"""验证 Ad Hoc 元数据、同域路由和上游失败的诊断边界。"""

import asyncio
import logging

import httpx
import pytest
from fastapi.testclient import TestClient
from fridgeboard import main as main_module
from fridgeboard.ios_update_service import (
    IOS_INSTALL_URL,
    IosUpdateService,
    IosUpdateServiceError,
    parse_ios_releases,
)


def release(version: str = "0.2.11", build: int = 4) -> dict:
    """构造 workflow 对应的公开 Release 数据。"""
    filename = f"FridgeBoard-{version}-ios.ipa"
    return {
        "tag_name": f"v{version}",
        "body": "修复问题。",
        "assets": [{
            "name": filename,
            "label": f"AdHoc build={build} release=261104173345",
            "size": 10000,
            "digest": f"sha256:{'a' * 64}",
            "browser_download_url": (
                f"https://github.com/flywhc/FridgeBoard/releases/download/v{version}/{filename}"
            ),
        }],
    }


def test_selects_latest_ios_despite_android_only_and_older_release_order() -> None:
    """版本排序不依赖 Release 创建顺序或 Android 发布。"""
    latest = release("0.2.12", 1)
    assert parse_ios_releases([
        {"tag_name": "v0.2.13", "assets": []}, release("0.2.11", 500), latest,
    ]).version == "0.2.12"
    assert parse_ios_releases([release(build=4), release(build=5)]).build_number == 5


@pytest.mark.parametrize("field,value", [
    ("draft", True), ("prerelease", True), ("tag_name", "v0.3.0-beta"),
])
def test_ignores_unpublished_or_prerelease(field: str, value: object) -> None:
    """内部测试版本不能触发正式用户升级。"""
    item = release()
    item[field] = value
    assert parse_ios_releases([item]) is None


@pytest.mark.parametrize("label", [None, "iOS development", "AdHoc build=0 release=261104173345"])
def test_ignores_unmarked_or_non_adhoc_artifacts(label: str | None) -> None:
    """历史未登记包和非 Ad Hoc 包不进入更新目录。"""
    item = release()
    item["assets"][0]["label"] = label
    assert parse_ios_releases([item]) is None


@pytest.mark.parametrize("field,value", [
    ("digest", None), ("size", 0),
    ("browser_download_url", "https://evil.example/test.ipa"),
    ("name", "FridgeBoard-0.2.10-ios.ipa"),
])
def test_rejects_broken_marked_release(field: str, value: object) -> None:
    """拒绝带发布标记但文件契约不完整的包。"""
    item = release()
    item["assets"][0][field] = value
    with pytest.raises(ValueError):
        parse_ios_releases([item])


@pytest.mark.anyio
async def test_caches_and_expires_including_no_release() -> None:
    """缓存空结果，并在到期后重新读取上游。"""
    calls = 0
    now = 100.0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json=[] if calls == 1 else [release()], request=request)

    def factory(**kwargs: object) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(handler), **kwargs)

    service = IosUpdateService(client_factory=factory, clock=lambda: now)
    assert await service.latest_release() is None
    assert await service.latest_release() is None
    assert calls == 1
    now += 301
    result = await service.latest_release()
    assert result.build_number == 4
    assert result.install_url == IOS_INSTALL_URL
    assert calls == 2


@pytest.mark.anyio
@pytest.mark.parametrize("failure", ["html", "truncated", "contract", "http", "timeout", "cancel"])
async def test_failures_record_context_and_stack_without_body_secrets(
    failure: str, caplog: pytest.LogCaptureFixture,
) -> None:
    """不同失败阶段均保留异常链，同时不输出上游敏感正文。"""
    async def handler(request: httpx.Request) -> httpx.Response:
        if failure == "timeout":
            raise httpx.ReadTimeout("read timed out", request=request)
        if failure == "cancel":
            raise asyncio.CancelledError()
        if failure == "http":
            return httpx.Response(429, text="Authorization: secret-value", request=request)
        if failure == "contract":
            return httpx.Response(200, json={"token": "secret-value"}, request=request)
        return httpx.Response(
            200, text='<html>secret-value' if failure == "html" else '{"token":"secret-value',
            headers={"Content-Type": "text/html" if failure == "html" else "application/json"},
            request=request,
        )

    def factory(**kwargs: object) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(handler), **kwargs)

    with caplog.at_level(logging.ERROR), pytest.raises(
        asyncio.CancelledError if failure == "cancel" else IosUpdateServiceError
    ):
        await IosUpdateService(client_factory=factory).latest_release()
    record = next(record for record in caplog.records if "ios_update_failed" in record.message)
    assert record.exc_info is not None
    assert "method=GET" in record.message
    assert "service=github" in record.message
    assert "parse_stage=" in record.message
    assert "elapsed_ms=" in record.message
    assert "content_type=" in record.message
    assert "content_length=" in record.message
    assert "response_summary=" in record.message
    assert "secret-value" not in caplog.text


@pytest.mark.parametrize("empty", [False, True])
def test_route_returns_metadata_or_204_and_allows_ios_origin(
    monkeypatch: pytest.MonkeyPatch, empty: bool,
) -> None:
    """元数据和空结果均保持同域缓存及原生壳 CORS 契约。"""
    class StubService:
        async def latest_release(self):
            return None if empty else parse_ios_releases([release()])

    monkeypatch.setattr(main_module, "IosUpdateService", StubService)
    response = TestClient(main_module.create_app()).get(
        "/api/mobile/ios/releases/latest", headers={"Origin": "capacitor://localhost"},
    )
    assert response.status_code == (204 if empty else 200)
    assert response.headers["access-control-allow-origin"] == "capacitor://localhost"
    assert response.headers["cache-control"] == "no-store"
    if not empty:
        assert response.json()["build_number"] == 4


def test_route_preserves_failure_chain(monkeypatch: pytest.MonkeyPatch) -> None:
    """上游异常转换成可重试错误，不能冒充暂无更新。"""
    class StubService:
        async def latest_release(self):
            raise IosUpdateServiceError("请稍后重试")

    monkeypatch.setattr(main_module, "IosUpdateService", StubService)
    response = TestClient(main_module.create_app()).get("/api/mobile/ios/releases/latest")
    assert response.status_code == 503


