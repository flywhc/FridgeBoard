import { useEffect, useRef, useState } from 'react'
import type { Icon, InventoryBatch } from './appTypes'
import { CategoryIcon, PageHeader, PageShell } from './sharedUi'
import { filterInventory } from './inventoryListFilters'
import { getInventoryAddedDaysLabel, getInventoryExpiryLabel } from './inventoryListUtils'

const QUANTITY_SAVE_DELAY_MS = 1_000

function parseQuantity(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null
  const quantity = Number(value)
  return Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : null
}

export function InventoryList({ inventory, icons, title, slotId, onBack, onAdd, onSelect, onSaveQuantity }: {
  inventory: InventoryBatch[]
  icons: Icon[]
  title: string
  slotId?: string
  onBack: () => void
  onAdd: () => void
  onSelect: (item: InventoryBatch) => void
  onSaveQuantity: (item: InventoryBatch, quantity: number) => Promise<boolean>
}) {
  const [query, setQuery] = useState('')
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>(() => Object.fromEntries(inventory.map(item => [item.id, String(item.quantity)])))
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [saveErrors, setSaveErrors] = useState<Set<string>>(new Set())
  const timers = useRef(new Map<string, number>())
  const saveChains = useRef(new Map<string, Promise<void>>())
  const latestInventory = useRef(inventory)
  const latestDrafts = useRef(quantityDrafts)
  const serverQuantities = useRef(Object.fromEntries(inventory.map(item => [item.id, item.quantity])))

  useEffect(() => {
    latestInventory.current = inventory
    for (const item of inventory) serverQuantities.current[item.id] = item.quantity
    setQuantityDrafts(current => {
      const next = { ...current }
      for (const item of inventory) {
        if (serverQuantities.current[item.id] === item.quantity && !timers.current.has(item.id) && !savingIds.has(item.id) && !saveErrors.has(item.id)) next[item.id] = String(item.quantity)
      }
      return next
    })
  }, [inventory, saveErrors, savingIds])

  useEffect(() => {
    latestDrafts.current = quantityDrafts
  }, [quantityDrafts])

  useEffect(() => () => {
    for (const timer of timers.current.values()) window.clearTimeout(timer)
  }, [])

  const queueQuantitySave = (itemId: string) => {
    const previous = saveChains.current.get(itemId) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(async () => {
      const quantity = parseQuantity(latestDrafts.current[itemId] ?? '')
      const item = latestInventory.current.find(value => value.id === itemId)
      if (!item || quantity === null || quantity === serverQuantities.current[itemId]) return
      setSavingIds(current => new Set(current).add(itemId))
      setSaveErrors(current => { const nextErrors = new Set(current); nextErrors.delete(itemId); return nextErrors })
      const saved = await onSaveQuantity(item, quantity).catch(() => false)
      if (saved) {
        serverQuantities.current[itemId] = quantity
        setQuantityDrafts(current => ({ ...current, [itemId]: String(parseQuantity(current[itemId] ?? '') ?? quantity) }))
      } else {
        setSaveErrors(current => new Set(current).add(itemId))
      }
      setSavingIds(current => { const nextIds = new Set(current); nextIds.delete(itemId); return nextIds })
    })
    saveChains.current.set(itemId, next)
    void next.catch(() => undefined).finally(() => {
      if (saveChains.current.get(itemId) === next) saveChains.current.delete(itemId)
    })
  }

  const scheduleQuantitySave = (itemId: string) => {
    const timer = timers.current.get(itemId)
    if (timer !== undefined) window.clearTimeout(timer)
    timers.current.set(itemId, window.setTimeout(() => {
      timers.current.delete(itemId)
      queueQuantitySave(itemId)
    }, QUANTITY_SAVE_DELAY_MS))
  }

  const updateQuantity = (item: InventoryBatch, value: string) => {
    setQuantityDrafts(current => ({ ...current, [item.id]: value }))
    setSaveErrors(current => { const next = new Set(current); next.delete(item.id); return next })
    if (parseQuantity(value) !== null) scheduleQuantitySave(item.id)
  }

  const normalizeQuantity = (item: InventoryBatch) => {
    const value = parseQuantity(latestDrafts.current[item.id] ?? '') ?? serverQuantities.current[item.id] ?? item.quantity
    setQuantityDrafts(current => ({ ...current, [item.id]: String(value) }))
    if (value !== serverQuantities.current[item.id]) scheduleQuantitySave(item.id)
  }

  const items = filterInventory(inventory, query, slotId).sort((left, right) => {
    const leftQuantity = parseQuantity(quantityDrafts[left.id] ?? String(left.quantity)) ?? left.quantity
    const rightQuantity = parseQuantity(quantityDrafts[right.id] ?? String(right.quantity)) ?? right.quantity
    return Number(leftQuantity === 0) - Number(rightQuantity === 0)
  })
  return <PageShell className="p5-flow" header={<PageHeader title={title} onBack={onBack} />} bodyClassName="p5-scroll p5-inventory-list" footer={<footer className="bottom-action-bar"><button type="button" onClick={onAdd}>＋ 添加物品</button></footer>}>
    <label className="p5-search p5-inventory-search">
      <svg className="p5-search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
      <input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索物品名称、品牌或备注" aria-label="搜索物品" />
    </label>
    <p className="p5-list-summary">{query.trim() ? `找到 ${items.length} 件物品` : `共 ${items.length} 件物品`}</p>
    <section className="p5-inventory-items" aria-live="polite">
      {items.map(item => {
        const quantity = quantityDrafts[item.id] ?? String(item.quantity)
        const saving = savingIds.has(item.id)
        const saveFailed = saveErrors.has(item.id)
        const displayedQuantity = parseQuantity(quantity) ?? item.quantity
        const isEmpty = displayedQuantity === 0
        return <article className={`p5-inventory-item ${isEmpty ? 'is-empty' : ''}`} key={item.id}>
          <span className="p5-inventory-icon"><CategoryIcon iconKey={item.icon_key} icons={icons} label={item.item_name} /></span>
          <button className="p5-inventory-open" type="button" onClick={() => onSelect(item)}>
            <span className="p5-inventory-main">
              <strong><span className={isEmpty ? 'p5-inventory-name-is-empty' : ''}>{item.item_name}</span><small className="p5-inventory-category"> · {item.subcategory_name}</small></strong>
              <span className="p5-inventory-meta">
                {(item.production_date || item.best_before) && <span className="p5-inventory-meta-primary">
                  {item.production_date && <small>{getInventoryAddedDaysLabel(item)}</small>}
                  {item.best_before && <small className={`p5-inventory-expiry ${item.expiry_status === 'expired' ? 'is-expired' : item.expiry_status === 'expiring' ? 'is-expiring' : ''}`}>{getInventoryExpiryLabel(item)}</small>}
                </span>}
                {item.product_description && <small className="p5-inventory-note">{item.product_description}</small>}
              </span>
            </span>
          </button>
          <span className={`p5-quantity-control p5-inventory-quantity ${saveFailed ? 'is-error' : ''}`}>
            <button type="button" onClick={() => updateQuantity(item, String(Math.max(0, (parseQuantity(quantity) ?? item.quantity) - 1)))} disabled={saving || (parseQuantity(quantity) ?? item.quantity) <= 0} aria-label={`减少 ${item.item_name} 数量`}>−</button>
            <input className="p5-food-quantity-input" type="number" min="0" inputMode="numeric" value={quantity} onChange={event => updateQuantity(item, event.target.value)} onBlur={() => normalizeQuantity(item)} aria-label={`${item.item_name} 数量`} aria-invalid={parseQuantity(quantity) === null} />
            <button type="button" onClick={() => updateQuantity(item, String((parseQuantity(quantity) ?? item.quantity) + 1))} disabled={saving} aria-label={`增加 ${item.item_name} 数量`}>＋</button>
            {saving && <small>保存中</small>}
            {saveFailed && <small>保存失败</small>}
          </span>
        </article>
      })}
      {items.length === 0 && <p className="p5-inventory-empty">{query.trim() ? `没有找到包含“${query.trim()}”的物品。` : '这个范围内还没有物品。'}</p>}
    </section>
  </PageShell>
}
