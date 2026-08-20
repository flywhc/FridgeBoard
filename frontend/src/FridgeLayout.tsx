/** 共享手机端拟物冰箱布局；首页和库存位置确认页复用同一套几何与格位交互。 */
import type { CSSProperties, ReactNode } from 'react'
import { createFridgeRenderPlan } from './fridgeLayoutPlan'
import type { FridgeDoorSegment, FridgeWideZone } from './fridgeLayoutPlan'
import type { Layout, LayoutZone } from './appTypes'
import { FridgeIllustrationPreview } from './fridgeIllustrationPreview'
import { useTheme } from './theme'
import type { HorizontalSwipeHandlers } from './horizontalSwipe'

export type FridgePreviewVariant = 'setup' | 'editor' | 'location' | 'home' | 'thumbnail'
type SlotRenderContext = { layoutKind: LayoutZone['geometry']['layout_kind']; slotIndex: number; slotCount: number }
type OpenFridgeProps = {
  layout: Layout
  activeZoneKey?: string
  activeSlotId?: string
  onSelect?: (key: string) => void
  onSelectSlot?: (slotId: string) => void
  renderSlot?: (slot: LayoutZone['slots'][number], context: SlotRenderContext) => ReactNode
}
type DoorPanelProps = {
  segments: FridgeDoorSegment[]
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
  const plan = createFridgeRenderPlan(layout)
  const shellGeometry = plan.shell
  const shellColumns = shellGeometry.columns.map((value, index) => index % 2
    ? `${value}px`
    : `minmax(0, ${value}fr)`).join(' ')
  const shellStyle = {
    '--fridge-shell-width': `${shellGeometry.width}px`,
    '--fridge-shell-aspect': `${shellGeometry.width} / ${shellGeometry.height}`,
    '--fridge-shell-ratio': `${shellGeometry.width / shellGeometry.height}`,
    '--fridge-shell-columns': shellColumns,
  } as CSSProperties
  const renderSlots = (zone: LayoutZone, slots = zone.slots) => slots.map((slot, index) => {
    const content = renderSlot?.(slot, { layoutKind: zone.geometry.layout_kind, slotIndex: index, slotCount: slots.length })
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
  const wideZone = ({ zone: item, x, y, width, height }: FridgeWideZone) => onSelect
    ? <button type="button" key={item.key} onClick={() => onSelect(item.key)} className={`open-fridge-wide-zone ${item.temperature_mode} ${item.key === activeZoneKey ? 'is-active' : ''} ${item.slots.length === 0 ? 'is-unavailable' : ''}`} style={{ left: `${x}%`, top: `${y}%`, width: `${width}%`, height: `${height}%`, gridTemplateRows: `repeat(${Math.max(item.slots.length, 1)}, minmax(0, 1fr))` }} aria-label={`${item.label}，${slotCountLabel(item)}`}>{item.key === activeZoneKey ? activeZoneTrace : null}{renderSlots(item)}</button>
    : <span key={item.key} className={`open-fridge-wide-zone ${item.temperature_mode} ${item.slots.length === 0 ? 'is-unavailable' : ''}`} style={{ left: `${x}%`, top: `${y}%`, width: `${width}%`, height: `${height}%`, gridTemplateRows: `repeat(${Math.max(item.slots.length, 1)}, minmax(0, 1fr))` }}>{renderSlots(item)}</span>
  if (plan.wide) {
    return <div className={`open-fridge open-fridge-wide ${layout.template_key}`} style={shellStyle} aria-label="冰箱布局预览">
      <DoorPanel segments={plan.doorPanels.left} label="左侧冰箱门" mirrored activeZoneKey={activeZoneKey} onSelect={onSelect} renderSlots={renderSlots} />
      <span className="open-fridge-hinges" aria-hidden="true"><i /><i /></span>
      <div className="open-fridge-cabinet">{plan.cabinetZones.map(wideZone)}</div>
      <span className="open-fridge-hinges" aria-hidden="true"><i /><i /></span>
      <DoorPanel segments={plan.doorPanels.right} label="右侧冰箱门" activeZoneKey={activeZoneKey} onSelect={onSelect} renderSlots={renderSlots} />
    </div>
  }
  return <div className={`open-fridge ${layout.template_key}`} style={shellStyle} aria-label="冰箱布局预览">
    <div className="open-fridge-cabinet" style={{ gridTemplateRows: plan.cabinetBands.map(band => `${band.height}fr`).join(' ') }}>
      {plan.cabinetBands.map(band => <div
        className="open-fridge-band"
        key={band.zones.map(item => item.zone.key).join(':')}
        style={{ gridTemplateColumns: band.zones.map(item => `${item.width}fr`).join(' ') }}
      >{band.zones.map(item => zone(item.zone, true))}</div>)}
    </div>
    <span className="open-fridge-hinges" aria-hidden="true"><i /><i /></span>
    <DoorPanel segments={plan.doorPanels.right} label="冰箱门" activeZoneKey={activeZoneKey} onSelect={onSelect} renderSlots={renderSlots} />
  </div>
}

/** 为各页面提供统一的预览尺寸边界，并按主题选择插图皮肤或语义 DOM 回退。 */
export function FridgePreviewFrame({ variant, className = '', ...props }: OpenFridgeProps & {
  variant: FridgePreviewVariant
  className?: string
  swipeHandlers?: HorizontalSwipeHandlers
}) {
  const theme = useTheme()
  const { swipeHandlers, ...openFridgeProps } = props
  const classes = `fridge-preview-frame fridge-preview-frame--${variant} ${openFridgeProps.layout.template_key} ${className}`.trim()
  const fallback = <OpenFridge {...openFridgeProps} />
  const useIllustration = theme === 'skeuomorphic'
    && variant !== 'thumbnail'
  return <div className={classes} aria-hidden={variant === 'thumbnail' || undefined} data-fridge-renderer={useIllustration ? 'illustration' : 'dom'} {...swipeHandlers}>
    {useIllustration ? <FridgeIllustrationPreview variant={variant} layout={openFridgeProps.layout} activeZoneKey={openFridgeProps.activeZoneKey} activeSlotId={openFridgeProps.activeSlotId} onSelect={openFridgeProps.onSelect} onSelectSlot={openFridgeProps.onSelectSlot} renderSlot={openFridgeProps.renderSlot} /> : fallback}
  </div>
}
