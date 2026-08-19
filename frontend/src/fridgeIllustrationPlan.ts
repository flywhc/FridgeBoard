import './fridgeLayoutCore.js'
import { createFridgeRenderPlan, type FridgeDoorSegment, type FridgeRenderPlan } from './fridgeLayoutPlan'
import type { Layout, LayoutZone } from './appTypes'

export type IllustrationPoint = { x: number; y: number }
export type IllustrationRect = { x: number; y: number; width: number; height: number }

export type IllustrationSlot = IllustrationRect & {
  id: string
  key: string
  zoneKey: string
  zoneLabel: string
  layoutKind: LayoutZone['geometry']['layout_kind']
  temperatureMode: LayoutZone['temperature_mode']
}

export type IllustrationDoorSlot = IllustrationSlot & { polygon: IllustrationPoint[] }

export type IllustrationDoorRack = {
  slotId: string
  temperatureMode: LayoutZone['temperature_mode']
  material: IllustrationShelfMaterial
  polygon: IllustrationPoint[]
  topEdge: [IllustrationPoint, IllustrationPoint]
}

export type IllustrationShelfMaterial = 'glass' | 'white'

export type IllustrationShelf = {
  slotId: string
  temperatureMode: LayoutZone['temperature_mode']
  material: IllustrationShelfMaterial
  polygon: IllustrationPoint[]
  rearEdge: [IllustrationPoint, IllustrationPoint]
  frontEdge: [IllustrationPoint, IllustrationPoint]
}

export type IllustrationDoor = {
  id: string
  side: 'left' | 'right'
  outer: IllustrationPoint[]
  inner: IllustrationPoint[]
  slots: IllustrationDoorSlot[]
  racks: IllustrationDoorRack[]
}

export type FridgeIllustrationPlan = {
  templateKey: Layout['template_key']
  viewBox: { width: number; height: number }
  shell: IllustrationRect
  cavity: IllustrationRect
  cavities: IllustrationRect[]
  shellAsset: 'single-cavity' | 'dual-cavity'
  cabinetSlots: IllustrationSlot[]
  cabinetShelves: IllustrationShelf[]
  doors: IllustrationDoor[]
  hinges: IllustrationPoint[]
}

type IllustrationScene = Omit<FridgeIllustrationPlan, 'templateKey' | 'cabinetSlots' | 'cabinetShelves' | 'doors' | 'hinges'> & {
  doorPlanes: Array<Pick<IllustrationDoor, 'id' | 'side' | 'outer' | 'inner'>>
}

const STANDARD_SCENE: IllustrationScene = {
  viewBox: { width: 1005, height: 1227 },
  shell: { x: 20, y: 20, width: 965, height: 1187 },
  cavity: { x: 66, y: 99, width: 545, height: 980 },
  cavities: [{ x: 66, y: 99, width: 545, height: 980 }],
  shellAsset: 'single-cavity',
  doorPlanes: [{
    id: 'right-door',
    side: 'right',
    outer: [{ x: 619, y: 74 }, { x: 934, y: 20 }, { x: 985, y: 1207 }, { x: 619, y: 1109 }],
    inner: [{ x: 630, y: 106 }, { x: 886, y: 82 }, { x: 886, y: 1157 }, { x: 630, y: 1067 }],
  }],
}

const WIDE_LEFT_DOOR: Pick<IllustrationDoor, 'id' | 'side' | 'outer' | 'inner'> = {
  id: 'left-door',
  side: 'left',
  outer: [{ x: 25, y: 42 }, { x: 338, y: 87 }, { x: 338, y: 1022 }, { x: 25, y: 1078 }],
  inner: [{ x: 105, y: 97 }, { x: 318, y: 126 }, { x: 318, y: 994 }, { x: 105, y: 1045 }],
}

const WIDE_RIGHT_DOOR: Pick<IllustrationDoor, 'id' | 'side' | 'outer' | 'inner'> = {
  id: 'right-door',
  side: 'right',
  outer: [{ x: 1089, y: 87 }, { x: 1402, y: 42 }, { x: 1402, y: 1078 }, { x: 1089, y: 1022 }],
  inner: [{ x: 1096, y: 126 }, { x: 1322, y: 97 }, { x: 1322, y: 1045 }, { x: 1096, y: 994 }],
}

const WIDE_SCENE: IllustrationScene = {
  viewBox: { width: 1427, height: 1102 },
  shell: { x: 0, y: 0, width: 1427, height: 1102 },
  cavity: { x: 347, y: 110, width: 731, height: 880 },
  cavities: [
    { x: 347, y: 110, width: 345, height: 880 },
    { x: 733, y: 110, width: 345, height: 880 },
  ],
  shellAsset: 'dual-cavity',
  doorPlanes: [WIDE_LEFT_DOOR, WIDE_RIGHT_DOOR],
}

function sceneFor(renderPlan: FridgeRenderPlan): IllustrationScene {
  return renderPlan.wide ? WIDE_SCENE : STANDARD_SCENE
}

function slotsForRect(zone: LayoutZone, rect: IllustrationRect): IllustrationSlot[] {
  const count = Math.max(zone.slots.length, 1)
  const isRow = zone.geometry.layout_kind === 'single_row'
  return zone.slots.map((slot, index) => ({
    id: slot.id,
    key: slot.key,
    zoneKey: zone.key,
    zoneLabel: zone.label,
    layoutKind: zone.geometry.layout_kind,
    temperatureMode: zone.temperature_mode,
    x: rect.x + (isRow ? rect.width * index / count : 0),
    y: rect.y + (isRow ? 0 : rect.height * index / count),
    width: isRow ? rect.width / count : rect.width,
    height: isRow ? rect.height : rect.height / count,
  }))
}

function mapPercentRect(cavity: IllustrationRect, x: number, y: number, width: number, height: number): IllustrationRect {
  return {
    x: cavity.x + cavity.width * x / 100,
    y: cavity.y + cavity.height * y / 100,
    width: cavity.width * width / 100,
    height: cavity.height * height / 100,
  }
}

function mapCabinetRect(scene: IllustrationScene, x: number, y: number, width: number, height: number): IllustrationRect {
  if (scene.shellAsset === 'single-cavity') return mapPercentRect(scene.cavity, x, y, width, height)

  const [left, right] = scene.cavities
  const start = x < 50
    ? left.x + left.width * x / 50
    : right.x + right.width * (x - 50) / 50
  const endPercent = x + width
  const end = endPercent <= 50
    ? left.x + left.width * endPercent / 50
    : right.x + right.width * (endPercent - 50) / 50
  return {
    x: start,
    y: scene.cavity.y + scene.cavity.height * y / 100,
    width: end - start,
    height: scene.cavity.height * height / 100,
  }
}

function cabinetSlots(renderPlan: FridgeRenderPlan, scene: IllustrationScene): IllustrationSlot[] {
  const regions = renderPlan.wide
    ? renderPlan.cabinetZones.map(zone => ({ zone: zone.zone, rect: mapCabinetRect(scene, zone.x, zone.y, zone.width, zone.height) }))
    : renderPlan.cabinetBands.flatMap(band => band.zones.map(zone => ({
      zone: zone.zone,
      rect: mapCabinetRect(scene, zone.x, band.top, zone.width, band.height),
    })))
  return regions.flatMap(({ zone, rect }) => slotsForRect(zone, rect))
}

function cabinetShelves(slots: IllustrationSlot[], cavities: IllustrationRect[]): IllustrationShelf[] {
  const cavityTop = Math.min(...cavities.map(cavity => cavity.y))
  const cavityBottom = Math.max(...cavities.map(cavity => cavity.y + cavity.height))
  const boundaries = slots
    .map(slot => ({ slot, y: slot.y + slot.height }))
    .filter(boundary => boundary.y < cavityBottom - 1)
  const levels = [...new Set(boundaries.map(boundary => Math.round(boundary.y * 10) / 10))].sort((left, right) => left - right)
  const whiteLevel = Math.floor(levels.length / 2)

  return boundaries.flatMap(({ slot, y }) => cavities.flatMap((cavity, cavityIndex) => {
    const segmentLeft = Math.max(slot.x, cavity.x)
    const segmentRight = Math.min(slot.x + slot.width, cavity.x + cavity.width)
    if (segmentRight - segmentLeft < 1) return []
    const level = Math.max(0, Math.min(1, (y - cavityTop) / (cavityBottom - cavityTop)))
    const depth = 18 + 16 * level
    const levelIndex = levels.findIndex(value => Math.abs(value - y) < .1)
    const material: IllustrationShelfMaterial = levelIndex === whiteLevel ? 'white' : 'glass'
    const rearEdge: [IllustrationPoint, IllustrationPoint] = [
      { x: Math.max(cavity.x + 16, segmentLeft + 28 + 7 * level), y: y - depth * .42 },
      { x: Math.min(cavity.x + cavity.width - 20, segmentRight - 53 - 4 * level), y: y - depth * .42 },
    ]
    const frontEdge: [IllustrationPoint, IllustrationPoint] = [
      { x: Math.max(cavity.x - 2, segmentLeft - 2), y: y + depth * .58 },
      { x: Math.min(cavity.x + cavity.width - 17, segmentRight - 17), y: y + depth * .58 },
    ]
    if (cavities.length === 2) {
      const dividerEdgeX = cavityIndex === 0 ? cavity.x + cavity.width - 7 : cavity.x + 9
      if (cavityIndex === 0) {
        rearEdge[0].x += 6
        frontEdge[0].x += 6
        rearEdge[1].x = dividerEdgeX
        frontEdge[1].x = dividerEdgeX
        if (material === 'glass') {
          rearEdge[1].x -= 2
          frontEdge[1].x -= 2
        } else {
          rearEdge[1].x += 2
          frontEdge[1].x += 2
        }
      } else {
        rearEdge[0].x = dividerEdgeX
        frontEdge[0].x = dividerEdgeX
        if (material === 'white') {
          rearEdge[0].x -= 2
          frontEdge[0].x -= 2
        }
        rearEdge[1].x = 1031
      }
    } else if (material === 'white') {
      rearEdge[0].x -= 2
      frontEdge[0].x -= 2
    }
    return {
      slotId: slot.id,
      temperatureMode: slot.temperatureMode,
      material,
      polygon: [rearEdge[0], rearEdge[1], frontEdge[1], frontEdge[0]],
      rearEdge,
      frontEdge,
    }
  }))
}

function mapDoorPoint(inner: IllustrationPoint[], u: number, v: number): IllustrationPoint {
  const [topLeft, topRight, bottomRight, bottomLeft] = inner
  const left = {
    x: topLeft.x + (bottomLeft.x - topLeft.x) * v,
    y: topLeft.y + (bottomLeft.y - topLeft.y) * v,
  }
  const right = {
    x: topRight.x + (bottomRight.x - topRight.x) * v,
    y: topRight.y + (bottomRight.y - topRight.y) * v,
  }
  return { x: left.x + (right.x - left.x) * u, y: left.y + (right.y - left.y) * u }
}

function doorSlots(segments: FridgeDoorSegment[], inner: IllustrationPoint[]): IllustrationDoorSlot[] {
  return segments.flatMap(segment => {
    const count = Math.max(segment.slots.length, 1)
    return segment.slots.map((slot, index) => {
      const top = (segment.top + segment.height * index / count) / 100
      const bottom = (segment.top + segment.height * (index + 1) / count) / 100
      const polygon = [mapDoorPoint(inner, 0, top), mapDoorPoint(inner, 1, top), mapDoorPoint(inner, 1, bottom), mapDoorPoint(inner, 0, bottom)]
      const xs = polygon.map(point => point.x)
      const ys = polygon.map(point => point.y)
      return {
        id: slot.id,
        key: slot.key,
        zoneKey: segment.zone.key,
        zoneLabel: segment.zone.label,
        layoutKind: segment.zone.geometry.layout_kind,
        temperatureMode: segment.zone.temperature_mode,
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
        polygon,
      }
    })
  })
}

function doorRacks(slots: IllustrationDoorSlot[], side: IllustrationDoor['side'], bottomWhite: boolean): IllustrationDoorRack[] {
  return slots.map((slot, index) => {
    const [, , sourceBottomRight, sourceBottomLeft] = slot.polygon
    const baseDepth = Math.min(slot.height * .15, 30)
    const level = slots.length === 1 ? 1 : index / (slots.length - 1)
    const nearLift = 10 + 8 * level ** 5
    const bottomLeft = side === 'left'
      ? { x: sourceBottomLeft.x, y: sourceBottomLeft.y - nearLift }
      : sourceBottomLeft
    const bottomRight = side === 'right'
      ? { x: sourceBottomRight.x, y: sourceBottomRight.y - nearLift }
      : sourceBottomRight
    const leftDepth = side === 'left' ? baseDepth * 1.08 : baseDepth
    const rightDepth = side === 'right' ? baseDepth * 1.08 : baseDepth
    const topEdge: [IllustrationPoint, IllustrationPoint] = [
      { x: bottomLeft.x, y: bottomLeft.y - leftDepth },
      { x: bottomRight.x, y: bottomRight.y - rightDepth },
    ]
    return {
      slotId: slot.id,
      temperatureMode: slot.temperatureMode,
      material: bottomWhite
        ? (index === slots.length - 1 ? 'white' : 'glass')
        : (slot.temperatureMode === 'frozen' ? 'white' : 'glass'),
      polygon: [topEdge[0], topEdge[1], bottomRight, bottomLeft],
      topEdge,
    }
  })
}

function hinges(scene: IllustrationScene, renderPlan: FridgeRenderPlan): IllustrationPoint[] {
  if (renderPlan.wide) {
    return scene.doorPlanes.map(door => ({
      x: door.side === 'left' ? door.inner[1].x : door.inner[0].x,
      y: scene.shell.y + scene.shell.height * .25,
    }))
  }
  return renderPlan.hingeTracks[0].positions.map(position => ({ x: 622, y: scene.shell.y + scene.shell.height * position / 100 }))
}

/** 由共享布局计划生成主题无关的 Soft-3D 场景，模板和分格数量不写死在皮肤层。 */
export function createFridgeIllustrationPlan(layout: Layout): FridgeIllustrationPlan {
  const renderPlan = createFridgeRenderPlan(layout)
  const scene = sceneFor(renderPlan)
  const cabinetSlotsList = cabinetSlots(renderPlan, scene)
  const shelves = cabinetShelves(cabinetSlotsList, scene.cavities)
  const doors = scene.doorPlanes.map(plane => {
    const segments = plane.side === 'left' ? renderPlan.doorPanels.left : renderPlan.doorPanels.right
    const slots = doorSlots(segments, plane.inner)
    return { ...plane, slots, racks: doorRacks(slots, plane.side, scene.shellAsset === 'dual-cavity') }
  })
  return {
    templateKey: layout.template_key,
    viewBox: scene.viewBox,
    shell: scene.shell,
    cavity: scene.cavity,
    cavities: scene.cavities,
    shellAsset: scene.shellAsset,
    cabinetSlots: cabinetSlotsList,
    cabinetShelves: shelves,
    doors,
    hinges: hinges(scene, renderPlan),
  }
}

export function polygonPoints(points: IllustrationPoint[]): string {
  return points.map(point => `${point.x},${point.y}`).join(' ')
}
