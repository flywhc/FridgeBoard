"""P5 库存与分类服务。

本模块在单个数据库事务中维护内置/自定义两级分类、库存批次和大类位置记忆；不处理
HTTP 鉴权或页面展示。内置分类使用稳定主键按需初始化，避免把种子数据的部署顺序变成
运行时前提。
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from fridgeboard.persistence.models import FoodCategory, InventoryBatchModel, Refrigerator
from fridgeboard.persistence.repositories import InventoryRepository

BUILTIN_CATEGORIES: tuple[tuple[str, str, str, tuple[tuple[str, str, str], ...]], ...] = (
    (
        "meat",
        "鸡肉",
        "chicken",
        (
            ("meat-general", "肉类", "chicken"),
            ("pork", "猪肉", "pork"),
            ("chicken", "鸡肉", "chicken"),
        ),
    ),
    ("pork", "猪肉", "pork", (("pork-general", "猪肉", "pork"),)),
    ("beef", "牛肉", "beef", (("beef-general", "牛肉", "beef"),)),
    ("lamb", "羊肉", "lamb", (("lamb-general", "羊肉", "lamb"),)),
    ("seafood", "水产", "fish", (("seafood-general", "水产", "fish"), ("fish", "鱼", "fish"))),
    ("sausage", "肠丸", "sausage", (("sausage-general", "肠丸", "sausage"),)),
    ("cooked-meat", "熟肉", "cooked-meat", (("cooked-meat-general", "熟肉", "cooked-meat"),)),
    (
        "vegetable",
        "蔬菜",
        "vegetable",
        (("vegetable-general", "蔬菜", "vegetable"), ("leafy-vegetable", "叶菜", "vegetable")),
    ),
    (
        "fruit",
        "水果",
        "fruit",
        (
            ("fruit-general", "水果", "fruit"),
            ("orange", "橘子", "fruit"),
            ("apple", "苹果", "fruit"),
        ),
    ),
    (
        "staple",
        "主食",
        "steamed-bun",
        (("staple-general", "主食", "steamed-bun"), ("noodle", "面条", "rice")),
    ),
    (
        "onion-ginger",
        "葱姜",
        "scallion-ginger",
        (("onion-ginger-general", "葱姜", "scallion-ginger"),),
    ),
    ("dry-goods", "干货", "dried-goods", (("dry-goods-general", "干货", "dried-goods"),)),
    (
        "condiment",
        "酱料",
        "condiment",
        (("condiment-general", "酱料", "condiment"), ("sauce", "酱料", "condiment")),
    ),
    ("dairy", "奶品", "milk", (("dairy-general", "奶品", "milk"), ("milk", "牛奶", "milk"))),
    ("dessert", "甜点", "dessert", (("dessert-general", "甜点", "dessert"),)),
    ("egg", "蛋类", "egg", (("egg-general", "蛋类", "egg"), ("egg", "鸡蛋", "egg"))),
    ("baking", "烘焙", "bread", (("baking-general", "烘焙", "bread"),)),
    ("drink", "饮料", "drink", (("drink-general", "饮料", "drink"), ("juice", "果汁", "drink"))),
    ("nuts", "坚果", "nuts", (("nuts-general", "坚果", "nuts"),)),
    ("other", "其他", "other", (("other-general", "其他", "other"),)),
)


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
        self._ensure_builtin_categories()
        statement = select(FoodCategory).where(
            or_(
                FoodCategory.refrigerator_id.is_(None),
                FoodCategory.refrigerator_id == refrigerator_id,
            )
        )
        normalized = (query or "").strip()
        if normalized:
            statement = statement.where(FoodCategory.name.contains(normalized))
        categories = list(self._session.scalars(statement))
        parent_order = {
            f"builtin-category-{category_id}": index
            for index, (category_id, _, _, _) in enumerate(BUILTIN_CATEGORIES)
        }
        return sorted(
            categories,
            key=lambda item: (
                parent_order.get(item.parent_id or item.id, len(parent_order)),
                item.parent_id is not None,
                item.name,
            ),
        )

    def create_custom_subcategory(
        self, refrigerator_id: str, parent_id: str, name: str, icon_key: str | None
    ) -> FoodCategory:
        """创建某冰箱专属的小类，并复用用户确认的图标键。

        Args:
            refrigerator_id: 新类别归属的冰箱。
            parent_id: 必须是当前冰箱可用的内置大类 ID。
            name: 用户确认的小类名称，去除首尾空白后不能为空。
            icon_key: 选中的图标键；为空时由大类图标回退。

        Returns:
            已加入当前事务的新自定义小类。

        Raises:
            ValueError: 当大类不合法、名称为空或存在同冰箱同名小类时抛出。
        """
        self._ensure_builtin_categories()
        parent = self._session.get(FoodCategory, parent_id)
        if (
            parent is None
            or parent.parent_id is not None
            or parent.refrigerator_id not in {None, refrigerator_id}
        ):
            raise ValueError("食品大类不存在或不属于当前冰箱")
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
        category_id = str(values["category_id"])
        subcategory_id = str(values["subcategory_id"])
        storage_slot_id = str(values["storage_slot_id"])
        self._repository.assert_inventory_scope(
            refrigerator_id, category_id, subcategory_id, storage_slot_id
        )
        quantity = int(values["quantity"])
        if quantity < 1:
            raise ValueError("数量必须至少为 1")
        food_name = str(values["food_name"]).strip()
        if not food_name:
            raise ValueError("食品名称不能为空")
        best_before = values.get("best_before")
        product_description = values.get("product_description")
        product_description = str(product_description).strip() if product_description else None
        batch = self._session.scalar(
            select(InventoryBatchModel).where(
                InventoryBatchModel.refrigerator_id == refrigerator_id,
                InventoryBatchModel.category_id == category_id,
                InventoryBatchModel.subcategory_id == subcategory_id,
                InventoryBatchModel.storage_slot_id == storage_slot_id,
                InventoryBatchModel.food_name == food_name,
                InventoryBatchModel.best_before == best_before,
                InventoryBatchModel.product_description == product_description,
            )
        )
        if batch is None:
            batch = InventoryBatchModel(
                refrigerator_id=refrigerator_id,
                category_id=category_id,
                subcategory_id=subcategory_id,
                storage_slot_id=storage_slot_id,
                food_name=food_name,
                quantity=quantity,
                production_date=(
                    values.get("production_date")
                    if isinstance(values.get("production_date"), date)
                    else None
                ),
                best_before=best_before if isinstance(best_before, date) else None,
                shelf_life_days=values.get("shelf_life_days"),
                product_description=product_description,
                barcode=values.get("barcode"),
            )
            self._session.add(batch)
            self._session.flush()
        else:
            batch.quantity += quantity
        self._repository.remember_location(refrigerator_id, category_id, storage_slot_id)
        if remember_last_added_location:
            refrigerator = self._session.get(Refrigerator, refrigerator_id)
            if refrigerator is None:
                raise ValueError("冰箱不存在")
            refrigerator.last_added_storage_slot_id = storage_slot_id
        return batch

    def update_batch(
        self, refrigerator_id: str, batch_id: str, **values: object
    ) -> InventoryBatchModel:
        """完整替换一个批次的可编辑字段，并更新大类位置记忆。"""
        batch = self._batch_for_refrigerator(refrigerator_id, batch_id)
        category_id = str(values["category_id"])
        subcategory_id = str(values["subcategory_id"])
        storage_slot_id = str(values["storage_slot_id"])
        self._repository.assert_inventory_scope(
            refrigerator_id, category_id, subcategory_id, storage_slot_id
        )
        quantity = int(values["quantity"])
        if quantity < 1:
            raise ValueError("数量必须至少为 1")
        food_name = str(values["food_name"]).strip()
        if not food_name:
            raise ValueError("食品名称不能为空")
        for field_name, value in {
            "category_id": category_id,
            "subcategory_id": subcategory_id,
            "storage_slot_id": storage_slot_id,
            "food_name": food_name,
            "quantity": quantity,
            "production_date": values.get("production_date"),
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
        self._repository.remember_location(refrigerator_id, category_id, storage_slot_id)
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

    def last_location(self, refrigerator_id: str, category_id: str) -> str | None:
        """返回当前冰箱大类的最近位置，分类不存在时拒绝请求。"""
        self._repository.assert_inventory_scope(
            refrigerator_id,
            category_id,
            self._general_subcategory_id(category_id),
            self._any_slot_id(refrigerator_id),
        )
        return self._repository.last_location(refrigerator_id, category_id)

    def last_added_location(self, refrigerator_id: str) -> str | None:
        """返回冰箱最近一次成功添加食品的位置。"""
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

    def _ensure_builtin_categories(self) -> None:
        """幂等写入内置大类和小类，便于旧数据库直接升级到 P5。"""
        for category_id, name, icon_key, subcategories in BUILTIN_CATEGORIES:
            parent_id = f"builtin-category-{category_id}"
            parent = self._session.get(FoodCategory, parent_id)
            if parent is None:
                self._session.add(FoodCategory(id=parent_id, name=name, icon_key=icon_key))
            else:
                parent.name = name
                parent.icon_key = icon_key
            for subcategory_id, subcategory_name, subcategory_icon in subcategories:
                full_id = f"builtin-{subcategory_id}"
                subcategory = self._session.get(FoodCategory, full_id)
                if subcategory is None:
                    self._session.add(
                        FoodCategory(
                            id=full_id,
                            parent_id=parent_id,
                            name=subcategory_name,
                            icon_key=subcategory_icon,
                        )
                    )
                else:
                    subcategory.parent_id = parent_id
                    subcategory.name = subcategory_name
                    subcategory.icon_key = subcategory_icon
        self._session.flush()

    def _general_subcategory_id(self, category_id: str) -> str:
        """找到大类的通用小类，用于读取位置记忆时复用边界校验。"""
        category = self._session.get(FoodCategory, category_id)
        if category is None or category.parent_id is not None:
            raise ValueError("食品大类不存在")
        subcategory = self._session.scalar(
            select(FoodCategory.id)
            .where(FoodCategory.parent_id == category_id)
            .order_by(FoodCategory.id)
        )
        if subcategory is None:
            raise ValueError("食品大类没有可用小类")
        return subcategory

    def _any_slot_id(self, refrigerator_id: str) -> str:
        """选择一个现有位置，仅供位置记忆读取时验证冰箱存在。"""
        from fridgeboard.persistence.models import StorageSlot, StorageZone

        slot_id = self._session.scalar(
            select(StorageSlot.id)
            .join(StorageZone, StorageSlot.zone_id == StorageZone.id)
            .where(StorageZone.refrigerator_id == refrigerator_id)
        )
        if slot_id is None:
            raise ValueError("冰箱没有可用存放位置")
        return slot_id
