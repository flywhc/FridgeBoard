"""P4 冰箱模板及受限的图形化布局配置规则。"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ZoneTemplate:
    """一个模板区域的固定几何与可编辑分格约束。"""

    key: str
    label: str
    temperature_mode: str
    geometry: dict[str, int]
    layout_kind: str
    min_slots: int = 0
    max_slots: int = 8
    adjustable_temperature: bool = False
    is_door: bool = False


@dataclass(frozen=True)
class RefrigeratorTemplate:
    """一个冰箱模板及其按物理位置排序的区域。"""

    key: str
    name: str
    zones: tuple[ZoneTemplate, ...]


def _vertical(
    key: str,
    label: str,
    temperature: str,
    x: int,
    y: int,
    width: int,
    height: int,
) -> ZoneTemplate:
    """构造支持不可用或一至八格的纵向区域。"""
    return ZoneTemplate(
        key,
        label,
        temperature,
        {"x": x, "y": y, "width": width, "height": height},
        "vertical",
    )


def _row(
    key: str,
    label: str,
    temperature: str,
    x: int,
    y: int,
    width: int,
    height: int,
    *,
    adjustable: bool = False,
) -> ZoneTemplate:
    """构造支持不可用或一至八格的单行区域。"""
    return ZoneTemplate(
        key,
        label,
        temperature,
        {"x": x, "y": y, "width": width, "height": height},
        "single_row",
        0,
        8,
        adjustable,
    )


def _door(
    key: str,
    label: str,
    temperature: str,
    x: int,
    y: int,
    width: int,
    height: int,
) -> ZoneTemplate:
    """构造与主柜固定区域相对的可配置门区。"""
    return ZoneTemplate(
        key,
        label,
        temperature,
        {"x": x, "y": y, "width": width, "height": height},
        "vertical",
        is_door=True,
    )


TEMPLATES: tuple[RefrigeratorTemplate, ...] = (
    RefrigeratorTemplate(
        "top_freezer_single",
        "上置冷冻单门",
        (
            _vertical("freezer", "冷冻室", "frozen", 0, 0, 100, 40),
            _vertical("refrigerator", "冷藏室", "cold", 0, 40, 100, 60),
            _door("door_freezer", "冷冻室对侧门", "frozen", 0, 0, 100, 40),
            _door("door", "冷藏室对侧门", "cold", 0, 40, 100, 60),
        ),
    ),
    RefrigeratorTemplate(
        "bottom_freezer_single",
        "下置冷冻单门",
        (
            _vertical("refrigerator", "冷藏室", "cold", 0, 0, 100, 60),
            _vertical("freezer", "冷冻室", "frozen", 0, 60, 100, 40),
            _door("door", "冷藏室对侧门", "cold", 0, 0, 100, 60),
            _door("door_freezer", "冷冻室对侧门", "frozen", 0, 60, 100, 40),
        ),
    ),
    RefrigeratorTemplate(
        "side_by_side",
        "对开门",
        (
            _vertical("left_freezer", "左侧冷冻室", "frozen", 0, 0, 50, 100),
            _vertical("right_refrigerator", "右侧冷藏室", "cold", 50, 0, 50, 100),
            _door("door_left_freezer", "左侧冷冻门", "frozen", 0, 0, 50, 100),
            _door("door", "右侧冷藏门", "cold", 50, 0, 50, 100),
        ),
    ),
    RefrigeratorTemplate(
        "french_door",
        "法式多门",
        (
            _vertical("left_refrigerator", "左侧冷藏室", "cold", 0, 0, 50, 65),
            _vertical("right_refrigerator", "右侧冷藏室", "cold", 50, 0, 50, 65),
            _vertical("freezer", "冷冻室", "frozen", 0, 65, 100, 35),
            _door("door", "上部冷藏门", "cold", 0, 0, 100, 65),
            _door("door_freezer", "下部冷冻门", "frozen", 0, 65, 100, 35),
        ),
    ),
    RefrigeratorTemplate(
        "mini",
        "迷你冰箱",
        (
            # 迷你冰箱的两个主区及对侧门区都固定各占一半高度。
            _vertical("freezer", "冷冻室", "frozen", 0, 0, 100, 50),
            _vertical("refrigerator", "冷藏室", "cold", 0, 50, 100, 50),
            _door("door_freezer", "冷冻室对侧门", "frozen", 0, 0, 100, 50),
            _door("door", "冷藏室对侧门", "cold", 0, 50, 100, 50),
        ),
    ),
    RefrigeratorTemplate(
        "three_door",
        "上中下三门",
        (
            _vertical("refrigerator", "冷藏室", "cold", 0, 0, 100, 45),
            _row("convertible", "中层可调区", "cold", 0, 45, 100, 15, adjustable=True),
            _vertical("freezer", "冷冻室", "frozen", 0, 60, 100, 40),
            _door("door", "冷藏室对侧门", "cold", 0, 0, 100, 45),
            _door("door_convertible", "中层对侧门", "cold", 0, 45, 100, 15),
            _door("door_freezer", "冷冻室对侧门", "frozen", 0, 60, 100, 40),
        ),
    ),
    RefrigeratorTemplate(
        "dual_middle",
        "中间功能区",
        (
            _vertical("refrigerator", "上层冷藏室", "cold", 0, 0, 100, 40),
            _vertical("middle", "中间功能区", "cold", 0, 40, 100, 20),
            _vertical("freezer", "下层冷冻室", "frozen", 0, 60, 100, 40),
            _door("door", "上层对侧门", "cold", 0, 0, 100, 40),
            _door("door_middle", "中间对侧门", "cold", 0, 40, 100, 20),
            _door("door_freezer", "下层对侧门", "frozen", 0, 60, 100, 40),
        ),
    ),
)


def list_templates() -> tuple[RefrigeratorTemplate, ...]:
    """返回产品固定支持的七种模板。"""
    return TEMPLATES


def get_template(template_key: str) -> RefrigeratorTemplate:
    """按键读取模板，不存在时用业务错误拒绝未知布局。"""
    for template in TEMPLATES:
        if template.key == template_key:
            return template
    raise ValueError("不支持的冰箱模板")


def default_slot_count(zone: ZoneTemplate) -> int:
    """返回新建冰箱时立即可保存的默认分格数。"""
    if zone.key == "door":
        return 5
    if zone.is_door:
        return 0
    return 1 if zone.layout_kind == "single_row" else 3


def validate_slot_count(zone: ZoneTemplate, slot_count: int) -> None:
    """验证区域分格数只能使用产品定义的图形化选项。"""
    if not zone.min_slots <= slot_count <= zone.max_slots:
        raise ValueError(f"{zone.label} 只允许设为不可用或 1 至 8 格")
