import type { LayoutZone } from './appTypes'

function getLargestColdZoneBoundary(cabinetZones: Pick<LayoutZone, 'temperature_mode' | 'geometry'>[]): number | null {
  const largestColdZone = cabinetZones
    .filter(zone => zone.temperature_mode === 'cold')
    .sort((left, right) => right.geometry.height - left.geometry.height)[0]
  const end = largestColdZone ? largestColdZone.geometry.y + largestColdZone.geometry.height : 100
  return end < 100 ? end : largestColdZone && largestColdZone.geometry.y > 0 ? largestColdZone.geometry.y : null
}

/** 返回冰箱门中与最大冷藏区域相对的分格区域高度比例。 */
export function getDoorSelectionRatio(cabinetZones: Pick<LayoutZone, 'temperature_mode' | 'geometry'>[]): number {
  const boundary = getLargestColdZoneBoundary(cabinetZones)
  return boundary === null ? 1 : boundary / 100
}

/**
 * 计算冰箱门分格的比例，使最后一条门内分割线对齐最大冷藏区域的边界。
 *
 * 当模板没有可对齐的冷藏区域边界（例如对开门的整高冷藏区）时，门格保持等分。
 */
export function getDoorGridRows(cabinetZones: Pick<LayoutZone, 'temperature_mode' | 'geometry'>[], slotCount: number): string {
  const count = Math.max(slotCount, 1)
  if (count === 1) return '1fr'

  const boundary = getLargestColdZoneBoundary(cabinetZones)
  if (boundary === null) return `repeat(${count}, minmax(0, 1fr))`

  const rowsBeforeBoundary = count - 1
  const remaining = 100 - boundary
  return `${Array.from({ length: rowsBeforeBoundary }, () => `${boundary / rowsBeforeBoundary}fr`).join(' ')} ${remaining}fr`
}
