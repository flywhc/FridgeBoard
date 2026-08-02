import type { LayoutZone } from './appTypes'

export type FridgeShellGeometry = {
  width: number
  height: number
  columns: string[]
}

const STANDARD_GEOMETRY: FridgeShellGeometry = {
  width: 238,
  height: 315,
  columns: ['minmax(0, 144fr)', '8px', 'minmax(0, 70fr)'],
}

const WIDE_GEOMETRY: FridgeShellGeometry = {
  width: 358,
  height: 280,
  columns: ['minmax(0, 74fr)', '8px', 'minmax(0, 194fr)', '8px', 'minmax(0, 74fr)'],
}

/** 返回所有页面共用的冰箱外壳比例和内部列结构。 */
export function getFridgeShellGeometry(templateKey: string): FridgeShellGeometry {
  if (templateKey === 'side_by_side') return WIDE_GEOMETRY
  if (templateKey === 'french_door') return { ...WIDE_GEOMETRY, height: 285 }
  if (templateKey === 'mini') {
    return { width: 180, height: 245, columns: ['minmax(0, 120fr)', '8px', 'minmax(0, 52fr)'] }
  }
  return STANDARD_GEOMETRY
}

/** 返回主柜纵向区域比例；迷你冰箱兼容旧数据并强制保持上下各半。 */
export function getFridgeZoneRows(templateKey: string, zones: LayoutZone[]): string {
  if (templateKey === 'mini') return '1fr 1fr'
  const bands = [...new Map(zones.map(zone => [zone.geometry.y, zone.geometry.height])).entries()]
    .sort(([left], [right]) => left - right)
  return bands.map(([, height]) => `${height}fr`).join(' ')
}
