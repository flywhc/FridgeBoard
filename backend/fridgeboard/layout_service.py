"""P4 布局持久化服务：模板默认值、受限编辑和位置稳定性。"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from fridgeboard.layouts import (
    RefrigeratorTemplate,
    ZoneTemplate,
    default_slot_count,
    get_template,
    validate_slot_count,
)
from fridgeboard.persistence.models import (
    CategoryLocationPreference,
    InventoryBatchModel,
    Refrigerator,
    StorageSlot,
    StorageZone,
)


class LayoutService:
    """在单个数据库事务内创建、读取和替换冰箱布局。"""

    def __init__(self, session: Session) -> None:
        self._session = session

    def create_refrigerator(
        self,
        owner_user_id: str,
        name: str,
        template_key: str,
        config: dict[str, tuple[str, int]] | None = None,
    ) -> Refrigerator:
        """按模板创建冰箱，并在同一事务内写入默认或用户确认的布局。"""
        refrigerator = Refrigerator(
            owner_user_id=owner_user_id, name=name, template_key=template_key
        )
        self._session.add(refrigerator)
        self._session.flush()
        template = get_template(template_key)
        self.replace_layout(refrigerator, config or self._default_config(template))
        return refrigerator

    def replace_layout(
        self, refrigerator: Refrigerator, config: dict[str, tuple[str, int]]
    ) -> None:
        """以受验证配置更新布局，并把被移除格内库存归入最后保留格。

        调用方必须把本方法置于事务中。这样位置替换、库存归位和位置记忆清理要么
        一并提交，要么一并回滚，避免食品指向已经不存在的分格。
        """
        template = get_template(refrigerator.template_key)
        expected = {zone.key: zone for zone in template.zones}
        if set(config) != set(expected):
            raise ValueError("布局必须包含模板中的全部区域")
        existing_zones = {
            zone.zone_key: zone
            for zone in self._session.scalars(
                select(StorageZone).where(StorageZone.refrigerator_id == refrigerator.id)
            )
        }
        existing_slots = {
            zone_key: list(
                self._session.scalars(
                    select(StorageSlot)
                    .where(StorageSlot.zone_id == zone.id)
                    .order_by(StorageSlot.display_order)
                )
            )
            for zone_key, zone in existing_zones.items()
        }
        removed_slots = [
            slot
            for zone_key, slots in existing_slots.items()
            for slot in slots[config[zone_key][1] if zone_key in config else 0 :]
        ]
        removed_slot_ids = {slot.id for slot in removed_slots}
        migration_targets = {
            zone_key: existing_slots[zone_key][config[zone_key][1] - 1]
            for zone_key in existing_slots
            if config[zone_key][1] < len(existing_slots[zone_key])
        }
        if removed_slot_ids:
            for batch in self._session.scalars(
                select(InventoryBatchModel).where(InventoryBatchModel.storage_slot_id.in_(removed_slot_ids))
            ):
                source_zone_key = next(
                    zone_key
                    for zone_key, slots in existing_slots.items()
                    if batch.storage_slot_id in {slot.id for slot in slots}
                )
                batch.storage_slot_id = migration_targets[source_zone_key].id
        for order, template_zone in enumerate(template.zones):
            temperature_mode, slot_count = config[template_zone.key]
            if temperature_mode not in {"cold", "frozen"}:
                raise ValueError("分区温度类型无效")
            if (
                not template_zone.adjustable_temperature
                and temperature_mode != template_zone.temperature_mode
            ):
                raise ValueError(f"{template_zone.label} 的冷藏/冷冻类型不可修改")
            validate_slot_count(template_zone, slot_count)
            geometry = {
                **template_zone.geometry,
                "layout_kind": template_zone.layout_kind,
                "label": template_zone.label,
                "is_door": template_zone.is_door,
            }
            zone = existing_zones.get(template_zone.key)
            if zone is None:
                zone = StorageZone(
                    refrigerator_id=refrigerator.id,
                    zone_key=template_zone.key,
                    temperature_mode=temperature_mode,
                    geometry=geometry,
                    display_order=order,
                )
                self._session.add(zone)
                self._session.flush()
            else:
                zone.temperature_mode = temperature_mode
                zone.geometry = geometry
                zone.display_order = order
            slots = existing_slots.get(template_zone.key, [])
            for slot_order in range(slot_count):
                slot_geometry = self._slot_geometry(template_zone, slot_order, slot_count)
                if slot_order < len(slots):
                    slots[slot_order].slot_key = f"{template_zone.key}-{slot_order + 1}"
                    slots[slot_order].display_order = slot_order
                    slots[slot_order].geometry = slot_geometry
                else:
                    self._session.add(
                        StorageSlot(
                            zone_id=zone.id,
                            slot_key=f"{template_zone.key}-{slot_order + 1}",
                            display_order=slot_order,
                            geometry=slot_geometry,
                        )
                    )
            for slot in slots[slot_count:]:
                self._forget_location(slot.id)
                self._session.delete(slot)
        refrigerator.revision += 1

    def _forget_location(self, storage_slot_id: str) -> None:
        """删除即将移除位置的所有大类记忆。"""
        for preference in self._session.scalars(
            select(CategoryLocationPreference).where(
                CategoryLocationPreference.storage_slot_id == storage_slot_id
            )
        ):
            self._session.delete(preference)

    def layout(self, refrigerator: Refrigerator) -> list[StorageZone]:
        """读取一个冰箱按物理排序展示的布局区域。"""
        return list(
            self._session.scalars(
                select(StorageZone)
                .where(StorageZone.refrigerator_id == refrigerator.id)
                .order_by(StorageZone.display_order)
            )
        )

    @staticmethod
    def _default_config(template: RefrigeratorTemplate) -> dict[str, tuple[str, int]]:
        return {
            zone.key: (
                zone.temperature_mode,
                2 if template.key == "dual_middle" and zone.key == "middle"
                else 1 if template.key == "mini" and zone.key == "freezer"
                else 2 if template.key == "mini" and zone.key == "refrigerator"
                else default_slot_count(zone),
            )
            for zone in template.zones
        }

    @staticmethod
    def _slot_geometry(
        template_zone: ZoneTemplate, slot_order: int, slot_count: int
    ) -> dict[str, int]:
        geometry = template_zone.geometry
        if template_zone.layout_kind == "vertical":
            return {
                "x": geometry["x"],
                "y": geometry["y"] + geometry["height"] * slot_order // slot_count,
                "width": geometry["width"],
                "height": geometry["height"] // slot_count,
            }
        return {
            "x": geometry["x"] + geometry["width"] * slot_order // slot_count,
            "y": geometry["y"],
            "width": geometry["width"] // slot_count,
            "height": geometry["height"],
        }
