"""P5 通用物品库存与分类服务。

本模块在单个数据库事务中维护数据驱动的分类、库存批次和最近小类；不处理 HTTP
鉴权、图标文件传输或页面展示。库存只持久化小类，大类仅作为选择器导航分组。
"""

from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from fridgeboard.item_catalog import default_subcategory_ids, ensure_builtin_catalog, load_catalog
from fridgeboard.persistence.models import (
    FoodCategory,
    InventoryBatchModel,
    RecentSubcategoryUsage,
    Refrigerator,
)
from fridgeboard.persistence.repositories import InventoryRepository


class InventoryService:
    """在当前事务中提供 P5 的库存、分类和位置记忆操作。"""

    def __init__(self, session: Session) -> None:
        """绑定由调用方管理提交边界的会话。"""
        self._session = session
        self._repository = InventoryRepository(session)

    def categories(self, refrigerator_id: str, query: str | None = None) -> list[FoodCategory]:
        """返回当前冰箱可用的两级分类，并可按名称搜索。

        Args:
            refrigerator_id: 自定义分类所属冰箱。
            query: 可选的名称片段；空白视为不筛选。

        Returns:
            内置分类和该冰箱自定义小类，按大类再按名称稳定排序。
        """
        ensure_builtin_catalog(self._session)
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
        categories = list(self._session.scalars(statement))
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

    def create_custom_group(self, refrigerator_id: str, name: str) -> FoodCategory:
        """创建只用于展开选择器导航的冰箱专属大类。

        Args:
            refrigerator_id: 新大类所属冰箱。
            name: 去除首尾空白后的展示名称。

        Returns:
            已加入当前事务、且不带图标的新大类。

        Raises:
            ValueError: 名称为空或当前冰箱已存在同名大类时抛出。
        """
        ensure_builtin_catalog(self._session)
        normalized = name.strip()
        if not normalized:
            raise ValueError("大类名称不能为空")
        duplicate = self._session.scalar(
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
                for item in self.categories(refrigerator_id)
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
        self._session.flush()
        return group

    def create_custom_subcategory(
        self, refrigerator_id: str, parent_id: str, name: str, icon_key: str | None
    ) -> FoodCategory:
        """创建某冰箱专属的小类，并复用用户确认的图标键。

        Args:
            refrigerator_id: 新类别归属的冰箱。
            parent_id: 必须是当前冰箱可用的内置大类 ID。
            name: 用户确认的小类名称，去除首尾空白后不能为空。
            icon_key: 选中的图标键；可为空。

        Returns:
            已加入当前事务的新自定义小类。

        Raises:
            ValueError: 当大类不合法、名称为空或存在同冰箱同名小类时抛出。
        """
        ensure_builtin_catalog(self._session)
        parent = self._session.get(FoodCategory, parent_id)
        if (
            parent is None
            or parent.parent_id is not None
            or parent.refrigerator_id not in {None, refrigerator_id}
        ):
            raise ValueError("物品大类不存在或不属于当前柜体")
        normalized_name = name.strip()
        if not normalized_name:
            raise ValueError("自定义小类名称不能为空")
        duplicate = self._session.scalar(
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
            display_order=self._next_child_order(parent_id),
        )
        self._session.add(category)
        self._session.flush()
        return category

    def create_batch(
        self, refrigerator_id: str, *, remember_last_added_location: bool = True, **values: object
    ) -> InventoryBatchModel:
        """新增库存；同品名且相同可合并字段的已有批次只增加数量。

        BBD 为空的批次不会写入总有效期，因此后续风险计算会自然返回空值。
        """
        subcategory_id = str(values["subcategory_id"])
        storage_slot_id = str(values["storage_slot_id"])
        self._repository.assert_inventory_scope(refrigerator_id, subcategory_id, storage_slot_id)
        quantity = int(values["quantity"])
        if quantity < 1:
            raise ValueError("数量必须至少为 1")
        item_name = str(values["item_name"]).strip()
        if not item_name:
            raise ValueError("物品名称不能为空")
        best_before = values.get("best_before")
        production_date = values.get("production_date")
        if best_before is not None and not isinstance(production_date, date):
            production_date = date.today()
        product_description = values.get("product_description")
        product_description = str(product_description).strip() if product_description else None
        batch = self._session.scalar(
            select(InventoryBatchModel).where(
                InventoryBatchModel.refrigerator_id == refrigerator_id,
                InventoryBatchModel.subcategory_id == subcategory_id,
                InventoryBatchModel.storage_slot_id == storage_slot_id,
                InventoryBatchModel.item_name == item_name,
                InventoryBatchModel.best_before == best_before,
                InventoryBatchModel.product_description == product_description,
            )
        )
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
                barcode=values.get("barcode"),
            )
            self._session.add(batch)
            self._session.flush()
        else:
            batch.quantity += quantity
        if remember_last_added_location:
            refrigerator = self._session.get(Refrigerator, refrigerator_id)
            if refrigerator is None:
                raise ValueError("冰箱不存在")
            refrigerator.last_added_storage_slot_id = storage_slot_id
            self._remember_subcategory(refrigerator_id, subcategory_id)
        return batch

    def update_batch(
        self, refrigerator_id: str, batch_id: str, **values: object
    ) -> InventoryBatchModel:
        """完整替换一个批次的可编辑字段。"""
        batch = self._batch_for_refrigerator(refrigerator_id, batch_id)
        subcategory_id = str(values["subcategory_id"])
        storage_slot_id = str(values["storage_slot_id"])
        self._repository.assert_inventory_scope(refrigerator_id, subcategory_id, storage_slot_id)
        quantity = int(values["quantity"])
        if quantity < 1:
            raise ValueError("数量必须至少为 1")
        item_name = str(values["item_name"]).strip()
        if not item_name:
            raise ValueError("物品名称不能为空")
        production_date = values.get("production_date")
        if values.get("best_before") is not None and not isinstance(production_date, date):
            production_date = batch.production_date or batch.created_at.date()
        for field_name, value in {
            "subcategory_id": subcategory_id,
            "storage_slot_id": storage_slot_id,
            "item_name": item_name,
            "quantity": quantity,
            "production_date": production_date,
            "best_before": values.get("best_before"),
            "shelf_life_days": values.get("shelf_life_days"),
            "product_description": (
                str(values["product_description"]).strip()
                if values.get("product_description")
                else None
            ),
            "barcode": values.get("barcode"),
        }.items():
            setattr(batch, field_name, value)
        return batch

    def delete_batch(self, refrigerator_id: str, batch_id: str) -> None:
        """删除当前冰箱的一个库存批次。"""
        self._session.delete(self._batch_for_refrigerator(refrigerator_id, batch_id))

    def adjust_batch_quantity(
        self, refrigerator_id: str, batch_id: str, delta: int
    ) -> InventoryBatchModel | None:
        """按显示设备的一次明确操作增减库存，数量归零时删除记录。

        Args:
            refrigerator_id: 当前设备已获授权访问的冰箱。
            batch_id: 要调整的库存批次。
            delta: 只能为 ``-1``、``1`` 或以 ``-quantity`` 表示全部拿走。

        Returns:
            更新后的批次；数量归零并删除时返回 ``None``。

        Raises:
            ValueError: 当操作跨冰箱、增减值非法或会使数量小于零时抛出。
        """
        batch = self._batch_for_refrigerator(refrigerator_id, batch_id)
        if delta not in {-1, 1, -batch.quantity}:
            raise ValueError("库存调整值无效")
        next_quantity = batch.quantity + delta
        if next_quantity < 0:
            raise ValueError("库存数量不能小于零")
        if next_quantity == 0:
            self._session.delete(batch)
            return None
        batch.quantity = next_quantity
        return batch

    def last_added_location(self, refrigerator_id: str) -> str | None:
        """返回冰箱最近一次成功添加物品的位置。"""
        refrigerator = self._session.get(Refrigerator, refrigerator_id)
        if refrigerator is None:
            raise ValueError("冰箱不存在")
        return refrigerator.last_added_storage_slot_id

    def _batch_for_refrigerator(self, refrigerator_id: str, batch_id: str) -> InventoryBatchModel:
        """读取当前冰箱的批次，防止通过 ID 修改其他冰箱库存。"""
        batch = self._session.get(InventoryBatchModel, batch_id)
        if batch is None or batch.refrigerator_id != refrigerator_id:
            raise ValueError("库存记录不存在或不属于当前冰箱")
        return batch

    def recent_subcategories(self, refrigerator_id: str, limit: int = 16) -> list[FoodCategory]:
        """返回最近成功新增过的小类，无历史时使用冰箱默认目录。

        Args:
            refrigerator_id: 当前冰箱 ID。
            limit: 最多返回的小类数量。

        Returns:
            按最后新增时间倒序且不重复的小类列表。
        """
        ensure_builtin_catalog(self._session)
        catalog = load_catalog()
        removed_names = set(catalog.get("removed_subcategory_names", []))
        visible_builtin_ids = {
            item["id"] for item in [*catalog["groups"], *catalog["subcategories"]]
        }
        recent_ids = list(
            self._session.scalars(
                select(RecentSubcategoryUsage.subcategory_id)
                .where(RecentSubcategoryUsage.refrigerator_id == refrigerator_id)
                .order_by(RecentSubcategoryUsage.last_added_at.desc())
                .limit(limit)
            )
        )
        ordered_ids = recent_ids or default_subcategory_ids()[:limit]
        categories = {
            item.id: item
            for item in self._session.scalars(
                select(FoodCategory).where(
                    FoodCategory.id.in_(ordered_ids),
                    or_(
                        FoodCategory.id.in_(visible_builtin_ids),
                        FoodCategory.refrigerator_id == refrigerator_id,
                    ),
                    ~FoodCategory.name.in_(removed_names),
                )
            )
        }
        result: list[FoodCategory] = []
        seen_icons: set[str] = set()
        for item_id in ordered_ids:
            item = categories.get(item_id)
            if item is None:
                continue
            icon_key = item.icon_key or item.id
            if icon_key in seen_icons:
                continue
            seen_icons.add(icon_key)
            result.append(item)
            if len(result) >= limit:
                break
        return result

    def _remember_subcategory(self, refrigerator_id: str, subcategory_id: str) -> None:
        """记录一次成功新增的小类，不让编辑和冰箱端恢复改写顺序。"""
        usage = self._session.get(
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
        usage.last_added_at = now

    def _next_child_order(self, parent_id: str) -> int:
        """返回某大类中新建小类的稳定末尾顺序。"""
        orders = self._session.scalars(
            select(FoodCategory.display_order).where(FoodCategory.parent_id == parent_id)
        )
        return max(orders, default=-1) + 1
