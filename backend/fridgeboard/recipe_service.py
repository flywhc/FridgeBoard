"""P9 食谱解析、严格食材名称匹配、补货计算与可逆库存扣减服务。

本模块只在调用方开启的一个数据库事务中读写食谱、库存和消费审计；不处理 HTTP
鉴权或页面序列化。食材名称仅移除首尾空白后与库存批次名称完全匹配，绝不做分类转换、别名或模糊
匹配，以保证完成食谱时的库存扣减可预测。
"""

from __future__ import annotations

import re
from datetime import UTC, date, datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from fridgeboard.domain.inventory import (
    Consumption,
    ConsumptionLine,
    RecipeIngredient,
    complete_recipe,
    normalize_ingredient_name,
    undo_consumption,
)
from fridgeboard.persistence.models import (
    ConsumptionLineModel,
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
            七个按星期排序的日对象，每个对象包含当天食谱和缺少的食材数量。
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
        missing_by_entry = self._planned_missing(refrigerator_id, entries)
        return [
            {
                "weekday": weekday,
                "label": WEEKDAYS[weekday],
                "entries": [
                    self._entry_view(entry, missing_by_entry[entry.id])
                    for entry in entries
                    if entry.weekday == weekday
                ],
            }
            for weekday in range(7)
        ]

    def import_text(
        self, refrigerator_id: str, week_start: date, text: str, *, overwrite: bool = False
    ) -> list[dict[str, object]]:
        """解析多行纯文本并导入指定周，保留无法匹配的食材名称。

        Args:
            refrigerator_id: 目标冰箱。
            week_start: 目标周的周一日期。
            text: 每行一道菜，支持 ``周二：菜名（鸡蛋×2、火腿）``。
            overwrite: 是否先删除目标周已有的食谱；默认追加到已有食谱。

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
        if overwrite:
            self._delete_entries(
                [
                    entry.id
                    for entry in self._session.scalars(
                        select(RecipeEntry).where(RecipeEntry.recipe_plan_id == plan.id)
                    )
                ]
            )
            self._session.flush()
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
            self._replace_ingredients(entry, self._parse_ingredients(raw_ingredients))
            created.append(self._entry_view(entry))
        return created

    def delete_entry(self, refrigerator_id: str, entry_id: str) -> None:
        """删除一条食谱及其完成审计，不恢复已完成食谱消耗的库存。

        Args:
            refrigerator_id: 当前所有者已授权的冰箱。
            entry_id: 要删除的食谱行 ID。

        Raises:
            ValueError: 当食谱不存在或不属于当前冰箱时抛出。
        """
        entry = self._entry_for_refrigerator(refrigerator_id, entry_id)
        self._delete_entries([entry.id])
        self._session.flush()

    def create_entry(
        self,
        refrigerator_id: str,
        week_start: date,
        weekday: int,
        dish_name: str,
        method: str | None,
        note: str | None,
        ingredients: list[dict[str, object]],
    ) -> dict[str, object]:
        """在指定周新增一道未完成食谱。

        Args:
            refrigerator_id: 当前所有者已授权的冰箱。
            week_start: 食谱所属周的周一日期。
            weekday: 星期索引，周一为 0。
            dish_name: 菜名。
            method: 食谱做法；空白做法按空值保存。
            note: 食谱备注；空白备注按空值保存。
            ingredients: 用户填写的食材名称和数量。

        Returns:
            新建食谱行的序列化结果。

        Raises:
            ValueError: 当星期、菜名或食材参数无效时抛出。
        """
        if weekday not in range(7) or not dish_name.strip():
            raise ValueError("星期或菜名无效")
        plan = self._plan(refrigerator_id, week_start, create=True)
        assert plan is not None
        entry = RecipeEntry(
            recipe_plan_id=plan.id,
            weekday=weekday,
            dish_name=dish_name.strip(),
            method=method.strip() if method and method.strip() else None,
            note=note.strip() if note and note.strip() else None,
        )
        self._session.add(entry)
        self._session.flush()
        self._replace_ingredients(entry, ingredients)
        return self._entry_view(entry)

    def update_entry(
        self,
        refrigerator_id: str,
        entry_id: str,
        weekday: int,
        dish_name: str,
        method: str | None,
        note: str | None,
        ingredients: list[dict[str, object]],
    ) -> dict[str, object]:
        """编辑食谱行；完成后只允许更新做法和备注。

        Args:
            refrigerator_id: 当前所有者已授权的冰箱。
            entry_id: 要更新的食谱行 ID。
            weekday: 食谱所在星期索引。
            dish_name: 菜名。
            method: 食谱做法；空白做法按空值保存。
            note: 食谱备注；空白备注按空值保存。
            ingredients: 食材名称和需求数量。

        Returns:
            更新后的食谱行序列化结果。

        Raises:
            ValueError: 当食谱不存在、完成食谱的结构字段发生变化，或参数无效时抛出。
        """
        entry = self._entry_for_refrigerator(refrigerator_id, entry_id)
        if entry.completed_at is not None:
            current_ingredients = [
                (item.raw_name, item.quantity) for item in self._ingredients(entry)
            ]
            submitted_ingredients = [
                (
                    normalize_ingredient_name(str(item.get("subcategory_name", ""))),
                    int(item.get("quantity", 1)),
                )
                for item in ingredients
            ]
            if (
                weekday != entry.weekday
                or dish_name.strip() != entry.dish_name
                or submitted_ingredients != current_ingredients
            ):
                raise ValueError("已完成食谱只能修改做法和备注")
            entry.method = method.strip() if method and method.strip() else None
            entry.note = note.strip() if note and note.strip() else None
            return self._entry_view(entry)
        if weekday not in range(7) or not dish_name.strip():
            raise ValueError("星期或菜名无效")
        entry.weekday, entry.dish_name = weekday, dish_name.strip()
        entry.method = method.strip() if method and method.strip() else None
        entry.note = note.strip() if note and note.strip() else None
        self._replace_ingredients(entry, ingredients)
        return self._entry_view(entry)

    def complete(self, refrigerator_id: str, entry_id: str) -> dict[str, object]:
        """按最早 BBD 扣减已精确匹配的库存，并保存逐批次审计记录。"""
        entry = self._entry_for_refrigerator(refrigerator_id, entry_id)
        if entry.completed_at is not None:
            raise ValueError("该食谱已完成")
        completion = self._session.scalar(
            select(RecipeCompletion).where(RecipeCompletion.recipe_entry_id == entry.id)
        )
        if completion is not None and completion.undone_at is None:
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
            [
                RecipeIngredient(item.raw_name, item.quantity) for item in ingredients
            ],
            self._inventory.list_batches(refrigerator_id),
        )
        self._inventory.apply_consumption(consumption)
        now = datetime.now(UTC)
        entry.completed_at = now
        if completion is None:
            completion = RecipeCompletion(recipe_entry_id=entry.id, completed_at=now)
            self._session.add(completion)
        else:
            self._session.execute(
                delete(ConsumptionLineModel).where(
                    ConsumptionLineModel.completion_id == completion.id
                )
            )
            completion.completed_at = now
            completion.undone_at = None
        self._session.flush()
        self._session.add_all(
            ConsumptionLineModel(
                completion_id=completion.id,
                inventory_batch_id=line.batch_id,
                quantity=line.quantity,
            )
            for line in consumption.lines
        )
        return self._entry_view(entry, self._completion_missing(entry))

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
        plans: list[tuple[date, RecipePlan]] = []
        for offset in (0, 7):
            plan_week_start = week_start.fromordinal(week_start.toordinal() + offset)
            plan = self._plan(refrigerator_id, plan_week_start, create=False)
            if plan is None:
                continue
            plans.append((plan_week_start, plan))
        entries = [
            (plan_week_start, entry)
            for plan_week_start, plan in plans
            for entry in self._session.scalars(
                select(RecipeEntry)
                .where(RecipeEntry.recipe_plan_id == plan.id)
                .order_by(RecipeEntry.weekday)
            )
        ]
        missing_by_entry = self._planned_missing(
            refrigerator_id, [entry for _, entry in entries]
        )
        result: list[dict[str, object]] = []
        for plan_week_start, entry in entries:
            missing = missing_by_entry[entry.id]
            if missing:
                result.append(
                    {
                        "week_start": plan_week_start,
                        "weekday": entry.weekday,
                        "label": WEEKDAYS[entry.weekday],
                        "dish_name": entry.dish_name,
                        "missing": missing,
                    }
                )
        return result

    def list_history(self, refrigerator_id: str, week_start: date) -> list[dict[str, object]]:
        """返回当前周之前连续八个自然周的菜单摘要。

        Args:
            refrigerator_id: 当前所有者已授权的冰箱。
            week_start: 当前周的周一日期；调用方须先完成规范化。

        Returns:
            从上周到八周前排序的八条周摘要；未安排食谱的周也会保留。
        """
        history: list[dict[str, object]] = []
        for offset in range(1, 9):
            historical_week = week_start.fromordinal(week_start.toordinal() - offset * 7)
            plan = self._plan(refrigerator_id, historical_week, create=False)
            recipe_count = 0
            preview = ""
            if plan is not None:
                entries = list(
                    self._session.scalars(
                        select(RecipeEntry)
                        .where(RecipeEntry.recipe_plan_id == plan.id)
                        .order_by(RecipeEntry.weekday, RecipeEntry.id)
                    )
                )
                recipe_count = len(entries)
                preview = "；".join(
                    f"{WEEKDAYS[entry.weekday]} {entry.dish_name}" for entry in entries
                )
            history.append(
                {
                    "week_start": historical_week,
                    "label": historical_week.isoformat(),
                    "recipe_count": recipe_count,
                    "preview": preview,
                }
            )
        return history

    def copy_history_week(
        self, refrigerator_id: str, current_week_start: date, source_week_start: date,
        target_week_start: date,
    ) -> list[dict[str, object]]:
        """将历史周食谱完整覆盖复制到本周或下周。

        复制只迁移菜名、星期和食材需求；历史周的完成状态及其库存扣减审计不会带入
        目标周。目标周现有已完成菜的库存扣减保持为既成事实，仅替换其菜单记录。

        Args:
            refrigerator_id: 当前所有者已授权的冰箱。
            current_week_start: 当前周的周一日期。
            source_week_start: 被复制的历史周周一日期。
            target_week_start: 本周或下周的周一日期。

        Returns:
            覆盖后的目标周固定七日食谱。

        Raises:
            ValueError: 当来源不属于最近八个历史周，或目标不是本周/下周时抛出。
        """
        allowed_sources = {
            current_week_start.fromordinal(current_week_start.toordinal() - offset * 7)
            for offset in range(1, 9)
        }
        allowed_targets = {
            current_week_start,
            current_week_start.fromordinal(current_week_start.toordinal() + 7),
        }
        if source_week_start not in allowed_sources:
            raise ValueError("只能复制最近八周的历史菜单")
        if target_week_start not in allowed_targets:
            raise ValueError("只能覆盖复制到本周或下周")

        source_plan = self._plan(refrigerator_id, source_week_start, create=False)
        source_entries = [] if source_plan is None else list(
            self._session.scalars(
                select(RecipeEntry)
                .where(RecipeEntry.recipe_plan_id == source_plan.id)
                .order_by(RecipeEntry.weekday, RecipeEntry.id)
            )
        )
        source_values = [
            (entry.weekday, entry.dish_name, entry.method, entry.note, [
                {"subcategory_name": ingredient.raw_name, "quantity": ingredient.quantity}
                for ingredient in self._ingredients(entry)
            ])
            for entry in source_entries
        ]

        target_plan = self._plan(refrigerator_id, target_week_start, create=True)
        assert target_plan is not None
        target_entry_ids = list(
            self._session.scalars(
                select(RecipeEntry.id).where(RecipeEntry.recipe_plan_id == target_plan.id)
            )
        )
        self._delete_entries(target_entry_ids)
        self._session.flush()

        for weekday, dish_name, method, note, ingredients in source_values:
            entry = RecipeEntry(
                recipe_plan_id=target_plan.id,
                weekday=weekday,
                dish_name=dish_name,
                method=method,
                note=note,
            )
            self._session.add(entry)
            self._session.flush()
            self._replace_ingredients(entry, ingredients)
        return self.list_week(refrigerator_id, target_week_start)

    def _delete_entries(self, entry_ids: list[str]) -> None:
        """删除食谱及关联行，但保留已完成动作对库存的实际影响。"""
        if not entry_ids:
            return
        completion_ids = list(
            self._session.scalars(
                select(RecipeCompletion.id).where(
                    RecipeCompletion.recipe_entry_id.in_(entry_ids)
                )
            )
        )
        if completion_ids:
            self._session.execute(
                delete(ConsumptionLineModel).where(
                    ConsumptionLineModel.completion_id.in_(completion_ids)
                )
            )
            self._session.execute(
                delete(RecipeCompletion).where(RecipeCompletion.id.in_(completion_ids))
            )
        self._session.execute(
            delete(RecipeIngredientModel).where(RecipeIngredientModel.recipe_entry_id.in_(entry_ids))
        )
        self._session.execute(delete(RecipeEntry).where(RecipeEntry.id.in_(entry_ids)))

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
        self, entry: RecipeEntry, ingredients: list[dict[str, object]]
    ) -> None:
        for item in self._session.scalars(
            select(RecipeIngredientModel).where(RecipeIngredientModel.recipe_entry_id == entry.id)
        ):
            self._session.delete(item)
        for item in ingredients:
            name = normalize_ingredient_name(str(item.get("subcategory_name", "")))
            quantity = int(item.get("quantity", 1))
            if not name or quantity < 1:
                raise ValueError("食材名称不能为空，数量至少为 1")
            self._session.add(
                RecipeIngredientModel(
                    recipe_entry_id=entry.id,
                    subcategory_id=None,
                    raw_name=name,
                    quantity=quantity,
                )
            )
        self._session.flush()

    def _entry_view(
        self, entry: RecipeEntry, missing: list[dict[str, object]] | None = None
    ) -> dict[str, object]:
        ingredients = self._ingredients(entry)
        return {
            "id": entry.id,
            "weekday": entry.weekday,
            "dish_name": entry.dish_name,
            "method": entry.method,
            "note": entry.note,
            "completed": entry.completed_at is not None,
            "ingredients": [
                {
                    "subcategory_name": item.raw_name,
                    "quantity": item.quantity,
                }
                for item in ingredients
            ],
            "missing": missing if missing is not None else self._missing(entry),
        }

    def _missing(self, entry: RecipeEntry) -> list[dict[str, object]]:
        plan = self._plan_for_entry(entry)
        entries = list(
            self._session.scalars(
                select(RecipeEntry)
                .where(RecipeEntry.recipe_plan_id == plan.id)
                .order_by(RecipeEntry.weekday, RecipeEntry.id)
            )
        )
        return self._planned_missing(plan.refrigerator_id, entries)[entry.id]

    def _ingredients(self, entry: RecipeEntry) -> list[RecipeIngredientModel]:
        """读取一条食谱的食材，保持其在编辑时的原始顺序。"""
        return list(
            self._session.scalars(
                select(RecipeIngredientModel).where(
                    RecipeIngredientModel.recipe_entry_id == entry.id
                )
            )
        )

    def _planned_missing(
        self, refrigerator_id: str, entries: list[RecipeEntry]
    ) -> dict[str, list[dict[str, object]]]:
        """按食谱日期依次预留库存，并保留已完成菜的历史未满足需求。"""
        available: dict[str, int] = {}
        for batch in self._inventory.list_batches(refrigerator_id):
            available[batch.item_name] = (
                available.get(batch.item_name, 0) + batch.quantity
            )
        result: dict[str, list[dict[str, object]]] = {}
        for entry in entries:
            if entry.completed_at is not None:
                result[entry.id] = self._completion_missing(entry)
                continue
            missing: list[dict[str, object]] = []
            for item in self._ingredients(entry):
                available_quantity = available.get(item.raw_name, 0)
                deficit = max(item.quantity - available_quantity, 0)
                available[item.raw_name] = max(available_quantity - item.quantity, 0)
                if deficit:
                    missing.append({"subcategory_name": item.raw_name, "quantity": deficit})
            result[entry.id] = missing
        return result

    def _completion_missing(self, entry: RecipeEntry) -> list[dict[str, object]]:
        """用完成审计计算某道已完成菜实际未满足的食材。"""
        completion = self._session.scalar(
            select(RecipeCompletion).where(RecipeCompletion.recipe_entry_id == entry.id)
        )
        consumed: dict[str, int] = {}
        if completion is not None:
            for line in self._session.scalars(
                select(ConsumptionLineModel).where(
                    ConsumptionLineModel.completion_id == completion.id
                )
            ):
                batch = self._session.get(InventoryBatchModel, line.inventory_batch_id)
                if batch is not None:
                    consumed[batch.item_name] = (
                        consumed.get(batch.item_name, 0) + line.quantity
                    )
        missing: list[dict[str, object]] = []
        for item in self._ingredients(entry):
            deficit = max(item.quantity - consumed.get(item.raw_name, 0), 0)
            if deficit:
                missing.append({"subcategory_name": item.raw_name, "quantity": deficit})
        return missing

    def _plan_for_entry(self, entry: RecipeEntry) -> RecipePlan:
        plan = self._session.get(RecipePlan, entry.recipe_plan_id)
        assert plan is not None
        return plan
