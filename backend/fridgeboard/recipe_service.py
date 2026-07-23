"""P9 食谱解析、严格匹配、补货计算与可逆库存扣减服务。

本模块只在调用方开启的一个数据库事务中读写食谱、库存和消费审计；不处理 HTTP
鉴权或页面序列化。食材名称仅移除首尾空白后与小类名称完全匹配，绝不做别名或模糊
匹配，以保证完成食谱时的库存扣减可预测。
"""

from __future__ import annotations

import re
from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from fridgeboard.domain.inventory import (
    Consumption,
    ConsumptionLine,
    RecipeIngredient,
    complete_recipe,
    normalize_subcategory_name,
    undo_consumption,
)
from fridgeboard.persistence.models import (
    ConsumptionLineModel,
    FoodCategory,
    InventoryBatchModel,
    RecipeCompletion,
    RecipeEntry,
    RecipeIngredientModel,
    RecipePlan,
)
from fridgeboard.persistence.repositories import InventoryRepository

WEEKDAYS = ("周一", "周二", "周三", "周四", "周五", "周六", "周日")
_LINE = re.compile(
    r"^\s*(?:(周[一二三四五六日])\s*[：:]\s*)?(.+?)\s*(?:[（(]\s*(.*?)\s*[）)])?\s*$"
)
_INGREDIENT = re.compile(r"^\s*(.+?)\s*(?:[×xX*]\s*(\d+))?\s*$")


class RecipeService:
    """提供同一冰箱内食谱的读写、缺货计算和原子完成/撤销操作。"""

    def __init__(self, session: Session) -> None:
        """绑定由调用方持有事务边界的数据库会话。"""
        self._session = session
        self._inventory = InventoryRepository(session)

    def list_week(self, refrigerator_id: str, week_start: date) -> list[dict[str, object]]:
        """读取固定七天的食谱和每道未完成菜的即时缺货。

        Args:
            refrigerator_id: 当前所有者已授权的冰箱。
            week_start: 周一日期；调用方须先完成规范化。

        Returns:
            七个按星期排序的日对象，每个对象包含当天食谱和缺少的小类数量。
        """
        plan = self._plan(refrigerator_id, week_start, create=False)
        entries = (
            []
            if plan is None
            else list(
                self._session.scalars(
                    select(RecipeEntry)
                    .where(RecipeEntry.recipe_plan_id == plan.id)
                    .order_by(RecipeEntry.weekday)
                )
            )
        )
        return [
            {
                "weekday": weekday,
                "label": WEEKDAYS[weekday],
                "entries": [
                    self._entry_view(entry) for entry in entries if entry.weekday == weekday
                ],
            }
            for weekday in range(7)
        ]

    def import_text(
        self, refrigerator_id: str, week_start: date, text: str
    ) -> list[dict[str, object]]:
        """解析多行纯文本并追加到指定周，保留无法匹配的小类名称。

        Args:
            refrigerator_id: 目标冰箱。
            week_start: 目标周的周一日期。
            text: 每行一道菜，支持 ``周二：菜名（鸡蛋×2、火腿）``。

        Returns:
            新建食谱行的序列化结果。

        Raises:
            ValueError: 当文本为空、行格式错误或星期重复时抛出。
        """
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        if not lines:
            raise ValueError("请至少输入一条食谱")
        plan = self._plan(refrigerator_id, week_start, create=True)
        assert plan is not None
        created: list[dict[str, object]] = []
        implicit_weekday = 0
        for line in lines:
            match = _LINE.match(line)
            if match is None:
                raise ValueError(f"无法解析食谱：{line}")
            weekday_name, dish_name, raw_ingredients = match.groups()
            weekday = WEEKDAYS.index(weekday_name) if weekday_name else implicit_weekday
            if weekday > 6:
                raise ValueError("一周只能录入周一至周日")
            implicit_weekday = weekday + 1
            entry = RecipeEntry(
                recipe_plan_id=plan.id, weekday=weekday, dish_name=dish_name.strip()
            )
            if not entry.dish_name:
                raise ValueError("菜名不能为空")
            self._session.add(entry)
            self._session.flush()
            self._replace_ingredients(
                refrigerator_id, entry, self._parse_ingredients(raw_ingredients)
            )
            created.append(self._entry_view(entry))
        return created

    def update_entry(
        self,
        refrigerator_id: str,
        entry_id: str,
        weekday: int,
        dish_name: str,
        ingredients: list[dict[str, object]],
    ) -> dict[str, object]:
        """编辑未完成食谱行，并立即以最新库存重新计算缺货。"""
        entry = self._entry_for_refrigerator(refrigerator_id, entry_id)
        if entry.completed_at is not None:
            raise ValueError("已完成食谱请先撤销后再编辑")
        if weekday not in range(7) or not dish_name.strip():
            raise ValueError("星期或菜名无效")
        entry.weekday, entry.dish_name = weekday, dish_name.strip()
        self._replace_ingredients(refrigerator_id, entry, ingredients)
        return self._entry_view(entry)

    def complete(self, refrigerator_id: str, entry_id: str) -> dict[str, object]:
        """按最早 BBD 扣减已精确匹配的库存，并保存逐批次审计记录。"""
        entry = self._entry_for_refrigerator(refrigerator_id, entry_id)
        if entry.completed_at is not None:
            raise ValueError("该食谱已完成")
        ingredients = list(
            self._session.scalars(
                select(RecipeIngredientModel).where(
                    RecipeIngredientModel.recipe_entry_id == entry.id
                )
            )
        )
        consumption = complete_recipe(
            entry.id,
            [RecipeIngredient(item.subcategory_id, item.quantity) for item in ingredients],
            self._inventory.list_batches(refrigerator_id),
        )
        self._inventory.apply_consumption(consumption)
        now = datetime.now(UTC)
        entry.completed_at = now
        completion = RecipeCompletion(recipe_entry_id=entry.id, completed_at=now)
        self._session.add(completion)
        self._session.flush()
        self._session.add_all(
            ConsumptionLineModel(
                completion_id=completion.id,
                inventory_batch_id=line.batch_id,
                quantity=line.quantity,
            )
            for line in consumption.lines
        )
        return self._entry_view(entry)

    def undo(self, refrigerator_id: str, entry_id: str) -> dict[str, object]:
        """一次性恢复该食谱完成动作实际扣除的每个原库存批次。"""
        entry = self._entry_for_refrigerator(refrigerator_id, entry_id)
        completion = self._session.scalar(
            select(RecipeCompletion).where(RecipeCompletion.recipe_entry_id == entry.id)
        )
        if completion is None or completion.undone_at is not None or entry.completed_at is None:
            raise ValueError("该食谱没有可撤销的完成操作")
        lines = list(
            self._session.scalars(
                select(ConsumptionLineModel).where(
                    ConsumptionLineModel.completion_id == completion.id
                )
            )
        )
        consumption = Consumption(
            entry.id, [ConsumptionLine(line.inventory_batch_id, line.quantity) for line in lines]
        )
        undo_consumption(consumption, self._inventory.list_batches(refrigerator_id))
        for line in lines:
            batch = self._session.get(InventoryBatchModel, line.inventory_batch_id)
            assert batch is not None
            batch.quantity += line.quantity
        completion.undone_at = datetime.now(UTC)
        entry.completed_at = None
        return self._entry_view(entry)

    def restock(self, refrigerator_id: str, week_start: date) -> list[dict[str, object]]:
        """返回本周和下周未完成食谱按日期、菜名拆分的实时缺货列表。"""
        result: list[dict[str, object]] = []
        for offset in (0, 7):
            plan = self._plan(
                refrigerator_id,
                week_start.fromordinal(week_start.toordinal() + offset),
                create=False,
            )
            if plan is None:
                continue
            for entry in self._session.scalars(
                select(RecipeEntry)
                .where(RecipeEntry.recipe_plan_id == plan.id)
                .order_by(RecipeEntry.weekday)
            ):
                if entry.completed_at is None:
                    missing = self._missing(entry)
                    if missing:
                        result.append(
                            {
                                "weekday": entry.weekday,
                                "label": WEEKDAYS[entry.weekday],
                                "dish_name": entry.dish_name,
                                "missing": missing,
                            }
                        )
        return result

    def _plan(self, refrigerator_id: str, week_start: date, *, create: bool) -> RecipePlan | None:
        plan = self._session.scalar(
            select(RecipePlan).where(
                RecipePlan.refrigerator_id == refrigerator_id, RecipePlan.week_start == week_start
            )
        )
        if plan is None and create:
            plan = RecipePlan(refrigerator_id=refrigerator_id, week_start=week_start)
            self._session.add(plan)
            self._session.flush()
        return plan

    def _entry_for_refrigerator(self, refrigerator_id: str, entry_id: str) -> RecipeEntry:
        entry = self._session.get(RecipeEntry, entry_id)
        if entry is None:
            raise ValueError("食谱不存在")
        plan = self._session.get(RecipePlan, entry.recipe_plan_id)
        if plan is None or plan.refrigerator_id != refrigerator_id:
            raise ValueError("食谱不存在或不属于当前冰箱")
        return entry

    def _parse_ingredients(self, raw: str | None) -> list[dict[str, object]]:
        if not raw:
            return []
        items: list[dict[str, object]] = []
        for value in re.split(r"[、,，]", raw):
            match = _INGREDIENT.match(value)
            if match is None:
                raise ValueError(f"无法解析食材：{value}")
            items.append(
                {"subcategory_name": match.group(1).strip(), "quantity": int(match.group(2) or 1)}
            )
        return items

    def _replace_ingredients(
        self, refrigerator_id: str, entry: RecipeEntry, ingredients: list[dict[str, object]]
    ) -> None:
        for item in self._session.scalars(
            select(RecipeIngredientModel).where(RecipeIngredientModel.recipe_entry_id == entry.id)
        ):
            self._session.delete(item)
        for item in ingredients:
            name = normalize_subcategory_name(str(item.get("subcategory_name", "")))
            quantity = int(item.get("quantity", 1))
            if not name or quantity < 1:
                raise ValueError("食材名称不能为空，数量至少为 1")
            category = self._session.scalar(
                select(FoodCategory).where(
                    FoodCategory.name == name,
                    FoodCategory.parent_id.is_not(None),
                    (
                        FoodCategory.refrigerator_id.is_(None)
                        | (FoodCategory.refrigerator_id == refrigerator_id)
                    ),
                )
            )
            if category is None:
                raise ValueError(f"未找到完全匹配的小类：{name}")
            self._session.add(
                RecipeIngredientModel(
                    recipe_entry_id=entry.id, subcategory_id=category.id, quantity=quantity
                )
            )
        self._session.flush()

    def _entry_view(self, entry: RecipeEntry) -> dict[str, object]:
        ingredients = list(
            self._session.scalars(
                select(RecipeIngredientModel).where(
                    RecipeIngredientModel.recipe_entry_id == entry.id
                )
            )
        )
        return {
            "id": entry.id,
            "weekday": entry.weekday,
            "dish_name": entry.dish_name,
            "completed": entry.completed_at is not None,
            "ingredients": [
                {
                    "subcategory_name": self._session.get(FoodCategory, item.subcategory_id).name,
                    "quantity": item.quantity,
                }
                for item in ingredients
            ],
            "missing": [] if entry.completed_at is not None else self._missing(entry),
        }

    def _missing(self, entry: RecipeEntry) -> list[dict[str, object]]:
        available: dict[str, int] = {}
        for batch in self._inventory.list_batches(self._plan_for_entry(entry).refrigerator_id):
            available[batch.subcategory_id] = (
                available.get(batch.subcategory_id, 0) + batch.quantity
            )
        for item in self._session.scalars(
            select(RecipeIngredientModel).where(RecipeIngredientModel.recipe_entry_id == entry.id)
        ):
            available[item.subcategory_id] = available.get(item.subcategory_id, 0) - item.quantity
        missing: list[dict[str, object]] = []
        for subcategory_id, quantity in available.items():
            deficit = max(-quantity, 0)
            if deficit:
                category = self._session.get(FoodCategory, subcategory_id)
                assert category is not None
                missing.append({"subcategory_name": category.name, "quantity": deficit})
        return missing

    def _plan_for_entry(self, entry: RecipeEntry) -> RecipePlan:
        plan = self._session.get(RecipePlan, entry.recipe_plan_id)
        assert plan is not None
        return plan
