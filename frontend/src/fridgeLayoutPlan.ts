import './fridgeLayoutCore.js'
import type { Layout, LayoutZone } from './appTypes'

export type FridgeDoorSegment = {
  zone: LayoutZone
  slots: LayoutZone['slots']
  top: number
  height: number
}

export type FridgeBandZone = {
  zone: LayoutZone
  slots: LayoutZone['slots']
  x: number
  width: number
  layoutKind: LayoutZone['geometry']['layout_kind']
}

export type FridgeCabinetBand = {
  top: number
  height: number
  zones: FridgeBandZone[]
}

export type FridgeWideZone = FridgeBandZone & { y: number; height: number }

export type FridgeRenderPlan = {
  shell: { width: number; height: number; columns: number[] }
  wide: boolean
  cabinetBands: FridgeCabinetBand[]
  cabinetZones: FridgeWideZone[]
  doorPanels: { left: FridgeDoorSegment[]; right: FridgeDoorSegment[] }
  hingeTracks: { after: 'left-door' | 'cabinet'; positions: number[] }[]
}

type FridgeLayoutCore = {
  createFridgeRenderPlan: (layout: Layout) => FridgeRenderPlan
  getDoorColdRegion: (
    cabinetZones: Pick<LayoutZone, 'temperature_mode' | 'geometry'>[],
  ) => { y: number; height: number }
  getShellGeometry: (templateKey: string) => FridgeRenderPlan['shell']
}

const core = (globalThis as typeof globalThis & { FridgeLayoutCore: FridgeLayoutCore })
  .FridgeLayoutCore

/** 生成手机端与冰箱端唯一共用的冰箱结构渲染计划。 */
export function createFridgeRenderPlan(layout: Layout): FridgeRenderPlan {
  return core.createFridgeRenderPlan(layout)
}

/** 返回共享外壳几何；具体终端不得再维护模板尺寸副本。 */
export function getSharedFridgeShellGeometry(templateKey: string): FridgeRenderPlan['shell'] {
  return core.getShellGeometry(templateKey)
}

/** 返回旧单门布局使用的最大冷藏门区域。 */
export function getSharedDoorColdRegion(
  cabinetZones: Pick<LayoutZone, 'temperature_mode' | 'geometry'>[],
): { y: number; height: number } {
  return core.getDoorColdRegion(cabinetZones)
}
