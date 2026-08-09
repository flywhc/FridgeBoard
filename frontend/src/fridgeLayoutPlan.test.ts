import { describe, expect, it } from 'vitest'
import { createFridgeRenderPlan } from './fridgeLayoutPlan'
import type { Layout, LayoutZone } from './appTypes'

function zone(
  key: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: { door?: boolean; layoutKind?: 'vertical' | 'single_row'; slots?: number } = {},
): LayoutZone {
  return {
    key,
    label: key,
    temperature_mode: 'cold',
    geometry: {
      x,
      y,
      width,
      height,
      layout_kind: options.layoutKind ?? 'vertical',
    },
    is_door: options.door ?? false,
    slots: Array.from({ length: options.slots ?? 2 }, (_, index) => ({
      id: `${key}-${index + 1}`,
      key: `${key}-${index + 1}`,
    })),
  }
}

function layout(templateKey: string, zones: LayoutZone[]): Layout {
  return { refrigerator_id: 'fridge-1', template_key: templateKey, revision: 1, zones }
}

describe('共享冰箱布局渲染计划', () => {
  it.each([
    ['top_freezer_single', [40, 60]],
    ['bottom_freezer_single', [60, 40]],
    ['mini', [50, 50]],
    ['three_door', [45, 15, 40]],
    ['dual_middle', [40, 20, 40]],
  ])('%s 的标准柜体和门共用同一组纵向分带', (templateKey, heights) => {
    let top = 0
    const cabinetZones = heights.map((height, index) => {
      const item = zone(`cabinet-${index}`, 0, top, 100, height)
      top += height
      return item
    })
    top = 0
    const doorZones = heights.map((height, index) => {
      const item = zone(`door-${index}`, 0, top, 100, height, { door: true })
      top += height
      return item
    })

    const plan = createFridgeRenderPlan(layout(templateKey, [...cabinetZones, ...doorZones]))

    expect(plan.cabinetBands.map(band => band.height)).toEqual(heights)
    expect(plan.doorPanels.right.map(segment => segment.height)).toEqual(heights)
    expect(plan.hingeTracks).toHaveLength(1)
  })

  it('按手机端基准生成标准冰箱的整行分带、右门和两块合页', () => {
    const plan = createFridgeRenderPlan(layout('three_door', [
      zone('refrigerator', 0, 0, 100, 45),
      zone('convertible', 0, 45, 100, 15, { layoutKind: 'single_row' }),
      zone('freezer', 0, 60, 100, 40),
      zone('door', 0, 0, 100, 45, { door: true }),
      zone('door_convertible', 0, 45, 100, 15, { door: true }),
      zone('door_freezer', 0, 60, 100, 40, { door: true }),
    ]))

    expect(plan.shell).toEqual({ width: 238, height: 315, columns: [144, 8, 70] })
    expect(plan.cabinetBands.map(band => [band.top, band.height])).toEqual([
      [0, 45],
      [45, 15],
      [60, 40],
    ])
    expect(plan.cabinetBands[1].zones[0]).toMatchObject({
      x: 0,
      width: 100,
      layoutKind: 'single_row',
    })
    expect(plan.doorPanels.left).toEqual([])
    expect(plan.doorPanels.right.map(segment => [segment.top, segment.height])).toEqual([
      [0, 45],
      [45, 15],
      [60, 40],
    ])
    expect(plan.hingeTracks).toEqual([{ after: 'cabinet', positions: [25, 75] }])
  })

  it('按手机端基准生成宽体冰箱的左右门和两组合页', () => {
    const plan = createFridgeRenderPlan(layout('side_by_side', [
      zone('left_freezer', 0, 0, 50, 100),
      zone('right_refrigerator', 50, 0, 50, 100),
      zone('door_left_freezer', 0, 0, 50, 100, { door: true }),
      zone('door', 50, 0, 50, 100, { door: true }),
    ]))

    expect(plan.wide).toBe(true)
    expect(plan.shell).toEqual({ width: 358, height: 280, columns: [74, 8, 194, 8, 74] })
    expect(plan.cabinetZones.map(item => [item.zone.key, item.x, item.width])).toEqual([
      ['left_freezer', 0, 50],
      ['right_refrigerator', 50, 50],
    ])
    expect(plan.doorPanels.left[0].zone.key).toBe('door_left_freezer')
    expect(plan.doorPanels.right[0].zone.key).toBe('door')
    expect(plan.hingeTracks).toEqual([
      { after: 'left-door', positions: [25, 75] },
      { after: 'cabinet', positions: [25, 75] },
    ])
  })

  it('法式多门按手机端规则把每个门区格位均分到左右门', () => {
    const plan = createFridgeRenderPlan(layout('french_door', [
      zone('left_refrigerator', 0, 0, 50, 65),
      zone('right_refrigerator', 50, 0, 50, 65),
      zone('freezer', 0, 65, 100, 35),
      zone('door', 0, 0, 100, 65, { door: true, slots: 4 }),
      zone('door_freezer', 0, 65, 100, 35, { door: true, slots: 2 }),
    ]))

    expect(plan.shell).toEqual({ width: 358, height: 285, columns: [74, 8, 194, 8, 74] })
    expect(plan.doorPanels.left.map(segment => segment.slots.map(slot => slot.id))).toEqual([
      ['door-1', 'door-2'],
      ['door_freezer-1'],
    ])
    expect(plan.doorPanels.right.map(segment => segment.slots.map(slot => slot.id))).toEqual([
      ['door-3', 'door-4'],
      ['door_freezer-2'],
    ])
    expect(plan.hingeTracks).toHaveLength(2)
  })

  it('同一纵坐标的中层区域共享一个完整分带', () => {
    const plan = createFridgeRenderPlan(layout('dual_middle', [
      zone('top', 0, 0, 100, 40),
      zone('middle-left', 0, 40, 50, 20),
      zone('middle-right', 50, 40, 50, 20),
      zone('bottom', 0, 60, 100, 40),
      zone('door', 0, 0, 100, 100, { door: true }),
    ]))

    expect(plan.cabinetBands).toHaveLength(3)
    expect(plan.cabinetBands[1].zones.map(item => [item.zone.key, item.x, item.width])).toEqual([
      ['middle-left', 0, 50],
      ['middle-right', 50, 50],
    ])
  })
})
