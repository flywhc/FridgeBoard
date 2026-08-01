"""数据驱动的物品分类与内置图标目录。

本模块从版本化 JSON 清单读取内置大类、小类和图标元数据，并幂等同步到 SQLite。
业务服务只查询数据库，不在 Python 常量中维护分类或 SVG 路径。
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.orm import Session

from fridgeboard.persistence.models import FoodCategory, IconAsset

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
    ):
        raise RuntimeError("内置物品目录格式无效")
    return payload


def ensure_builtin_catalog(session: Session) -> None:
    """把版本化目录幂等同步到当前数据库事务。

    已有内置节点会更新名称、顺序和图标关联；用户自定义节点不受影响。大类的
    ``icon_key`` 始终清空，保证它们只能作为展开选择器的导航分组。

    Args:
        session: 由调用方管理提交边界的数据库会话。
    """
    catalog = load_catalog()
    expected_group_ids = {item["id"] for item in catalog["groups"]}
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
