"""食谱服务的食材持久化与库存缺货计算。

这些方法与食谱计划的创建、完成和删除共用同一 ``AsyncSession``，因此以 mixin
保留原 ``RecipeService`` 的调用接口，同时把食材规则和库存计算从计划编排中隔离。
事务边界仍由路由调用方管理。
"""

from __future__ import annotations

import re
from decimal import Decimal

from sqlalchemy import select

from fridgeboard.category_match_routes import deterministic_category_match
from fridgeboard.domain.inventory import (
    RecipeIngredient,
    normalize_ingredient_name,
    recipe_matches_inventory,
)
from fridgeboard.item_catalog import active_builtin_subcategory_ids
from fridgeboard.persistence.models import (
    ConsumptionLineModel,
    FoodCategory,
    InventoryBatchModel,
    RecipeCompletion,
    RecipeEntry,
    RecipeIngredientModel,
    RecipePlan,
)

_INGREDIENT = re.compile(r"^\s*(.+?)\s*(?:[×xX*]\s*(\d+(?:\.\d{1,2})?))?\s*$")


class RecipeInventoryMixin:
    """提供食谱食材写入、视图映射和库存预留计算。"""

    def _parse_ingredients(self, raw: str | None) -> list[dict[str, object]]:
        """解析文本食材，支持中文逗号和可选数量后缀。"""
        if not raw:
            return []
        items: list[dict[str, object]] = []
        for value in re.split(r"[、,，]", raw):
            match = _INGREDIENT.match(value)
            if match is None:
                raise ValueError(f"无法解析食材：{value}")
            items.append(
                {
                    "subcategory_name": match.group(1).strip(),
                    "quantity": Decimal(match.group(2) or "1"),
                }
            )
        return items

    async def _replace_ingredients(
        self,
        refrigerator_id: str,
        entry: RecipeEntry,
        ingredients: list[dict[str, object]],
    ) -> None:
        """替换一条食谱的食材，并校验客户端提交的分类归属。"""
        for item in await self._session.scalars(
            select(RecipeIngredientModel).where(RecipeIngredientModel.recipe_entry_id == entry.id)
        ):
            await self._session.delete(item)
        for item in ingredients:
            name = normalize_ingredient_name(str(item.get("subcategory_name", "")))
            quantity = Decimal(str(item.get("quantity", 1)))
            if not name or quantity < Decimal("0.01"):
                raise ValueError("食材名称不能为空，数量至少为 0.01")
            category_id = await self._valid_category_id(refrigerator_id, item.get("subcategory_id"))
            if category_id is None:
                matched = await deterministic_category_match(self._session, refrigerator_id, name)
                category_id = matched.subcategory_id if matched is not None else None
            self._session.add(
                RecipeIngredientModel(
                    recipe_entry_id=entry.id,
                    subcategory_id=category_id,
                    raw_name=name,
                    quantity=quantity,
                )
            )
        await self._session.flush()

    async def _valid_category_id(self, refrigerator_id: str, raw_category_id: object) -> str | None:
        """只接受当前冰箱可用的小类 ID，拒绝模型或客户端伪造的分类。"""
        if not raw_category_id:
            return None
        category = await self._session.get(FoodCategory, str(raw_category_id))
        if (
            category is None
            or category.parent_id is None
            or category.refrigerator_id not in {None, refrigerator_id}
            or (
                category.refrigerator_id is None
                and category.id.startswith("builtin-")
                and category.id not in active_builtin_subcategory_ids()
            )
        ):
            return None
        return category.id

    async def _entry_view(
        self, entry: RecipeEntry, missing: list[dict[str, object]] | None = None
    ) -> dict[str, object]:
        """构造食谱响应，按需计算当前缺货。"""
        ingredients = await self._ingredients(entry)
        ingredient_views = []
        for item in ingredients:
            category = (
                await self._session.get(FoodCategory, item.subcategory_id)
                if item.subcategory_id is not None
                else None
            )
            ingredient_views.append(
                {
                    "subcategory_name": item.raw_name,
                    "quantity": item.quantity,
                    "subcategory_id": item.subcategory_id,
                    "matched_category_name": category.name if category is not None else None,
                }
            )
        return {
            "id": entry.id,
            "weekday": entry.weekday,
            "dish_name": entry.dish_name,
            "method": entry.method,
            "note": entry.note,
            "completed": entry.completed_at is not None,
            "ingredients": ingredient_views,
            "missing": missing if missing is not None else await self._missing(entry),
        }

    async def _missing(self, entry: RecipeEntry) -> list[dict[str, object]]:
        """计算单条食谱在其计划内的实时缺货。"""
        plan = await self._plan_for_entry(entry)
        entries = list(
            await self._session.scalars(
                select(RecipeEntry)
                .where(RecipeEntry.recipe_plan_id == plan.id)
                .order_by(RecipeEntry.weekday, RecipeEntry.id)
            )
        )
        missing_by_entry = await self._planned_missing(plan.refrigerator_id, entries)
        return missing_by_entry[entry.id]

    async def _ingredients(self, entry: RecipeEntry) -> list[RecipeIngredientModel]:
        """读取一条食谱的食材，保持其在编辑时的原始顺序。"""
        return list(
            await self._session.scalars(
                select(RecipeIngredientModel).where(
                    RecipeIngredientModel.recipe_entry_id == entry.id
                )
            )
        )

    async def _planned_missing(
        self, refrigerator_id: str, entries: list[RecipeEntry]
    ) -> dict[str, list[dict[str, object]]]:
        """按食谱日期依次预留匹配批次，并保留已完成菜的历史未满足需求。"""
        batches = await self._inventory.list_batches(refrigerator_id)
        available = {batch.id: batch.quantity for batch in batches}
        result: dict[str, list[dict[str, object]]] = {}
        for entry in entries:
            if entry.completed_at is not None:
                result[entry.id] = await self._completion_missing(entry)
                continue
            missing: list[dict[str, object]] = []
            for item in await self._ingredients(entry):
                matched_batches = [
                    batch
                    for batch in batches
                    if available[batch.id] > 0
                    and recipe_matches_inventory(
                        RecipeIngredient(item.raw_name, item.quantity, item.subcategory_id),
                        batch.subcategory_id,
                        batch.item_name,
                    )
                ]
                available_quantity = sum(
                    (available[batch.id] for batch in matched_batches), Decimal("0")
                )
                deficit = max(item.quantity - available_quantity, 0)
                remaining = item.quantity
                for batch in matched_batches:
                    reserved = min(available[batch.id], remaining)
                    available[batch.id] -= reserved
                    remaining -= reserved
                    if remaining == 0:
                        break
                if deficit:
                    missing.append(
                        {
                            "subcategory_name": item.raw_name,
                            "quantity": deficit,
                            "subcategory_id": item.subcategory_id,
                        }
                    )
            result[entry.id] = missing
        return result

    async def _completion_missing(self, entry: RecipeEntry) -> list[dict[str, object]]:
        """用完成审计计算某道已完成菜实际未满足的食材。"""
        completion = await self._session.scalar(
            select(RecipeCompletion).where(RecipeCompletion.recipe_entry_id == entry.id)
        )
        consumed: dict[str, Decimal] = {}
        if completion is not None:
            for line in await self._session.scalars(
                select(ConsumptionLineModel).where(
                    ConsumptionLineModel.completion_id == completion.id
                )
            ):
                batch = await self._session.get(InventoryBatchModel, line.inventory_batch_id)
                if batch is not None:
                    consumed[batch.id] = consumed.get(batch.id, Decimal("0")) + line.quantity
        missing: list[dict[str, object]] = []
        for item in await self._ingredients(entry):
            consumed_quantity = Decimal("0")
            for batch_id, quantity in consumed.items():
                batch = await self._session.get(InventoryBatchModel, batch_id)
                if batch is not None and recipe_matches_inventory(
                    RecipeIngredient(item.raw_name, item.quantity, item.subcategory_id),
                    batch.subcategory_id,
                    batch.item_name,
                ):
                    consumed_quantity += quantity
            deficit = max(item.quantity - consumed_quantity, 0)
            if deficit:
                missing.append(
                    {
                        "subcategory_name": item.raw_name,
                        "quantity": deficit,
                        "subcategory_id": item.subcategory_id,
                    }
                )
        return missing

    async def _plan_for_entry(self, entry: RecipeEntry) -> RecipePlan:
        """读取食谱所属计划；数据库外键异常时中止而不返回不完整响应。"""
        plan = await self._session.get(RecipePlan, entry.recipe_plan_id)
        assert plan is not None
        return plan
