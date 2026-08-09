import { getSharedFridgeShellGeometry } from './fridgeLayoutPlan'

export type FridgeShellGeometry = {
  width: number
  height: number
  columns: string[]
}

export type FridgePreviewFit = {
  width: number
  height: number
}

/** 返回所有页面共用的冰箱外壳比例和内部列结构。 */
export function getFridgeShellGeometry(templateKey: string): FridgeShellGeometry {
  const geometry = getSharedFridgeShellGeometry(templateKey)
  return {
    width: geometry.width,
    height: geometry.height,
    columns: geometry.columns.map((value, index) => index % 2
      ? `${value}px`
      : `minmax(0, ${value}fr)`),
  }
}

/**
 * 计算冰箱预览在可用矩形内的最大等比尺寸。
 *
 * 宽度上限、可用宽度和可用高度共同约束同一个缩放比例；不能先按宽度
 * 放大后再用 max-height 截短高度，否则冰箱下部会被裁掉。
 */
export function getFridgePreviewFitSize(
  templateKey: string,
  availableWidth: number,
  availableHeight: number,
  maxWidth: number,
): FridgePreviewFit {
  const geometry = getFridgeShellGeometry(templateKey)
  const scale = Math.max(0, Math.min(
    availableWidth / geometry.width,
    availableHeight / geometry.height,
    maxWidth / geometry.width,
  ))
  return { width: geometry.width * scale, height: geometry.height * scale }
}
