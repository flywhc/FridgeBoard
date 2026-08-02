"""数据驱动的物品分类与内置图标目录。

本模块从版本化 JSON 清单读取内置大类、小类和图标元数据，并幂等同步到 SQLite。
业务服务只查询数据库，不在 Python 常量中维护分类或 SVG 路径。
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.orm import Session

from fridgeboard.persistence.models import (
    FoodCategory,
    IconAsset,
    InventoryBatchModel,
    RecentSubcategoryUsage,
    RecipeIngredientModel,
)

CATALOG_ROOT = Path(__file__).resolve().parent / "assets" / "item_catalog"
CATALOG_PATH = CATALOG_ROOT / "catalog.json"


@lru_cache(maxsize=1)
def load_catalog() -> dict[str, Any]:
    """读取并缓存版本化物品目录。

    Returns:
        包含图标、大类、小类和冰箱默认小类顺序的目录数据。

    Raises:
        RuntimeError: 清单不存在、不是 JSON 对象或缺少必要列表时抛出。
    """
    try:
        payload = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError("内置物品目录无法读取") from exc
    if not isinstance(payload, dict) or not all(
        isinstance(payload.get(key), list)
        for key in ("icons", "groups", "subcategories", "default_subcategory_ids")
    ) or not isinstance(payload.get("removed_subcategory_names", []), list):
        raise RuntimeError("内置物品目录格式无效")
    return payload


def ensure_builtin_catalog(session: Session) -> None:
    """把版本化目录幂等同步到当前数据库事务。

    已有内置节点会更新名称、顺序和图标关联；清理已从清单移除且没有业务引用的
    旧内置节点和图标；用户自定义节点及仍被历史数据引用的内置节点不受影响。大类的
    ``icon_key`` 始终清空，保证它们只能作为展开选择器的导航分组。

    Args:
        session: 由调用方管理提交边界的数据库会话。
    """
    catalog = load_catalog()
    expected_group_ids = {item["id"] for item in catalog["groups"]}
    expected_subcategory_ids = {item["id"] for item in catalog["subcategories"]}
    expected_icon_keys = {item["key"] for item in catalog["icons"]}
    removed_names = set(catalog.get("removed_subcategory_names", []))
    obsolete_subcategories = session.scalars(
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
        has_inventory = session.scalar(
            select(InventoryBatchModel.id)
            .where(InventoryBatchModel.subcategory_id == subcategory.id)
            .limit(1)
        )
        has_recipe_reference = session.scalar(
            select(RecipeIngredientModel.id)
            .where(RecipeIngredientModel.subcategory_id == subcategory.id)
            .limit(1)
        )
        if has_inventory is None and has_recipe_reference is None:
            session.execute(
                delete(RecentSubcategoryUsage).where(
                    RecentSubcategoryUsage.subcategory_id == subcategory.id
                )
            )
            session.delete(subcategory)

    obsolete_icons = session.scalars(
        select(IconAsset).where(
            (
                (IconAsset.source == "builtin")
                & IconAsset.key.not_in(expected_icon_keys)
            )
            | IconAsset.key.in_(removed_icon_keys),
        )
    )
    for icon in obsolete_icons:
        is_referenced = session.scalar(
            select(FoodCategory.id)
            .where(FoodCategory.icon_key == icon.key)
            .limit(1)
        )
        if is_referenced is None:
            session.delete(icon)

    for item in catalog["icons"]:
        values = {
            "key": item["key"],
            "refrigerator_id": None,
            "label": item["label"],
            "media_type": item["media_type"],
            "storage_path": item["path"],
            "source": "builtin",
        }
        session.execute(
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
        session.execute(
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
        session.execute(
            insert(FoodCategory)
            .values(**values)
            .on_conflict_do_update(index_elements=[FoodCategory.id], set_=values)
        )
    # 先更新小类归属，再清理旧大类，避免历史大类因仍挂着待迁移小类而残留。
    obsolete_groups = session.scalars(
        select(FoodCategory).where(
            FoodCategory.id.like("builtin-group-%"),
            FoodCategory.id.not_in(expected_group_ids),
        )
    )
    for group in obsolete_groups:
        has_children = session.scalar(
            select(FoodCategory.id).where(FoodCategory.parent_id == group.id).limit(1)
        )
        if has_children is None:
            session.delete(group)
    session.flush()


def default_subcategory_ids() -> list[str]:
    """返回冰箱没有历史记录时使用的 16 个小类 ID。"""
    return list(load_catalog()["default_subcategory_ids"])


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
