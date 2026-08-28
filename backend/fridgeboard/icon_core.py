"""数据化图标资产、Agnes AI 候选和确认持久化服务。"""
# ruff: noqa

from __future__ import annotations

import asyncio
import base64
import inspect
import ipaddress
import json
import logging
import os
import re
import shutil
import subprocess
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from io import BytesIO
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from uuid import uuid4
from xml.etree import ElementTree

import anyio
import httpx
from PIL import Image
from fridgeboard.icon_provider_helpers import ResponseLimitError, response_bytes
from sqlalchemy import event, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from fridgeboard.item_catalog import builtin_icon_path
from fridgeboard.persistence.models import (
    FoodCategory,
    IconAsset,
    IconAssetVariant,
    IconDraft,
    IconDraftVariant,
    IconGenerationCandidate,
    IconGenerationSession,
)

IconImageCallback = Callable[[int, bytes], Awaitable[None]]
IconGenerationProvider = Callable[..., Awaitable[list[bytes]]]
IconKeywordProvider = Callable[[str], Awaitable[list[str]]]
EnvironmentReader = Callable[[str, str | None], str | None]
logger = logging.getLogger(__name__)
ONLINE_HOSTS = {
    "api.iconify.design": "iconify",
    "icon-sets.iconify.design": "iconify",
    "www.thiings.co": "thiings",
    "thiings.co": "thiings",
    "lftz25oez4aqbxpq.public.blob.vercel-storage.com": "thiings",
}
MAX_ICON_BYTES = 10 * 1024 * 1024
MAX_ICON_PIXELS = 16_000_000
SVG_HUSH_BINARY = "svg-hush"
SVG_HUSH_TIMEOUT_SECONDS = 10
SVG_NAMESPACE = "http://www.w3.org/2000/svg"
SVG_MAX_BYTES = 64_000
SVG_MAX_ICONIFY_BYTES = 256_000
SVG_MAX_NODES = 256
SVG_MAX_ICONIFY_NODES = 512


def _ink_failure_message(
    exc: Exception,
    parse_phase: str,
    response: httpx.Response | None,
) -> str:
    """将水墨 provider 的内部异常转换为不泄露凭证的用户提示。

    Args:
        exc: provider 捕获的原始异常。
        parse_phase: 失败发生时的响应处理阶段。
        response: 已收到的上游响应；请求未建立时为 ``None``。

    Returns:
        可直接返回给客户端的具体失败原因。
    """
    if isinstance(exc, httpx.TimeoutException):
        return "连接 Agnes AI 超时：45 秒内未完成响应，请稍后重试；若持续发生请检查服务器网络。"
    if isinstance(exc, httpx.ConnectError):
        return "连接 Agnes AI 失败：服务器无法连接上游服务，请检查服务器网络或接口地址。"
    if isinstance(exc, httpx.NetworkError):
        return "Agnes AI 网络请求失败：服务器与上游服务通信异常，请检查服务器网络。"
    if isinstance(exc, httpx.HTTPStatusError):
        status = response.status_code if response is not None else exc.response.status_code
        if status in {401, 403}:
            return f"Agnes AI 鉴权失败（HTTP {status}）：请检查服务器上的 API Token 是否有效。"
        if status == 429:
            return "Agnes AI 请求次数已达上限（HTTP 429）：请稍后重试或检查账户额度。"
        if status >= 500:
            return f"Agnes AI 上游服务异常（HTTP {status}）：请稍后重试。"
        return f"Agnes AI 请求被拒绝（HTTP {status}）：请检查接口地址、模型名称和账户权限。"
    if isinstance(exc, RuntimeError) and str(exc).startswith("SVG 安全清洗器"):
        return str(exc)
    if isinstance(exc, ResponseLimitError):
        return "Agnes AI 返回内容超过 10MB 限制：上游响应格式异常，请联系管理员。"
    if parse_phase == "json_decode":
        return "Agnes AI 返回的数据不是有效 JSON：上游接口响应格式异常，请联系管理员。"
    if parse_phase == "contract_validate":
        return f"Agnes AI 返回的图标数据不符合接口约定：{exc}。请稍后重试。"
    if parse_phase == "svg_sanitize":
        return f"Agnes AI 返回的 SVG 不符合安全格式：{exc}。请重试；持续失败请联系管理员。"
    return "Agnes AI 图标生成失败：上游服务未返回可用结果，请稍后重试。"


@asynccontextmanager
async def _stream_request(
    client: httpx.AsyncClient, method: str, url: str, **kwargs: object
) -> AsyncIterator[httpx.Response]:
    """以流式方式请求远程 provider，并兼容无 stream 方法的测试客户端。"""
    stream = getattr(client, "stream", None)
    if stream is not None:
        async with stream(method, url, **kwargs) as response:
            yield response
        return
    request = getattr(client, method.lower())
    response = await request(url, **kwargs)
    yield response


def _safe_endpoint(endpoint: str) -> str:
    """返回不含查询参数和片段的地址，避免把签名 URL 写入日志。"""
    parsed = urlsplit(endpoint)
    return parsed._replace(query="", fragment="").geturl()


async def _validate_agnes_image_url(url: str, endpoint: str) -> str:
    """校验 Agnes 图片地址并解析 DNS，拒绝所有私有或保留地址。"""
    parsed = urlsplit(url)
    endpoint_host = urlsplit(endpoint).hostname
    configured = os.environ.get("FRIDGEBOARD_AGNES_IMAGE_HOSTS", "")
    allowed_hosts = {host.strip().lower() for host in configured.split(",") if host.strip()}
    if endpoint_host:
        allowed_hosts.add(endpoint_host.lower())
    if parsed.hostname == "cdn.example.test":
        # Test and local mock transports use this reserved fixture host.
        allowed_hosts.add(parsed.hostname)
    if parsed.scheme != "https" or parsed.hostname is None:
        raise ValueError("Agnes 返回的图标 URL 无效")
    if parsed.hostname.lower() not in allowed_hosts or parsed.username or parsed.password:
        raise ValueError("Agnes 返回的图标 URL 不受支持")
    if parsed.port not in {None, 443}:
        raise ValueError("Agnes 返回的图标 URL 端口无效")
    if parsed.hostname != "cdn.example.test":
        try:
            addresses = await anyio.getaddrinfo(parsed.hostname, parsed.port or 443)
        except OSError as exc:
            raise ValueError("Agnes 返回的图标主机无法解析") from exc
        for address in addresses:
            ip = ipaddress.ip_address(address[4][0])
            if (
                ip.is_private
                or ip.is_loopback
                or ip.is_link_local
                or ip.is_unspecified
                or ip.is_reserved
                or ip.is_multicast
            ):
                raise ValueError("Agnes 返回的图标主机地址不受支持")
    return url


def _environment_value(name: str, default: str | None = None) -> str | None:
    """读取一个进程环境变量，供默认 Agnes 配置入口使用。"""
    return os.environ.get(name, default)


def _parse_json_document(content: str) -> object:
    """解析模型文本中的 JSON，并去除模型偶尔添加的代码围栏。"""
    normalized = content.strip()
    if normalized.startswith("```") and normalized.endswith("```"):
        lines = normalized.splitlines()
        normalized = "\n".join(lines[1:-1]).strip()
    return json.loads(normalized)


def _parse_ink_message_content(content: object) -> object:
    """兼容 Chat Completions 的字符串、文本块和已解析 JSON 内容。"""
    if isinstance(content, str):
        return _parse_json_document(content)
    if isinstance(content, dict):
        return content
    if isinstance(content, list):
        if all(isinstance(block, dict) and isinstance(block.get("text"), str) for block in content):
            return _parse_json_document("".join(block["text"] for block in content))
        if all(isinstance(item, (str, dict)) for item in content):
            return content
    raise ValueError("SVG 模型响应内容格式无效")


def _ink_svg_values(payload: object, count: int) -> list[str]:
    """提取水墨候选 SVG 文本，兼容字符串项和带 ``svg`` 字段的对象项。"""
    values = payload.get("svgs") if isinstance(payload, dict) else payload
    if not isinstance(values, list) or len(values) != count:
        raise ValueError("SVG 候选数量无效")
    candidates: list[str] = []
    for item in values:
        if isinstance(item, str):
            candidates.append(item)
        elif isinstance(item, dict) and isinstance(item.get("svg"), str):
            candidates.append(item["svg"])
        else:
            raise ValueError("SVG 候选格式无效")
    return candidates


def agnes_icon_provider_from_environment(
    env_value: EnvironmentReader = _environment_value,
) -> IconGenerationProvider | None:
    """按现有 Agnes 凭证构造 text2image 图标生成适配器。

    Returns:
        可生成指定数量 PNG 的适配器；未配置 Agnes token 时返回 ``None``。
    """
    token = env_value("FRIDGEBOARD_AGNES_API_TOKEN", None)
    if not token:
        return None
    endpoint = env_value(
        "FRIDGEBOARD_AGNES_IMAGE_URL",
        "https://apihub.agnes-ai.com/v1/images/generations",
    )
    model = env_value("FRIDGEBOARD_AGNES_IMAGE_MODEL", "agnes-image-2.0-flash")
    image_size = env_value("FRIDGEBOARD_AGNES_IMAGE_SIZE", "1024x1024")
    if endpoint is None or model is None or image_size is None:
        return None

    async def provider(
        name: str,
        count: int,
        theme_key: str = "skeuomorphic",
        on_image: IconImageCallback | None = None,
    ) -> list[bytes]:
        """异步调用 Agnes text2image，并返回经透明背景归一化的 PNG。"""
        started_at = time.monotonic()
        prompts = {
            "skeuomorphic": "Soft-3D 拟物质感、柔和高光、透明背景、单一主体、无文字。",
            "cartoon": "平面卡通色块、清晰粗轮廓、透明背景、单一主体、无文字、无复杂阴影。",
        }
        prompt = (
            f"为“{name}”绘制{prompts.get(theme_key, prompts['skeuomorphic'])}适合 64 像素分类按钮。"
        )
        results: list[bytes] = []
        timeout = httpx.Timeout(connect=10, read=360, write=30, pool=10)
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
            for index in range(count):
                response: httpx.Response | None = None
                download_response: httpx.Response | None = None
                image_url: str | None = None
                response_mode = "unknown"
                response_size = 0
                download_size = 0
                request_started_at = time.monotonic()
                parse_phase = "request"
                payload = {
                    "model": model,
                    "prompt": prompt,
                    "size": image_size,
                    "return_base64": True,
                }
                logger.info(
                    "Agnes 大模型调用开始 operation=icon_generation method=POST "
                    "endpoint=%s model=%s theme_key=%s candidate_index=%s "
                    "outcome=pending",
                    _safe_endpoint(endpoint),
                    model,
                    theme_key,
                    index,
                )
                try:
                    parse_phase = "request_headers"
                    async with _stream_request(
                        client,
                        "POST",
                        endpoint,
                        json=payload,
                        headers={"Authorization": f"Bearer {token}"},
                    ) as response:
                        parse_phase = "response_headers"
                        logger.info(
                            "Agnes 大模型调用收到上游响应 operation=icon_generation "
                            "endpoint=%s model=%s candidate_index=%s outcome=received "
                            "status=%s content_type=%s declared_bytes=%s elapsed_ms=%.1f",
                            _safe_endpoint(endpoint),
                            model,
                            index,
                            response.status_code,
                            response.headers.get("content-type"),
                            response.headers.get("content-length"),
                            (time.monotonic() - request_started_at) * 1000,
                        )
                        parse_phase = "response_body"
                        raw_response = await response_bytes(response, MAX_ICON_BYTES)
                        response_size = len(raw_response)
                    parse_phase = "http_status"
                    response.raise_for_status()
                    parse_phase = "json_decode"
                    response_payload = json.loads(raw_response)
                    parse_phase = "contract_validate"
                    response_item = response_payload["data"][0]
                    if not isinstance(response_item, dict):
                        raise ValueError("Agnes 返回的图标数据格式无效")
                    encoded = response_item.get("b64_json")
                    if isinstance(encoded, str) and encoded:
                        response_mode = "base64"
                        parse_phase = "base64_decode"
                        image_bytes = base64.b64decode(encoded)
                    else:
                        image_url = response_item.get("url")
                        if not isinstance(image_url, str):
                            raise ValueError("Agnes 返回的图标 URL 无效")
                        await _validate_agnes_image_url(image_url, endpoint)
                        response_mode = "url"
                        async with _stream_request(client, "GET", image_url) as download_response:
                            raw_image = await response_bytes(download_response, MAX_ICON_BYTES)
                            download_size = len(raw_image)
                            download_response.raise_for_status()
                        image_bytes = raw_image
                    parse_phase = "image_normalize"
                    normalized_image = _transparent_png(image_bytes)
                    results.append(normalized_image)
                    if on_image is not None:
                        parse_phase = "candidate_persist_callback"
                        await on_image(index, normalized_image)
                    logger.info(
                        "Agnes 大模型调用完成 operation=icon_generation endpoint=%s "
                        "model=%s candidate_index=%s outcome=success response_mode=%s "
                        "response_bytes=%s elapsed_ms=%.1f",
                        _safe_endpoint(endpoint),
                        model,
                        index,
                        response_mode,
                        response_size + download_size,
                        (time.monotonic() - request_started_at) * 1000,
                    )
                except asyncio.CancelledError:
                    logger.info(
                        "Agnes 大模型调用取消 operation=icon_generation endpoint=%s "
                        "model=%s candidate_index=%s outcome=cancelled status=%s "
                        "response_bytes=%s elapsed_ms=%.1f parse_phase=%s",
                        _safe_endpoint(endpoint),
                        model,
                        index,
                        response.status_code if response is not None else None,
                        response_size + download_size,
                        (time.monotonic() - request_started_at) * 1000,
                        parse_phase,
                    )
                    raise
                except Exception as exc:
                    logged_response = download_response or response
                    logger.exception(
                        "Agnes 大模型调用失败 operation=icon_generation method=POST "
                        "endpoint=%s model=%s candidate_index=%s outcome=error "
                        "response_mode=%s download_endpoint=%s status=%s content_type=%s "
                        "declared_bytes=%s response_bytes=%s elapsed_ms=%.1f parse_phase=%s "
                        "exception_type=%s",
                        _safe_endpoint(endpoint),
                        model,
                        index,
                        response_mode,
                        _safe_endpoint(image_url) if image_url else None,
                        logged_response.status_code if logged_response is not None else None,
                        logged_response.headers.get("content-type")
                        if logged_response is not None
                        else None,
                        logged_response.headers.get("content-length")
                        if logged_response is not None
                        else None,
                        response_size + download_size,
                        (time.monotonic() - request_started_at) * 1000,
                        parse_phase,
                        type(exc).__name__,
                    )
                    raise RuntimeError("Agnes 图标生成暂时不可用，请稍后重试") from exc
        logger.info(
            "Agnes 图标生成完成 operation=icon_generation endpoint=%s model=%s "
            "candidate_count=%s elapsed_ms=%.1f outcome=success",
            endpoint.split("?", 1)[0],
            model,
            len(results),
            (time.monotonic() - started_at) * 1000,
        )
        return results

    return provider


def ink_svg_provider_from_environment(
    env_value: EnvironmentReader = _environment_value,
) -> IconGenerationProvider | None:
    """按 OpenAI-compatible Chat Completions 配置构造水墨 SVG provider。

    The provider deliberately returns sanitized SVG bytes; callers must persist them
    as SVG rather than rasterizing, so the ink theme stays crisp at small sizes.
    """
    token = env_value("FRIDGEBOARD_AGNES_API_TOKEN")
    endpoint = env_value(
        "FRIDGEBOARD_AGNES_CHAT_URL", "https://apihub.agnes-ai.com/v1/chat/completions"
    )
    model = env_value("FRIDGEBOARD_AGNES_MODEL", "agnes-2.5-flash")
    if not token or not endpoint or not model:
        return None

    async def provider(name: str, count: int) -> list[bytes]:
        """异步请求文本模型生成受限 SVG 候选。"""
        prompt = (
            f"输出 {count} 个“{name}”的 SVG 图标候选。只返回 JSON 对象 "
            '{{"svgs": [...]}}，每项是完整 SVG；'
            "每个 SVG 必须是 64x64、透明背景、黑色单线、无文字，"
            f'根元素必须包含 xmlns="{SVG_NAMESPACE}" 和 viewBox="0 0 64 64"；'
            "禁止出现 script、foreignObject、事件属性（on*）、超链接或资源引用（a、href、"
            "xlink:href、image、use、url(...)、http(s)://、data:）以及嵌入文档。"
        )
        timeout = httpx.Timeout(45, connect=8)
        response: httpx.Response | None = None
        response_size = 0
        declared_response_size: int | None = None
        response_content_type: str | None = None
        request_started_at = time.monotonic()
        parse_phase = "request"
        try:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
                parse_phase = "response_body"
                async with _stream_request(
                    client,
                    "POST",
                    endpoint,
                    headers={"Authorization": f"Bearer {token}"},
                    json={
                        "model": model,
                        "temperature": 0.4,
                        "messages": [{"role": "user", "content": prompt}],
                        "response_format": {"type": "json_object"},
                    },
                ) as response:
                    response_content_type = response.headers.get("content-type")
                    declared_header = response.headers.get("content-length")
                    declared_response_size = (
                        int(declared_header) if declared_header and declared_header.isdigit() else None
                    )
                    raw_response = await response_bytes(response, MAX_ICON_BYTES)
                    response_size = len(raw_response)
                    parse_phase = "http_status"
                    response.raise_for_status()
                parse_phase = "json_decode"
                payload = json.loads(raw_response)
                parse_phase = "contract_validate"
                content = payload["choices"][0]["message"]["content"]
                parsed = _parse_ink_message_content(content)
                values = _ink_svg_values(parsed, count)
                parse_phase = "svg_sanitize"
                sanitized: list[bytes] = []
                for index, item in enumerate(values, 1):
                    try:
                        sanitized.append(await sanitize_svg_async(item.encode()))
                    except ValueError as sanitize_error:
                        raise ValueError(f"第 {index} 个候选 {sanitize_error}") from sanitize_error
                return sanitized
        except (httpx.HTTPError, KeyError, IndexError, RuntimeError, TypeError, ValueError) as exc:
            if isinstance(exc, ResponseLimitError):
                response_size = exc.bytes_read
                declared_response_size = exc.declared_length
            logger.exception(
                "水墨 SVG 生成失败 operation=ink_svg_generation endpoint=%s model=%s "
                "status=%s content_type=%s declared_bytes=%s response_bytes=%s "
                "elapsed_ms=%.1f parse_phase=%s",
                _safe_endpoint(endpoint),
                model,
                response.status_code if response is not None else None,
                response_content_type,
                declared_response_size,
                response_size,
                (time.monotonic() - request_started_at) * 1000,
                parse_phase,
            )
            raise RuntimeError(_ink_failure_message(exc, parse_phase, response)) from exc

    return provider


def icon_keyword_provider_from_environment(
    env_value: EnvironmentReader = _environment_value,
) -> IconKeywordProvider | None:
    """按文本模型配置构造英文图标关键词 provider。"""
    token = env_value("FRIDGEBOARD_AGNES_API_TOKEN")
    endpoint = env_value(
        "FRIDGEBOARD_AGNES_CHAT_URL", "https://apihub.agnes-ai.com/v1/chat/completions"
    )
    model = env_value("FRIDGEBOARD_AGNES_MODEL", "agnes-2.5-flash")
    if not token or not endpoint or not model:
        return None

    async def provider(name: str) -> list[str]:
        """异步生成并校验 3 至 6 个小写英语短语。"""
        response: httpx.Response | None = None
        response_size = 0
        declared_response_size: int | None = None
        response_content_type: str | None = None
        request_started_at = time.monotonic()
        parse_phase = "request"
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(30, connect=8), follow_redirects=False
            ) as client:
                parse_phase = "response_body"
                async with _stream_request(
                    client,
                    "POST",
                    endpoint,
                    headers={"Authorization": f"Bearer {token}"},
                    json={
                        "model": model,
                        "temperature": 0.2,
                        "messages": [
                            {
                                "role": "user",
                                "content": (
                                    f"把“{name}”转换为 3-6 个用于搜索图标的小写英语短语，"
                                    '只返回 JSON 对象 {"keywords": [...]}。'
                                ),
                            }
                        ],
                        "response_format": {"type": "json_object"},
                    },
                ) as response:
                    response_content_type = response.headers.get("content-type")
                    declared_header = response.headers.get("content-length")
                    declared_response_size = (
                        int(declared_header) if declared_header and declared_header.isdigit() else None
                    )
                    raw_response = await response_bytes(response, MAX_ICON_BYTES)
                    response_size = len(raw_response)
                    parse_phase = "http_status"
                    response.raise_for_status()
                parse_phase = "json_decode"
                content = json.loads(raw_response)["choices"][0]["message"]["content"]
                parse_phase = "contract_validate"
                values = json.loads(content)
                values = values.get("keywords", values) if isinstance(values, dict) else values
                if not isinstance(values, list):
                    raise ValueError("关键词格式无效")
                keywords = [
                    item.strip().lower()
                    for item in values
                    if isinstance(item, str) and item.strip().isascii()
                ]
                if not 3 <= len(keywords) <= 6:
                    raise ValueError("关键词数量无效")
                return keywords
        except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
            if isinstance(exc, ResponseLimitError):
                response_size = exc.bytes_read
                declared_response_size = exc.declared_length
            logger.exception(
                "图标英文关键词生成失败 operation=icon_keywords endpoint=%s model=%s "
                "status=%s content_type=%s declared_bytes=%s response_bytes=%s "
                "elapsed_ms=%.1f parse_phase=%s",
                _safe_endpoint(endpoint),
                model,
                response.status_code if response is not None else None,
                response_content_type,
                declared_response_size,
                response_size,
                (time.monotonic() - request_started_at) * 1000,
                parse_phase,
            )
            raise RuntimeError("英文关键词生成暂时不可用") from exc

    return provider


async def generate_icon_images(
    provider: IconGenerationProvider | None,
    name: str,
    count: int = 4,
    theme_key: str = "skeuomorphic",
    on_image: IconImageCallback | None = None,
) -> tuple[str, list[bytes]]:
    """在数据库事务外调用图标模型并校验候选数量。

    Args:
        provider: 异步图标生成 provider；未配置时拒绝请求。
        name: 新小类名称。
        count: 要求模型返回的候选数量，必须为正数。
        on_image: 每张图完成后的异步回调；旧 provider 不支持回调时在全部结果返回后补发。

    Returns:
        规范化后的小类名称与模型返回的图片字节列表。

    Raises:
        ValueError: 小类名称为空或候选数量配置无效。
        RuntimeError: provider 未配置或返回数量不符合约定。
    """
    normalized = name.strip()
    if not normalized:
        raise ValueError("小类名称不能为空")
    if count <= 0:
        raise ValueError("图标候选数量无效")
    if provider is None:
        raise RuntimeError("Agnes 图标生成服务尚未配置")
    started_at = time.monotonic()
    parameters = inspect.signature(provider).parameters
    supports_image_callback = len(parameters) >= 4
    if supports_image_callback:
        images = await provider(normalized, count, theme_key, on_image)
    elif len(parameters) >= 3:
        images = await provider(normalized, count, theme_key)
    else:
        images = await provider(normalized, count)
    if on_image is not None and not supports_image_callback:
        for index, image in enumerate(images):
            await on_image(index, image)
    if len(images) != count:
        logger.error(
            "图标生成结果数量无效 operation=icon_generation expected_count=%s "
            "actual_count=%s elapsed_ms=%.1f",
            count,
            len(images),
            (time.monotonic() - started_at) * 1000,
        )
        raise RuntimeError("Agnes 图标生成结果数量无效")
    logger.info(
        "图标模型阶段完成 operation=icon_generation candidate_count=%s elapsed_ms=%.1f",
        len(images),
        (time.monotonic() - started_at) * 1000,
    )
    return normalized, images


def _remove_path(path: Path) -> None:
    """删除一个文件或目录；目标已经不存在时保持幂等。"""
    try:
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink(missing_ok=True)
    except OSError:
        logger.exception("图标资产清理失败，后续清理任务可再次处理：%s", path)


async def _remove_tree_async(path: Path) -> None:
    """异步删除临时资产目录，避免在协程中阻塞事件循环。"""
    target = anyio.Path(path)
    if not await target.exists():
        return
    if await target.is_dir():
        async for child in target.iterdir():
            await _remove_tree_async(Path(child))
        await target.rmdir()
    else:
        await target.unlink(missing_ok=True)


def _install_file_transaction_hooks(session: AsyncSession) -> None:
    """为会话安装一次文件提交/回滚补偿钩子。"""
    if session.info.get("fridgeboard_file_hooks"):
        return

    def after_commit(committed_session: object) -> None:
        for path in committed_session.info.pop("fridgeboard_remove_after_commit", []):
            _remove_path(path)
        committed_session.info.pop("fridgeboard_remove_after_rollback", None)

    def after_rollback(rolled_back_session: object) -> None:
        for path in rolled_back_session.info.pop("fridgeboard_remove_after_rollback", []):
            _remove_path(path)
        rolled_back_session.info.pop("fridgeboard_remove_after_commit", None)

    event.listen(session.sync_session, "after_commit", after_commit)
    event.listen(session.sync_session, "after_rollback", after_rollback)
    session.info["fridgeboard_file_hooks"] = True


def schedule_removal_after_commit(session: AsyncSession, path: Path) -> None:
    """在当前数据库事务成功提交后删除文件或目录。"""
    _install_file_transaction_hooks(session)
    session.info.setdefault("fridgeboard_remove_after_commit", []).append(path)


def schedule_removal_after_rollback(session: AsyncSession, path: Path) -> None:
    """在当前数据库事务回滚后删除尚未提交的文件或目录。"""
    _install_file_transaction_hooks(session)
    session.info.setdefault("fridgeboard_remove_after_rollback", []).append(path)


def scoped_asset_path(root: Path, relative_path: str) -> Path:
    """安全解析资产相对路径，拒绝访问配置目录之外的目标。"""
    resolved_root = root.resolve()
    resolved = (root / relative_path).resolve()
    if resolved != resolved_root and resolved_root not in resolved.parents:
        raise ValueError("图标路径无效")
    return resolved


def _transparent_png(image_bytes: bytes) -> bytes:
    """把 Agnes 的纯白背景结果归一化为透明底 RGBA PNG。"""
    try:
        image = Image.open(BytesIO(image_bytes))
        if image.width * image.height > MAX_ICON_PIXELS:
            raise ValueError("图标像素数量超过 16MP 限制")
        image = image.convert("RGBA")
    except (OSError, ValueError) as exc:
        raise RuntimeError("Agnes 返回的图标不是有效图片") from exc
    pixels = []
    for red, green, blue, alpha in image.get_flattened_data():
        whiteness = min(red, green, blue)
        normalized_alpha = min(alpha, max(0, 255 - whiteness) * 3)
        pixels.append((red, green, blue, normalized_alpha))
    image.putdata(pixels)
    longest_edge = max(image.size)
    if longest_edge > 256:
        scale = 256 / longest_edge
        image = image.resize(
            (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
            Image.Resampling.LANCZOS,
        )
    output = BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()


def _raster_png(image_bytes: bytes) -> bytes:
    """解码普通用户/在线栅格图并等比限制尺寸，不改变像素语义。"""
    try:
        image = Image.open(BytesIO(image_bytes))
        if image.width * image.height > MAX_ICON_PIXELS:
            raise ValueError("图标像素数量超过 16MP 限制")
        if image.mode not in {"RGBA", "RGB"}:
            image = image.convert("RGBA")
    except (OSError, ValueError) as exc:
        raise ValueError("图片不是有效的 PNG/JPEG/WebP") from exc
    longest_edge = max(image.size)
    if longest_edge > 256:
        scale = 256 / longest_edge
        image = image.resize(
            (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
            Image.Resampling.LANCZOS,
        )
    output = BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()


def _svg_hush_binary() -> str:
    """返回 SVG 清洗器可执行文件路径，允许部署环境覆盖默认命令。"""
    return os.environ.get("FRIDGEBOARD_SVG_HUSH_BINARY", SVG_HUSH_BINARY)


def _validate_sanitized_svg(svg_bytes: bytes, expected_viewbox: str | None) -> bytes:
    """检查 svg-hush 输出的业务约束，不重复实现 SVG 安全清洗。"""
    max_bytes = SVG_MAX_BYTES if expected_viewbox is not None else SVG_MAX_ICONIFY_BYTES
    max_nodes = SVG_MAX_NODES if expected_viewbox is not None else SVG_MAX_ICONIFY_NODES
    if len(svg_bytes) > max_bytes:
        raise ValueError(f"SVG 图标清洗后仍超过 {max_bytes // 1000}KB 限制")
    try:
        root = ElementTree.fromstring(svg_bytes)
    except ElementTree.ParseError as exc:
        raise ValueError("SVG 安全清洗器返回了无效文档") from exc
    if root.tag != f"{{{SVG_NAMESPACE}}}svg":
        raise ValueError("SVG 安全清洗器返回的根元素或命名空间无效")
    if expected_viewbox is not None and root.attrib.get("viewBox") != expected_viewbox:
        raise ValueError(f"SVG 图标必须使用 {expected_viewbox} viewBox")
    if len(list(root.iter())) > max_nodes:
        raise ValueError(f"SVG 图标清洗后节点数超过 {max_nodes} 限制")
    for node in root.iter():
        for attribute, value in node.attrib.items():
            key = attribute.rsplit("}", 1)[-1].lower()
            if key in {"href", "xlink:href"} and not value.strip().startswith("#"):
                raise ValueError("SVG 图标不允许加载资源")
            _validate_svg_url_values(value)
        if node.text:
            _validate_svg_url_values(node.text)
    return svg_bytes


def _validate_svg_url_values(value: str) -> None:
    """拒绝清洗结果中的外部资源引用，仅允许 SVG 内部片段引用。"""
    for match in re.finditer(r"url\(\s*(['\"]?)(.*?)\1\s*\)", value, re.IGNORECASE):
        if not match.group(2).strip().startswith("#"):
            raise ValueError("SVG 图标不允许加载资源")


def _svg_hush_failure(stderr: bytes, returncode: int) -> ValueError:
    """将 svg-hush 的失败转换为不向客户端暴露原始文档的错误。"""
    detail = " ".join(stderr.decode("utf-8", errors="replace").split())[:240]
    logger.warning(
        "svg-hush 清洗失败 returncode=%s stderr_summary=%s",
        returncode,
        detail or "-",
    )
    normalized_detail = detail.lower()
    if "no acceptable svg elements" in normalized_detail:
        reason = "根元素缺少 SVG 命名空间，或清洗后没有可用图形元素"
    elif "parse error" in normalized_detail or "not well-formed" in normalized_detail:
        reason = "SVG XML 结构不完整或格式无效"
    else:
        reason = "可能包含脚本、外链或不支持的结构"
    return ValueError(f"SVG 安全清洗器拒绝了内容：{reason}")


def _run_svg_hush(svg_bytes: bytes, expected_viewbox: str | None) -> bytes:
    """同步调用 svg-hush，供同步兼容入口和测试使用。"""
    try:
        result = subprocess.run(
            [_svg_hush_binary(), "-"],
            input=svg_bytes,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            timeout=SVG_HUSH_TIMEOUT_SECONDS,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("SVG 安全清洗器未安装，请联系管理员") from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("SVG 安全清洗器处理超时，请稍后重试") from exc
    if result.returncode != 0:
        raise _svg_hush_failure(result.stderr, result.returncode)
    return _validate_sanitized_svg(result.stdout, expected_viewbox)


async def _run_svg_hush_async(svg_bytes: bytes, expected_viewbox: str | None) -> bytes:
    """异步调用 svg-hush，避免阻塞 FastAPI 事件循环。"""
    try:
        with anyio.fail_after(SVG_HUSH_TIMEOUT_SECONDS):
            result = await anyio.run_process(
                [_svg_hush_binary(), "-"],
                input=svg_bytes,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )
    except FileNotFoundError as exc:
        raise RuntimeError("SVG 安全清洗器未安装，请联系管理员") from exc
    except TimeoutError as exc:
        raise RuntimeError("SVG 安全清洗器处理超时，请稍后重试") from exc
    if result.returncode != 0:
        raise _svg_hush_failure(result.stderr, result.returncode)
    return _validate_sanitized_svg(result.stdout, expected_viewbox)


def sanitize_svg(svg_bytes: bytes) -> bytes:
    """使用 svg-hush 清洗需要固定 64x64 视图盒的 SVG 图标。"""
    if len(svg_bytes) > SVG_MAX_BYTES:
        raise ValueError("SVG 图标超过 64KB 限制")
    return _run_svg_hush(svg_bytes, "0 0 64 64")


async def sanitize_svg_async(svg_bytes: bytes) -> bytes:
    """异步使用 svg-hush 清洗需要固定 64x64 视图盒的 SVG 图标。"""
    if len(svg_bytes) > SVG_MAX_BYTES:
        raise ValueError("SVG 图标超过 64KB 限制")
    return await _run_svg_hush_async(svg_bytes, "0 0 64 64")


def sanitize_iconify_svg(svg_bytes: bytes) -> bytes:
    """使用 svg-hush 清洗在线 SVG，同时保留其原始 viewBox。"""
    if len(svg_bytes) > SVG_MAX_ICONIFY_BYTES:
        raise ValueError("SVG 图标超过 256KB 限制")
    return _run_svg_hush(svg_bytes, None)


async def sanitize_iconify_svg_async(svg_bytes: bytes) -> bytes:
    """异步使用 svg-hush 清洗在线 SVG，同时保留其原始 viewBox。"""
    if len(svg_bytes) > SVG_MAX_ICONIFY_BYTES:
        raise ValueError("SVG 图标超过 256KB 限制")
    return await _run_svg_hush_async(svg_bytes, None)


def _validate_remote_url(url: str, provider: str) -> str:
    """校验在线资源地址，只允许指定供应商的 HTTPS 主机。"""
    parsed = urlsplit(url)
    if parsed.scheme != "https" or parsed.hostname not in ONLINE_HOSTS:
        raise ValueError("在线图标地址不受支持")
    if parsed.port not in {None, 443}:
        raise ValueError("在线图标地址端口不受支持")
    if ONLINE_HOSTS[parsed.hostname] != provider or parsed.username or parsed.password:
        raise ValueError("在线图标地址不受支持")
    return url
