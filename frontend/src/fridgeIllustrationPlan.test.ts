import { describe, expect, it } from 'vitest'
import type { Layout, LayoutZone } from './appTypes'
import { createFridgeIllustrationPlan } from './fridgeIllustrationPlan'

function zone(key: string, y: number, height: number, temperatureMode: 'cold' | 'frozen', options: { door?: boolean; slots?: number; geometry?: LayoutZone['geometry'] } = {}): LayoutZone {
  return {
    key,
    label: key,
    temperature_mode: temperatureMode,
    geometry: options.geometry ?? { x: 0, y, width: 100, height, layout_kind: 'vertical' },
    is_door: options.door ?? false,
    slots: Array.from({ length: options.slots ?? 2 }, (_, index) => ({ id: `${key}-${index + 1}`, key: `${key}-${index + 1}` })),
  }
}

function layout(): Layout {
  return {
    refrigerator_id: 'fridge-1',
    template_key: 'top_freezer_single',
    revision: 1,
    zones: [
      zone('freezer', 0, 40, 'frozen'),
      zone('refrigerator', 40, 60, 'cold', { slots: 3 }),
      zone('door_freezer', 0, 40, 'frozen', { door: true }),
      zone('door', 40, 60, 'cold', { door: true, slots: 3 }),
    ],
  }
}

describe('单门拟物位图母版计划', () => {
  it('从共享布局生成柜体格位并保留温区材质语义', () => {
    const plan = createFridgeIllustrationPlan(layout())
    expect(plan.cabinetSlots).toHaveLength(5)
    expect(plan.cabinetSlots.map(slot => slot.temperatureMode)).toEqual(['frozen', 'frozen', 'cold', 'cold', 'cold'])
    expect(plan.cabinetShelves.map(shelf => shelf.material)).toEqual(['glass', 'glass', 'white', 'glass'])
    expect(plan.viewBox).toEqual({ width: 1005, height: 1227 })
    expect(plan.shellAsset).toBe('single-cavity')
    expect(plan.cabinetSlots[0].height).toBeCloseTo(980 * .4 / 2)
    expect(plan.cabinetShelves).toHaveLength(4)
    expect(plan.hinges).toHaveLength(2)
    const whiteShelf = plan.cabinetShelves.find(shelf => shelf.material === 'white')!
    expect(whiteShelf.frontEdge[0].x).toBe(plan.cavity.x - 4)
  })

  it('按层高生成形状不同的透视隔板并收短柜体右端', () => {
    const plan = createFridgeIllustrationPlan(layout())
    const first = plan.cabinetShelves[0]
    const last = plan.cabinetShelves.at(-1)!
    const firstDepth = first.frontEdge[0].y - first.rearEdge[0].y
    const lastDepth = last.frontEdge[0].y - last.rearEdge[0].y

    expect(lastDepth).toBeGreaterThan(firstDepth)
    expect(first.frontEdge[0].x).toBe(64)
    expect(first.frontEdge[1].x).toBe(594)
    expect(first.frontEdge[1].x).toBeLessThan(plan.cavity.x + plan.cavity.width)
  })

  it('把门格位映射为固定透视四边形且保持顺序', () => {
    const plan = createFridgeIllustrationPlan(layout())
    expect(plan.doors).toHaveLength(1)
    expect(plan.doors[0].slots).toHaveLength(5)
    expect(plan.doors[0].slots.map(slot => slot.id)).toEqual([
      'door_freezer-1', 'door_freezer-2', 'door-1', 'door-2', 'door-3',
    ])
    expect(plan.doors[0].slots.every(slot => slot.polygon.length === 4 && slot.width > 0 && slot.height > 0)).toBe(true)
    expect(plan.doors[0].slots[0].polygon[0].x).toBeLessThan(plan.doors[0].slots[0].polygon[1].x)
    expect(plan.doors[0].slots[0].polygon[0].x).toBe(630)
    expect(plan.doors[0].slots[0].polygon[1].x).toBe(886)
    expect(plan.doors[0].inner[1].y).toBeLessThan(plan.doors[0].inner[0].y)
    expect(plan.doors[0].inner[2].y - plan.doors[0].inner[1].y).toBeGreaterThan(plan.doors[0].inner[3].y - plan.doors[0].inner[0].y)
  })

  it('按层高平滑增加门架右端透视补偿', () => {
    const plan = createFridgeIllustrationPlan(layout())
    const door = plan.doors[0]
    const firstSlotBottomRight = door.slots[0].polygon[2]
    const firstRackBottomRight = door.racks[0].polygon[2]
    const lastSlotBottomRight = door.slots.at(-1)!.polygon[2]
    const lastRackBottomRight = door.racks.at(-1)!.polygon[2]
    const lifts = door.racks.map((rack, index) => door.slots[index].polygon[2].y - rack.polygon[2].y)

    expect(firstRackBottomRight.y).toBe(firstSlotBottomRight.y - 10)
    expect(lastRackBottomRight.y).toBe(lastSlotBottomRight.y - 18)
    expect(lastRackBottomRight.x).toBe(lastSlotBottomRight.x)
    expect(lifts.at(-2)).toBeCloseTo(12, 0)
    expect(lifts.every((lift, index) => index === 0 || lift >= lifts[index - 1])).toBe(true)
    const lastRack = door.racks.at(-1)!
    const leftDepth = lastRack.polygon[3].y - lastRack.polygon[0].y
    const rightDepth = lastRack.polygon[2].y - lastRack.polygon[1].y
    expect(rightDepth).toBeCloseTo(leftDepth * 1.08)
  })

  it('按共享布局计划适应六种其他模板并生成门体与隔板', () => {
    const templates = ['bottom_freezer_single', 'mini', 'three_door', 'dual_middle'] as const
    for (const templateKey of templates) {
      const plan = createFridgeIllustrationPlan({ ...layout(), template_key: templateKey })
      expect(plan.cabinetSlots.length).toBeGreaterThan(0)
      expect(plan.cabinetShelves.length).toBeGreaterThan(0)
      expect(plan.doors).toHaveLength(1)
      expect(plan.doors[0].slots.length).toBeGreaterThan(0)
    }

    for (const templateKey of ['side_by_side', 'french_door'] as const) {
      const wide = {
        refrigerator_id: 'fridge-wide',
        template_key: templateKey,
        revision: 1,
        zones: [
          zone('left-cabinet', 0, 100, 'cold', { slots: 2, geometry: { x: 0, y: 0, width: 50, height: 100, layout_kind: 'vertical' } }),
          zone('right-cabinet', 0, 100, 'frozen', { slots: 2, geometry: { x: 50, y: 0, width: 50, height: 100, layout_kind: 'vertical' } }),
          zone('left-door', 0, 100, 'cold', { door: true, slots: 2, geometry: { x: 0, y: 0, width: 50, height: 100, layout_kind: 'vertical' } }),
          zone('door', 0, 100, 'cold', { door: true, slots: 2, geometry: { x: 50, y: 0, width: 50, height: 100, layout_kind: 'vertical' } }),
        ],
      } satisfies Layout
      const plan = createFridgeIllustrationPlan(wide)
      expect(plan.doors).toHaveLength(2)
      expect(plan.doors.every(door => door.slots.length > 0)).toBe(true)
      expect(plan.cabinetSlots).toHaveLength(4)
      expect(plan.shellAsset).toBe('dual-cavity')
      expect(plan.cavities).toHaveLength(2)
      expect(plan.cabinetShelves.every(shelf => plan.cavities.some(cavity => (
        shelf.frontEdge[0].x >= cavity.x - 2
        && shelf.frontEdge[1].x <= cavity.x + cavity.width
      )))).toBe(true)
      const [leftCavity, rightCavity] = plan.cavities
      const leftShelves = plan.cabinetShelves.filter(shelf => shelf.frontEdge[1].x <= leftCavity.x + leftCavity.width)
      const rightShelves = plan.cabinetShelves.filter(shelf => shelf.frontEdge[0].x >= rightCavity.x)
      expect(leftShelves.every(shelf => shelf.rearEdge[1].x === shelf.frontEdge[1].x)).toBe(true)
      expect(leftShelves.every(shelf => shelf.frontEdge[0].x === leftCavity.x + 4)).toBe(true)
      expect(rightShelves.every(shelf => shelf.rearEdge[0].x === shelf.frontEdge[0].x)).toBe(true)
      expect(leftShelves.filter(shelf => shelf.material === 'glass').every(shelf => shelf.frontEdge[1].x === leftCavity.x + leftCavity.width - 9)).toBe(true)
      expect(leftShelves.filter(shelf => shelf.material === 'glass').every(shelf => shelf.rearEdge[1].x === leftCavity.x + leftCavity.width - 9)).toBe(true)
      expect(rightShelves.filter(shelf => shelf.material === 'white').every(shelf => shelf.frontEdge[0].x === rightCavity.x + 7)).toBe(true)
      expect(rightShelves.filter(shelf => shelf.material === 'white').every(shelf => shelf.rearEdge[0].x === rightCavity.x + 7)).toBe(true)
      expect(rightShelves.every(shelf => shelf.rearEdge[1].x === 1031)).toBe(true)
      const [leftDoor, rightDoor] = plan.doors
      expect(leftDoor.side).toBe('left')
      expect(rightDoor.side).toBe('right')
      expect(leftDoor.inner).not.toEqual(rightDoor.inner)
      expect(leftDoor.inner.map(point => point.x)).toEqual([105, 318, 318, 105])
      expect(rightDoor.inner.map(point => point.x)).toEqual([1096, 1322, 1322, 1096])
      expect(leftDoor.racks.map(rack => rack.material)).toEqual(['glass', 'white'])
      expect(rightDoor.racks.map(rack => rack.material)).toEqual(['glass', 'white'])
    }
  })

  it('三门按腔体边界使用白色隔板、内部使用玻璃并生成中层竖框', () => {
    const threeDoor: Layout = {
      refrigerator_id: 'three-door', template_key: 'three_door', revision: 1,
      zones: [
        zone('top', 0, 45, 'cold', { slots: 2 }),
        zone('middle', 45, 15, 'cold', { slots: 2, geometry: { x: 0, y: 45, width: 100, height: 15, layout_kind: 'single_row' } }),
        zone('bottom', 60, 40, 'frozen', { slots: 2 }),
        zone('door-top', 0, 45, 'cold', { door: true, slots: 2 }),
        zone('door-middle', 45, 15, 'cold', { door: true, slots: 1 }),
        zone('door-bottom', 60, 40, 'frozen', { door: true, slots: 2 }),
      ],
    }
    const plan = createFridgeIllustrationPlan(threeDoor)

    expect(plan.cabinetDividers).toHaveLength(1)
    expect(plan.cabinetDividers[0].y).toBeGreaterThan(99 + 980 * .45)
    expect(plan.cabinetDividers[0].height).toBeLessThan(980 * .15)
    const lowerWhiteShelf = plan.cabinetShelves.find(shelf =>
      shelf.material === 'white' && shelf.frontEdge[0].y > plan.cabinetDividers[0].y,
    )!
    expect(plan.cabinetDividers[0].y + plan.cabinetDividers[0].height).toBe(lowerWhiteShelf.frontEdge[0].y)
    expect(plan.cabinetShelves.map(shelf => shelf.material)).toEqual(['glass', 'white', 'white', 'glass'])
    expect(plan.doors[0].racks.map(rack => rack.material)).toEqual(['glass', 'white', 'white', 'glass', 'white'])
    expect(plan.cabinetSlots.filter(slot => slot.zoneKey === 'middle').every(slot => slot.contentY! > slot.y && slot.contentHeight! < slot.height)).toBe(true)
    expect(plan.cabinetSlots.filter(slot => slot.zoneKey === 'bottom').every(slot => slot.contentY! > slot.y && slot.contentHeight! < slot.height)).toBe(true)
  })

  it('隔板数量随共享布局槽位增减而变化', () => {
    const fewer = layout()
    fewer.zones[1].slots = [{ id: 'refrigerator-1', key: 'refrigerator-1' }]
    const more = layout()
    more.zones[1].slots = Array.from({ length: 5 }, (_, index) => ({ id: `refrigerator-${index + 1}`, key: `refrigerator-${index + 1}` }))

    expect(createFridgeIllustrationPlan(fewer).cabinetShelves.length).toBeLessThan(createFridgeIllustrationPlan(more).cabinetShelves.length)
  })
})
