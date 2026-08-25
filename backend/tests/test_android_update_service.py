"""Tests for the same-origin Android Release metadata proxy."""

import httpx
import pytest
from fastapi.testclient import TestClient
from fridgeboard import main as main_module
from fridgeboard.android_update_service import (
    AndroidUpdateService,
    AndroidUpdateServiceError,
)


def _github_release() -> dict[str, object]:
    """Return a minimal GitHub Release payload accepted by the proxy."""
    return {
        "tag_name": "v1.2.0",
        "name": "FridgeBoard 1.2.0 · release 260825112917",
        "body": "修复更新检查。",
        "assets": [
            {
                "name": "FridgeBoard-1.2.0-android-120.apk",
                "size": 10_000,
                "digest": f"sha256:{'a' * 64}",
                "browser_download_url": (
                    "https://github.com/flywhc/FridgeBoard/releases/download/"
                    "v1.2.0/FridgeBoard-1.2.0-android-120.apk"
                ),
            }
        ],
    }


@pytest.mark.anyio
async def test_android_update_service_normalizes_and_caches_release() -> None:
    calls = 0
    now = 100.0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json=_github_release(), request=request)

    def client_factory(**kwargs: object) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(handler), **kwargs)

    service = AndroidUpdateService(client_factory=client_factory, clock=lambda: now)

    first = await service.latest_release()
    second = await service.latest_release()

    assert first["build_number"] == "120"
    assert first["sha256"] == "a" * 64
    assert second == first
    assert calls == 1


@pytest.mark.anyio
async def test_android_update_service_reports_github_rate_limit() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, text="rate limited", request=request)

    def client_factory(**kwargs: object) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(handler), **kwargs)

    service = AndroidUpdateService(client_factory=client_factory)

    with pytest.raises(
        AndroidUpdateServiceError, match="您的网络地址受到 GitHub 下载站点限制"
    ) as error:
        await service.latest_release()

    assert error.value.status_code == 429


def test_android_update_route_returns_service_metadata(monkeypatch: pytest.MonkeyPatch) -> None:
    class StubService:
        async def latest_release(self) -> dict[str, object]:
            return {"app_slug": "fridgeboard", "build_number": "120"}

    monkeypatch.setattr(main_module, "AndroidUpdateService", StubService)

    response = TestClient(main_module.create_app()).get(
        "/api/mobile/android/releases/latest",
        headers={"Origin": "https://localhost"},
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://localhost"
    assert response.json() == {"app_slug": "fridgeboard", "build_number": "120"}
