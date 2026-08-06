import type { ZoneGeometry } from './appTypes'

export type FoodIconPosition = {
  x: number
  y: number
}

export type FoodIconPositionOptions = {
  layoutKind?: ZoneGeometry['layout_kind']
  width?: number
  height?: number
}

const EDGE_GAP = 2
const ICON_WIDTH = 22
const ICON_HEIGHT = 18
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

function hashString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function halton(index: number, base: number): number {
  let result = 0
  let factor = 1 / base
  let value = index
  while (value > 0) {
    result += factor * (value % base)
    value = Math.floor(value / base)
    factor /= base
  }
  return result
}

function getSpreadScore(candidate: FoodIconPosition, selected: FoodIconPosition[], width: number, height: number): number {
  const usableWidth = Math.max(width - EDGE_GAP * 2 - ICON_WIDTH, 1)
  const usableHeight = Math.max(height - EDGE_GAP * 2 - ICON_HEIGHT, 1)
  const candidateX = EDGE_GAP + candidate.x * usableWidth + ICON_WIDTH / 2
  const candidateY = EDGE_GAP + candidate.y * usableHeight + ICON_HEIGHT / 2

  return Math.min(...selected.map(position => {
    const positionX = EDGE_GAP + position.x * usableWidth + ICON_WIDTH / 2
    const positionY = EDGE_GAP + position.y * usableHeight + ICON_HEIGHT / 2
    const horizontal = Math.abs(candidateX - positionX) / ICON_WIDTH
    const vertical = Math.abs(candidateY - positionY) / ICON_HEIGHT
    return Math.min(horizontal, vertical) + Math.hypot(horizontal, vertical) * 0.35
  }))
}

function relaxPositions(positions: FoodIconPosition[], width: number, height: number): FoodIconPosition[] {
  const usableWidth = Math.max(width - EDGE_GAP * 2 - ICON_WIDTH, 1)
  const usableHeight = Math.max(height - EDGE_GAP * 2 - ICON_HEIGHT, 1)
  const relaxed = positions.map(position => ({ ...position }))

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const shifts = relaxed.map(() => ({ x: 0, y: 0 }))
    for (let left = 0; left < relaxed.length; left += 1) {
      for (let right = left + 1; right < relaxed.length; right += 1) {
        const horizontal = (relaxed[left].x - relaxed[right].x) * usableWidth
        const vertical = (relaxed[left].y - relaxed[right].y) * usableHeight
        const distance = Math.hypot(horizontal / ICON_WIDTH, vertical / ICON_HEIGHT)
        if (distance >= 1.1) continue
        const safeDistance = Math.max(distance, 0.01)
        const push = (1.1 - safeDistance) / safeDistance * 0.08
        shifts[left].x += horizontal / usableWidth * push
        shifts[left].y += vertical / usableHeight * push
        shifts[right].x -= horizontal / usableWidth * push
        shifts[right].y -= vertical / usableHeight * push
      }
    }
    for (let index = 0; index < relaxed.length; index += 1) {
      relaxed[index] = {
        x: Math.min(1, Math.max(0, relaxed[index].x + shifts[index].x)),
        y: Math.min(1, Math.max(0, relaxed[index].y + shifts[index].y)),
      }
    }
  }
  return relaxed
}

/**
 * 为一个分格生成分散的食材图标位置。
 *
 * 五个以内沿用稳定的语义位置；更多图标使用 Halton 低差异候选点，并以“距
 * 已有图标的最小实际像素距离最大”为目标逐个选点。候选点和 tie-breaker 由
 * 食材 ID 生成确定性种子，因此同一批物品不会因重新渲染随机跳动；空间不足时
 * 仍会选择上下、左右均有差异的点，重叠由实际可用空间自然产生。
 *
 * @param itemKeys 当前分格内食材的稳定 ID，顺序对应返回位置。
 * @param options 分格布局方向和当前实际尺寸。
 * @returns 与 `itemKeys` 一一对应的归一化左上角位置。
 */
export function getFoodIconPositions(itemKeys: readonly string[], options: FoodIconPositionOptions = {}): FoodIconPosition[] {
  const count = itemKeys.length
  if (count < 1) return []

  const sparse = sparsePositions[count]
  if (sparse) return sparse.map(position => ({ ...position }))

  const width = options.width ?? 180
  const height = options.height ?? (options.layoutKind === 'single_row' ? 72 : 120)
  const candidateCount = Math.max(96, count * 24)
  const seed = hashString(itemKeys.join('\u001f'))
  const candidates = Array.from({ length: candidateCount }, (_, index) => {
    const sequenceIndex = index + 1 + seed % 17
    return { x: halton(sequenceIndex, 2), y: halton(sequenceIndex, 3) }
  })
  const selected: FoodIconPosition[] = [{ x: 0.5, y: 0.5 }]

  while (selected.length < count) {
    let bestCandidate = candidates[0]
    let bestScore = -Infinity
    for (const candidate of candidates) {
      if (selected.some(position => position.x === candidate.x && position.y === candidate.y)) continue
      const score = getSpreadScore(candidate, selected, width, height)
      if (score > bestScore) {
        bestCandidate = candidate
        bestScore = score
      }
    }
    selected.push(bestCandidate)
  }

  const rotation = seed % selected.length
  const relaxed = relaxPositions(selected, width, height)
  return itemKeys.map((_, index) => relaxed[(index + rotation) % relaxed.length])
}

/**
 * 计算首页分格内食材图标的二维归一化位置。
 *
 * 少量图标使用中心、三等分和三角形等稳定位置；图标增多后使用确定性蓝噪声
 * 采样和轻量排斥，位置只描述图标左上角在分格内部可用轨道中的比例，实际
 * 2px 外框留白由 CSS 统一保证。
 *
 * @param index 当前图标在分格内的索引。
 * @param count 分格内图标总数。
 * @param options 分格布局方向和实际尺寸。
 */
export function getFoodIconPosition(index: number, count: number, options: FoodIconPositionOptions = {}): FoodIconPosition {
  if (count < 1 || index < 0 || index >= count) {
    throw new RangeError('食材图标位置索引超出范围')
  }

  const sparse = sparsePositions[count]
  return sparse?.[index] ?? getFoodIconPositions(Array.from({ length: count }, (_, itemIndex) => String(itemIndex)), options)[index]
}
