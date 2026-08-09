import type { LayoutZone } from './appTypes'
import { getSharedDoorColdRegion } from './fridgeLayoutPlan'

type DoorGeometry = Pick<LayoutZone, 'temperature_mode' | 'geometry'>

/** 返回用于冰箱门的最大冷藏区域；没有冷藏区时退回整扇门。 */
export function getDoorColdRegion(cabinetZones: DoorGeometry[]): { y: number; height: number } {
  return getSharedDoorColdRegion(cabinetZones)
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
