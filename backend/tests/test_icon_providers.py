"""在线图标 provider 适配器和网络安全边界测试。"""

from __future__ import annotations

import base64
import json

import anyio
import fridgeboard.icon_provider_service as provider_service
import fridgeboard.icon_service as icon_service
import httpx
import pytest


class FakeAsyncClient:
    """使用预置响应模拟异步 HTTP 客户端。"""

    def __init__(self, responses: dict[str, httpx.Response]) -> None:
        self.responses = responses

    async def __aenter__(self) -> FakeAsyncClient:
        return self

    async def __aexit__(self, *_args: object) -> None:
        return None

    async def get(self, url: str, **_kwargs: object) -> httpx.Response:
        response = self.responses[url]
        response.request = httpx.Request("GET", url)
        return response


class ChunkedStream(httpx.AsyncByteStream):
    """向 httpx 响应提供可观察的异步分块字节流。"""

    def __init__(self, chunks: list[bytes]) -> None:
        self.chunks = chunks
        self.read = False

    async def __aiter__(self):
        self.read = True
        for chunk in self.chunks:
            yield chunk

    async def aclose(self) -> None:
        return None


def _patch_stream_response(
    monkeypatch: pytest.MonkeyPatch,
    headers: dict[str, str],
    chunks: list[bytes],
    status_code: int = 200,
) -> ChunkedStream:
    """用真实 AsyncByteStream 为文本 provider 注入单次响应。"""
    stream = ChunkedStream(chunks)
    real_client = httpx.AsyncClient

    def client_factory(*args: object, **kwargs: object) -> httpx.AsyncClient:
        async def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                status_code,
                headers=headers,
                stream=stream,
                request=request,
            )

        kwargs["transport"] = httpx.MockTransport(handler)
        return real_client(*args, **kwargs)

    monkeypatch.setattr(icon_service.httpx, "AsyncClient", client_factory)
    return stream


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("provider_factory", "operation"),
    [
        (icon_service.ink_svg_provider_from_environment, "ink_svg_generation"),
        (icon_service.icon_keyword_provider_from_environment, "icon_keywords"),
    ],
)
@pytest.mark.parametrize(
    ("status_code", "headers", "chunks", "expected_phase"),
    [
        (200, {"content-type": "application/json"}, [b"not-json"], "json_decode"),
        (
            503,
            {"content-type": "application/json", "content-length": "11"},
            [b"upstream-fail"],
            "http_status",
        ),
        (
            200,
            {
                "content-type": "application/json",
                "content-length": str(icon_service.MAX_ICON_BYTES + 1),
            },
            [b"not-read"],
            "response_body",
        ),
        (
            200,
            {"content-type": "application/json"},
            [b"x" * icon_service.MAX_ICON_BYTES, b"y"],
            "response_body",
        ),
    ],
)
async def test_text_provider_stream_failures_log_complete_response_context(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    provider_factory,
    operation: str,
    status_code: int,
    headers: dict[str, str],
    chunks: list[bytes],
    expected_phase: str,
) -> None:
    """真实异步流的各类失败均记录准确长度上下文且不读取 response.content。"""
    stream = _patch_stream_response(monkeypatch, headers, chunks, status_code)
    provider = provider_factory(
        lambda name, default=None: {
            "FRIDGEBOARD_AGNES_API_TOKEN": "secret-token",
        }.get(name, default)
    )
    assert provider is not None
    with caplog.at_level("ERROR", logger="fridgeboard.icon_service"):
        with pytest.raises(RuntimeError):
            if operation == "ink_svg_generation":
                await provider("洗发水", 1)
            else:
                await provider("洗发水")
    message = " ".join(record.getMessage() for record in caplog.records)
    assert f"operation={operation}" in message
    assert f"status={status_code}" in message
    assert "content_type=application/json" in message
    assert "declared_bytes=" in message
    assert "response_bytes=" in message
    assert "elapsed_ms=" in message
    assert f"parse_phase={expected_phase}" in message
    assert "secret-token" not in message
    if status_code == 200 and "content-length" not in headers:
        assert stream.read is True
    if status_code == 200 and headers.get("content-length", "").isdigit():
        assert stream.read is False


@pytest.mark.anyio
async def test_generate_icon_images_reports_each_candidate_as_soon_as_provider_returns_it() -> None:
    """支持增量回调的 provider 应在每张图完成后立即通知调用方。"""
    images = [f"image-{index}".encode() for index in range(4)]
    provider_observed: list[tuple[int, bytes]] = []
    callback_observed: list[tuple[int, bytes]] = []

    async def provider(_name: str, _count: int, _theme: str, on_image) -> list[bytes]:
        for index, image in enumerate(images):
            await on_image(index, image)
            provider_observed.append((index, image))
        return images

    normalized_name, result = await icon_service.generate_icon_images(
        provider,
        "洗发水",
        on_image=lambda index, image: _record_candidate(callback_observed, index, image),
    )

    assert normalized_name == "洗发水"
    assert result == images
    assert callback_observed == [(index, image) for index, image in enumerate(images)]
    assert provider_observed == callback_observed


@pytest.mark.anyio
@pytest.mark.parametrize(
    "content",
    [
        '{"svgs": ["<svg viewBox=\\"0 0 64 64\\"><path d=\\"M1 1h2\\"/></svg>"]}',
        [
            {
                "type": "text",
                "text": '{"svgs": ["<svg viewBox=\\"0 0 64 64\\"><path d=\\"M1 1h2\\"/></svg>"]}',
            }
        ],
        {
            "svgs": [
                {"label": "洗发水", "svg": '<svg viewBox="0 0 64 64"><path d="M1 1h2"/></svg>'}
            ]
        },
    ],
)
async def test_ink_svg_provider_accepts_common_chat_completion_content_shapes(
    monkeypatch: pytest.MonkeyPatch, content: object
) -> None:
    """水墨 provider 应兼容文本、文本块和带 svg 字段的候选对象。"""
    real_client = httpx.AsyncClient

    def client_factory(*args: object, **kwargs: object) -> httpx.AsyncClient:
        async def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json={"choices": [{"message": {"content": content}}]},
                request=request,
            )

        kwargs["transport"] = httpx.MockTransport(handler)
        return real_client(*args, **kwargs)

    monkeypatch.setattr(icon_service.httpx, "AsyncClient", client_factory)
    provider = icon_service.ink_svg_provider_from_environment(
        lambda name, default=None: {"FRIDGEBOARD_AGNES_API_TOKEN": "secret-token"}.get(
            name, default
        )
    )
    assert provider is not None

    result = await provider("洗发水", 1)

    assert len(result) == 1
    assert result[0].startswith(b"<?xml")


async def _record_candidate(
    observed: list[tuple[int, bytes]], index: int, image: bytes
) -> None:
    """将生成回调记录到测试列表。"""
    observed.append((index, image))


@pytest.mark.anyio
async def test_agnes_image_provider_uses_supported_single_image_payload(
    monkeypatch, caplog
) -> None:
    """Agnes Image 2.0 请求使用公开示例尺寸和充裕读取超时。"""
    observed: list[dict[str, object]] = []
    observed_timeouts = []
    image = base64.b64encode(
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x04\x00\x00\x00\xb5\x1c\x0c\x02\x00\x00\x00\x0bIDAT\x08\xd7c\xf8\xcf\xc0\xf0\x1f\x00\x05\x00\x01\xff\x89\x99=\x1d\x00\x00\x00\x00IEND\xaeB`\x82"
    ).decode()
    real_client = httpx.AsyncClient

    def client_factory(*args: object, **kwargs: object) -> httpx.AsyncClient:
        observed_timeouts.append(kwargs["timeout"])

        async def handler(request: httpx.Request) -> httpx.Response:
            observed.append(json.loads(request.content))
            return httpx.Response(200, json={"data": [{"b64_json": image}]}, request=request)

        kwargs["transport"] = httpx.MockTransport(handler)
        return real_client(*args, **kwargs)

    monkeypatch.setattr(icon_service.httpx, "AsyncClient", client_factory)
    provider = icon_service.agnes_icon_provider_from_environment(
        lambda name, default=None: {"FRIDGEBOARD_AGNES_API_TOKEN": "secret-token"}.get(
            name, default
        )
    )
    assert provider is not None
    with caplog.at_level("INFO", logger="fridgeboard.icon_core"):
        result = await provider("洗发水", 1)

    assert len(result) == 1
    assert observed_timeouts[0].read == 360
    assert observed == [
        {
            "model": "agnes-image-2.0-flash",
            "prompt": observed[0]["prompt"],
            "size": "1024x1024",
            "return_base64": True,
        }
    ]
    message = " ".join(record.getMessage() for record in caplog.records)
    assert "Agnes 大模型调用开始" in message
    assert "endpoint=https://apihub.agnes-ai.com/v1/images/generations" in message
    assert "model=agnes-image-2.0-flash" in message
    assert "outcome=pending" in message
    assert "outcome=received" in message
    assert "outcome=success" in message
    assert "secret-token" not in message


@pytest.mark.anyio
async def test_agnes_image_provider_logs_timeout_after_request_attempt(monkeypatch, caplog) -> None:
    """上游迟迟不返回时，日志应保留接口、模型和超时异常链。"""
    real_client = httpx.AsyncClient

    def client_factory(*args: object, **kwargs: object) -> httpx.AsyncClient:
        async def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ReadTimeout("upstream did not respond", request=request)

        kwargs["transport"] = httpx.MockTransport(handler)
        return real_client(*args, **kwargs)

    monkeypatch.setattr(icon_service.httpx, "AsyncClient", client_factory)
    provider = icon_service.agnes_icon_provider_from_environment(
        lambda name, default=None: {"FRIDGEBOARD_AGNES_API_TOKEN": "secret-token"}.get(
            name, default
        )
    )
    assert provider is not None

    with caplog.at_level("INFO", logger="fridgeboard.icon_core"):
        with pytest.raises(RuntimeError, match="Agnes 图标生成暂时不可用"):
            await provider("洗发水", 1)

    messages = [record.getMessage() for record in caplog.records]
    start = next(message for message in messages if "Agnes 大模型调用开始" in message)
    failure = next(message for message in messages if "Agnes 大模型调用失败" in message)
    assert "method=POST" in start
    assert "endpoint=https://apihub.agnes-ai.com/v1/images/generations" in start
    assert "model=agnes-image-2.0-flash" in start
    assert "outcome=pending" in start
    assert "outcome=error" in failure
    assert "status=None" in failure
    assert "content_type=None" in failure
    assert "parse_phase=request_headers" in failure
    assert "exception_type=ReadTimeout" in failure
    assert any(record.exc_info is not None for record in caplog.records)
    assert "secret-token" not in " ".join(messages)


@pytest.mark.anyio
async def test_thiings_compressed_catalog_search_and_trusted_download(monkeypatch) -> None:
    """真实压缩目录应按 slug 搜索，并从 fileId 构造可信 blob URL。"""
    catalog_url = "https://www.thiings.co/api/catalog"
    blob_url = "https://lftz25oez4aqbxpq.public.blob.vercel-storage.com/image-abcdefghijklmnop.png"
    catalog = {
        "categories": ["food", "fruit"],
        "items": [["coconut", "abcdefghijklmnop", "Coconut", [0, 1], 0]],
    }
    responses = {
        catalog_url: httpx.Response(200, json=catalog),
        blob_url: httpx.Response(
            200, content=b"not-an-image", headers={"content-type": "image/png"}
        ),
    }
    monkeypatch.setattr(icon_service, "_thiings_catalog_cache", None)
    monkeypatch.setenv("FRIDGEBOARD_THIINGS_CATALOG_URL", catalog_url)
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **_kwargs: FakeAsyncClient(responses),
    )
    results = await icon_service.search_online_icons("thiings", "fruit")
    assert results[0]["id"] == "coconut"
    assert results[0]["preview_url"] == blob_url
    with pytest.raises(RuntimeError, match="在线图标下载失败"):
        await icon_service.download_provider_item("thiings", "coconut")


@pytest.mark.anyio
async def test_thiings_search_reuses_full_catalog_without_result_truncation(monkeypatch) -> None:
    """完整目录只加载一次，搜索结果不应被额外截断为 30 条。"""
    catalog_url = "https://www.thiings.co/api/catalog"
    items = [
        [f"fruit-{index}", f"abcdefghijklmnop{index:02d}", f"Fruit {index}", [0], 0]
        for index in range(31)
    ]
    responses = {catalog_url: httpx.Response(200, json={"categories": ["food"], "items": items})}
    calls = 0

    class CountingClient(FakeAsyncClient):
        async def get(self, url: str, **kwargs: object) -> httpx.Response:
            nonlocal calls
            calls += 1
            return await super().get(url, **kwargs)

    monkeypatch.setattr(provider_service, "_thiings_catalog_cache", None)
    monkeypatch.setenv("FRIDGEBOARD_THIINGS_CATALOG_URL", catalog_url)
    monkeypatch.setattr(httpx, "AsyncClient", lambda **_kwargs: CountingClient(responses))

    first = await icon_service.search_online_icons("thiings", "fruit")
    second = await icon_service.search_online_icons("thiings", "fruit")

    assert len(first) == 31
    assert len(second) == 31
    assert calls == 1


@pytest.mark.anyio
async def test_thiings_persistent_cache_merges_without_checking_assets(
    monkeypatch, tmp_path
) -> None:
    """每日刷新应合并历史目录，且不应逐个检查旧资源。"""
    catalog_url = "https://www.thiings.co/api/catalog"
    cache_path = tmp_path / "thiings-catalog.json"
    first_catalog = {
        "items": [
            ["legacy", "abcdefghijklmnop", "Legacy", [0], 0],
            ["stable", "qrstuvwxyzabcdef", "Stable", [0], 0],
        ],
        "categories": ["food"],
    }
    refreshed_catalog = {
        "items": [
            ["stable", "qrstuvwxyzabcdef", "Stable", [0], 0],
            ["new", "ghijklmnopqrstuv", "New", [0], 0],
        ],
        "categories": ["food"],
    }
    responses = [
        httpx.Response(200, json=first_catalog),
        httpx.Response(200, json=refreshed_catalog),
        httpx.Response(200, json=refreshed_catalog),
    ]

    class RefreshingClient(FakeAsyncClient):
        async def get(self, url: str, **kwargs: object) -> httpx.Response:
            response = responses.pop(0)
            response.request = httpx.Request("GET", url)
            return response

        async def head(self, url: str, **kwargs: object) -> httpx.Response:
            raise AssertionError(f"刷新阶段不应检查资源: {url}")

    monkeypatch.setattr(provider_service, "_thiings_catalog_cache", None)
    monkeypatch.setenv("FRIDGEBOARD_THIINGS_CATALOG_URL", catalog_url)
    monkeypatch.setenv("FRIDGEBOARD_THIINGS_CATALOG_CACHE_TTL_SECONDS", "0")
    monkeypatch.setattr(httpx, "AsyncClient", lambda **_kwargs: RefreshingClient({}))

    first = await icon_service.search_online_icons("thiings", "legacy", cache_path=cache_path)
    second = await icon_service.search_online_icons("thiings", "legacy", cache_path=cache_path)
    third = await icon_service.search_online_icons("thiings", "legacy", cache_path=cache_path)

    assert [item["id"] for item in first] == ["legacy"]
    assert [item["id"] for item in second] == ["legacy"]
    assert [item["id"] for item in third] == ["legacy"]
    cached = json.loads(cache_path.read_text())
    assert {item["id"] for item in cached["items"]} == {"legacy", "stable", "new"}


@pytest.mark.anyio
async def test_thiings_download_404_removes_cached_item(monkeypatch, tmp_path) -> None:
    """实际导入读取到 Thiings 404 时才删除对应缓存条目。"""
    catalog_url = "https://www.thiings.co/api/catalog"
    blob_url = "https://lftz25oez4aqbxpq.public.blob.vercel-storage.com/image-abcdefghijklmnop.png"
    cache_path = tmp_path / "thiings-catalog.json"
    responses = {
        catalog_url: httpx.Response(
            200,
            json={
                "categories": ["food"],
                "items": [["coconut", "abcdefghijklmnop", "Coconut", [0], 0]],
            },
        ),
        blob_url: httpx.Response(404, content=b"not found"),
    }

    monkeypatch.setattr(provider_service, "_thiings_catalog_cache", None)
    monkeypatch.setenv("FRIDGEBOARD_THIINGS_CATALOG_URL", catalog_url)
    monkeypatch.setattr(httpx, "AsyncClient", lambda **_kwargs: FakeAsyncClient(responses))

    with pytest.raises(RuntimeError, match="在线图标下载失败"):
        await icon_service.download_provider_item("thiings", "coconut", cache_path=cache_path)

    cached = json.loads(cache_path.read_text())
    assert cached["items"] == []


@pytest.mark.anyio
async def test_thiings_refresh_failure_keeps_persistent_history(monkeypatch, tmp_path) -> None:
    """目录刷新遇到上游失败时应继续提供最后一次成功目录。"""
    catalog_url = "https://www.thiings.co/api/catalog"
    cache_path = tmp_path / "thiings-catalog.json"
    responses = [
        httpx.Response(
            200,
            json={
                "categories": ["food"],
                "items": [["coconut", "abcdefghijklmnop", "Coconut", [0], 0]],
            },
        ),
        httpx.Response(503, content=b"upstream unavailable"),
    ]

    class FailingRefreshClient(FakeAsyncClient):
        async def get(self, url: str, **kwargs: object) -> httpx.Response:
            response = responses.pop(0)
            response.request = httpx.Request("GET", url)
            return response

    monkeypatch.setattr(provider_service, "_thiings_catalog_cache", None)
    monkeypatch.setenv("FRIDGEBOARD_THIINGS_CATALOG_URL", catalog_url)
    monkeypatch.setenv("FRIDGEBOARD_THIINGS_CATALOG_CACHE_TTL_SECONDS", "0")
    monkeypatch.setattr(httpx, "AsyncClient", lambda **_kwargs: FailingRefreshClient({}))

    await icon_service.search_online_icons("thiings", "coconut", cache_path=cache_path)
    result = await icon_service.search_online_icons("thiings", "coconut", cache_path=cache_path)

    assert [item["id"] for item in result] == ["coconut"]


@pytest.mark.anyio
async def test_thiings_expired_refresh_is_single_flight(monkeypatch, tmp_path) -> None:
    """并发首次搜索只能触发一次 Thiings catalog 拉取。"""
    catalog_url = "https://www.thiings.co/api/catalog"
    cache_path = tmp_path / "thiings-catalog.json"
    started = anyio.Event()
    release = anyio.Event()
    calls = 0
    response = httpx.Response(
        200,
        json={
            "categories": ["food"],
            "items": [["coconut", "abcdefghijklmnop", "Coconut", [0], 0]],
        },
    )

    class SlowClient(FakeAsyncClient):
        async def get(self, url: str, **kwargs: object) -> httpx.Response:
            nonlocal calls
            calls += 1
            started.set()
            await release.wait()
            response.request = httpx.Request("GET", url)
            return response

    monkeypatch.setattr(provider_service, "_thiings_catalog_cache", None)
    monkeypatch.setenv("FRIDGEBOARD_THIINGS_CATALOG_URL", catalog_url)
    monkeypatch.setenv("FRIDGEBOARD_THIINGS_CATALOG_CACHE_TTL_SECONDS", "3600")
    monkeypatch.setattr(httpx, "AsyncClient", lambda **_kwargs: SlowClient({}))
    results: list[list[dict[str, str | None]]] = []

    async def search() -> None:
        results.append(
            await icon_service.search_online_icons("thiings", "coconut", cache_path=cache_path)
        )

    async with anyio.create_task_group() as task_group:
        task_group.start_soon(search)
        await started.wait()
        task_group.start_soon(search)
        await anyio.sleep(0)
        assert calls == 1
        release.set()

    assert calls == 1
    assert len(results) == 2
    assert all([item["id"] for item in result] == ["coconut"] for result in results)


@pytest.mark.anyio
async def test_iconify_download_uses_path_url_and_rejects_redirect_and_oversize(
    monkeypatch,
) -> None:
    """Iconify ID 必须生成路径形式 URL，并拒绝不可信跳转和超限响应。"""
    good_url = "https://api.iconify.design/mdi/food-apple.svg"
    svg = b'<svg viewBox="0 0 24 24"><path d="M1 1h2"/></svg>'
    captured: list[str] = []

    class CaptureClient(FakeAsyncClient):
        async def get(self, url: str, **kwargs: object) -> httpx.Response:
            captured.append(url)
            response = httpx.Response(200, content=svg, headers={"content-type": "image/svg+xml"})
            response.request = httpx.Request("GET", url)
            return response

    monkeypatch.setattr(httpx, "AsyncClient", lambda **_kwargs: CaptureClient({}))
    content, media_type, source_url = await icon_service.download_provider_item(
        "iconify", "mdi:food-apple"
    )
    assert content.startswith(b"<?xml")
    assert media_type == "image/svg+xml"
    assert source_url == good_url
    assert captured == [good_url]

    class RedirectClient(FakeAsyncClient):
        async def get(self, url: str, **kwargs: object) -> httpx.Response:
            return httpx.Response(302, headers={"location": "https://example.com/icon.svg"})

    monkeypatch.setattr(httpx, "AsyncClient", lambda **_kwargs: RedirectClient({}))
    with pytest.raises(RuntimeError, match="在线图标下载失败"):
        await icon_service.download_online_icon("iconify", good_url)


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("headers", "content"),
    [
        ({"content-type": "text/html"}, b"<html>not an icon</html>"),
        (
            {"content-type": "image/png", "content-length": str(icon_service.MAX_ICON_BYTES + 1)},
            b"",
        ),
    ],
)
async def test_online_download_rejects_mime_and_content_length_with_context(
    monkeypatch, headers: dict[str, str], content: bytes, caplog
) -> None:
    """错误 MIME 和超限响应均失败，并记录可定位但不含秘密的上下文。"""
    url = "https://api.iconify.design/mdi/food.svg"

    class ErrorClient(FakeAsyncClient):
        async def get(self, request_url: str, **kwargs: object) -> httpx.Response:
            response = httpx.Response(200, content=content, headers=headers)
            response.request = httpx.Request("GET", request_url)
            return response

    monkeypatch.setattr(httpx, "AsyncClient", lambda **_kwargs: ErrorClient({}))
    with pytest.raises(RuntimeError, match="在线图标下载失败"):
        await icon_service.download_online_icon("iconify", url)
    message = " ".join(record.getMessage() for record in caplog.records)
    assert "operation=icon_download" in message
    assert "status=200" in message
    assert "content_type=" in message
    assert "Authorization" not in message


def test_provider_error_summary_does_not_include_authorization() -> None:
    """错误摘要序列化时不得包含 token 或签名参数。"""
    summary = icon_service._safe_endpoint(
        "https://api.iconify.design/icon.svg?token=secret&signature=private"
    )
    assert "secret" not in summary
    assert "private" not in summary
