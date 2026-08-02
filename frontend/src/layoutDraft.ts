import type { Layout, Template } from './appTypes'

/** 为旧冰箱补齐后来新增的门区；缺失门区默认不可用，保存后才写入后端。 */
export function completeLayoutZones(layout: Layout, template: Template | undefined): Layout {
  if (!template) return layout
  const existingZones = new Map(layout.zones.map(zone => [zone.key, zone]))
  return {
    ...layout,
    zones: template.zones.map(zone => existingZones.get(zone.key) ?? {
      key: zone.key,
      label: zone.label,
      temperature_mode: zone.temperature_mode,
      geometry: { ...zone.geometry, layout_kind: zone.layout_kind },
      is_door: zone.is_door,
      slots: [],
    }),
  }
}
