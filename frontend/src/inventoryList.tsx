import { useEffect, useRef, useState } from 'react'
import type { Icon, InventoryBatch, Refrigerator } from './appTypes'
import { CategoryIcon, PageHeader, PageShell } from './sharedUi'
import { filterInventory, readInventorySortKey, saveInventorySortKey, sortInventory, type InventorySortKey } from './inventoryListFilters'
import { getInventoryAddedDaysLabel, getInventoryExpiryLabel } from './inventoryListUtils'

const QUANTITY_SAVE_DELAY_MS = 1_000

function parseQuantity(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null
  const quantity = Number(value)
  return Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : null
}

function SortOptionIcon({ sortKey }: { sortKey: InventorySortKey }) {
  if (sortKey === 'recent') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></svg>
  if (sortKey === 'oldest') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v16H6z" /><path d="M9 8h6M9 12h6M9 16h4" /></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8M8 21h8M8 3c0 4 4 4 4 9s-4 5-4 9M16 3c0 4-4 4-4 9s4 5 4 9" /></svg>
}

export function InventoryList({ inventory, icons, title, slotId, refrigerator, refrigeratorByItemId, onSelectFridge, initialQuery, summaryLabel, loading = false, error = '', emptyMessage, onBack, onAdd, onSelect, onSaveQuantity, onMoveSelected }: {
  inventory: InventoryBatch[]
  icons: Icon[]
  title: string
  slotId?: string
  refrigerator?: Refrigerator
  refrigeratorByItemId?: Record<string, Refrigerator>
  onSelectFridge?: (refrigerator: Refrigerator) => void
  initialQuery?: string
  summaryLabel?: string
  loading?: boolean
  error?: string
  emptyMessage?: string
  onBack: () => void
  onAdd?: () => void
  onSelect: (item: InventoryBatch) => void
  onSaveQuantity: (item: InventoryBatch, quantity: number, refrigerator?: Refrigerator) => Promise<boolean>
  onMoveSelected?: (items: InventoryBatch[], icons: Icon[]) => void
}) {
  const [query, setQuery] = useState(initialQuery ?? '')
  const [sortKey, setSortKey] = useState<InventorySortKey>(readInventorySortKey)
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>(() => Object.fromEntries(inventory.map(item => [item.id, String(item.quantity)])))
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [saveErrors, setSaveErrors] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
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

  const filteredItems = filterInventory(inventory, query, slotId, refrigeratorByItemId)
  const items = sortInventory(filteredItems, sortKey).sort((left, right) => {
    const leftQuantity = parseQuantity(quantityDrafts[left.id] ?? String(left.quantity)) ?? left.quantity
    const rightQuantity = parseQuantity(quantityDrafts[right.id] ?? String(right.quantity)) ?? right.quantity
    return Number(leftQuantity === 0) - Number(rightQuantity === 0)
  })
  const sortLabels: Record<InventorySortKey, string> = { recent: '最近添加', oldest: '最早添加', expiry: '临近过期' }
  const selectedRefrigerator = (item: InventoryBatch) => refrigeratorByItemId?.[item.id] ?? refrigerator
  const selectedItems = inventory.filter(item => selectedIds.has(item.id))
  const emptyText = emptyMessage ?? (query.trim() ? `没有找到包含“${query.trim()}”的物品。` : '这个范围内还没有物品。')
  const selectSort = (key: InventorySortKey) => { setSortKey(key); saveInventorySortKey(key); setSortMenuOpen(false) }
  const toggleSelection = (itemId: string) => setSelectedIds(current => {
    const next = new Set(current)
    if (next.has(itemId)) next.delete(itemId)
    else next.add(itemId)
    return next
  })
  const cancelSelection = () => setSelectedIds(new Set())
  const moveSelected = () => {
    if (!selectedItems.length || !onMoveSelected) return
    const itemsToMove = selectedItems
    cancelSelection()
    onMoveSelected(itemsToMove, icons)
  }
  const sortMenu = <div className="p9-header-menu"><button className="p7-icon-button" type="button" onClick={() => setSortMenuOpen(open => !open)} aria-label="筛选物品" aria-haspopup="menu" aria-expanded={sortMenuOpen}><svg className="p9-menu-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg></button>{sortMenuOpen && <span className="p5-sort-dropdown" role="menu" aria-label="物品排序">{(Object.keys(sortLabels) as InventorySortKey[]).map(key => <button key={key} type="button" role="menuitemradio" aria-checked={sortKey === key} onClick={() => selectSort(key)}><SortOptionIcon sortKey={key} /><span>{sortLabels[key]}</span><span className="p5-sort-check" aria-hidden="true">{sortKey === key && <svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg>}</span></button>)}</span>}</div>
  const footer = selectedItems.length ? <footer className="bottom-action-bar p5-selection-actions"><button type="button" onClick={cancelSelection}>取消</button><button type="button" onClick={moveSelected}>移动</button></footer> : onAdd && <footer className="bottom-action-bar"><button type="button" onClick={onAdd}>＋ 添加物品</button></footer>
  return <PageShell className="p5-flow" header={<PageHeader title={title} onBack={onBack} right={sortMenu} />} bodyClassName="p5-scroll p5-inventory-list" footer={footer}>
    <label className="p5-search p5-inventory-search">
      <svg className="p5-search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
      <input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索物品名称、品牌或备注" aria-label="搜索物品" />
    </label>
    <div className="p5-list-summary"><b>{summaryLabel ?? (query.trim() ? `找到 ${items.length} 件物品` : `共 ${items.length} 件物品`)}</b><span>{!summaryLabel && sortLabels[sortKey]}</span>{summaryLabel && <span>{loading || error ? '' : `${items.length} 条结果`}</span>}</div>
    {loading && <p className="p5-inventory-state" role="status">正在搜索所有冰箱…</p>}
    {error && <p className="p5-inventory-state p5-inventory-state-error" role="alert">{error} 请返回后重试。</p>}
    <section className="p5-inventory-items" aria-live="polite">
      {!loading && !error && items.map(item => {
        const quantity = quantityDrafts[item.id] ?? String(item.quantity)
        const saving = savingIds.has(item.id)
        const saveFailed = saveErrors.has(item.id)
        const displayedQuantity = parseQuantity(quantity) ?? item.quantity
        const isEmpty = displayedQuantity === 0
        const itemRefrigerator = selectedRefrigerator(item)
        const isSelected = selectedIds.has(item.id)
        return <article className={`p5-inventory-item ${isEmpty ? 'is-empty' : ''}`} key={item.id}>
          <button className={`p5-inventory-select ${isSelected ? 'is-selected' : ''}`} type="button" aria-pressed={isSelected} aria-label={isSelected ? '取消选择' : '选择物品'} onClick={() => toggleSelection(item.id)}><CategoryIcon iconKey={item.icon_key} icons={icons} label={item.item_name} />{isSelected && <span className="p5-inventory-select-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg></span>}</button>
          {itemRefrigerator && <button className="p5-inventory-fridge" type="button" onClick={() => onSelectFridge?.(itemRefrigerator)}><span>{itemRefrigerator.name}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg></button>}
          <button className="p5-inventory-open" type="button" onClick={() => onSelect(item)}>
            <span className="p5-inventory-main">
              <strong><span className={isEmpty ? 'p5-inventory-name-is-empty' : ''}>{item.item_name}</span><small className="p5-inventory-category"> · {item.subcategory_name}</small></strong>
              <span className="p5-inventory-meta">
                {!isEmpty && (item.production_date || item.best_before) && <span className="p5-inventory-meta-primary">
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
      {!loading && !error && items.length === 0 && <p className="p5-inventory-empty">{emptyText}</p>}
    </section>
  </PageShell>
}
