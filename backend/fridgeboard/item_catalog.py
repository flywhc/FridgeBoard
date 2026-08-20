"""数据驱动的物品分类与内置图标目录。

本模块从版本化 JSON 清单读取内置大类、小类和图标元数据，并幂等同步到 SQLite。
业务服务只查询数据库，不在 Python 常量中维护分类或 SVG 路径。
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

from sqlalchemy import delete, or_, select
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.ext.asyncio import AsyncSession

from fridgeboard.persistence.models import (
    FoodCategory,
    GlobalItemCategoryMapping,
    IconAsset,
    InventoryBatchModel,
    ItemCategoryMapping,
    RecentSubcategoryUsage,
    RecipeIngredientModel,
)

CATALOG_ROOT = Path(__file__).resolve().parent / "assets" / "item_catalog"
CATALOG_PATH = CATALOG_ROOT / "catalog.json"
ICON_VARIANTS_PATH = CATALOG_ROOT / "theme_variants.json"


@lru_cache(maxsize=1)
def load_catalog() -> dict[str, Any]:
    """读取并缓存版本化物品目录。

    Returns:
        包含图标、大类和小类顺序的目录数据。

    Raises:
        RuntimeError: 清单不存在、不是 JSON 对象或缺少必要列表时抛出。
    """
    try:
        payload = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError("内置物品目录无法读取") from exc
    if not isinstance(payload, dict) or not all(
        isinstance(payload.get(key), list) for key in ("icons", "groups", "subcategories")
    ) or not isinstance(payload.get("removed_subcategory_names", []), list):
        raise RuntimeError("内置物品目录格式无效")
    return payload


def active_builtin_subcategory_ids() -> set[str]:
    """返回当前版本目录中允许参与自动分类的内置小类 ID。"""
    return {str(item["id"]) for item in load_catalog()["subcategories"]}


@lru_cache(maxsize=1)
def load_icon_variants() -> dict[str, dict[str, str]]:
    """读取主题图标变体清单。

    Returns:
        按主题和逻辑图标键索引的变体相对路径。

    Raises:
        RuntimeError: 变体清单不存在、不是 JSON 对象或包含无效路径时抛出。
    """
    try:
        payload = json.loads(ICON_VARIANTS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError("主题图标变体清单无法读取") from exc
    if not isinstance(payload, dict):
        raise RuntimeError("主题图标变体清单格式无效")
    variants: dict[str, dict[str, str]] = {}
    for theme_key, theme_variants in payload.items():
        if not isinstance(theme_key, str) or not isinstance(theme_variants, dict):
            raise RuntimeError("主题图标变体清单格式无效")
        if not all(
            isinstance(icon_key, str) and isinstance(path, str)
            for icon_key, path in theme_variants.items()
        ):
            raise RuntimeError("主题图标变体清单格式无效")
        variants[theme_key] = dict(theme_variants)
    return variants


def builtin_icon_variants(icon_key: str) -> dict[str, tuple[Path, str]]:
    """返回内置图标已有的主题变体路径和媒体类型。

    Args:
        icon_key: 内置逻辑图标键。

    Returns:
        主题键到资产路径、媒体类型的映射；不存在或文件缺失的变体会被忽略。
    """
    variants: dict[str, tuple[Path, str]] = {}
    for theme_key, theme_icons in load_icon_variants().items():
        relative_path = theme_icons.get(icon_key)
        if not relative_path:
            continue
        path = builtin_icon_path(relative_path)
        if path.is_file():
            variants[theme_key] = (path, "image/png")
    return variants


def builtin_icon_variant_urls(icon_key: str, asset_url: str) -> dict[str, dict[str, str]]:
    """将内置图标变体转换为 API 响应中的 URL 和媒体类型。

    Args:
        icon_key: 内置逻辑图标键。
        asset_url: 变体路由的基础 URL，不包含查询字符串。

    Returns:
        主题键到资源 URL、媒体类型的映射。
    """
    return {
        theme_key: {
            "asset_url": (
                f"{asset_url}?{urlencode({'theme': theme_key, 'v': asset_revision(path)})}"
            ),
            "media_type": media_type,
        }
        for theme_key, (path, media_type) in builtin_icon_variants(icon_key).items()
    }


async def ensure_builtin_catalog(session: AsyncSession) -> None:
    """把版本化目录幂等同步到当前数据库事务。

    已有内置节点会更新名称、顺序和图标关联；清理已从清单移除且没有业务引用的
    旧内置节点和图标；用户自定义节点及仍被历史数据引用的内置节点不受影响。大类的
    ``icon_key`` 始终清空，保证它们只能作为展开选择器的导航分组。

    Args:
        session: 由调用方管理提交边界的数据库会话。
    """
    if session.info.get("fridgeboard_builtin_catalog_synced"):
        return
    catalog = load_catalog()
    expected_group_ids = {item["id"] for item in catalog["groups"]}
    expected_subcategory_ids = {item["id"] for item in catalog["subcategories"]}
    expected_icon_keys = {item["key"] for item in catalog["icons"]}
    removed_names = set(catalog.get("removed_subcategory_names", []))
    obsolete_subcategories = await session.scalars(
        select(FoodCategory).where(
            FoodCategory.parent_id.is_not(None),
            (
                FoodCategory.id.like("builtin-%")
                & FoodCategory.id.not_in(expected_subcategory_ids)
            )
            | FoodCategory.name.in_(removed_names),
        )
    )
    removed_icon_keys: set[str] = set()
    for subcategory in obsolete_subcategories:
        if subcategory.icon_key:
            removed_icon_keys.add(subcategory.icon_key)
        subcategory.icon_key = None
        has_inventory = await session.scalar(
            select(InventoryBatchModel.id)
            .where(InventoryBatchModel.subcategory_id == subcategory.id)
            .limit(1)
        )
        has_recipe_reference = await session.scalar(
            select(RecipeIngredientModel.id)
            .where(RecipeIngredientModel.subcategory_id == subcategory.id)
            .limit(1)
        )
        if has_inventory is None and has_recipe_reference is None:
            await session.execute(
                delete(RecentSubcategoryUsage).where(
                    RecentSubcategoryUsage.subcategory_id == subcategory.id
                )
            )
            await session.execute(
                delete(ItemCategoryMapping).where(
                    ItemCategoryMapping.subcategory_id == subcategory.id
                )
            )
            await session.execute(
                delete(GlobalItemCategoryMapping).where(
                    GlobalItemCategoryMapping.subcategory_id == subcategory.id
                )
            )
            await session.delete(subcategory)

    obsolete_icons = await session.scalars(
        select(IconAsset).where(
            (
                (IconAsset.source == "builtin")
                & IconAsset.key.not_in(expected_icon_keys)
            )
            | IconAsset.key.in_(removed_icon_keys),
        )
    )
    for icon in obsolete_icons:
        is_referenced = await session.scalar(
            select(FoodCategory.id)
            .where(FoodCategory.icon_key == icon.key)
            .limit(1)
        )
        if is_referenced is None:
            await session.delete(icon)

    for item in catalog["icons"]:
        values = {
            "key": item["key"],
            "refrigerator_id": None,
            "label": item["label"],
            "media_type": item["media_type"],
            "storage_path": item["path"],
            "source": "builtin",
        }
        await session.execute(
            insert(IconAsset)
            .values(**values)
            .on_conflict_do_update(index_elements=[IconAsset.key], set_=values)
        )

    for item in catalog["groups"]:
        values = {
            "id": item["id"],
            "refrigerator_id": None,
            "parent_id": None,
            "name": item["name"],
            "icon_key": None,
            "is_custom": False,
            "display_order": item["display_order"],
        }
        await session.execute(
            insert(FoodCategory)
            .values(**values)
            .on_conflict_do_update(index_elements=[FoodCategory.id], set_=values)
        )

    for item in catalog["subcategories"]:
        values = {
            "id": item["id"],
            "refrigerator_id": None,
            "parent_id": item["parent_id"],
            "name": item["name"],
            "icon_key": item["icon_key"],
            "is_custom": False,
            "display_order": item["display_order"],
        }
        await session.execute(
            insert(FoodCategory)
            .values(**values)
            .on_conflict_do_update(index_elements=[FoodCategory.id], set_=values)
        )
    # 先更新小类归属，再清理旧大类，避免历史大类因仍挂着待迁移小类而残留。
    obsolete_groups = await session.scalars(
        select(FoodCategory).where(
            FoodCategory.id.like("builtin-group-%"),
            FoodCategory.id.not_in(expected_group_ids),
        )
    )
    for group in obsolete_groups:
        has_children = await session.scalar(
            select(FoodCategory.id).where(FoodCategory.parent_id == group.id).limit(1)
        )
        if has_children is None:
            await session.delete(group)
    await session.flush()
    session.info["fridgeboard_builtin_catalog_synced"] = True


async def initialize_recent_subcategories(
    session: AsyncSession, refrigerator_id: str, limit: int = 16
) -> None:
    """为新建冰箱写入一次性默认最近小类记录。

    Args:
        session: 由调用方管理提交边界的数据库会话。
        refrigerator_id: 新建冰箱 ID。
        limit: 要初始化的默认小类数量。
    """
    catalog = load_catalog()
    removed_names = set(catalog.get("removed_subcategory_names", []))
    visible_ids = {item["id"] for item in [*catalog["groups"], *catalog["subcategories"]]}
    categories = list(
        await session.scalars(
            select(FoodCategory).where(
                or_(
                    FoodCategory.id.in_(visible_ids),
                    FoodCategory.refrigerator_id == refrigerator_id,
                )
            )
        )
    )
    by_id = {item.id: item for item in categories}
    children = [
        item
        for item in categories
        if item.parent_id is not None
        and item.parent_id in by_id
        and item.name not in removed_names
    ]
    children.sort(
        key=lambda item: (
            by_id[item.parent_id].display_order,
            item.display_order,
            item.name.casefold(),
            item.id,
        )
    )
    existing_ids = set(
        await session.scalars(
            select(RecentSubcategoryUsage.subcategory_id).where(
                RecentSubcategoryUsage.refrigerator_id == refrigerator_id
            )
        )
    )
    seen_icons: set[str] = set()
    seed_timestamp = datetime(1970, 1, 1)
    seed_index = 0
    for item in children:
        if len(seen_icons) >= limit:
            break
        icon_key = item.icon_key or item.id
        if item.id in existing_ids or icon_key in seen_icons:
            continue
        seen_icons.add(icon_key)
        session.add(
            RecentSubcategoryUsage(
                refrigerator_id=refrigerator_id,
                subcategory_id=item.id,
                last_added_at=seed_timestamp - timedelta(microseconds=seed_index),
                is_bootstrap=True,
            )
        )
        seed_index += 1


def builtin_icon_path(relative_path: str) -> Path:
    """安全解析一个清单内置图标路径。

    Args:
        relative_path: 相对于内置目录根路径的资产位置。

    Returns:
        已验证仍位于目录根下的绝对路径。

    Raises:
        ValueError: 路径越出内置目录时抛出。
    """
    root = CATALOG_ROOT.resolve()
    candidate = (root / relative_path).resolve()
    if candidate != root and root not in candidate.parents:
        raise ValueError("图标资产路径无效")
    return candidate


def asset_revision(path: Path) -> str:
    """返回图标文件的版本标识，用于使浏览器缓存随文件变化失效。

    Args:
        path: 已解析且应当存在的图标文件路径。

    Returns:
        文件最后修改时间的纳秒值；文件暂时不可读时返回 ``missing``。
    """
    try:
        return str(path.stat().st_mtime_ns)
    except OSError:
        return "missing"
