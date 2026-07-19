"""P2 领域服务使用的最小仓储接口实现。

本模块负责把 SQLAlchemy 行转换为纯领域对象并持久化位置记忆；不执行食谱扣减
决策，也不管理事务生命周期。调用者必须使用 ``database.transaction`` 保证原子性。
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from fridgeboard.domain.inventory import Consumption, InventoryBatch
from fridgeboard.persistence.models import (
    CategoryLocationPreference,
    FoodCategory,
    InventoryBatchModel,
    StorageSlot,
    StorageZone,
)


class InventoryRepository:
    """提供库存规则所需的读取和位置记忆持久化边界。"""

    def __init__(self, session: Session) -> None:
        """绑定调用方已开启事务的数据库会话。"""
        self._session = session

    def list_batches(self, refrigerator_id: str) -> list[InventoryBatch]:
        """读取指定冰箱的库存快照，并保留小类 ID 供严格匹配。

        Args:
            refrigerator_id: 要读取的冰箱 ID。

        Returns:
            可交给领域扣减服务的库存批次；不包含其他冰箱的数据。
        """
        batches = self._session.scalars(
            select(InventoryBatchModel).where(
                InventoryBatchModel.refrigerator_id == refrigerator_id
            )
        )
        return [
            InventoryBatch(
                id=batch.id,
                subcategory_id=batch.subcategory_id,
                quantity=batch.quantity,
                created_at=batch.created_at,
                best_before=batch.best_before,
                shelf_life_days=batch.shelf_life_days,
            )
            for batch in batches
        ]

    def assert_inventory_scope(
        self,
        refrigerator_id: str,
        category_id: str,
        subcategory_id: str,
        storage_slot_id: str,
    ) -> None:
        """验证库存的大类、小类和位置可安全归属于同一台冰箱。

        内置分类没有 ``refrigerator_id``，可被所有冰箱复用；自定义分类必须属于目标
        冰箱。小类还必须直接隶属传入的大类，防止把错误层级的分类持久化。

        Args:
            refrigerator_id: 目标冰箱 ID。
            category_id: 食品大类 ID。
            subcategory_id: 食品小类 ID。
            storage_slot_id: 物理存放位置 ID。

        Raises:
            ValueError: 当分类层级、分类归属或位置归属不合法时抛出。
        """
        category = self._assert_category_scope(refrigerator_id, category_id)
        if category.parent_id is not None:
            raise ValueError("食品大类不能是小类")
        subcategory = self._assert_category_scope(refrigerator_id, subcategory_id)
        if subcategory.parent_id != category_id:
            raise ValueError("食品小类不属于所选大类")
        slot_belongs_to_refrigerator = self._session.scalar(
            select(StorageSlot.id)
            .join(StorageZone, StorageSlot.zone_id == StorageZone.id)
            .where(
                StorageSlot.id == storage_slot_id,
                StorageZone.refrigerator_id == refrigerator_id,
            )
        )
        if slot_belongs_to_refrigerator is None:
            raise ValueError("存放位置不属于当前冰箱")

    def apply_consumption(self, consumption: Consumption) -> None:
        """将领域扣减结果写回原库存批次。

        调用者必须在读取批次、运行领域规则和本方法之间保持同一个短事务。数量在
        写回前再次校验，避免旧快照覆盖其他已提交的库存修改。

        Args:
            consumption: ``complete_recipe`` 返回的实际扣减明细。

        Raises:
            ValueError: 当原批次不存在或可用数量已不足时抛出。
        """
        for line in consumption.lines:
            batch = self._session.get(InventoryBatchModel, line.batch_id)
            if batch is None:
                raise ValueError("无法扣减：原库存批次已不存在")
            if batch.quantity < line.quantity:
                raise ValueError("无法扣减：库存已被其他操作修改")
            batch.quantity -= line.quantity

    def remember_location(
        self,
        refrigerator_id: str,
        category_id: str,
        storage_slot_id: str,
    ) -> None:
        """写入或覆盖一个大类的最后人工选择位置。"""
        category = self._assert_category_scope(refrigerator_id, category_id)
        if category.parent_id is not None:
            raise ValueError("位置记忆只能按食品大类保存")
        slot_belongs_to_refrigerator = self._session.scalar(
            select(StorageSlot.id)
            .join(StorageZone, StorageSlot.zone_id == StorageZone.id)
            .where(
                StorageSlot.id == storage_slot_id,
                StorageZone.refrigerator_id == refrigerator_id,
            )
        )
        if slot_belongs_to_refrigerator is None:
            raise ValueError("存放位置不属于当前冰箱")
        preference = self._session.get(
            CategoryLocationPreference,
            {"refrigerator_id": refrigerator_id, "category_id": category_id},
        )
        if preference is None:
            self._session.add(
                CategoryLocationPreference(
                    refrigerator_id=refrigerator_id,
                    category_id=category_id,
                    storage_slot_id=storage_slot_id,
                )
            )
            return
        preference.storage_slot_id = storage_slot_id

    def last_location(self, refrigerator_id: str, category_id: str) -> str | None:
        """读取一个大类的最近位置；首次录入返回空值。"""
        preference = self._session.get(
            CategoryLocationPreference,
            {"refrigerator_id": refrigerator_id, "category_id": category_id},
        )
        return preference.storage_slot_id if preference is not None else None

    def forget_location_for_slot(self, refrigerator_id: str, storage_slot_id: str) -> None:
        """删除布局已移除位置对应的所有大类记忆。"""
        preferences = self._session.scalars(
            select(CategoryLocationPreference).where(
                CategoryLocationPreference.refrigerator_id == refrigerator_id,
                CategoryLocationPreference.storage_slot_id == storage_slot_id,
            )
        )
        for preference in preferences:
            self._session.delete(preference)

    def _assert_category_scope(self, refrigerator_id: str, category_id: str) -> FoodCategory:
        """返回可被当前冰箱使用的分类，拒绝其他冰箱的自定义分类。"""
        category = self._session.get(FoodCategory, category_id)
        if category is None:
            raise ValueError("食品分类不存在")
        if category.refrigerator_id not in {None, refrigerator_id}:
            raise ValueError("食品分类不属于当前冰箱")
        return category
