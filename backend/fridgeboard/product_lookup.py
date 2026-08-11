"""通过公开条码数据库查询商品基础资料。"""

from __future__ import annotations

import json
from dataclasses import dataclass
from time import monotonic
from urllib.parse import quote

import httpx


@dataclass(frozen=True)
class ProductLookup:
    """一次公开商品库查询的可填充结果。"""

    item_name: str
    product_description: str | None
    barcode: str
    source: str


async def lookup_product_by_barcode(barcode: str) -> ProductLookup | None:
    """异步按条码依次查询免费公开商品库，查不到时返回 ``None``。

    公开数据库覆盖不完整，因此网络错误和未收录都视为“未找到”，不阻塞手工录入。

    Args:
        barcode: 相机解码得到的条码文本。

    Returns:
        可用于填充添加物品页的商品资料，或 ``None``。
    """
    normalized = barcode.strip()
    if not normalized or len(normalized) > 128:
        return None
    encoded = quote(normalized, safe="")
    providers = (
        ("Open Food Facts", f"https://world.openfoodfacts.org/api/v2/product/{encoded}.json"),
        ("Open Products Facts", f"https://world.openproductsfacts.org/api/v2/product/{encoded}.json"),
    )
    deadline = monotonic() + 30
    timeout = httpx.Timeout(connect=5, read=30, write=10, pool=5)
    async with httpx.AsyncClient(timeout=timeout) as client:
        for source, url in providers:
            remaining = deadline - monotonic()
            if remaining <= 0:
                break
            payload = await _get_json(client, url, min(30, remaining))
            if not payload or payload.get("status") != 1:
                continue
            product = payload.get("product")
            if not isinstance(product, dict):
                continue
            item_name = _first_text(
                product,
                "product_name_zh",
                "product_name_cn",
                "product_name",
                "generic_name_zh",
                "generic_name",
            )
            if not item_name:
                continue
            description_parts = [
                _first_text(product, "brands", "brands_zh"),
                _first_text(product, "quantity", "quantity_zh"),
            ]
            description = " ".join(part for part in description_parts if part) or None
            return ProductLookup(item_name[:160], description, normalized, source)
    return None


async def _get_json(
    client: httpx.AsyncClient, url: str, timeout: float
) -> dict[str, object] | None:
    """异步读取一个公开商品库 JSON 响应，失败时返回 ``None``。"""
    try:
        response = await client.get(
            url,
            headers={"User-Agent": "FridgeBoard/0.1 (product lookup)"},
            timeout=timeout,
        )
        response.raise_for_status()
        payload = response.json()
    except (httpx.HTTPError, ValueError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def _first_text(product: dict[str, object], *keys: str) -> str | None:
    for key in keys:
        value = product.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None
