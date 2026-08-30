"""P2 领域服务使用的最小仓储接口实现。

本模块负责把 SQLAlchemy 行转换为纯领域对象并持久化位置记忆；不执行食谱扣减
决策，也不管理事务生命周期。调用者必须使用 ``database.transaction`` 保证原子性。
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fridgeboard.domain.inventory import Consumption, InventoryBatch
from fridgeboard.item_catalog import active_builtin_subcategory_ids
from fridgeboard.persistence.models import (
    FoodCategory,
    InventoryBatchModel,
    Refrigerator,
    StorageSlot,
    StorageZone,
)


class InventoryRepository:
    """提供库存规则所需的读取和位置记忆持久化边界。"""

    def __init__(self, session: AsyncSession) -> None:
        """绑定调用方已开启事务的数据库会话。"""
        self._session = session

    async def list_batches(self, refrigerator_id: str) -> list[InventoryBatch]:
        """读取指定冰箱的库存快照，并保留分类和名称供食谱匹配。

        Args:
            refrigerator_id: 要读取的冰箱 ID。

        Returns:
            可交给领域扣减服务的库存批次；不包含其他冰箱的数据。
        """
        batches = await self._session.scalars(
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
                item_name=batch.item_name,
            )
            for batch in batches
        ]

    async def assert_inventory_scope(
        self,
        refrigerator_id: str,
        subcategory_id: str,
        storage_slot_id: str,
    ) -> None:
        """验证库存的小类和位置可安全归属于同一台冰箱。

        内置分类没有 ``refrigerator_id``，可被所有冰箱复用；自定义分类必须属于目标
        冰箱。库存只能保存带图标的小类，大类仅用于选择器导航。

        Args:
            refrigerator_id: 目标冰箱 ID。
            subcategory_id: 物品小类 ID。
            storage_slot_id: 物理存放位置 ID。

        Raises:
            ValueError: 当小类层级、分类归属或位置归属不合法时抛出。
        """
        subcategory = await self._assert_category_scope(refrigerator_id, subcategory_id)
        if subcategory.parent_id is None:
            raise ValueError("库存只能选择物品小类")
        slot_belongs_to_refrigerator = await self._session.scalar(
            select(StorageSlot.id)
            .join(StorageZone, StorageSlot.zone_id == StorageZone.id)
            .where(
                StorageSlot.id == storage_slot_id,
                StorageZone.refrigerator_id == refrigerator_id,
            )
        )
        if slot_belongs_to_refrigerator is None:
            raise ValueError("存放位置不属于当前冰箱")

    async def apply_consumption(self, consumption: Consumption) -> None:
        """将领域扣减结果写回原库存批次。

        调用者必须在读取批次、运行领域规则和本方法之间保持同一个短事务。数量在
        写回前再次校验，避免旧快照覆盖其他已提交的库存修改。

        Args:
            consumption: ``complete_recipe`` 返回的实际扣减明细。

        Raises:
            ValueError: 当原批次不存在或可用数量已不足时抛出。
        """
        for line in consumption.lines:
            batch = await self._session.get(InventoryBatchModel, line.batch_id)
            if batch is None:
                raise ValueError("无法扣减：原库存批次已不存在")
            if batch.quantity < line.quantity:
                raise ValueError("无法扣减：库存已被其他操作修改")
            batch.quantity -= line.quantity

    async def _assert_category_scope(self, refrigerator_id: str, category_id: str) -> FoodCategory:
        """返回可被当前冰箱所有者使用的内置或用户级分类。"""
        category = await self._session.get(FoodCategory, category_id)
        if category is None:
            raise ValueError("物品分类不存在")
        owner_user_id = await self._session.scalar(
            select(Refrigerator.owner_user_id).where(Refrigerator.id == refrigerator_id)
        )
        if owner_user_id is None or category.owner_user_id not in {None, owner_user_id}:
            raise ValueError("物品分类不属于当前用户")
        if (
            category.owner_user_id is None
            and category.id.startswith("builtin-")
            and category.id not in active_builtin_subcategory_ids()
        ):
            raise ValueError("物品分类已停用")
        return category
