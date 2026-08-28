"""P5 通用物品库存与分类服务。

本模块在单个数据库事务中维护数据驱动的分类、库存批次和最近小类；不处理 HTTP
鉴权、图标文件传输或页面展示。库存只持久化小类，大类仅作为选择器导航分组。
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from fridgeboard.category_matching import normalize_item_name
from fridgeboard.item_catalog import ensure_builtin_catalog, load_catalog
from fridgeboard.persistence.models import (
    ConsumptionLineModel,
    FoodCategory,
    GlobalItemCategoryMapping,
    InventoryBatchModel,
    ItemCategoryMapping,
    RecentSubcategoryUsage,
    RecipeIngredientModel,
    Refrigerator,
)
from fridgeboard.persistence.repositories import InventoryRepository


class CategoryOwnershipError(ValueError):
    """当前用户不是自定义小类创建者，不能执行管理操作。"""


class InventoryService:
    """在当前事务中提供 P5 的库存、分类和位置记忆操作。"""

    def __init__(self, session: AsyncSession) -> None:
        """绑定由调用方管理提交边界的会话。"""
        self._session = session
        self._repository = InventoryRepository(session)

    async def categories(
        self, refrigerator_id: str, query: str | None = None
    ) -> list[FoodCategory]:
        """返回当前冰箱可用的两级分类，并可按名称搜索。

        Args:
            refrigerator_id: 自定义分类所属冰箱。
            query: 可选的名称片段；空白视为不筛选。

        Returns:
            内置分类和该冰箱自定义小类，按大类再按名称稳定排序。
        """
        catalog = load_catalog()
        removed_names = set(catalog.get("removed_subcategory_names", []))
        visible_builtin_ids = {
            item["id"] for item in [*catalog["groups"], *catalog["subcategories"]]
        }
        statement = select(FoodCategory).where(
            or_(
                FoodCategory.id.in_(visible_builtin_ids),
                FoodCategory.refrigerator_id == refrigerator_id,
            ),
            or_(FoodCategory.parent_id.is_(None), ~FoodCategory.name.in_(removed_names)),
        )
        normalized = (query or "").strip()
        if normalized:
            statement = statement.where(FoodCategory.name.contains(normalized))
        categories = list(await self._session.scalars(statement))
        by_id = {item.id: item for item in categories}
        return sorted(
            categories,
            key=lambda item: (
                by_id.get(item.parent_id or item.id, item).display_order,
                item.parent_id is not None,
                item.display_order,
                item.name.casefold(),
            ),
        )

    async def create_custom_group(self, refrigerator_id: str, name: str) -> FoodCategory:
        """创建只用于展开选择器导航的冰箱专属大类。

        Args:
            refrigerator_id: 新大类所属冰箱。
            name: 去除首尾空白后的展示名称。

        Returns:
            已加入当前事务、且不带图标的新大类。

        Raises:
            ValueError: 名称为空或当前冰箱已存在同名大类时抛出。
        """
        await ensure_builtin_catalog(self._session)
        normalized = name.strip()
        if not normalized:
            raise ValueError("大类名称不能为空")
        duplicate = await self._session.scalar(
            select(FoodCategory.id).where(
                FoodCategory.parent_id.is_(None),
                FoodCategory.name == normalized,
                or_(
                    FoodCategory.refrigerator_id.is_(None),
                    FoodCategory.refrigerator_id == refrigerator_id,
                ),
            )
        )
        if duplicate:
            raise ValueError("当前冰箱已存在同名大类")
        last_order = max(
            (
                item.display_order
                for item in await self.categories(refrigerator_id)
                if item.parent_id is None
            ),
            default=-1,
        )
        group = FoodCategory(
            refrigerator_id=refrigerator_id,
            name=normalized,
            icon_key=None,
            is_custom=True,
            display_order=last_order + 1,
        )
        self._session.add(group)
        await self._session.flush()
        return group

    async def create_custom_subcategory(
        self,
        refrigerator_id: str,
        parent_id: str,
        name: str,
        icon_key: str | None,
        created_by_user_id: str,
    ) -> FoodCategory:
        """创建某冰箱专属的小类，并复用用户确认的图标键。

        Args:
            refrigerator_id: 新类别归属的冰箱。
            parent_id: 必须是当前冰箱可用的内置大类 ID。
            name: 用户确认的小类名称，去除首尾空白后不能为空。
            icon_key: 选中的图标键；可为空。
            created_by_user_id: 创建者用户 ID；自定义小类必须记录该归属。

        Returns:
            已加入当前事务的新自定义小类。

        Raises:
            ValueError: 当大类不合法、名称为空或存在同冰箱同名小类时抛出。
        """
        await ensure_builtin_catalog(self._session)
        parent = await self._session.get(FoodCategory, parent_id)
        if (
            parent is None
            or parent.parent_id is not None
            or parent.refrigerator_id not in {None, refrigerator_id}
        ):
            raise ValueError("物品大类不存在或不属于当前柜体")
        normalized_name = name.strip()
        if not normalized_name:
            raise ValueError("自定义小类名称不能为空")
        duplicate = await self._session.scalar(
            select(FoodCategory.id).where(
                FoodCategory.refrigerator_id == refrigerator_id,
                FoodCategory.parent_id == parent_id,
                FoodCategory.name == normalized_name,
            )
        )
        if duplicate:
            raise ValueError("该冰箱已存在同名自定义小类")
        category = FoodCategory(
            refrigerator_id=refrigerator_id,
            parent_id=parent_id,
            name=normalized_name,
            icon_key=icon_key,
            is_custom=True,
            created_by_user_id=created_by_user_id,
            display_order=await self._next_child_order(parent_id),
        )
        self._session.add(category)
        await self._session.flush()
        return category

    async def update_custom_subcategory(
        self, refrigerator_id: str, category_id: str, name: str | None, parent_id: str | None,
        icon_key: str | None = None, *, created_by_user_id: str,
    ) -> FoodCategory:
        """更新当前冰箱的自定义小类，不触碰系统分类。

        Args:
            refrigerator_id: 自定义小类所属冰箱。
            category_id: 待更新的小类 ID。
            name: 新名称；为空时保留原名称。
            parent_id: 新大类 ID；为空时保留原大类。
            icon_key: 新图标键；为空时保留原图标。
            created_by_user_id: 执行操作的用户 ID；必须与创建者一致。

        Raises:
            CategoryOwnershipError: 当前用户不是该小类创建者。
            ValueError: 小类不存在、不是自定义小类或参数不合法。
        """
        category = await self._session.get(FoodCategory, category_id)
        if (
            category is None
            or category.refrigerator_id != refrigerator_id
            or not category.is_custom
        ):
            raise ValueError("系统小类不可修改")
        if category.created_by_user_id != created_by_user_id:
            raise CategoryOwnershipError("只有小类创建者可以编辑或删除该小类")
        if name is not None:
            normalized_name = name.strip()
            if not normalized_name:
                raise ValueError("自定义小类名称不能为空")
            category.name = normalized_name
        if parent_id is not None:
            parent = await self._session.get(FoodCategory, parent_id)
            if (
                parent is None
                or parent.parent_id is not None
                or parent.refrigerator_id not in {None, refrigerator_id}
            ):
                raise ValueError("物品大类不存在或不属于当前柜体")
            category.parent_id = parent_id
        if icon_key is not None:
            category.icon_key = icon_key
        category.revision += 1
        await self._session.flush()
        return category

    async def delete_custom_subcategory(
        self, refrigerator_id: str, category_id: str, created_by_user_id: str
    ) -> None:
        """删除没有业务引用的自定义小类。

        Args:
            refrigerator_id: 自定义小类所属冰箱。
            category_id: 待删除的小类 ID。
            created_by_user_id: 执行删除的用户 ID；必须与创建者一致。

        Raises:
            CategoryOwnershipError: 当前用户不是该小类创建者。
            ValueError: 小类不存在、不是自定义小类或仍被库存/食谱引用。
        """
        category = await self._session.get(FoodCategory, category_id)
        if (
            category is None
            or category.refrigerator_id != refrigerator_id
            or not category.is_custom
            or category.parent_id is None
        ):
            raise ValueError("系统小类不可删除")
        if category.created_by_user_id != created_by_user_id:
            raise CategoryOwnershipError("只有小类创建者可以编辑或删除该小类")
        has_inventory = await self._session.scalar(
            select(InventoryBatchModel.id)
            .where(InventoryBatchModel.subcategory_id == category_id)
            .limit(1)
        )
        has_recipe = await self._session.scalar(
            select(RecipeIngredientModel.id)
            .where(RecipeIngredientModel.subcategory_id == category_id)
            .limit(1)
        )
        if has_inventory is not None or has_recipe is not None:
            raise ValueError("该小类仍被物品或食谱使用，无法删除")
        await self._session.execute(
            delete(RecentSubcategoryUsage).where(
                RecentSubcategoryUsage.subcategory_id == category_id
            )
        )
        await self._session.execute(
            delete(ItemCategoryMapping).where(ItemCategoryMapping.subcategory_id == category_id)
        )
        await self._session.delete(category)
        await self._session.flush()

    async def create_batch(
        self, refrigerator_id: str, *, remember_last_added_location: bool = True, **values: object
    ) -> InventoryBatchModel:
        """新增库存；满足合并条件的已有批次只增加数量。

        普通录入要求小类、位置、名称、BBD、描述和价格都相同；订单批量录入可通过
        ``merge_same_name`` 在同一小类和位置合并同名库存，以免同一订单反复生成重复
        物品项。BBD 为空的批次不会写入总有效期，因此后续风险计算会自然返回空值。
        """
        subcategory_id = str(values["subcategory_id"])
        storage_slot_id = str(values["storage_slot_id"])
        await self._repository.assert_inventory_scope(
            refrigerator_id, subcategory_id, storage_slot_id
        )
        quantity = Decimal(str(values["quantity"]))
        if quantity < 0:
            raise ValueError("数量不能小于 0")
        item_name = str(values["item_name"]).strip()
        if not item_name:
            raise ValueError("物品名称不能为空")
        best_before = values.get("best_before")
        production_date = values.get("production_date")
        if not isinstance(production_date, date):
            production_date = date.today()
        product_description = values.get("product_description")
        product_description = str(product_description).strip() if product_description else None
        price = values.get("price")
        price = price if isinstance(price, Decimal) else None
        merge_same_name = bool(values.get("merge_same_name"))
        statement = select(InventoryBatchModel).where(
            InventoryBatchModel.refrigerator_id == refrigerator_id,
            InventoryBatchModel.subcategory_id == subcategory_id,
            InventoryBatchModel.storage_slot_id == storage_slot_id,
            InventoryBatchModel.item_name == item_name,
        )
        if not merge_same_name:
            statement = statement.where(
                InventoryBatchModel.best_before == best_before,
                InventoryBatchModel.product_description == product_description,
                InventoryBatchModel.price == price,
            )
        batch = await self._session.scalar(statement.order_by(InventoryBatchModel.created_at))
        if batch is None:
            batch = InventoryBatchModel(
                refrigerator_id=refrigerator_id,
                subcategory_id=subcategory_id,
                storage_slot_id=storage_slot_id,
                item_name=item_name,
                quantity=quantity,
                production_date=production_date if isinstance(production_date, date) else None,
                best_before=best_before if isinstance(best_before, date) else None,
                shelf_life_days=values.get("shelf_life_days"),
                product_description=product_description,
                price=price,
                barcode=values.get("barcode"),
            )
            self._session.add(batch)
            await self._session.flush()
        else:
            batch.quantity += quantity
            if merge_same_name:
                if batch.product_description is None and product_description is not None:
                    batch.product_description = product_description
                if batch.price is None and price is not None:
                    batch.price = price
        if remember_last_added_location:
            refrigerator = await self._session.get(Refrigerator, refrigerator_id)
            if refrigerator is None:
                raise ValueError("冰箱不存在")
            refrigerator.last_added_storage_slot_id = storage_slot_id
            await self._remember_subcategory(refrigerator_id, subcategory_id)
        await self._remember_item_category(refrigerator_id, item_name, subcategory_id)
        return batch

    async def update_batch(
        self, refrigerator_id: str, batch_id: str, **values: object
    ) -> InventoryBatchModel:
        """完整替换一个库存批次，并保留数量调整前的日期信息。

        数量调整包括减至 0 和从 0 恢复。数量变化本身不代表用户修改了日期，
        因此沿用批次已有的生产日期、BBD 和有效期；只有请求明确变更 BBD 时
        才替换或清除 BBD。食谱扣减不经过本方法，所以其撤销语义保持不变。
        """
        batch = await self._batch_for_refrigerator(refrigerator_id, batch_id)
        subcategory_id = str(values["subcategory_id"])
        storage_slot_id = str(values["storage_slot_id"])
        await self._repository.assert_inventory_scope(
            refrigerator_id, subcategory_id, storage_slot_id
        )
        quantity = Decimal(str(values["quantity"]))
        if quantity < 0:
            raise ValueError("数量不能小于 0")
        item_name = str(values["item_name"]).strip()
        if not item_name:
            raise ValueError("物品名称不能为空")
        submitted_production_date = values.get("production_date")
        submitted_best_before = values.get("best_before")
        best_before_changed = bool(values.get("best_before_changed"))
        quantity_changed = quantity != batch.quantity
        if quantity_changed:
            production_date = (
                submitted_production_date
                if isinstance(submitted_production_date, date)
                else batch.production_date or date.today()
            )
            if best_before_changed:
                best_before = (
                    submitted_best_before if isinstance(submitted_best_before, date) else None
                )
            else:
                best_before = (
                    submitted_best_before
                    if isinstance(submitted_best_before, date)
                    and submitted_best_before != batch.best_before
                    else batch.best_before
                )
            if best_before is not None and best_before < production_date:
                raise ValueError("BBD 不能早于生产日期")
            shelf_life = (
                (best_before - production_date).days if isinstance(best_before, date) else None
            )
        else:
            production_date = (
                submitted_production_date
                if isinstance(submitted_production_date, date)
                else batch.production_date or date.today()
            )
            best_before = submitted_best_before if isinstance(submitted_best_before, date) else None
            shelf_life = values.get("shelf_life_days")
            if (
                batch.quantity == 0
                and submitted_production_date is None
                and submitted_best_before is None
            ):
                production_date = batch.production_date
                best_before = batch.best_before
                shelf_life = batch.shelf_life_days
        for field_name, value in {
            "subcategory_id": subcategory_id,
            "storage_slot_id": storage_slot_id,
            "item_name": item_name,
            "quantity": quantity,
            "production_date": production_date,
            "best_before": best_before,
            "shelf_life_days": shelf_life,
            "product_description": (
                str(values["product_description"]).strip()
                if values.get("product_description")
                else None
            ),
            "price": values.get("price") if isinstance(values.get("price"), Decimal) else None,
            "barcode": values.get("barcode"),
        }.items():
            setattr(batch, field_name, value)
        await self._remember_item_category(refrigerator_id, item_name, subcategory_id)
        return batch

    async def delete_batch(self, refrigerator_id: str, batch_id: str) -> None:
        """删除当前冰箱的库存批次及其消费审计引用。

        用户明确删除批次时，相关消费审计行也必须一并移除，否则 SQLite 外键会阻止
        删除；这也意味着后续撤销食谱不会再尝试恢复已被用户删除的批次。
        """
        batch = await self._batch_for_refrigerator(refrigerator_id, batch_id)
        await self._session.execute(
            delete(ConsumptionLineModel).where(ConsumptionLineModel.inventory_batch_id == batch.id)
        )
        await self._session.delete(batch)

    async def reclassify_batches(
        self, refrigerator_id: str, batch_ids: list[str], subcategory_id: str
    ) -> list[InventoryBatchModel]:
        """将当前冰箱中的多个库存批次改到同一个小类。

        Args:
            refrigerator_id: 批次所属冰箱 ID。
            batch_ids: 要修改的小类批次 ID，返回时保留此顺序。
            subcategory_id: 目标小类 ID。

        Returns:
            已更新小类的库存批次。

        Raises:
            ValueError: 当批次重复、批次不属于当前冰箱或目标分类不可用时抛出。
        """
        if len(set(batch_ids)) != len(batch_ids):
            raise ValueError("物品列表不能重复")
        batches = list(
            await self._session.scalars(
                select(InventoryBatchModel).where(
                    InventoryBatchModel.id.in_(batch_ids),
                    InventoryBatchModel.refrigerator_id == refrigerator_id,
                )
            )
        )
        by_id = {batch.id: batch for batch in batches}
        if len(by_id) != len(batch_ids):
            raise ValueError("部分物品不存在或无权访问")
        for batch in batches:
            await self._repository.assert_inventory_scope(
                refrigerator_id, subcategory_id, batch.storage_slot_id
            )
        for batch in batches:
            batch.subcategory_id = subcategory_id
            await self._remember_item_category(refrigerator_id, batch.item_name, subcategory_id)
        return [by_id[batch_id] for batch_id in batch_ids]

    async def delete_batches(self, batch_ids: list[str]) -> None:
        """永久删除多个库存批次及其消费审计引用。

        Args:
            batch_ids: 要删除的库存批次 ID；调用方应在事务内完成权限校验。

        Raises:
            ValueError: 当批次重复或任一批次不存在时抛出。
        """
        if len(set(batch_ids)) != len(batch_ids):
            raise ValueError("物品列表不能重复")
        batches = list(
            await self._session.scalars(
                select(InventoryBatchModel).where(InventoryBatchModel.id.in_(batch_ids))
            )
        )
        if len(batches) != len(batch_ids):
            raise ValueError("库存记录不存在")
        await self._session.execute(
            delete(ConsumptionLineModel).where(
                ConsumptionLineModel.inventory_batch_id.in_(batch_ids)
            )
        )
        for batch in batches:
            await self._session.delete(batch)

    async def move_batches(
        self, target_refrigerator_id: str, batch_ids: list[str], storage_slot_id: str
    ) -> list[InventoryBatchModel]:
        """将库存批次移动到目标冰箱的同一位置。

        Args:
            target_refrigerator_id: 目标冰箱 ID。
            batch_ids: 要移动的库存批次 ID，顺序会保留在返回值中。
            storage_slot_id: 目标冰箱中的位置 ID。

        Returns:
            已更新位置和归属冰箱的库存批次。

        Raises:
            ValueError: 当批次重复、不存在或目标分类/位置不属于目标冰箱时抛出。
        """
        if len(set(batch_ids)) != len(batch_ids):
            raise ValueError("物品列表不能重复")
        batches = list(
            await self._session.scalars(
                select(InventoryBatchModel).where(InventoryBatchModel.id.in_(batch_ids))
            )
        )
        by_id = {batch.id: batch for batch in batches}
        if len(by_id) != len(batch_ids):
            raise ValueError("库存记录不存在")
        target_subcategory_ids = {
            batch.id: await self._copy_category_to_refrigerator(
                batch.subcategory_id, target_refrigerator_id
            )
            for batch in batches
        }
        for batch in batches:
            await self._repository.assert_inventory_scope(
                target_refrigerator_id,
                target_subcategory_ids[batch.id],
                storage_slot_id,
            )
        moved = [by_id[batch_id] for batch_id in batch_ids]
        for batch in moved:
            batch.refrigerator_id = target_refrigerator_id
            batch.storage_slot_id = storage_slot_id
            batch.subcategory_id = target_subcategory_ids[batch.id]
        return moved

    async def _copy_category_to_refrigerator(self, category_id: str, refrigerator_id: str) -> str:
        """返回目标冰箱可使用的分类，必要时复制源冰箱的自定义分类树。"""
        category = await self._session.get(FoodCategory, category_id)
        if category is None:
            raise ValueError("物品分类不存在")
        if category.refrigerator_id in {None, refrigerator_id}:
            return category.id
        parent_id = (
            await self._copy_category_to_refrigerator(category.parent_id, refrigerator_id)
            if category.parent_id
            else None
        )
        existing = await self._session.scalar(
            select(FoodCategory).where(
                FoodCategory.refrigerator_id == refrigerator_id,
                FoodCategory.parent_id == parent_id,
                FoodCategory.name == category.name,
            )
        )
        if existing:
            return existing.id
        last_order = await self._session.scalar(
            select(FoodCategory.display_order)
            .where(
                FoodCategory.refrigerator_id == refrigerator_id,
                FoodCategory.parent_id == parent_id,
            )
            .order_by(FoodCategory.display_order.desc())
            .limit(1)
        )
        clone = FoodCategory(
            refrigerator_id=refrigerator_id,
            parent_id=parent_id,
            name=category.name,
            icon_key=category.icon_key,
            is_custom=True,
            created_by_user_id=category.created_by_user_id,
            display_order=(last_order + 1) if last_order is not None else 0,
        )
        self._session.add(clone)
        await self._session.flush()
        return clone.id

    async def adjust_batch_quantity(
        self, refrigerator_id: str, batch_id: str, delta: int
    ) -> InventoryBatchModel:
        """按显示设备的一次明确操作增减库存，数量归零时保留软删除记录。

        Args:
            refrigerator_id: 当前设备已获授权访问的冰箱。
            batch_id: 要调整的库存批次。
            delta: 只能为 ``-1``、``1`` 或以 ``-quantity`` 表示全部拿走。

        Returns:
            更新后的库存批次；数量为 0 时仍返回该批次，供撤销操作恢复原记录。

        Raises:
            ValueError: 当操作跨冰箱、增减值非法或会使数量小于零时抛出。
        """
        batch = await self._batch_for_refrigerator(refrigerator_id, batch_id)
        if delta not in {-1, 1, -batch.quantity}:
            raise ValueError("库存调整值无效")
        next_quantity = batch.quantity + delta
        if next_quantity < 0:
            raise ValueError("库存数量不能小于零")
        batch.quantity = next_quantity
        return batch

    async def restore_batch_quantity(
        self, refrigerator_id: str, batch_id: str, quantity: int
    ) -> InventoryBatchModel:
        """恢复冰箱端刚归零的原库存批次，并保留其日期字段。

        Args:
            refrigerator_id: 当前设备所属冰箱。
            batch_id: 要恢复的原库存批次 ID。
            quantity: 撤销时恢复的原数量，必须为正数。

        Returns:
            已恢复数量的原库存批次。

        Raises:
            ValueError: 当批次不存在、尚未归零或恢复数量非法时抛出。
        """
        if quantity < 1:
            raise ValueError("恢复数量必须至少为 1")
        batch = await self._batch_for_refrigerator(refrigerator_id, batch_id)
        if batch.quantity != 0:
            raise ValueError("该库存批次当前未处于归零状态")
        batch.quantity = quantity
        return batch

    async def last_added_location(self, refrigerator_id: str) -> str | None:
        """返回冰箱最近一次成功添加物品的位置。"""
        refrigerator = await self._session.get(Refrigerator, refrigerator_id)
        if refrigerator is None:
            raise ValueError("冰箱不存在")
        return refrigerator.last_added_storage_slot_id

    async def _batch_for_refrigerator(
        self, refrigerator_id: str, batch_id: str
    ) -> InventoryBatchModel:
        """读取当前冰箱的批次，防止通过 ID 修改其他冰箱库存。"""
        batch = await self._session.get(InventoryBatchModel, batch_id)
        if batch is None or batch.refrigerator_id != refrigerator_id:
            raise ValueError("库存记录不存在或不属于当前冰箱")
        return batch

    async def recent_subcategories(
        self, refrigerator_id: str, limit: int = 16
    ) -> list[FoodCategory]:
        """只读返回已记录的最近小类。

        Args:
            refrigerator_id: 当前冰箱 ID。
            limit: 最多返回的小类数量。

        Returns:
            按最后新增时间倒序且不重复的小类列表。
        """
        catalog = load_catalog()
        removed_names = set(catalog.get("removed_subcategory_names", []))
        recent_ids = list(
            await self._session.scalars(
                select(RecentSubcategoryUsage.subcategory_id)
                .where(RecentSubcategoryUsage.refrigerator_id == refrigerator_id)
                .order_by(RecentSubcategoryUsage.last_added_at.desc())
            )
        )
        all_categories = [
            item
            for item in await self.categories(refrigerator_id)
            if item.parent_id is not None and item.name not in removed_names
        ]
        categories = {item.id: item for item in all_categories}
        ordered_ids = recent_ids
        result: list[FoodCategory] = []
        displayed_icons: set[str] = set()
        for item_id in ordered_ids:
            item = categories.get(item_id)
            if item is None:
                continue
            icon_key = item.icon_key or item.id
            if icon_key in displayed_icons:
                continue
            displayed_icons.add(icon_key)
            result.append(item)
            if len(result) >= limit:
                break
        return result

    async def _remember_subcategory(self, refrigerator_id: str, subcategory_id: str) -> None:
        """记录一次成功新增的小类，不让编辑和冰箱端恢复改写顺序。"""
        usage = await self._session.get(
            RecentSubcategoryUsage,
            {"refrigerator_id": refrigerator_id, "subcategory_id": subcategory_id},
        )
        now = datetime.now(UTC).replace(tzinfo=None)
        if usage is None:
            self._session.add(
                RecentSubcategoryUsage(
                    refrigerator_id=refrigerator_id,
                    subcategory_id=subcategory_id,
                    last_added_at=now,
                )
            )
            return
        usage.is_bootstrap = False
        usage.last_added_at = now

    async def _remember_item_category(
        self, refrigerator_id: str, item_name: str, subcategory_id: str
    ) -> None:
        """把成功保存的物品名称提升为当前冰箱的用户确认映射。"""
        normalized = normalize_item_name(item_name)
        if not normalized:
            return
        mapping = await self._session.get(
            ItemCategoryMapping,
            {"refrigerator_id": refrigerator_id, "normalized_item_name": normalized},
        )
        if mapping is None:
            self._session.add(
                ItemCategoryMapping(
                    refrigerator_id=refrigerator_id,
                    normalized_item_name=normalized,
                    display_item_name=item_name,
                    subcategory_id=subcategory_id,
                    source="user",
                    confidence=1.0,
                    confirmed=True,
                    expires_at=None,
                    hit_count=1,
                )
            )
        else:
            mapping.display_item_name = item_name
            mapping.subcategory_id = subcategory_id
            mapping.source = "user"
            mapping.confidence = 1.0
            mapping.confirmed = True
            mapping.expires_at = None
            mapping.hit_count += 1

        category = await self._session.get(FoodCategory, subcategory_id)
        if category is None or category.refrigerator_id is not None:
            return
        global_mapping = await self._session.get(GlobalItemCategoryMapping, normalized)
        if global_mapping is None:
            self._session.add(
                GlobalItemCategoryMapping(
                    normalized_item_name=normalized,
                    display_item_name=item_name,
                    subcategory_id=subcategory_id,
                    source="user",
                    confidence=1.0,
                    confirmed=True,
                    expires_at=None,
                    hit_count=1,
                )
            )
            return
        global_mapping.display_item_name = item_name
        global_mapping.subcategory_id = subcategory_id
        global_mapping.source = "user"
        global_mapping.confidence = 1.0
        global_mapping.confirmed = True
        global_mapping.expires_at = None
        global_mapping.hit_count += 1

    async def _next_child_order(self, parent_id: str) -> int:
        """返回某大类中新建小类的稳定末尾顺序。"""
        orders = await self._session.scalars(
            select(FoodCategory.display_order).where(FoodCategory.parent_id == parent_id)
        )
        return max(orders, default=-1) + 1
