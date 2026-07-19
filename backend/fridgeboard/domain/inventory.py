"""库存日期、精确小类匹配与食谱扣减规则。

本模块只操作内存中的领域对象，不承担数据库事务。调用方必须把一次完成食谱
或撤销操作包裹在同一个数据库事务中，确保库存与扣减审计记录原子更新。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from enum import StrEnum
from math import ceil


class ExpiryStatus(StrEnum):
    """库存批次对用户呈现的日期风险状态。"""

    NORMAL = "normal"
    EXPIRING = "expiring"
    EXPIRED = "expired"


@dataclass(frozen=True, slots=True)
class ExpiryRule:
    """计算临期窗口的用户级规则。

    Args:
        ratio: 总有效期进入临期的比例，必须大于零。
        minimum_days: 临期窗口下限，必须至少一天。
        maximum_days: 临期窗口上限，必须不小于下限。
    """

    ratio: float = 0.2
    minimum_days: int = 1
    maximum_days: int = 14

    def __post_init__(self) -> None:
        """验证规则在计算前有明确且可比较的边界。"""
        if self.ratio <= 0:
            raise ValueError("临期比例必须大于 0")
        if self.minimum_days < 1:
            raise ValueError("临期最小天数必须至少为 1")
        if self.maximum_days < self.minimum_days:
            raise ValueError("临期最大天数不能小于最小天数")


@dataclass(slots=True)
class InventoryBatch:
    """可被食谱消耗的一个库存批次。

    ``subcategory_id`` 是扣减语义，必须是用户最终确认的小类主键；不以名称、大类
    或图标名称替代。``best_before`` 为空时，批次仍可消耗，但没有日期风险。
    """

    id: str
    subcategory_id: str
    quantity: int
    created_at: datetime
    best_before: date | None = None
    shelf_life_days: int | None = None

    def __post_init__(self) -> None:
        """拒绝无法表达实际库存的数量或有效期。"""
        if not self.subcategory_id.strip():
            raise ValueError("小类 ID 不能为空")
        if self.quantity < 0:
            raise ValueError("库存数量不能为负数")
        if self.shelf_life_days is not None and self.shelf_life_days < 0:
            raise ValueError("总有效期不能为负数")


@dataclass(frozen=True, slots=True)
class RecipeIngredient:
    """食谱中一项经过用户确认的小类食材需求。"""

    subcategory_id: str
    quantity: int = 1

    def __post_init__(self) -> None:
        """验证食材名称和需求数量的最小业务约束。"""
        if not self.subcategory_id.strip():
            raise ValueError("食谱小类 ID 不能为空")
        if self.quantity < 1:
            raise ValueError("食谱食材数量必须至少为 1")


@dataclass(frozen=True, slots=True)
class ConsumptionLine:
    """一次完成食谱时从单个批次实际扣除的数量。"""

    batch_id: str
    quantity: int


@dataclass(slots=True)
class Consumption:
    """一次可逆的食谱完成操作审计。"""

    recipe_entry_id: str
    lines: list[ConsumptionLine] = field(default_factory=list)
    undone: bool = False


def expiry_window_days(total_shelf_life_days: int, rule: ExpiryRule = ExpiryRule()) -> int:
    """返回按规则截断后的临期窗口天数。

    Args:
        total_shelf_life_days: BBD 与有效期起点之间的自然日数，可为零。
        rule: 用户配置的比例、下限与上限。

    Returns:
        ``ceil(total × ratio)`` 落在用户配置区间后的天数。

    Raises:
        ValueError: 当总有效期为负数时抛出。
    """
    if total_shelf_life_days < 0:
        raise ValueError("总有效期不能为负数")
    return min(max(ceil(total_shelf_life_days * rule.ratio), rule.minimum_days), rule.maximum_days)


def expiry_status(
    batch: InventoryBatch, today: date, rule: ExpiryRule = ExpiryRule()
) -> ExpiryStatus | None:
    """计算一个批次的日期风险；未填写 BBD 时不返回风险。

    Args:
        batch: 要判断的库存批次。
        today: 当前本地日期；调用者负责使用冰箱所属时区。
        rule: 临期窗口规则。

    Returns:
        过期、临期或正常；BBD 为空时返回 ``None``。
    """
    if batch.best_before is None:
        return None
    if batch.best_before < today:
        return ExpiryStatus.EXPIRED
    shelf_life_days = batch.shelf_life_days
    if shelf_life_days is None:
        shelf_life_days = max((batch.best_before - batch.created_at.date()).days, 0)
    if (batch.best_before - today).days <= expiry_window_days(shelf_life_days, rule):
        return ExpiryStatus.EXPIRING
    return ExpiryStatus.NORMAL


def normalize_subcategory_name(name: str) -> str:
    """执行不改变语义的食谱小类名称格式清理。

    Args:
        name: 用户输入或库存保存的小类名称。

    Returns:
        仅移除首尾空白后的名称；不做别名、大小写或模糊匹配。
    """
    return name.strip()


def complete_recipe(
    recipe_entry_id: str,
    ingredients: list[RecipeIngredient],
    batches: list[InventoryBatch],
) -> Consumption:
    """按精确小类与最早 BBD 顺序扣减库存，并记录可逆结果。

    Args:
        recipe_entry_id: 被完成的食谱行标识。
        ingredients: 本次食谱的已确认食材及数量。
        batches: 同一冰箱内可变更的库存批次列表。

    Returns:
        仅记录实际扣减数量的可逆消费审计；库存不足不会产生负数。
    """
    consumption = Consumption(recipe_entry_id=recipe_entry_id)
    for ingredient in ingredients:
        remaining = ingredient.quantity
        candidates = sorted(
            (
                batch
                for batch in batches
                if batch.subcategory_id == ingredient.subcategory_id and batch.quantity > 0
            ),
            key=lambda batch: (
                batch.best_before is None,
                batch.best_before or date.max,
                batch.created_at,
            ),
        )
        for batch in candidates:
            if remaining == 0:
                break
            deducted = min(batch.quantity, remaining)
            batch.quantity -= deducted
            remaining -= deducted
            consumption.lines.append(ConsumptionLine(batch_id=batch.id, quantity=deducted))
    return consumption


def undo_consumption(consumption: Consumption, batches: list[InventoryBatch]) -> None:
    """恢复一次完成食谱实际扣除的库存，且只允许撤销一次。

    Args:
        consumption: ``complete_recipe`` 返回且尚未撤销的审计记录。
        batches: 包含原批次的可变更库存列表。

    Raises:
        ValueError: 当已撤销或原批次已经不可恢复时抛出。
    """
    if consumption.undone:
        raise ValueError("该食谱完成操作已经撤销")
    batches_by_id = {batch.id: batch for batch in batches}
    missing_batch_ids = [
        line.batch_id for line in consumption.lines if line.batch_id not in batches_by_id
    ]
    if missing_batch_ids:
        raise ValueError("无法撤销：原库存批次已不存在")
    for line in consumption.lines:
        batches_by_id[line.batch_id].quantity += line.quantity
    consumption.undone = True
