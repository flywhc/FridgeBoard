/** 共享手机端拟物冰箱布局；首页和库存位置确认页复用同一套几何与格位交互。 */
import type { CSSProperties, ReactNode } from 'react'
import { getDoorColdRegion } from './fridgeDoorLayout'
import { getFridgeShellGeometry, getFridgeZoneRows } from './fridgeGeometry'
import type { Layout, LayoutZone } from './appTypes'

type DoorSegment = { zone: LayoutZone; slots: LayoutZone['slots']; top: number; height: number }
export type FridgePreviewVariant = 'setup' | 'editor' | 'location' | 'home' | 'thumbnail'
type OpenFridgeProps = {
  layout: Layout
  activeZoneKey?: string
  activeSlotId?: string
  onSelect?: (key: string) => void
  onSelectSlot?: (slotId: string) => void
  renderSlot?: (slot: LayoutZone['slots'][number]) => ReactNode
}
type DoorPanelProps = {
  segments: DoorSegment[]
  label: string
  mirrored?: boolean
  activeZoneKey?: string
  onSelect?: (key: string) => void
  renderSlots: (zone: LayoutZone, slots: LayoutZone['slots']) => ReactNode
}

function DoorPanel({ segments, label, mirrored = false, activeZoneKey, onSelect, renderSlots }: DoorPanelProps) {
  return <div className={`open-fridge-door ${mirrored ? 'open-fridge-door--left' : ''}`} aria-label={label}>{segments.map(({ zone, slots, top, height }) => {
    const unavailable = zone.slots.length === 0
    const className = `door-segment ${zone.temperature_mode} ${zone.key === activeZoneKey ? 'is-active' : ''} ${unavailable ? 'is-unavailable' : ''}`
    const partialDoorStyle = segments.length === 1 ? {
      borderTop: top > 0 ? '3px solid var(--ink)' : undefined,
      borderBottom: top + height < 100 ? '3px solid var(--ink)' : undefined,
    } : {}
    const style = { top: `${top}%`, height: `${height}%`, gridTemplateRows: `repeat(${Math.max(slots.length, 1)}, minmax(0, 1fr))`, ...partialDoorStyle }
    const content = <>{zone.key === activeZoneKey ? <span className="zone-light-trace" aria-hidden="true" /> : null}{renderSlots(zone, slots)}</>
    return onSelect
      ? <button type="button" key={zone.key} className={className} style={style} onClick={() => onSelect(zone.key)} aria-label={`${zone.label}，${unavailable ? '不可用' : `${zone.slots.length} 格`}`}>{content}</button>
      : <span key={zone.key} className={className} style={style}>{content}</span>
  })}</div>
}

export function OpenFridge({ layout, activeZoneKey, activeSlotId, onSelect, onSelectSlot, renderSlot }: OpenFridgeProps) {
  const cabinetZones = layout.zones.filter(zone => !zone.is_door)
  const doorZones = layout.zones.filter(zone => zone.is_door)
  const top = cabinetZones[0]
  const middle = cabinetZones.slice(1, -1)
  const bottom = cabinetZones[cabinetZones.length - 1]
  const wide = layout.template_key === 'side_by_side' || layout.template_key === 'french_door'
  const doorRows = getFridgeZoneRows(layout.template_key, cabinetZones)
  const shellGeometry = getFridgeShellGeometry(layout.template_key)
  const shellStyle = {
    '--fridge-shell-width': `${shellGeometry.width}px`,
    '--fridge-shell-aspect': `${shellGeometry.width} / ${shellGeometry.height}`,
    '--fridge-shell-ratio': `${shellGeometry.width / shellGeometry.height}`,
    '--fridge-shell-columns': shellGeometry.columns.join(' '),
  } as CSSProperties
  const renderSlots = (zone: LayoutZone, slots = zone.slots) => slots.map((slot, index) => {
    const content = renderSlot?.(slot)
    const isSelected = slot.id === activeSlotId
    const slotClassName = `open-fridge-slot${isSelected ? ' is-selected' : ''}`
    const slotSelectionTrace = isSelected ? <span className="zone-light-trace zone-light-trace--inner" aria-hidden="true" /> : null
    return onSelectSlot
      ? <button type="button" className={slotClassName} key={slot.id} onClick={() => onSelectSlot(slot.id)} aria-label={`选择${zone.label} ${slot.key}`}>{slotSelectionTrace}{content}</button>
      : <i className={isSelected ? 'is-selected' : undefined} key={index}>{content}</i>
  })
  const activeZoneTrace = <span className="zone-light-trace" aria-hidden="true" />
  const slotCountLabel = (zone: LayoutZone) => zone.slots.length === 0 ? '不可用' : `${zone.slots.length} 格`
  const zoneStyle = (item: LayoutZone) => item.geometry.layout_kind === 'single_row'
    ? { gridTemplateRows: '1fr', gridTemplateColumns: `repeat(${Math.max(item.slots.length, 1)}, minmax(0, 1fr))`, gridAutoFlow: 'column' as const }
    : { gridTemplateRows: `repeat(${Math.max(item.slots.length, 1)}, minmax(0, 1fr))` }
  const zone = (item: LayoutZone, compact = false) => onSelect
    ? <button type="button" key={item.key} onClick={() => onSelect(item.key)} className={`open-fridge-zone ${item.temperature_mode} ${item.geometry.layout_kind === 'single_row' ? 'is-row' : ''} ${item.key === activeZoneKey ? 'is-active' : ''} ${item.slots.length === 0 ? 'is-unavailable' : ''} ${compact ? 'is-compact' : ''}`} style={zoneStyle(item)} aria-label={`${item.label}，${slotCountLabel(item)}`}>{item.key === activeZoneKey ? activeZoneTrace : null}{renderSlots(item)}</button>
    : <span key={item.key} className={`open-fridge-zone ${item.temperature_mode} ${item.geometry.layout_kind === 'single_row' ? 'is-row' : ''} ${item.slots.length === 0 ? 'is-unavailable' : ''} ${compact ? 'is-compact' : ''}`} style={zoneStyle(item)}>{renderSlots(item)}</span>
  const wideZone = (item: LayoutZone) => onSelect
    ? <button type="button" key={item.key} onClick={() => onSelect(item.key)} className={`open-fridge-wide-zone ${item.temperature_mode} ${item.key === activeZoneKey ? 'is-active' : ''} ${item.slots.length === 0 ? 'is-unavailable' : ''}`} style={{ left: `${item.geometry.x}%`, top: `${item.geometry.y}%`, width: `${item.geometry.width}%`, height: `${item.geometry.height}%`, gridTemplateRows: `repeat(${Math.max(item.slots.length, 1)}, minmax(0, 1fr))` }} aria-label={`${item.label}，${slotCountLabel(item)}`}>{item.key === activeZoneKey ? activeZoneTrace : null}{renderSlots(item)}</button>
    : <span key={item.key} className={`open-fridge-wide-zone ${item.temperature_mode} ${item.slots.length === 0 ? 'is-unavailable' : ''}`} style={{ left: `${item.geometry.x}%`, top: `${item.geometry.y}%`, width: `${item.geometry.width}%`, height: `${item.geometry.height}%`, gridTemplateRows: `repeat(${Math.max(item.slots.length, 1)}, minmax(0, 1fr))` }}>{renderSlots(item)}</span>
  const legacyDoorRegion = doorZones.length === 1 && doorZones[0].key === 'door'
    ? getDoorColdRegion(cabinetZones)
    : null
  const segmentGeometry = (doorZone: LayoutZone) => {
    if (layout.template_key === 'mini') {
      return doorZone.key === 'door' ? { y: 50, height: 50 } : { y: 0, height: 50 }
    }
    return legacyDoorRegion
      ? legacyDoorRegion
      : { y: doorZone.geometry.y, height: doorZone.geometry.height }
  }
  if (wide) {
    const leftSegments: DoorSegment[] = []
    const rightSegments: DoorSegment[] = []
    for (const doorZone of doorZones) {
      const geometry = segmentGeometry(doorZone)
      if (layout.template_key === 'side_by_side') {
        const target = doorZone.key === 'door' || doorZone.geometry.x >= 50 ? rightSegments : leftSegments
        target.push({ zone: doorZone, slots: doorZone.slots, top: geometry.y, height: geometry.height })
      } else {
        const splitIndex = Math.ceil(doorZone.slots.length / 2)
        leftSegments.push({ zone: doorZone, slots: doorZone.slots.slice(0, splitIndex), top: geometry.y, height: geometry.height })
        rightSegments.push({ zone: doorZone, slots: doorZone.slots.slice(splitIndex), top: geometry.y, height: geometry.height })
      }
    }
    return <div className={`open-fridge open-fridge-wide ${layout.template_key}`} style={shellStyle} aria-label="冰箱布局预览">
      <DoorPanel segments={leftSegments} label="左侧冰箱门" mirrored activeZoneKey={activeZoneKey} onSelect={onSelect} renderSlots={renderSlots} />
      <span className="open-fridge-hinges" aria-hidden="true"><i /><i /></span>
      <div className="open-fridge-cabinet">{cabinetZones.map(wideZone)}</div>
      <span className="open-fridge-hinges" aria-hidden="true"><i /><i /></span>
      <DoorPanel segments={rightSegments} label="右侧冰箱门" activeZoneKey={activeZoneKey} onSelect={onSelect} renderSlots={renderSlots} />
    </div>
  }
  const doorSegments = doorZones.map(doorZone => {
    const geometry = segmentGeometry(doorZone)
    return { zone: doorZone, slots: doorZone.slots, top: geometry.y, height: geometry.height }
  })
  return <div className={`open-fridge ${layout.template_key}`} style={shellStyle} aria-label="冰箱布局预览">
    <div className={`open-fridge-cabinet ${middle.length ? 'has-middle' : 'two-zone'}`} style={{ gridTemplateRows: doorRows }}>
      {top && zone(top)}
      {middle.length ? <div className={`open-fridge-middle ${middle.length === 1 ? 'is-single' : ''}`}>{middle.map(item => zone(item, true))}</div> : null}
      {bottom && zone(bottom)}
    </div>
    <span className="open-fridge-hinges" aria-hidden="true"><i /><i /></span>
    <DoorPanel segments={doorSegments} label="冰箱门" activeZoneKey={activeZoneKey} onSelect={onSelect} renderSlots={renderSlots} />
  </div>
}

/** 为各页面提供统一的预览尺寸边界，内部冰箱始终由 OpenFridge 绘制。 */
export function FridgePreviewFrame({ variant, className = '', ...props }: OpenFridgeProps & {
  variant: FridgePreviewVariant
  className?: string
}) {
  const classes = `fridge-preview-frame fridge-preview-frame--${variant} ${props.layout.template_key} ${className}`.trim()
  return <div className={classes} aria-hidden={variant === 'thumbnail' || undefined}><OpenFridge {...props} /></div>
}
