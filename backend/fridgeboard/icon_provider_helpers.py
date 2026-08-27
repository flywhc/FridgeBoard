"""在线图标 provider 的无状态校验 helper。"""

from __future__ import annotations

import re

import httpx

ICONIFY_PREFIX_LICENSES = {
    "mdi": "Apache-2.0",
    "lucide": "ISC",
    "tabler": "MIT",
    "heroicons": "MIT",
    "carbon": "Apache-2.0",
    "bi": "MIT",
    "fa6-solid": "CC-BY-4.0",
}


class ResponseLimitError(ValueError):
    """表示 provider 响应超过限制，并携带已知长度上下文。"""

    def __init__(self, declared_length: int | None, bytes_read: int) -> None:
        """保存响应声明长度和已经消费的字节数。"""
        super().__init__("在线图标响应过大")
        self.declared_length = declared_length
        self.bytes_read = bytes_read


async def response_bytes(response: httpx.Response, limit: int) -> bytes:
    """分块读取 HTTP 响应，拒绝无长度或分块超限的内容。"""
    declared = response.headers.get("content-length")
    declared_length: int | None = None
    if declared is not None:
        try:
            declared_length = int(declared)
            if declared_length > limit:
                raise ResponseLimitError(declared_length, 0)
        except ValueError as exc:
            if isinstance(exc, ResponseLimitError):
                raise
            raise ValueError("在线图标响应长度无效") from exc
    chunks: list[bytes] = []
    total = 0
    async for chunk in response.aiter_bytes():
        total += len(chunk)
        if total > limit:
            raise ResponseLimitError(declared_length, total)
        chunks.append(chunk)
    return b"".join(chunks)


def provider_item_metadata(provider: str, item_id: str) -> dict[str, str | None]:
    """返回 provider item 的可持久化来源和许可元数据。"""
    if provider == "iconify" and re.fullmatch(
        r"[a-z0-9][a-z0-9-]{0,63}:[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}", item_id
    ):
        prefix = item_id.split(":", 1)[0]
        license_spdx = ICONIFY_PREFIX_LICENSES.get(prefix)
        if license_spdx is None:
            raise ValueError("Iconify 图标集合不在许可 allowlist 中")
        return {
            "license_spdx": license_spdx,
            "license_url": f"https://icon-sets.iconify.design/{prefix}/",
            "attribution": f"Iconify collection {prefix}",
        }
    if provider == "thiings":
        return {
            "license_spdx": "Thiings-Personal-NonCommercial",
            "license_url": "https://www.thiings.co/things",
            "attribution": f"Thiings {item_id}",
        }
    raise ValueError("在线图标来源或 item id 无效")
