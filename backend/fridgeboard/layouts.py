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
    min_slots: int = 1
    max_slots: int = 6
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
    """构造支持一至六层的纵向区域。"""
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
    """构造只允许一、二或三格的单行区域。"""
    return ZoneTemplate(
        key,
        label,
        temperature,
        {"x": x, "y": y, "width": width, "height": height},
        "single_row",
        1,
        3,
        adjustable,
    )


def _door() -> ZoneTemplate:
    """构造冰箱门架区域；门架默认按五层等分。"""
    return ZoneTemplate(
        "door",
        "冰箱门",
        "cold",
        {"x": 0, "y": 0, "width": 100, "height": 100},
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
            _door(),
        ),
    ),
    RefrigeratorTemplate(
        "bottom_freezer_single",
        "下置冷冻单门",
        (
            _vertical("refrigerator", "冷藏室", "cold", 0, 0, 100, 60),
            _vertical("freezer", "冷冻室", "frozen", 0, 60, 100, 40),
            _door(),
        ),
    ),
    RefrigeratorTemplate(
        "side_by_side",
        "对开门",
        (
            _vertical("left_freezer", "左侧冷冻室", "frozen", 0, 0, 50, 100),
            _vertical("right_refrigerator", "右侧冷藏室", "cold", 50, 0, 50, 100),
            _door(),
        ),
    ),
    RefrigeratorTemplate(
        "french_door",
        "法式多门",
        (
            _vertical("left_refrigerator", "左侧冷藏室", "cold", 0, 0, 50, 65),
            _vertical("right_refrigerator", "右侧冷藏室", "cold", 50, 0, 50, 65),
            _vertical("freezer", "冷冻室", "frozen", 0, 65, 100, 35),
            _door(),
        ),
    ),
    RefrigeratorTemplate(
        "mini",
        "迷你冰箱",
        (
            # 迷你冰箱固定呈现三格：顶部冷冻一格，下面冷藏两格。
            _vertical("freezer", "冷冻室", "frozen", 0, 0, 100, 33),
            _vertical("refrigerator", "冷藏室", "cold", 0, 33, 100, 67),
            _door(),
        ),
    ),
    RefrigeratorTemplate(
        "three_door",
        "上中下三门",
        (
            _vertical("refrigerator", "冷藏室", "cold", 0, 0, 100, 45),
            _row("convertible", "中层可调区", "cold", 0, 45, 100, 15, adjustable=True),
            _vertical("freezer", "冷冻室", "frozen", 0, 60, 100, 40),
            _door(),
        ),
    ),
    RefrigeratorTemplate(
        "dual_middle",
        "中间功能区",
        (
            _vertical("refrigerator", "上层冷藏室", "cold", 0, 0, 100, 40),
            _vertical("middle", "中间功能区", "cold", 0, 40, 100, 20),
            _vertical("freezer", "下层冷冻室", "frozen", 0, 60, 100, 40),
            _door(),
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
    return 5 if zone.is_door else 1 if zone.layout_kind == "single_row" else 3


def validate_slot_count(zone: ZoneTemplate, slot_count: int) -> None:
    """验证区域分格数只能使用产品定义的图形化选项。"""
    if zone.layout_kind == "single_row" and slot_count not in {1, 2, 3}:
        raise ValueError(f"{zone.label} 只允许一格、左右两格或左中右三格")
    if zone.layout_kind == "vertical" and not zone.min_slots <= slot_count <= zone.max_slots:
        raise ValueError(f"{zone.label} 只允许 1 至 6 层")
