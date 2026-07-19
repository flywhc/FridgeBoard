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
    best_before: date | None = None,
    created_at: datetime = datetime(2026, 7, 1, tzinfo=UTC),
    shelf_life_days: int | None = None,
) -> InventoryBatch:
    """构造一个日期与数量可控的库存批次。"""
    return InventoryBatch(
        batch_id, subcategory_id, quantity, created_at, best_before, shelf_life_days
    )


def test_bbd_is_optional_and_does_not_create_risk() -> None:
    """未填写 BBD 的库存仍可保存，但不参与临期或过期状态。"""
    assert expiry_status(batch("no-bbd", "牛奶", 1), date(2026, 7, 19)) is None


@pytest.mark.parametrize(("shelf_life", "expected"), [(1, 1), (5, 1), (10, 2), (100, 14)])
def test_expiry_window_is_ceil_and_clamped(shelf_life: int, expected: int) -> None:
    """临期窗口遵守向上取整与 1 至 14 天的默认边界。"""
    assert expiry_window_days(shelf_life) == expected


def test_expiry_status_includes_bbd_day_and_expiry_afterward() -> None:
    """BBD 当天临期，过去后才过期。"""
    milk = batch("milk", "牛奶", 1, best_before=date(2026, 7, 19), shelf_life_days=10)
    assert expiry_status(milk, date(2026, 7, 19)) == ExpiryStatus.EXPIRING
    assert expiry_status(milk, date(2026, 7, 20)) == ExpiryStatus.EXPIRED


def test_recipe_only_matches_exact_subcategory_id() -> None:
    """食谱不以大类、名称或近义词兜底，只匹配用户确认的小类 ID。"""
    eggs = batch("eggs", "egg", 3)
    duck_eggs = batch("duck-eggs", "duck-egg", 2)
    consumption = complete_recipe("recipe-1", [RecipeIngredient("egg", 2)], [eggs, duck_eggs])
    assert eggs.quantity == 1
    assert duck_eggs.quantity == 2
    assert consumption.lines[0].batch_id == "eggs"


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
    consumption = complete_recipe("recipe-2", [RecipeIngredient("egg", 3)], batches)
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
    complete_recipe("recipe-3", [RecipeIngredient("egg", 4)], [eggs])
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
