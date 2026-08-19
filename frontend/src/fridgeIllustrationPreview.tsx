import type { CSSProperties, ReactNode } from 'react'
import type { Layout, LayoutZone } from './appTypes'
import singleCavityShellAsset from './assets/fridge/empty-fridge-soft3d-top-freezer-single.webp'
import dualCavityShellAsset from './assets/fridge/empty-fridge-soft3d-wide-double-door-v1.webp'
import type { FridgePreviewVariant } from './FridgeLayout'
import { createFridgeIllustrationPlan, polygonPoints, type IllustrationDoorRack, type IllustrationDoorSlot, type IllustrationSlot } from './fridgeIllustrationPlan'

type SlotRenderContext = { layoutKind: LayoutZone['geometry']['layout_kind']; slotIndex: number; slotCount: number }

type FridgeIllustrationPreviewProps = {
  layout: Layout
  variant: FridgePreviewVariant
  activeZoneKey?: string
  activeSlotId?: string
  onSelect?: (zoneKey: string) => void
  onSelectSlot?: (slotId: string) => void
  renderSlot?: (slot: LayoutZone['slots'][number], context: SlotRenderContext) => ReactNode
}

function DoorRack({ rack }: { rack: IllustrationDoorRack }) {
  const [, , bottomRight, bottomLeft] = rack.polygon
  return <g className={`fridge-illustration-rack fridge-illustration-rack--${rack.material}`}>
    <path
      className="fridge-illustration-rack-shadow"
      d={`M ${bottomLeft.x} ${bottomLeft.y + 4} L ${bottomRight.x} ${bottomRight.y + 4}`}
    />
    <polygon points={polygonPoints(rack.polygon)} />
    {rack.material === 'white' && <>
      <path className="fridge-illustration-rack-edge fridge-illustration-rack-edge--top" d={`M ${rack.topEdge[0].x} ${rack.topEdge[0].y} L ${rack.topEdge[1].x} ${rack.topEdge[1].y}`} />
    </>}
    <path className="fridge-illustration-rack-edge fridge-illustration-rack-edge--bottom" d={`M ${bottomLeft.x} ${bottomLeft.y} L ${bottomRight.x} ${bottomRight.y}`} />
  </g>
}

function overlayStyle(slot: IllustrationSlot, width: number, height: number): CSSProperties {
  return {
    left: `${slot.x / width * 100}%`,
    top: `${slot.y / height * 100}%`,
    width: `${slot.width / width * 100}%`,
    height: `${slot.height / height * 100}%`,
  }
}

function doorOverlayStyle(slot: IllustrationDoorSlot, width: number, height: number): CSSProperties {
  const points = slot.polygon.map(point => `${(point.x - slot.x) / slot.width * 100}% ${(point.y - slot.y) / slot.height * 100}%`).join(', ')
  return { ...overlayStyle(slot, width, height), clipPath: `polygon(${points})` }
}

/** 渲染共享布局计划映射出的 Soft-3D 皮肤，格位内容和交互仍由 DOM 承载。 */
export function FridgeIllustrationPreview({ layout, activeZoneKey, activeSlotId, onSelect, onSelectSlot, renderSlot }: FridgeIllustrationPreviewProps) {
  const plan = createFridgeIllustrationPlan(layout)
  const shellAsset = plan.shellAsset === 'dual-cavity' ? dualCavityShellAsset : singleCavityShellAsset
  const allSlots = [...plan.cabinetSlots, ...plan.doors.flatMap(door => door.slots)]
  const layoutSlot = new Map(layout.zones.flatMap(zone => zone.slots.map(slot => [slot.id, slot] as const)))
  const renderOverlaySlot = (slot: IllustrationSlot, door = false) => {
    const source = layoutSlot.get(slot.id)
    if (!source) return null
    const zoneSlots = allSlots.filter(item => item.zoneKey === slot.zoneKey)
    const content = renderSlot?.(source, {
      layoutKind: slot.layoutKind,
      slotIndex: zoneSlots.findIndex(item => item.id === slot.id),
      slotCount: zoneSlots.length,
    })
    const className = `fridge-illustration-slot${slot.id === activeSlotId || slot.zoneKey === activeZoneKey ? ' is-active' : ''}${door ? ' is-door-slot' : ''}`
    const style = door
      ? doorOverlayStyle(slot as IllustrationDoorSlot, plan.viewBox.width, plan.viewBox.height)
      : overlayStyle(slot, plan.viewBox.width, plan.viewBox.height)
    if (onSelectSlot) {
      return <button aria-label={`选择${slot.zoneLabel} ${slot.key}`} className={className} key={slot.id} onClick={() => onSelectSlot(slot.id)} style={style} type="button">{content}</button>
    }
    if (onSelect) {
      return <button aria-label={`选择${slot.zoneLabel}`} className={className} key={slot.id} onClick={() => onSelect(slot.zoneKey)} style={style} type="button">{content}</button>
    }
    return <span className={className} key={slot.id} style={style}>{content}</span>
  }

  return <div
    className="fridge-illustration-preview fridge-illustration-preview--skeuomorphic"
    data-illustration-template={layout.template_key}
    style={{
      '--fridge-illustration-aspect': `${plan.viewBox.width} / ${plan.viewBox.height}`,
      '--fridge-illustration-ratio': plan.viewBox.width / plan.viewBox.height,
    } as CSSProperties}
  >
    <svg aria-hidden="true" className="fridge-illustration-art" viewBox={`0 0 ${plan.viewBox.width} ${plan.viewBox.height}`}>
      <defs>
        <linearGradient id="soft-glass" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#ffffff" stopOpacity=".18" /><stop offset=".52" stopColor="#fbffff" stopOpacity=".28" /><stop offset="1" stopColor="#edf8f5" stopOpacity=".42" /></linearGradient>
        <linearGradient id="soft-white-shelf-top" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#c7c0b4" stopOpacity=".62" /><stop offset=".2" stopColor="#d8d1c6" stopOpacity=".68" /><stop offset=".62" stopColor="#e1dbd1" stopOpacity=".86" /><stop offset="1" stopColor="#e8e2d8" /></linearGradient>
        <filter id="shelf-shadow" height="220%" width="120%" x="-10%" y="-60%"><feDropShadow dx="0" dy="5" floodColor="#4d4b43" floodOpacity=".22" stdDeviation="4" /></filter>
        <filter id="rack-bottom-shadow" height="500%" width="120%" x="-10%" y="-200%"><feGaussianBlur stdDeviation="3" /></filter>
      </defs>
      <image href={shellAsset} height={plan.viewBox.height} width={plan.viewBox.width} />
      {plan.cabinetShelves.map((shelf, shelfIndex) => shelf.material === 'white'
        ? <g className="fridge-illustration-shelf fridge-illustration-shelf--white" key={`shelf-${shelf.slotId}-${shelfIndex}`}>
          <polygon fill="url(#soft-white-shelf-top)" points={polygonPoints(shelf.polygon)} stroke="none" />
          <polygon
            fill="#f5f1e8"
            points={polygonPoints([
              shelf.frontEdge[0],
              shelf.frontEdge[1],
              { x: shelf.frontEdge[1].x, y: shelf.frontEdge[1].y + 18 },
              { x: shelf.frontEdge[0].x, y: shelf.frontEdge[0].y + 18 },
            ])}
            stroke="none"
          />
        </g>
        : <g className="fridge-illustration-shelf fridge-illustration-shelf--glass" filter="url(#shelf-shadow)" key={`shelf-${shelf.slotId}-${shelfIndex}`}>
          <polygon fill="url(#soft-glass)" points={polygonPoints(shelf.polygon)} stroke="#d4e2dd" strokeOpacity=".82" strokeWidth="3" />
          <path d={`M ${shelf.frontEdge[0].x} ${shelf.frontEdge[0].y} L ${shelf.frontEdge[1].x} ${shelf.frontEdge[1].y}`} stroke="#dce9e4" strokeOpacity=".78" strokeWidth="9" />
          <path d={`M ${shelf.frontEdge[0].x} ${shelf.frontEdge[0].y - 3} L ${shelf.frontEdge[1].x} ${shelf.frontEdge[1].y - 3}`} stroke="#f9ffff" strokeOpacity=".9" strokeWidth="3" />
        </g>)}
      {plan.doors.flatMap(door => door.racks).map(rack => <DoorRack key={`rack-${rack.slotId}`} rack={rack} />)}
    </svg>
    <div className="fridge-illustration-overlay" aria-label="冰箱布局交互">
      {plan.cabinetSlots.map(slot => renderOverlaySlot(slot))}
      {plan.doors.flatMap(door => door.slots).map(slot => renderOverlaySlot(slot, true))}
    </div>
  </div>
}
