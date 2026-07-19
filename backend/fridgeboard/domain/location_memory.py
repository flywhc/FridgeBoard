"""按冰箱和大类记忆最近存放位置的纯领域规则。"""

from dataclasses import dataclass, field


@dataclass(slots=True)
class CategoryLocationMemory:
    """维护每台冰箱每个大类的最后一次用户明确选址。

    该对象故意不按小类保存历史，也不根据冰箱名称或位置名称猜测默认位置。
    """

    _positions: dict[tuple[str, str], str] = field(default_factory=dict)

    def remember(self, refrigerator_id: str, category_id: str, storage_slot_id: str) -> None:
        """记录用户保存库存时选择的有效位置。"""
        self._positions[(refrigerator_id, category_id)] = storage_slot_id

    def recall(self, refrigerator_id: str, category_id: str) -> str | None:
        """返回最近位置；没有历史时返回空值以要求首次人工选择。"""
        return self._positions.get((refrigerator_id, category_id))

    def forget_slot(self, refrigerator_id: str, storage_slot_id: str) -> None:
        """在布局删除位置时清理引用该位置的所有大类记忆。"""
        stale_keys = [
            key
            for key, value in self._positions.items()
            if key[0] == refrigerator_id and value == storage_slot_id
        ]
        for key in stale_keys:
            del self._positions[key]
