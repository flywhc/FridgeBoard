import type { ZoneGeometry } from './appTypes'

export type FoodIconPosition = {
  x: number
  y: number
}

export type FoodIconPositionOptions = {
  layoutKind?: ZoneGeometry['layout_kind']
}

const sparsePositions: Record<number, FoodIconPosition[]> = {
  1: [{ x: 0.5, y: 0.5 }],
  2: [{ x: 1 / 3, y: 0.5 }, { x: 2 / 3, y: 0.5 }],
  3: [{ x: 0.5, y: 1 / 3 }, { x: 1 / 3, y: 2 / 3 }, { x: 2 / 3, y: 2 / 3 }],
  4: [
    { x: 1 / 3, y: 1 / 3 },
    { x: 2 / 3, y: 1 / 3 },
    { x: 1 / 3, y: 2 / 3 },
    { x: 2 / 3, y: 2 / 3 },
  ],
  5: [
    { x: 1 / 3, y: 1 / 3 },
    { x: 2 / 3, y: 1 / 3 },
    { x: 0.5, y: 0.5 },
    { x: 1 / 3, y: 2 / 3 },
    { x: 2 / 3, y: 2 / 3 },
  ],
}

function getGridColumnCount(count: number, layoutKind: ZoneGeometry['layout_kind']): number {
  if (layoutKind === 'single_row') return Math.max(2, Math.ceil(Math.sqrt(count * 1.5)))
  return Math.max(2, Math.floor(Math.sqrt(count / 1.5)))
}

function getGridPosition(index: number, count: number, layoutKind: ZoneGeometry['layout_kind']): FoodIconPosition {
  const columns = Math.min(count, getGridColumnCount(count, layoutKind))
  const row = Math.floor(index / columns)
  const rowStart = row * columns
  const itemsInRow = Math.min(columns, count - rowStart)
  const column = index - rowStart + (columns - itemsInRow) / 2
  const rows = Math.ceil(count / columns)

  return {
    x: (column + 0.5) / columns,
    y: (row + 0.5) / rows,
  }
}

/**
 * 计算首页分格内食材图标的二维归一化位置。
 *
 * 少量图标使用中心、三等分和三角形等稳定位置；图标增多后按格子方向选择
 * 更合适的二维网格，使竖格优先增加行数、横格优先增加列数。位置只描述图标
 * 左上角在分格内部可用轨道中的比例，实际 2px 外框留白由 CSS 统一保证。
 *
 * @param index 当前图标在分格内的索引。
 * @param count 分格内图标总数。
 * @param options 分格布局方向。
 */
export function getFoodIconPosition(index: number, count: number, options: FoodIconPositionOptions = {}): FoodIconPosition {
  if (count < 1 || index < 0 || index >= count) {
    throw new RangeError('食材图标位置索引超出范围')
  }

  const sparse = sparsePositions[count]
  return sparse?.[index] ?? getGridPosition(index, count, options.layoutKind ?? 'vertical')
}
