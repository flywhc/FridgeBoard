"""回填历史食谱食材和自定义购物项的小类引用。"""

from __future__ import annotations

import json
import unicodedata
from collections import defaultdict
from collections.abc import Sequence
from pathlib import Path

import sqlalchemy as sa
from alembic import op

revision: str = "20260830_31"
down_revision: str | None = "20260829_30"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

_CATALOG_ROOT = Path(__file__).resolve().parents[2] / "fridgeboard" / "assets" / "item_catalog"


def _normalize(value: str) -> str:
    """规范化名称，以执行历史数据的精确匹配。"""
    return " ".join(unicodedata.normalize("NFKC", value).strip().lower().split())


def _load_aliases() -> dict[str, list[str]]:
    """读取既有版本化别名，不增加迁移专用别名。"""
    path = _CATALOG_ROOT / "classification_aliases.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    return {
        str(category_id): [str(alias) for alias in aliases if str(alias).strip()]
        for category_id, aliases in payload.items()
        if isinstance(aliases, list)
    }


def _category_lookup(
    connection: sa.Connection, refrigerator_id: str
) -> tuple[dict[str, str], set[str]]:
    """返回无歧义的精确分类名称和既有别名。"""
    rows = connection.execute(
        sa.text(
            "SELECT id, name FROM food_categories "
            "WHERE parent_id IS NOT NULL "
            "AND (refrigerator_id IS NULL OR refrigerator_id = :refrigerator_id)"
        ),
        {"refrigerator_id": refrigerator_id},
    ).mappings()
    names: dict[str, set[str]] = defaultdict(set)
    category_ids: set[str] = set()
    for row in rows:
        category_id = str(row["id"])
        category_ids.add(category_id)
        names[_normalize(str(row["name"]))].add(category_id)
    for category_id, aliases in _load_aliases().items():
        if category_id in category_ids:
            for alias in aliases:
                names[_normalize(alias)].add(category_id)
    return {name: next(iter(ids)) for name, ids in names.items() if len(ids) == 1}, category_ids


def _inventory_lookup(
    connection: sa.Connection, refrigerator_id: str, category_ids: set[str]
) -> dict[str, str]:
    """返回只对应一个已存分类的精确库存名称。"""
    rows = connection.execute(
        sa.text(
            "SELECT item_name, subcategory_id FROM inventory_batches "
            "WHERE refrigerator_id = :refrigerator_id"
        ),
        {"refrigerator_id": refrigerator_id},
    ).mappings()
    names: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        if row["subcategory_id"] in category_ids:
            names[_normalize(str(row["item_name"]))].add(str(row["subcategory_id"]))
    return {name: next(iter(ids)) for name, ids in names.items() if len(ids) == 1}


def _backfill_refrigerator(connection: sa.Connection, refrigerator_id: str) -> None:
    """只根据当前冰箱的精确证据填充空引用。"""
    name_to_category, category_ids = _category_lookup(connection, refrigerator_id)
    name_to_category.update(_inventory_lookup(connection, refrigerator_id, category_ids))
    shopping_rows = connection.execute(
        sa.text(
            "SELECT id, item_name FROM custom_shopping_items "
            "WHERE refrigerator_id = :refrigerator_id AND subcategory_id IS NULL"
        ),
        {"refrigerator_id": refrigerator_id},
    ).mappings()
    recipe_rows = connection.execute(
        sa.text(
            "SELECT ingredient.id, ingredient.raw_name "
            "FROM recipe_ingredients AS ingredient "
            "JOIN recipe_entries AS entry ON entry.id = ingredient.recipe_entry_id "
            "JOIN recipe_plans AS plan ON plan.id = entry.recipe_plan_id "
            "WHERE plan.refrigerator_id = :refrigerator_id "
            "AND ingredient.subcategory_id IS NULL"
        ),
        {"refrigerator_id": refrigerator_id},
    ).mappings()
    for table, rows in (
        ("custom_shopping_items", shopping_rows),
        ("recipe_ingredients", recipe_rows),
    ):
        name_column = "item_name" if table == "custom_shopping_items" else "raw_name"
        for row in rows:
            category_id = name_to_category.get(_normalize(str(row[name_column])))
            if category_id is not None:
                connection.execute(
                    sa.text(
                        f"UPDATE {table} SET subcategory_id = :subcategory_id "
                        f"WHERE id = :item_id AND subcategory_id IS NULL"
                    ),
                    {"subcategory_id": category_id, "item_id": row["id"]},
                )


def upgrade() -> None:
    """回填精确匹配项，未确定记录交由 AI 回填命令处理。"""
    connection = op.get_bind()
    for refrigerator_id in connection.execute(sa.text("SELECT id FROM refrigerators")).scalars():
        _backfill_refrigerator(connection, str(refrigerator_id))


def downgrade() -> None:
    """仅回退迁移标记时保留已经恢复的分类数据。"""
