"""P2 核心库存规则的可重复验收测试。"""

from datetime import UTC, date, datetime

import pytest
from fridgeboard.domain.inventory import (
    ExpiryRule,
    ExpiryStatus,
    InventoryBatch,
    RecipeIngredient,
    complete_recipe,
    expiry_status,
    expiry_window_days,
    undo_consumption,
)
from fridgeboard.domain.location_memory import CategoryLocationMemory


def batch(
    batch_id: str,
    subcategory_id: str,
    quantity: int,
    *,
    item_name: str | None = None,
    best_before: date | None = None,
    created_at: datetime = datetime(2026, 7, 1, tzinfo=UTC),
    shelf_life_days: int | None = None,
) -> InventoryBatch:
    """构造一个日期与数量可控的库存批次。"""
    return InventoryBatch(
        batch_id,
        subcategory_id,
        quantity,
        created_at,
        best_before,
        shelf_life_days,
        item_name or subcategory_id,
    )


def test_bbd_is_optional_and_does_not_create_risk() -> None:
    """未填写 BBD 的库存仍可保存，但不参与临期或过期状态。"""
    assert expiry_status(batch("no-bbd", "牛奶", 1), date(2026, 7, 19)) is None


def test_zero_quantity_batch_is_soft_deleted_from_expiry_calculation() -> None:
    """数量为 0 的批次保留身份，但不再产生日期风险。"""
    empty = batch("empty", "牛奶", 0, best_before=date(2026, 7, 19), shelf_life_days=10)

    assert expiry_status(empty, date(2026, 7, 19)) is None


@pytest.mark.parametrize(("shelf_life", "expected"), [(1, 1), (5, 1), (10, 2), (100, 14)])
def test_expiry_window_is_ceil_and_clamped(shelf_life: int, expected: int) -> None:
    """临期窗口遵守向上取整与 1 至 14 天的默认边界。"""
    assert expiry_window_days(shelf_life) == expected


def test_expiry_status_includes_bbd_day_and_expiry_afterward() -> None:
    """BBD 当天临期，过去后才过期。"""
    milk = batch("milk", "牛奶", 1, best_before=date(2026, 7, 19), shelf_life_days=10)
    assert expiry_status(milk, date(2026, 7, 19)) == ExpiryStatus.EXPIRING
    assert expiry_status(milk, date(2026, 7, 20)) == ExpiryStatus.EXPIRED


def test_recipe_requires_exact_category_and_matches_inventory_name_by_containment() -> None:
    """食谱要求分类相同，并允许库存物品名称包含食材名称。"""
    eggs = batch("eggs", "egg", 3, item_name="鸡蛋")
    pork_dumplings = batch("pork-dumplings", "main-food", 2, item_name="猪肉水饺")
    other_category = batch("other-dumplings", "other-food", 2, item_name="猪肉水饺")
    consumption = complete_recipe(
        "recipe-1",
        [RecipeIngredient("水饺", 2, subcategory_id="main-food")],
        [eggs, pork_dumplings, other_category],
    )
    assert eggs.quantity == 3
    assert pork_dumplings.quantity == 0
    assert other_category.quantity == 2
    assert [(line.batch_id, line.quantity) for line in consumption.lines] == [
        ("pork-dumplings", 2)
    ]


def test_recipe_does_not_match_inventory_name_without_containment() -> None:
    """同一分类下库存名称不包含食材名称时不能被扣减。"""
    eggs = batch("eggs", "egg", 3, item_name="鸡蛋")
    duck_eggs = batch("duck-eggs", "egg", 2, item_name="鹌鹑蛋")
    consumption = complete_recipe(
        "recipe-name", [RecipeIngredient("鸡蛋", 2, subcategory_id="egg")], [eggs, duck_eggs]
    )
    assert eggs.quantity == 1
    assert duck_eggs.quantity == 2
    assert [(line.batch_id, line.quantity) for line in consumption.lines] == [("eggs", 2)]


def test_recipe_matches_inventory_item_name_not_category() -> None:
    """库存食材的分类必须与食谱分类精确一致。"""
    eggs = InventoryBatch(
        id="eggs",
        subcategory_id="egg-category",
        item_name="鸡蛋",
        quantity=3,
        created_at=datetime(2026, 7, 1, tzinfo=UTC),
    )
    duck_eggs = InventoryBatch(
        id="duck-eggs",
        subcategory_id="egg-category",
        item_name="鹌鹑蛋",
        quantity=2,
        created_at=datetime(2026, 7, 1, tzinfo=UTC),
    )

    consumption = complete_recipe(
        "recipe-name",
        [RecipeIngredient("鸡蛋", 2, subcategory_id="egg-category")],
        [eggs, duck_eggs],
    )

    assert eggs.quantity == 1
    assert duck_eggs.quantity == 2
    assert [(line.batch_id, line.quantity) for line in consumption.lines] == [("eggs", 2)]


def test_recipe_consumes_earliest_bbd_then_created_batch_and_is_reversible() -> None:
    """同小类扣减优先最早 BBD；BBD 相同时按最早录入，并精确撤销。"""
    later = batch("later", "egg", 2, best_before=date(2026, 7, 30))
    earliest = batch("earliest", "egg", 1, best_before=date(2026, 7, 20))
    no_bbd = batch("no-bbd", "egg", 5)
    same_bbd_later = batch(
        "same-bbd-later",
        "egg",
        1,
        best_before=date(2026, 7, 30),
        created_at=datetime(2026, 7, 2, tzinfo=UTC),
    )
    batches = [later, no_bbd, same_bbd_later, earliest]
    consumption = complete_recipe("recipe-2", [RecipeIngredient("egg", 3, "egg")], batches)
    assert [(line.batch_id, line.quantity) for line in consumption.lines] == [
        ("earliest", 1),
        ("later", 2),
    ]
    assert [item.quantity for item in batches] == [0, 5, 1, 0]
    undo_consumption(consumption, batches)
    assert [item.quantity for item in batches] == [2, 5, 1, 1]
    with pytest.raises(ValueError, match="已经撤销"):
        undo_consumption(consumption, batches)


def test_recipe_never_creates_negative_inventory_when_insufficient() -> None:
    """库存不足只扣已有数量，短缺由后续补货计算展示。"""
    eggs = batch("eggs", "egg", 1)
    complete_recipe("recipe-3", [RecipeIngredient("egg", 4, "egg")], [eggs])
    assert eggs.quantity == 0


def test_location_memory_is_per_refrigerator_category_and_clears_deleted_slot() -> None:
    """位置只按大类记忆，并在布局删除位置时失效。"""
    memory = CategoryLocationMemory()
    memory.remember("fridge-a", "fruit", "slot-top")
    memory.remember("fridge-a", "meat", "slot-bottom")
    memory.remember("fridge-b", "fruit", "slot-other")
    memory.forget_slot("fridge-a", "slot-top")
    assert memory.recall("fridge-a", "fruit") is None
    assert memory.recall("fridge-a", "meat") == "slot-bottom"
    assert memory.recall("fridge-b", "fruit") == "slot-other"


def test_custom_expiry_rule_validates_its_bounds() -> None:
    """非法临期配置在持久化前被拒绝。"""
    with pytest.raises(ValueError, match="比例"):
        ExpiryRule(ratio=0)
