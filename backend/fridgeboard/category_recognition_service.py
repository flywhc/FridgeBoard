"""跨冰箱把名称匹配到某个自定义小类的事务服务。"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fridgeboard.category_matching import match_item_name
from fridgeboard.persistence.models import (
    CustomShoppingItem,
    FoodCategory,
    InventoryBatchModel,
    RecipeEntry,
    RecipeIngredientModel,
    RecipePlan,
    Refrigerator,
)


class CategoryRecognitionService:
    """在单个事务中扫描当前用户全部活跃自有冰箱的物品来源。"""

    def __init__(self, session: AsyncSession) -> None:
        """绑定由路由管理提交边界的数据库会话。"""
        self._session = session

    async def recognize(
        self,
        owner_user_id: str,
        refrigerator_id: str,
        category_id: str,
        context_item_name: str | None = None,
        context_inventory_batch_id: str | None = None,
    ) -> tuple[FoodCategory, list[dict[str, str]]]:
        """扫描并更新当前用户全部活跃自有冰箱中的匹配物品。

        Args:
            owner_user_id: 当前登录所有者 ID。
            refrigerator_id: 当前页面打开的冰箱 ID。
            category_id: 已保存的自定义小类 ID。
            context_item_name: 前一页尚未保存的物品名称。
            context_inventory_batch_id: 前一页正在编辑的库存批次 ID。

        Returns:
            目标小类和按首次出现顺序去重后的识别物品来源列表。

        Raises:
            ValueError: 目标小类不属于当前所有者，或编辑批次不属于其所有冰箱。
        """
        category = await self._session.get(FoodCategory, category_id)
        refrigerator_ids = list(
            await self._session.scalars(
                select(Refrigerator.id).where(
                    Refrigerator.owner_user_id == owner_user_id,
                    Refrigerator.deleted_at.is_(None),
                )
                .order_by(Refrigerator.display_order, Refrigerator.id)
            )
        )
        if (
            category is None
            or not category.is_custom
            or category.parent_id is None
            or category.owner_user_id != owner_user_id
            or refrigerator_id not in refrigerator_ids
        ):
            raise ValueError("自定义小类不存在或不属于当前用户")
        if not refrigerator_ids:
            return category, []

        context_batch = None
        if context_inventory_batch_id:
            context_batch = await self._session.get(
                InventoryBatchModel, context_inventory_batch_id
            )
            if context_batch is None or context_batch.refrigerator_id not in refrigerator_ids:
                raise ValueError("正在编辑的库存不属于当前所有者")

        context_name = context_item_name.strip() if context_item_name else ""
        results: list[dict[str, str]] = []
        seen_names: set[str] = set()
        for refrigerator_id in refrigerator_ids:
            candidate = self._candidate(category)
            batch_query = select(InventoryBatchModel).where(
                InventoryBatchModel.refrigerator_id == refrigerator_id
            )
            if context_name and context_batch is not None:
                batch_query = batch_query.where(InventoryBatchModel.id != context_batch.id)
            batches = await self._session.scalars(batch_query)
            for batch in batches:
                if self._matches(batch.item_name, candidate):
                    batch.subcategory_id = candidate["id"]
                    self._append_result(results, seen_names, batch.item_name, "inventory")

            shopping_items = await self._session.scalars(
                select(CustomShoppingItem).where(
                    CustomShoppingItem.refrigerator_id == refrigerator_id
                )
            )
            for item in shopping_items:
                if self._matches(item.item_name, candidate):
                    item.subcategory_id = candidate["id"]
                    self._append_result(results, seen_names, item.item_name, "shopping")

        recipe_rows = await self._session.execute(
            select(RecipeIngredientModel, RecipePlan.refrigerator_id)
            .join(RecipeEntry, RecipeEntry.id == RecipeIngredientModel.recipe_entry_id)
            .join(RecipePlan, RecipePlan.id == RecipeEntry.recipe_plan_id)
            .where(RecipePlan.refrigerator_id.in_(refrigerator_ids))
        )
        for ingredient, refrigerator_id in recipe_rows:
            candidate = self._candidate(category)
            if self._matches(ingredient.raw_name, candidate):
                ingredient.subcategory_id = candidate["id"]
                self._append_result(results, seen_names, ingredient.raw_name, "recipe")

        if context_name:
            candidate = self._candidate(category)
            if self._matches(context_name, candidate):
                if context_batch is not None:
                    context_batch.subcategory_id = candidate["id"]
                self._append_result(results, seen_names, context_name, "current")

        await self._session.flush()
        return category, results

    @staticmethod
    def _candidate(category: FoodCategory) -> dict[str, str]:
        """把本地目标小类转换为现有名称匹配器的单候选格式。"""
        return {"id": category.id, "name": category.name}

    @staticmethod
    def _matches(item_name: str, candidate: dict[str, str]) -> bool:
        """只判断名称是否匹配当前目标小类。"""
        return match_item_name(item_name, [candidate]) is not None

    @staticmethod
    def _append_result(
        results: list[dict[str, str]],
        seen_names: set[str],
        item_name: str,
        source: str,
    ) -> None:
        """按名称去重并保留稳定的首次出现顺序。"""
        normalized = item_name.strip()
        if normalized and normalized not in seen_names:
            seen_names.add(normalized)
            results.append({"item_name": normalized, "source": source})
