import { useEffect, useMemo, useState } from 'react'
import type { Icon, InventoryBatch, Layout, Refrigerator } from './appTypes'
import { request } from './appApi'
import { FridgePreviewFrame } from './FridgeLayout'
import { formatStorageSlotLabel } from './inventoryListFilters'
import { getInventorySelectionSummary } from './inventorySelection'
import { CategoryIcon, Dialog, PageHeader, PageShell } from './sharedUi'

type InventoryMoveFlowProps = {
  items: InventoryBatch[]
  icons: Icon[]
  refrigerators: Refrigerator[]
  currentRefrigeratorId: string
  onClose: () => void
  onComplete: () => Promise<void> | void
}

function CheckIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
}

export function InventoryMoveFlow({ items, icons, refrigerators, currentRefrigeratorId, onClose, onComplete }: InventoryMoveFlowProps) {
  const [target, setTarget] = useState<Refrigerator | null>(null)
  const [layout, setLayout] = useState<Layout | null>(null)
  const [selectedSlotId, setSelectedSlotId] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!target) return
    let active = true
    void request<Layout>(`/api/owner/refrigerators/${target.id}/layout`).then(nextLayout => {
      if (!active) return
      setLayout(nextLayout)
      setSelectedSlotId(nextLayout.zones.flatMap(zone => zone.slots)[0]?.id ?? '')
    }).catch(reason => {
      if (!active) return
      setLayout(null)
      setSelectedSlotId('')
      setError((reason as Error).message || '暂时无法读取目标冰箱布局。')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [target])

  const chooseTarget = (refrigerator: Refrigerator) => {
    setTarget(refrigerator)
    setLayout(null)
    setSelectedSlotId('')
    setLoading(true)
    setError('')
  }

  const selectedSlot = useMemo(
    () => layout?.zones.flatMap(zone => zone.slots.map(slot => ({ slot, zone }))).find(item => item.slot.id === selectedSlotId),
    [layout, selectedSlotId],
  )

  const move = async () => {
    if (!target || !selectedSlotId || saving) return
    setSaving(true)
    setError('')
    try {
      await request<InventoryBatch[]>('/api/owner/inventory/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_refrigerator_id: target.id, storage_slot_id: selectedSlotId, batch_ids: items.map(item => item.id) }),
      })
      await onComplete()
    } catch (reason) {
      setError((reason as Error).message || '移动失败，请稍后重试。')
    } finally {
      setSaving(false)
    }
  }

  if (target && layout) {
    return <div className="p5-move-location-layer">
      <PageShell className="p5-flow p5-move-location-flow" header={<PageHeader title="确认位置" onBack={() => { setTarget(null); setLayout(null); setError('') }} />} bodyClassName="p5-scroll p5-location" footer={<footer className="bottom-action-bar"><button type="button" disabled={!selectedSlotId || saving} onClick={() => void move()}>{saving ? '移动中…' : '确认移动'}</button></footer>}>
        <FridgePreviewFrame variant="location" className="p5-location-preview" layout={layout} activeSlotId={selectedSlotId} onSelectSlot={setSelectedSlotId} />
        <b className="p5-location-label">{selectedSlot ? formatStorageSlotLabel(selectedSlot.zone.label, selectedSlot.slot.key, selectedSlot.slot.custom_name) : '请选择一个分区'}</b>
        <p>点击目标分区或点下面确认按钮</p>
        <div className="p5-food-summary p5-move-summary"><span><CategoryIcon iconKey={items[0]?.icon_key ?? null} icons={icons} label={items[0]?.item_name} /></span><div><strong>{getInventorySelectionSummary(items)}</strong></div></div>
        {error && <p className="p5-inline-notice" role="alert">{error}</p>}
      </PageShell>
    </div>
  }

  return <Dialog title="选择目标冰箱" onClose={onClose} closeLabel="关闭移动" className="p5-move-modal" dialogClassName="p5-move-dialog">
      <p className="p5-move-description">请选择要移动到的冰箱。</p>
      <div className="p5-move-fridge-list">
        {refrigerators.map(refrigerator => {
          const isCurrent = refrigerator.id === currentRefrigeratorId
          return <button className="p5-move-fridge-row" type="button" key={refrigerator.id} onClick={() => chooseTarget(refrigerator)}><span className="p5-move-fridge-check">{isCurrent && <CheckIcon />}</span><span className="p5-move-fridge-name">{refrigerator.name}</span><b aria-hidden="true">›</b></button>
        })}
      </div>
      {loading && <p className="p5-inventory-state">正在读取冰箱布局…</p>}
      {error && <p className="p5-inline-notice" role="alert">{error}</p>}
  </Dialog>
}
