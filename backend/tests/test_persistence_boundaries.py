"""P2 数据归属和食谱扣减持久化边界的回归测试。"""

import asyncio
from datetime import UTC, datetime

import pytest
from fridgeboard.domain.inventory import InventoryBatch, RecipeIngredient, complete_recipe
from fridgeboard.persistence.database import (
    create_database_engine,
    create_database_schema,
    create_session_factory,
    sync_session,
)
from fridgeboard.persistence.models import (
    FoodCategory,
    InventoryBatchModel,
    Refrigerator,
    StorageSlot,
    StorageZone,
)
from fridgeboard.persistence.repositories import InventoryRepository


@pytest.fixture
def session():
    """创建由 AsyncSession 驱动的隔离测试会话代理。"""
    engine = create_database_engine("sqlite://")
    create_database_schema(engine)
    with sync_session(create_session_factory(engine)) as database_session:
        yield database_session


def seed_inventory_scope(session: object) -> None:
    """写入两台冰箱、各自位置及一个全局两级分类。"""
    session.add_all(
        [
            Refrigerator(id="fridge-a", owner_user_id="owner", name="A", template_key="single"),
            Refrigerator(id="fridge-b", owner_user_id="owner", name="B", template_key="single"),
        ]
    )
    session.flush()
    session.add_all(
        [
            StorageZone(
                id="zone-a",
                refrigerator_id="fridge-a",
                zone_key="cold",
                temperature_mode="cold",
                geometry={},
                display_order=0,
            ),
            StorageZone(
                id="zone-b",
                refrigerator_id="fridge-b",
                zone_key="cold",
                temperature_mode="cold",
                geometry={},
                display_order=0,
            ),
        ]
    )
    session.flush()
    session.add_all(
        [
            StorageSlot(
                id="slot-a", zone_id="zone-a", slot_key="top", geometry={}, display_order=0
            ),
            StorageSlot(
                id="slot-b", zone_id="zone-b", slot_key="top", geometry={}, display_order=0
            ),
            FoodCategory(id="egg-category", name="蛋", is_custom=False),
        ]
    )
    session.flush()
    session.add(
        FoodCategory(
            id="egg-subcategory",
            parent_id="egg-category",
            name="鸡蛋",
            is_custom=False,
        )
    )
    session.flush()


def test_repository_rejects_inventory_scope_from_another_refrigerator(session: object) -> None:
    """库存分类和位置必须属于目标冰箱或可共享的内置分类。"""
    seed_inventory_scope(session)
    repository = InventoryRepository(session)

    asyncio.run(repository.assert_inventory_scope("fridge-a", "egg-subcategory", "slot-a"))

    with pytest.raises(ValueError, match="存放位置"):
        asyncio.run(repository.assert_inventory_scope("fridge-a", "egg-subcategory", "slot-b"))


def test_repository_persists_domain_consumption_by_item_name(session: object) -> None:
    """按食材名称扣减产生的变更必须在同一数据库事务中写回原批次。"""
    seed_inventory_scope(session)
    session.add(
        InventoryBatchModel(
            id="batch-eggs",
            refrigerator_id="fridge-a",
            subcategory_id="egg-subcategory",
            storage_slot_id="slot-a",
            item_name="鸡蛋",
            quantity=3,
            created_at=datetime(2026, 7, 1, tzinfo=UTC),
            updated_at=datetime(2026, 7, 1, tzinfo=UTC),
        )
    )
    session.flush()
    repository = InventoryRepository(session)
    consumption = complete_recipe(
        "recipe-entry",
        [RecipeIngredient("鸡蛋", 2)],
        [
            InventoryBatch(
                id="batch-eggs",
                subcategory_id="egg-subcategory",
                quantity=3,
                created_at=datetime(2026, 7, 1, tzinfo=UTC),
                item_name="鸡蛋",
            )
        ],
    )

    asyncio.run(repository.apply_consumption(consumption))
    session.flush()

    assert session.get(InventoryBatchModel, "batch-eggs").quantity == 1
