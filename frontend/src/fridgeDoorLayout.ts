import type { LayoutZone } from './appTypes'

type DoorGeometry = Pick<LayoutZone, 'temperature_mode' | 'geometry'>

/** 返回用于冰箱门的最大冷藏区域；没有冷藏区时退回整扇门。 */
export function getDoorColdRegion(cabinetZones: DoorGeometry[]): { y: number; height: number } {
  const largestColdZone = cabinetZones
    .filter(zone => zone.temperature_mode === 'cold')
    .sort((left, right) => right.geometry.height - left.geometry.height)[0]

  return largestColdZone
    ? { y: largestColdZone.geometry.y, height: largestColdZone.geometry.height }
    : { y: 0, height: 100 }
}

/** 返回门冷藏区与门冷冻区之间的结构分隔线位置。 */
export function getDoorTemperatureBoundary(cabinetZones: DoorGeometry[]): number | null {
  const region = getDoorColdRegion(cabinetZones)
  if (region.y > 0) return region.y
  const end = region.y + region.height
  return end < 100 ? end : null
}

/** 计算冰箱门冷藏区域内的均分格线。 */
export function getDoorGridRows(_cabinetZones: DoorGeometry[], slotCount: number): string {
  return `repeat(${Math.max(slotCount, 1)}, minmax(0, 1fr))`
}
