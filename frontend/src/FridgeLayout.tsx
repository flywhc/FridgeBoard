/** 共享手机端拟物冰箱布局；首页和库存位置确认页复用同一套几何与格位交互。 */
import type { ReactNode } from 'react'
import { getDoorColdRegion, getDoorGridRows, getDoorTemperatureBoundary } from './fridgeDoorLayout'
import type { Layout, LayoutZone } from './appTypes'

export function OpenFridge({ layout, activeZoneKey, activeSlotId, onSelect, onSelectSlot, renderSlot }: {
  layout: Layout
  activeZoneKey?: string
  activeSlotId?: string
  onSelect?: (key: string) => void
  onSelectSlot?: (slotId: string) => void
  renderSlot?: (slot: LayoutZone['slots'][number]) => ReactNode
}) {
  const cabinetZones = layout.zones.filter(zone => !zone.is_door)
  const door = layout.zones.find(zone => zone.is_door)
  const top = cabinetZones[0]
  const middle = cabinetZones.slice(1, -1)
  const bottom = cabinetZones[cabinetZones.length - 1]
  const wide = layout.template_key === 'side_by_side' || layout.template_key === 'french_door'
  const isMini = layout.template_key === 'mini'
  const doorBands = [...new Map(cabinetZones.map(zone => [zone.geometry.y, zone.geometry.height])).entries()]
    .sort(([left], [right]) => left - right)
  const doorRows = isMini ? '1fr' : doorBands.map(([, height]) => `${height}fr`).join(' ')
  const renderSlots = (zone: LayoutZone) => Array.from({ length: Math.max(zone.slots.length, 1) }, (_, index) => {
    const slot = zone.slots[index]
    const content = slot && renderSlot?.(slot)
    const isSelected = slot?.id === activeSlotId
    const slotClassName = `open-fridge-slot${isSelected ? ' is-selected' : ''}`
    return slot && onSelectSlot
      ? <button type="button" className={slotClassName} key={slot.id} onClick={() => onSelectSlot(slot.id)} aria-label={`选择${zone.label} ${slot.key}`}>{content}</button>
      : <i className={isSelected ? 'is-selected' : undefined} key={index}>{content}</i>
  })
  const doorContent = door ? renderSlots(door) : null
  const activeZoneTrace = <span className="zone-light-trace" aria-hidden="true" />
  const doorColdRegion = getDoorColdRegion(cabinetZones)
  const doorTemperatureBoundary = getDoorTemperatureBoundary(cabinetZones)
  const doorRegionStyle = { top: `${doorColdRegion.y}%`, height: `${doorColdRegion.height}%`, gridTemplateRows: getDoorGridRows(cabinetZones, door?.slots.length ?? 1) }
  const doorContentPanel = door ? <span className="door-cold-zone" style={doorRegionStyle}>{door.key === activeZoneKey ? <span className="door-selection-trace" aria-hidden="true" /> : null}{doorContent}</span> : null
  const frozenDoorPanel = <span className="door-frozen-zone" aria-hidden="true" />
  const doorDivider = doorTemperatureBoundary === null ? null : <span className="door-temperature-divider" style={{ top: `calc(${doorTemperatureBoundary}% - 1.5px)` }} aria-hidden="true" />
  const doorPanel = door && onSelect
    ? <button type="button" className={`door-zone ${door.temperature_mode} ${door.key === activeZoneKey ? 'is-active' : ''}`} onClick={() => onSelect(door.key)} aria-label={`${door.label}，${door.slots.length} 格`}>{frozenDoorPanel}{doorContentPanel}{doorDivider}</button>
    : door ? <span className={`door-zone ${door.temperature_mode}`}>{frozenDoorPanel}{doorContentPanel}{doorDivider}</span> : <div className="door-empty" />
  const zoneStyle = (item: LayoutZone) => item.geometry.layout_kind === 'single_row'
    ? { gridTemplateRows: '1fr', gridTemplateColumns: `repeat(${Math.max(item.slots.length, 1)}, minmax(0, 1fr))`, gridAutoFlow: 'column' as const }
    : { gridTemplateRows: `repeat(${Math.max(item.slots.length, 1)}, minmax(0, 1fr))` }
  const zone = (item: LayoutZone, compact = false) => onSelect
    ? <button type="button" key={item.key} onClick={() => onSelect(item.key)} className={`open-fridge-zone ${item.temperature_mode} ${item.geometry.layout_kind === 'single_row' ? 'is-row' : ''} ${item.key === activeZoneKey ? 'is-active' : ''} ${compact ? 'is-compact' : ''}`} style={zoneStyle(item)} aria-label={`${item.label}，${item.slots.length} 格`}>{item.key === activeZoneKey ? activeZoneTrace : null}{renderSlots(item)}</button>
    : <span key={item.key} className={`open-fridge-zone ${item.temperature_mode} ${item.geometry.layout_kind === 'single_row' ? 'is-row' : ''} ${compact ? 'is-compact' : ''}`} style={zoneStyle(item)}>{renderSlots(item)}</span>
  const wideZone = (item: LayoutZone) => onSelect
    ? <button type="button" key={item.key} onClick={() => onSelect(item.key)} className={`open-fridge-wide-zone ${item.temperature_mode} ${item.key === activeZoneKey ? 'is-active' : ''}`} style={{ left: `${item.geometry.x}%`, top: `${item.geometry.y}%`, width: `${item.geometry.width}%`, height: `${item.geometry.height}%`, gridTemplateRows: `repeat(${Math.max(item.slots.length, 1)}, minmax(0, 1fr))` }} aria-label={`${item.label}，${item.slots.length} 格`}>{item.key === activeZoneKey ? activeZoneTrace : null}{renderSlots(item)}</button>
    : <span key={item.key} className={`open-fridge-wide-zone ${item.temperature_mode}`} style={{ left: `${item.geometry.x}%`, top: `${item.geometry.y}%`, width: `${item.geometry.width}%`, height: `${item.geometry.height}%`, gridTemplateRows: `repeat(${Math.max(item.slots.length, 1)}, minmax(0, 1fr))` }}>{renderSlots(item)}</span>
  if (wide) return <div className={`open-fridge open-fridge-wide ${layout.template_key}`} aria-label="冰箱布局预览">
    <div className="open-fridge-cabinet">{cabinetZones.map(wideZone)}</div>
    <span className="open-fridge-hinges" aria-hidden="true"><i /><i /></span>
    <div className="open-fridge-door" aria-label="冰箱门">{doorPanel}</div>
  </div>
  return <div className={`open-fridge ${layout.template_key}`} aria-label="冰箱布局预览">
    <div className={`open-fridge-cabinet ${middle.length ? 'has-middle' : 'two-zone'}`} style={{ gridTemplateRows: doorRows }}>
      {top && zone(top)}
      {middle.length ? <div className={`open-fridge-middle ${middle.length === 1 ? 'is-single' : ''}`}>{middle.map(item => zone(item, true))}</div> : null}
      {bottom && zone(bottom)}
    </div>
    <span className="open-fridge-hinges" aria-hidden="true"><i /><i /></span>
    <div className="open-fridge-door" aria-label="冰箱门">{doorPanel}</div>
  </div>
}
