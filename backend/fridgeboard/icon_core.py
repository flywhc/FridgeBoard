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
            "只使用 path/circle/ellipse/rect/line/polyline/polygon 元素。"
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
                return [sanitize_svg(item.encode()) for item in values]
        except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
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
            raise RuntimeError("水墨图标生成暂时不可用") from exc

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


def sanitize_svg(svg_bytes: bytes) -> bytes:
    """Validate and clean a small transparent SVG icon.

    Args:
        svg_bytes: UTF-8 SVG document bytes.

    Returns:
        Canonical UTF-8 SVG bytes containing only safe drawing elements.

    Raises:
        ValueError: If the SVG is malformed, external, interactive, or too complex.
    """
    if (
        len(svg_bytes) > 64_000
        or b"<!doctype" in svg_bytes.lower()
        or b"<!entity" in svg_bytes.lower()
    ):
        raise ValueError("SVG 图标过大")
    try:
        root = ElementTree.fromstring(svg_bytes)
    except ElementTree.ParseError as exc:
        raise ValueError("SVG 图标格式无效") from exc
    if root.tag.rsplit("}", 1)[-1] != "svg":
        raise ValueError("SVG 根元素无效")
    if root.attrib.get("viewBox", "") != "0 0 64 64":
        raise ValueError("SVG 图标必须使用 0 0 64 64 viewBox")
    allowed = {"svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon"}
    monochrome = {"none", "currentcolor", "black", "#000", "#000000"}
    allowed_attributes = {
        "svg": {"xmlns", "width", "height", "viewbox", "fill"},
        "g": {"fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "transform"},
        "path": {
            "d",
            "fill",
            "stroke",
            "stroke-width",
            "stroke-linecap",
            "stroke-linejoin",
            "transform",
        },
        "circle": {"cx", "cy", "r", "fill", "stroke", "stroke-width", "transform"},
        "ellipse": {"cx", "cy", "rx", "ry", "fill", "stroke", "stroke-width", "transform"},
        "rect": {
            "x",
            "y",
            "width",
            "height",
            "rx",
            "ry",
            "fill",
            "stroke",
            "stroke-width",
            "transform",
        },
        "line": {"x1", "y1", "x2", "y2", "fill", "stroke", "stroke-width", "transform"},
        "polyline": {"points", "fill", "stroke", "stroke-width", "transform"},
        "polygon": {"points", "fill", "stroke", "stroke-width", "transform"},
    }
    colors = {"none", "currentColor", "black", "#000", "#000000"}
    nodes = list(root.iter())
    if len(nodes) > 80:
        raise ValueError("SVG 图标过于复杂")
    for node in nodes:
        name = node.tag.rsplit("}", 1)[-1].lower()
        if name not in allowed:
            raise ValueError("SVG 图标包含不支持的元素")
        for attribute, value in node.attrib.items():
            attribute_name = attribute.rsplit("}", 1)[-1].lower()
            if attribute_name not in allowed_attributes.get(name, set()):
                raise ValueError("SVG 图标包含不允许的属性")
            if attribute_name in {"fill", "stroke"} and value not in colors:
                raise ValueError("SVG 图标颜色不受支持")
            if any(
                token in value.lower()
                for token in (
                    "javascript:",
                    "data:",
                    "http:",
                    "https:",
                    "url(",
                    "doctype",
                    "entity",
                )
            ):
                raise ValueError("SVG 图标不允许外部资源")
            if attribute_name == "d" and len(value) > 2_000:
                raise ValueError("SVG 图标路径过长")
    if sum(len(node.attrib.get("d", "")) for node in nodes) > 8_000:
        raise ValueError("SVG 图标路径总长度过长")
    return ElementTree.tostring(root, encoding="utf-8", xml_declaration=True)


def sanitize_iconify_svg(svg_bytes: bytes) -> bytes:
    """清洗 Iconify 的合法外部 SVG，保留其原始 viewBox 以避免破坏图形。"""
    if (
        len(svg_bytes) > 256_000
        or b"<!doctype" in svg_bytes.lower()
        or b"<!entity" in svg_bytes.lower()
    ):
        raise ValueError("SVG 图标过大或包含实体")
    try:
        root = ElementTree.fromstring(svg_bytes)
    except ElementTree.ParseError as exc:
        raise ValueError("SVG 图标格式无效") from exc
    if root.tag.rsplit("}", 1)[-1].lower() != "svg" or "viewBox" not in root.attrib:
        raise ValueError("Iconify SVG 根元素无效")
    allowed = {"svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon"}
    monochrome = {"none", "currentcolor", "black", "#000", "#000000"}
    for node in list(root.iter()):
        name = node.tag.rsplit("}", 1)[-1].lower()
        if name not in allowed or len(node.attrib) > 12:
            raise ValueError("Iconify SVG 包含不支持的结构")
        for attribute, value in node.attrib.items():
            key = attribute.rsplit("}", 1)[-1].lower()
            if key.startswith("on") or key in {"style", "class", "id", "href", "xlink:href"}:
                raise ValueError("Iconify SVG 包含不安全属性")
            if "url(" in value.lower() or "javascript:" in value.lower():
                raise ValueError("Iconify SVG 包含外部资源")
            if (
                key in {"fill", "stroke", "color"}
                and value.lower().replace(" ", "") not in monochrome
            ):
                raise ValueError("Iconify SVG 必须为单色图标")
    return ElementTree.tostring(root, encoding="utf-8", xml_declaration=True)


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
