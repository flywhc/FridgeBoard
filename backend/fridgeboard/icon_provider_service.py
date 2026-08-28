"""Iconify 与 Thiings 在线图标 provider 适配器。"""

from __future__ import annotations

import contextlib
import ipaddress
import json
import logging
import os
import re
import time
from pathlib import Path
from urllib.parse import urljoin, urlsplit

import anyio
import httpx

from fridgeboard.icon_core import (
    MAX_ICON_BYTES,
    _raster_png,
    _safe_endpoint,
    _stream_request,
    _validate_remote_url,
    sanitize_iconify_svg_async,
    sanitize_svg_async,
)
from fridgeboard.icon_provider_helpers import (
    ICONIFY_PREFIX_LICENSES,
    provider_item_metadata,
    response_bytes,
)

logger = logging.getLogger(__name__)
_thiings_catalog_cache: tuple[
    float, str | None, list[dict[str, object]]
] | None = None
_thiings_catalog_refresh_lock = anyio.Lock()
DEFAULT_THIINGS_CATALOG_CACHE_TTL_SECONDS = 24 * 60 * 60
_THIINGS_CACHE_ITEM_FIELDS = frozenset(
    {
        "id",
        "slug",
        "file_id",
        "name",
        "title",
        "tags",
        "preview_url",
        "download_url",
        "image_url",
        "url",
        "src",
    }
)


class _ThiingsResourceNotFound(RuntimeError):
    """表示实际下载时 Thiings 资源明确返回 404 或 410。"""

    def __init__(self, url: str, status_code: int) -> None:
        super().__init__(f"Thiings resource returned HTTP {status_code}")
        self.url = url
        self.status_code = status_code


def _thiings_catalog_cache_ttl_seconds() -> float:
    """读取 Thiings catalog 缓存时长，非法配置回退到 24 小时。"""
    configured = os.environ.get("FRIDGEBOARD_THIINGS_CATALOG_CACHE_TTL_SECONDS")
    if configured is None:
        return DEFAULT_THIINGS_CATALOG_CACHE_TTL_SECONDS
    try:
        return max(0.0, float(configured))
    except ValueError:
        return DEFAULT_THIINGS_CATALOG_CACHE_TTL_SECONDS


async def _validate_remote_url_async(url: str, provider: str) -> str:
    """校验 HTTPS provider 地址并逐次解析 DNS，拒绝非公网目标。"""
    _validate_remote_url(url, provider)
    parsed = urlsplit(url)
    if parsed.hostname is None:
        raise ValueError("在线图标地址无效")
    try:
        addresses = await anyio.getaddrinfo(parsed.hostname, parsed.port or 443)
    except OSError as exc:
        raise ValueError("在线图标主机无法解析") from exc
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
            raise ValueError("在线图标主机地址不受支持")
    return url

async def search_online_icons(
    provider: str, query: str, cache_path: Path | None = None
) -> list[dict[str, str | None]]:
    """从 Iconify 或 Thiings 的公开目录异步检索图标。

    Args:
        provider: 在线图标来源标识。
        query: 要匹配的关键词。
        cache_path: Thiings 目录的持久缓存路径；Iconify 忽略此参数。

    Returns:
        与关键词匹配的在线图标元数据列表。
    """
    normalized = " ".join(query.split())
    if not normalized or provider not in {"iconify", "thiings"}:
        raise ValueError("在线图标搜索参数无效")
    if provider == "thiings":
        items = await _load_thiings_catalog(cache_path)
        needle = normalized.lower()
        results: list[dict[str, str | None]] = []
        for item in items:
            haystack = " ".join(
                str(item.get(field, "")) for field in ("id", "name", "title", "tags")
            ).lower()
            if needle not in haystack:
                continue
            item_id = str(item.get("id", ""))
            preview = _thiings_item_url(item, "preview_url")
            results.append(
                {
                    "id": item_id,
                    "label": str(item.get("name") or item.get("title") or item_id),
                    "preview_url": preview,
                    "source_url": f"https://www.thiings.co/things/{item_id}",
                    "license": "Thiings personal non-commercial",
                }
            )
        return results
    endpoint = "https://api.iconify.design/search"
    started_at = time.monotonic()
    response: httpx.Response | None = None
    response_size = 0
    try:
        await _validate_remote_url_async(endpoint, "iconify")
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(30, connect=30), follow_redirects=False
        ) as client:
            async with _stream_request(
                client, "GET", endpoint, params={"query": normalized, "limit": 30}
            ) as response:
                raw_response = await response_bytes(response, MAX_ICON_BYTES)
                response_size = len(raw_response)
                response.raise_for_status()
            payload = json.loads(raw_response)
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        logger.exception(
            "在线图标搜索失败 operation=icon_search provider=%s endpoint=%s query_length=%s "
            "status=%s content_type=%s response_bytes=%s elapsed_ms=%.1f parse_phase=%s",
            provider,
            _safe_endpoint(endpoint),
            len(normalized),
            response.status_code if response is not None else None,
            response.headers.get("content-type") if response is not None else None,
            response_size,
            (time.monotonic() - started_at) * 1000,
            "response_decode",
        )
        raise RuntimeError("在线图标搜索暂时不可用") from exc
    prefix = payload.get("prefixes", []) if isinstance(payload, dict) else []
    icons = payload.get("icons", []) if isinstance(payload, dict) else []
    collections = payload.get("collections", {}) if isinstance(payload, dict) else {}
    if not isinstance(prefix, list) or not isinstance(icons, list):
        raise RuntimeError("在线图标搜索响应无效")
    results: list[dict[str, str | None]] = []
    for icon_name in icons[:30]:
        if not isinstance(icon_name, str) or ":" not in icon_name:
            continue
        prefix = icon_name.split(":", 1)[0]
        if prefix not in ICONIFY_PREFIX_LICENSES:
            continue
        collection = (
            collections.get(prefix) if isinstance(collections, dict) else None
        )
        license_data = collection.get("license") if isinstance(collection, dict) else None
        author_data = collection.get("author") if isinstance(collection, dict) else None
        spdx = license_data.get("spdx") if isinstance(license_data, dict) else license_data
        if (
            not isinstance(spdx, str)
            or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9.+-]{1,40}", spdx)
            or spdx.upper() == "NOASSERTION"
            or spdx != ICONIFY_PREFIX_LICENSES[prefix]
            or (isinstance(collection, dict) and collection.get("palette") is True)
        ):
            continue
        results.append(
            {
                "id": icon_name,
                "label": icon_name,
                "preview_url": (
                    f"https://api.iconify.design/{prefix}"
                    f"/{icon_name.split(':', 1)[1]}.svg"
                ),
                "source_url": f"https://icon-sets.iconify.design/{prefix}/",
                "license": (spdx),
                "author": author_data.get("name") if isinstance(author_data, dict) else author_data,
            }
        )
    return results


def _thiings_item_url(item: dict[str, object], field: str = "download_url") -> str:
    """从目录 item 读取并校验 Thiings 图片地址。"""
    for key in (field, "download_url", "image_url", "url", "src"):
        value = item.get(key)
        if isinstance(value, str):
            return _validate_remote_url(value, "thiings")
    file_id = item.get("file_id")
    if isinstance(file_id, str) and re.fullmatch(r"[A-Za-z0-9_-]{16,80}", file_id):
        return _validate_remote_url(
            f"https://lftz25oez4aqbxpq.public.blob.vercel-storage.com/image-{file_id}.png",
            "thiings",
        )
    raise ValueError("Thiings 图标资源地址缺失")


def _cacheable_thiings_item(item: dict[str, object]) -> dict[str, object] | None:
    """提取可安全写入本地目录缓存的 Thiings 字段。"""
    if not isinstance(item.get("id"), str) or not item["id"]:
        return None
    cached: dict[str, object] = {}
    for key, value in item.items():
        if key not in _THIINGS_CACHE_ITEM_FIELDS:
            continue
        if isinstance(value, (str, int, float, bool)) or value is None:
            cached[key] = value
        elif isinstance(value, list) and all(isinstance(entry, str) for entry in value):
            cached[key] = value
    return cached


async def _read_thiings_catalog_cache(
    cache_path: Path | None,
) -> tuple[float, list[dict[str, object]]] | None:
    """异步读取并校验 Thiings 持久目录缓存。"""
    if cache_path is None:
        return None
    try:
        path = anyio.Path(cache_path)
        if not await path.exists():
            return None
        payload = json.loads(await path.read_text(encoding="utf-8"))
        fetched_at = payload.get("fetched_at") if isinstance(payload, dict) else None
        raw_items = payload.get("items") if isinstance(payload, dict) else None
        if not isinstance(fetched_at, (int, float)) or not isinstance(raw_items, list):
            raise ValueError("Thiings 持久缓存格式无效")
        items = [
            cached_item
            for item in raw_items
            if isinstance(item, dict)
            for cached_item in [_cacheable_thiings_item(item)]
            if cached_item is not None
        ]
        return float(fetched_at), items
    except (OSError, TypeError, ValueError, json.JSONDecodeError):
        logger.exception(
            "Thiings 持久目录缓存读取失败 operation=icon_catalog cache_path=%s",
            cache_path,
        )
        return None


async def _write_thiings_catalog_cache(
    cache_path: Path,
    fetched_at: float,
    items: list[dict[str, object]],
) -> None:
    """以临时文件替换方式异步写入 Thiings 目录缓存。"""
    path = anyio.Path(cache_path)
    await path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = anyio.Path(f"{cache_path}.{os.getpid()}.{time.time_ns()}.tmp")
    payload = {
        "schema_version": 1,
        "fetched_at": fetched_at,
        "items": items,
    }
    try:
        await temporary_path.write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        await temporary_path.replace(path)
    finally:
        with contextlib.suppress(OSError):
            if await temporary_path.exists():
                await temporary_path.unlink()


def _parse_thiings_catalog(payload: object) -> tuple[list[dict[str, object]], int]:
    """将 Thiings catalog 的当前数组格式规范化为搜索条目。"""
    raw_items = (
        payload.get("items", payload.get("things", [])) if isinstance(payload, dict) else payload
    )
    if not isinstance(raw_items, list):
        raise ValueError("Thiings 目录格式无效")
    categories = payload.get("categories") if isinstance(payload, dict) else None
    items: list[dict[str, object]] = []
    for raw_item in raw_items:
        if isinstance(raw_item, dict) and isinstance(raw_item.get("id"), str):
            items.append(raw_item)
            continue
        if not isinstance(raw_item, list) or len(raw_item) < 5:
            continue
        slug, file_id, name, category_indices, latest = raw_item[:5]
        if (
            not isinstance(slug, str)
            or not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,127}", slug)
            or not isinstance(file_id, str)
            or not re.fullmatch(r"[A-Za-z0-9_-]{16,80}", file_id)
            or not isinstance(name, str)
            or not isinstance(category_indices, list)
            or not isinstance(latest, (bool, int))
        ):
            continue
        tags = [
            categories[index]
            for index in category_indices
            if isinstance(categories, list)
            and isinstance(index, int)
            and 0 <= index < len(categories)
            and isinstance(categories[index], str)
        ]
        items.append(
            {
                "id": slug,
                "slug": slug,
                "file_id": file_id,
                "name": name,
                "tags": tags,
                "preview_url": f"https://lftz25oez4aqbxpq.public.blob.vercel-storage.com/image-{file_id}.png",
                "download_url": f"https://lftz25oez4aqbxpq.public.blob.vercel-storage.com/image-{file_id}.png",
            }
        )
    return items, len(raw_items)


def _merge_thiings_catalog(
    cached_items: list[dict[str, object]],
    fresh_items: list[dict[str, object]],
) -> list[dict[str, object]]:
    """合并新目录并永久保留没有出现在本次刷新的历史资源。"""
    fresh_by_id = {
        str(item["id"]): item
        for item in fresh_items
        if isinstance(item.get("id"), str) and item["id"]
    }
    merged_by_id = {
        str(item["id"]): item
        for item in cached_items
        if isinstance(item.get("id"), str) and item["id"]
    }
    merged_by_id.update(fresh_by_id)
    return list(merged_by_id.values())


async def _remove_thiings_catalog_item(cache_path: Path | None, item_id: str) -> None:
    """从内存和持久目录缓存中删除实际下载确认不存在的条目。"""
    cache_key = str(cache_path) if cache_path is not None else None
    async with _thiings_catalog_refresh_lock:
        persistent_cache = await _read_thiings_catalog_cache(cache_path)
        if persistent_cache is not None:
            fetched_at, cached_items = persistent_cache
            items = [item for item in cached_items if item.get("id") != item_id]
            if len(items) != len(cached_items) and cache_path is not None:
                try:
                    await _write_thiings_catalog_cache(cache_path, fetched_at, items)
                except (OSError, TypeError, ValueError):
                    logger.exception(
                        "Thiings 缓存条目删除失败 operation=icon_catalog_item_delete "
                        "item_id=%s cache_path=%s",
                        item_id,
                        cache_path,
                    )
            _set_thiings_memory_cache(cache_key, items)
            return
        if _thiings_catalog_cache and _thiings_catalog_cache[1] == cache_key:
            items = [item for item in _thiings_catalog_cache[2] if item.get("id") != item_id]
            _set_thiings_memory_cache(cache_key, items)


def _set_thiings_memory_cache(cache_key: str | None, items: list[dict[str, object]]) -> None:
    """更新指定缓存路径对应的进程内 Thiings 目录。"""
    global _thiings_catalog_cache
    _thiings_catalog_cache = (time.monotonic(), cache_key, items)


async def _load_thiings_catalog(cache_path: Path | None = None) -> list[dict[str, object]]:
    """异步加载 Thiings 公开目录，按日刷新并合并持久历史缓存。"""
    async with _thiings_catalog_refresh_lock:
        return await _load_thiings_catalog_unlocked(cache_path)


async def _load_thiings_catalog_unlocked(cache_path: Path | None) -> list[dict[str, object]]:
    """在 Thiings 刷新锁内加载目录，避免重复请求上游。"""
    global _thiings_catalog_cache
    now = time.monotonic()
    cache_ttl = _thiings_catalog_cache_ttl_seconds()
    cache_key = str(cache_path) if cache_path is not None else None
    if (
        _thiings_catalog_cache
        and _thiings_catalog_cache[1] == cache_key
        and now - _thiings_catalog_cache[0] < cache_ttl
    ):
        logger.info(
            "Thiings catalog 命中内存缓存 operation=icon_catalog catalog_items=%s cache_age_s=%.1f",
            len(_thiings_catalog_cache[2]),
            now - _thiings_catalog_cache[0],
        )
        return _thiings_catalog_cache[2]
    persistent_cache = await _read_thiings_catalog_cache(cache_path)
    if persistent_cache is not None and time.time() - persistent_cache[0] < cache_ttl:
        _thiings_catalog_cache = (now, cache_key, persistent_cache[1])
        logger.info(
            "Thiings catalog 命中持久缓存 operation=icon_catalog catalog_items=%s cache_age_s=%.1f",
            len(persistent_cache[1]),
            max(0.0, time.time() - persistent_cache[0]),
        )
        return persistent_cache[1]
    endpoint = os.environ.get(
        "FRIDGEBOARD_THIINGS_CATALOG_URL", "https://www.thiings.co/api/catalog"
    )
    await _validate_remote_url_async(endpoint, "thiings")
    started_at = time.monotonic()
    response: httpx.Response | None = None
    response_size = 0
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(30, connect=30), follow_redirects=False
        ) as client:
            async with _stream_request(client, "GET", endpoint) as response:
                raw_response = await response_bytes(response, MAX_ICON_BYTES)
                response_size = len(raw_response)
                response.raise_for_status()
            payload = json.loads(raw_response)
        items, raw_item_count = _parse_thiings_catalog(payload)
        if raw_item_count > 0 and not items:
            raise ValueError("Thiings 目录未解析出有效条目")
    except (httpx.HTTPError, ValueError, TypeError, RuntimeError) as exc:
        logger.exception(
            "Thiings 目录获取失败 operation=icon_catalog provider=thiings endpoint=%s "
            "status=%s content_type=%s response_bytes=%s elapsed_ms=%.1f parse_phase=%s",
            _safe_endpoint(endpoint),
            response.status_code if response is not None else None,
            response.headers.get("content-type") if response is not None else None,
            response_size,
            (time.monotonic() - started_at) * 1000,
            "catalog_decode",
        )
        if persistent_cache is not None:
            _thiings_catalog_cache = (now, cache_key, persistent_cache[1])
            logger.warning(
                "Thiings catalog 刷新失败，继续使用历史缓存 operation=icon_catalog "
                "catalog_items=%s",
                len(persistent_cache[1]),
            )
            return persistent_cache[1]
        raise RuntimeError("Thiings 图标目录暂时不可用") from exc
    if persistent_cache is not None:
        items = _merge_thiings_catalog(persistent_cache[1], items)
    fetched_at = time.time()
    if cache_path is not None:
        try:
            await _write_thiings_catalog_cache(cache_path, fetched_at, items)
        except (OSError, TypeError, ValueError):
            logger.exception(
                "Thiings catalog 持久缓存写入失败 operation=icon_catalog cache_path=%s",
                cache_path,
            )
    _thiings_catalog_cache = (time.monotonic(), cache_key, items)
    logger.info(
        "Thiings catalog 加载完成 operation=icon_catalog raw_items=%s "
        "catalog_items=%s elapsed_ms=%.1f",
        raw_item_count,
        len(items),
        (time.monotonic() - started_at) * 1000,
    )
    return items


async def download_provider_item(
    provider: str, item_id: str, cache_path: Path | None = None
) -> tuple[bytes, str, str]:
    """根据可信 provider item ID 解析并下载图标，拒绝客户端任意 URL。

    Args:
        provider: 在线图标来源标识。
        item_id: provider 返回的稳定图标 ID。
        cache_path: Thiings 目录的持久缓存路径；Iconify 忽略此参数。

    Returns:
        图标内容、媒体类型和最终可信来源地址。
    """
    if provider == "iconify":
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}:[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}", item_id):
            raise ValueError("Iconify 图标 ID 无效")
        prefix, name = item_id.split(":", 1)
        provider_item_metadata(provider, item_id)
        url = f"https://api.iconify.design/{prefix}/{name}.svg"
    elif provider == "thiings":
        item = next(
            (item for item in await _load_thiings_catalog(cache_path) if item.get("id") == item_id),
            None,
        )
        if item is None:
            raise ValueError("Thiings 图标 ID 不存在")
        url = _thiings_item_url(item)
    else:
        raise ValueError("在线图标来源无效")
    try:
        content, media_type = await download_online_icon(provider, url)
    except _ThiingsResourceNotFound as exc:
        await _remove_thiings_catalog_item(cache_path, item_id)
        logger.warning(
            "Thiings 图标资源已确认不存在，已从缓存删除 operation=icon_download "
            "provider=thiings item_id=%s endpoint=%s status=%s",
            item_id,
            _safe_endpoint(exc.url),
            exc.status_code,
        )
        raise RuntimeError("在线图标下载失败") from exc
    return content, media_type, url


async def download_online_icon(provider: str, url: str) -> tuple[bytes, str]:
    """异步下载并校验一个在线 SVG/PNG 图标，返回内容和媒体类型。"""
    await _validate_remote_url_async(url, provider)
    if provider == "iconify":
        parts = urlsplit(url)
        prefix = parts.path.strip("/").split("/", 1)[0]
        if prefix not in ICONIFY_PREFIX_LICENSES:
            raise ValueError("Iconify 图标集合不在许可 allowlist 中")
    started_at = time.monotonic()
    response: httpx.Response | None = None
    response_size = 0
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(30, connect=30), follow_redirects=False
        ) as client:
            current_url = url
            for _ in range(4):
                await _validate_remote_url_async(current_url, provider)
                async with _stream_request(client, "GET", current_url) as response:
                    if not response.is_redirect:
                        raw_response = await response_bytes(response, MAX_ICON_BYTES)
                        response_size = len(raw_response)
                        break
                    location = response.headers.get("location")
                    if not location:
                        raise ValueError("在线图标重定向地址无效")
                    current_url = urljoin(current_url, location)
            else:
                raise ValueError("在线图标重定向次数过多")
            if response is None:
                raise ValueError("在线图标响应为空")
            if provider == "thiings" and response.status_code in {404, 410}:
                raise _ThiingsResourceNotFound(url, response.status_code)
            response.raise_for_status()
            content_type = response.headers.get("content-type", "").split(";", 1)[0].lower()
            if provider == "iconify" or content_type == "image/svg+xml" or url.endswith(".svg"):
                sanitizer = (
                    sanitize_iconify_svg_async if provider == "iconify" else sanitize_svg_async
                )
                return await sanitizer(raw_response), "image/svg+xml"
            if content_type not in {"image/png", "image/jpeg", "image/webp"}:
                raise ValueError("在线图标媒体类型无效")
            return _raster_png(raw_response), "image/png"
    except _ThiingsResourceNotFound:
        raise
    except (httpx.HTTPError, OSError, ValueError, RuntimeError) as exc:
        logger.exception(
            "在线图标下载失败 operation=icon_download provider=%s endpoint=%s status=%s "
            "content_type=%s response_bytes=%s elapsed_ms=%.1f parse_phase=%s",
            provider,
            _safe_endpoint(url),
            response.status_code if response is not None else None,
            response.headers.get("content-type") if response is not None else None,
            response_size,
            (time.monotonic() - started_at) * 1000,
            "download_validate",
        )
        raise RuntimeError("在线图标下载失败") from exc
