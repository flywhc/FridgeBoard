import { useEffect, useRef, useState } from 'react'
import type { Category, Icon, InventoryBatch, LayoutSlot, Refrigerator } from './appTypes'
import { CategoryPickerPanel } from './CategoryPickerPanel'
import { CategoryIcon, Dialog, PageHeader, PageShell } from './sharedUi'
import { filterInventory, readInventorySortKey, saveInventorySortKey, sortInventory, type InventoryExpiryStatus, type InventorySortKey } from './inventoryListFilters'
import { countActiveInventoryItems, formatInventoryPrice, getInventoryAddedDaysLabel, getInventoryExpiryLabel, sumInventoryPrices } from './inventoryListUtils'
import { getInventorySelectionSummary } from './inventorySelection'
import { useDismissibleMenu } from './menuBehavior'
import { QuantityStepper } from './sharedUi'
import { formatQuantity, parseQuantity, stepQuantity } from './quantity'

const QUANTITY_SAVE_DELAY_MS = 1_000

function SortOptionIcon({ sortKey }: { sortKey: InventorySortKey }) {
  if (sortKey === 'recent') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></svg>
  if (sortKey === 'oldest') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v16H6z" /><path d="M9 8h6M9 12h6M9 16h4" /></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8M8 21h8M8 3c0 4 4 4 4 9s-4 5-4 9M16 3c0 4-4 4-4 9s4 5 4 9" /></svg>
}

function uniqueCategories(categories: Category[]): Category[] {
  const seen = new Set<string>()
  return categories.filter(category => {
    const key = category.name.trim()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function InventoryList({ inventory, icons, categories = [], title, slotId, slot, refrigerator, refrigeratorByItemId, onSelectFridge, onRenameSlot, initialQuery, expiryStatus, summaryLabel, loading = false, error = '', emptyMessage, onBack, onAdd, onSelect, onSaveQuantity, onMoveSelected, onDeleteSelected, onClassifySelected, onAddGroup, onAddSubcategory }: {
  inventory: InventoryBatch[]
  icons: Icon[]
  categories?: Category[]
  title: string
  slotId?: string
  slot?: LayoutSlot
  refrigerator?: Refrigerator
  refrigeratorByItemId?: Record<string, Refrigerator>
  onSelectFridge?: (refrigerator: Refrigerator) => void
  onRenameSlot?: (slotId: string, name: string) => Promise<string | null>
  initialQuery?: string
  expiryStatus?: InventoryExpiryStatus
  summaryLabel?: string
  loading?: boolean
  error?: string
  emptyMessage?: string
  onBack: () => void
  onAdd?: () => void
  onSelect: (item: InventoryBatch) => void
  onSaveQuantity: (item: InventoryBatch, quantity: number, refrigerator?: Refrigerator) => Promise<boolean>
  onMoveSelected?: (items: InventoryBatch[], icons: Icon[]) => void
  onDeleteSelected?: (items: InventoryBatch[]) => Promise<boolean>
  onClassifySelected?: (items: InventoryBatch[], subcategoryId: string) => Promise<boolean>
  onAddGroup?: () => void
  onAddSubcategory?: (items: InventoryBatch[], onCreated: (category: Category) => void) => void
}) {
  const [query, setQuery] = useState(initialQuery ?? '')
  const [sortKey, setSortKey] = useState<InventorySortKey>(readInventorySortKey)
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const sortMenuRef = useDismissibleMenu<HTMLSpanElement>(sortMenuOpen, () => setSortMenuOpen(false))
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const [renameError, setRenameError] = useState('')
  const [renamingSlot, setRenamingSlot] = useState(false)
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>(() => Object.fromEntries(inventory.map(item => [item.id, String(item.quantity)])))
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [saveErrors, setSaveErrors] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [classifyDialogOpen, setClassifyDialogOpen] = useState(false)
  const [classifying, setClassifying] = useState(false)
  const [classifyError, setClassifyError] = useState('')
  const [categoryQuery, setCategoryQuery] = useState('')
  const [classifyPanelTop, setClassifyPanelTop] = useState(0)
  const [activeCategoryGroupId, setActiveCategoryGroupId] = useState(() => categories.find(category => !category.parent_id)?.id ?? '')
  const timers = useRef(new Map<string, number>())
  const saveChains = useRef(new Map<string, Promise<void>>())
  const categoryAnchorRef = useRef<HTMLElement | null>(null)
  const latestInventory = useRef(inventory)
  const latestDrafts = useRef(quantityDrafts)
  const serverQuantities = useRef(Object.fromEntries(inventory.map(item => [item.id, item.quantity])))

  useEffect(() => {
    latestInventory.current = inventory
    for (const item of inventory) serverQuantities.current[item.id] = item.quantity
    setQuantityDrafts(current => {
      const next = { ...current }
      for (const item of inventory) {
        if (serverQuantities.current[item.id] === item.quantity && !timers.current.has(item.id) && !savingIds.has(item.id) && !saveErrors.has(item.id) && parseQuantity(next[item.id] ?? '') !== null) next[item.id] = String(item.quantity)
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
        setQuantityDrafts(current => ({ ...current, [itemId]: formatQuantity(parseQuantity(current[itemId] ?? '') ?? quantity) }))
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
    setQuantityDrafts(current => ({ ...current, [item.id]: formatQuantity(value) }))
    if (value !== serverQuantities.current[item.id]) scheduleQuantitySave(item.id)
  }

  const filteredItems = filterInventory(inventory, query, slotId, refrigeratorByItemId, expiryStatus)
  const items = sortInventory(filteredItems, sortKey).sort((left, right) => {
    const leftQuantity = parseQuantity(quantityDrafts[left.id] ?? String(left.quantity)) ?? left.quantity
    const rightQuantity = parseQuantity(quantityDrafts[right.id] ?? String(right.quantity)) ?? right.quantity
    return Number(leftQuantity === 0) - Number(rightQuantity === 0)
  })
  const activeQuantities = items.map(item => parseQuantity(quantityDrafts[item.id] ?? String(item.quantity)) ?? item.quantity)
  const activeItemCount = countActiveInventoryItems(activeQuantities)
  const activeItems = items.filter((_, index) => activeQuantities[index] > 0)
  const totalPrice = sumInventoryPrices(activeItems)
  const sortLabels: Record<InventorySortKey, string> = { recent: '最近添加', oldest: '最早添加', expiry: '临近过期' }
  const selectedRefrigerator = (item: InventoryBatch) => refrigeratorByItemId?.[item.id] ?? refrigerator
  const selectedItems = inventory.filter(item => selectedIds.has(item.id))
  const canDeleteSelected = Boolean(onDeleteSelected) && selectedItems.length > 0 && selectedItems.every(item => selectedRefrigerator(item)?.access_role === 'owner')
  const canClassifySelected = Boolean(onClassifySelected) && selectedItems.length > 0 && selectedItems.every(item => selectedRefrigerator(item)?.access_role === 'owner')
  const categoryParents = categories.filter(category => !category.parent_id)
  const categoryChildren = uniqueCategories(categories.filter(category => category.parent_id && (categoryQuery.trim() ? category.name.includes(categoryQuery.trim()) : category.parent_id === activeCategoryGroupId)))
  const selectedCategoryIds = new Set(selectedItems.map(item => item.subcategory_id))
  const selectedCategoryId = selectedCategoryIds.size === 1 ? selectedItems[0]?.subcategory_id : undefined
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
  const openClassifyDialog = () => {
    if (!canClassifySelected) return
    const selectedCategory = categories.find(category => category.id === selectedItems[0]?.subcategory_id)
    setCategoryQuery('')
    setClassifyPanelTop(Math.max(0, categoryAnchorRef.current?.getBoundingClientRect().top ?? 0))
    setActiveCategoryGroupId(selectedCategory?.parent_id ?? categoryParents[0]?.id ?? '')
    setClassifyError('')
    setClassifyDialogOpen(true)
  }
  const classifySelected = async (category: Category) => {
    if (classifying || !onClassifySelected || !canClassifySelected) return
    setClassifying(true)
    setClassifyError('')
    const classified = await onClassifySelected(selectedItems, category.id).catch(() => false)
    if (classified) {
      setSelectedIds(new Set())
      setClassifyDialogOpen(false)
    } else {
      setClassifyError('分类失败，请稍后重试。')
    }
    setClassifying(false)
  }
  const openDeleteDialog = () => {
    if (!canDeleteSelected) return
    setDeleteError('')
    setDeleteDialogOpen(true)
  }
  const deleteSelected = async () => {
    if (!onDeleteSelected || !canDeleteSelected || deleting) return
    setDeleting(true)
    setDeleteError('')
    const deleted = await onDeleteSelected(selectedItems).catch(() => false)
    if (deleted) {
      setSelectedIds(new Set())
      setDeleteDialogOpen(false)
    } else {
      setDeleteError('删除失败，请稍后重试。')
    }
    setDeleting(false)
  }
  const openRenameDialog = () => {
    if (!slot || !onRenameSlot) return
    setRenameDraft(slot.custom_name ?? title)
    setRenameError('')
    setSortMenuOpen(false)
    setRenameDialogOpen(true)
  }
  const saveSlotName = async () => {
    if (!slot || !onRenameSlot) return
    const name = renameDraft.trim()
    if (!name) {
      setRenameError('分层名字不能为空。')
      return
    }
    setRenamingSlot(true)
    setRenameError('')
    const message = await onRenameSlot(slot.id, name).catch(error => (error as Error).message)
    setRenamingSlot(false)
    if (message) {
      setRenameError(message)
      return
    }
    setRenameDialogOpen(false)
  }
  const sortMenu = <span ref={sortMenuRef} className="p9-header-menu"><button className="p7-icon-button" type="button" onClick={() => setSortMenuOpen(open => !open)} aria-label="筛选物品" aria-haspopup="menu" aria-expanded={sortMenuOpen}><svg className="p9-menu-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg></button>{sortMenuOpen && <span className="p5-sort-dropdown" role="menu" aria-label="物品排序">{(Object.keys(sortLabels) as InventorySortKey[]).map(key => <button className="p5-sort-option" key={key} type="button" role="menuitemradio" aria-checked={sortKey === key} onClick={() => selectSort(key)}><SortOptionIcon sortKey={key} /><span>{sortLabels[key]}</span><span className="p5-sort-check" aria-hidden="true">{sortKey === key && <svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg>}</span></button>)}{slot && onRenameSlot && <><div className="p5-sort-divider" role="separator" /><button className="p5-sort-option p5-rename-slot-option" type="button" role="menuitem" onClick={openRenameDialog}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-4-4L4 15v5Z" /><path d="m13.5 6.5 4 4" /></svg><span>修改名字</span><span className="p5-sort-check" aria-hidden="true" /></button></>}</span>}</span>
  const openSubcategoryCreator = () => {
    if (!onAddSubcategory || !onClassifySelected || !selectedItems.length) return
    setClassifyDialogOpen(false)
    onAddSubcategory(selectedItems, category => { void onClassifySelected(selectedItems, category.id) })
  }
  const footer = selectedItems.length ? <footer className={`bottom-action-bar p5-selection-actions${canDeleteSelected ? ' has-delete' : ''}${canClassifySelected ? ' has-category' : ''}`}><button className="p5-selection-cancel" type="button" onClick={cancelSelection}>取消</button><button className="p5-selection-move" type="button" onClick={moveSelected}>移动</button>{canClassifySelected && <button className="p5-selection-category" type="button" onClick={openClassifyDialog}>分类</button>}{canDeleteSelected && <button className="p5-selection-delete" type="button" onClick={openDeleteDialog}>删除</button>}</footer> : onAdd && <footer className="bottom-action-bar"><button type="button" onClick={onAdd}>＋ 添加物品</button></footer>
  return <><PageShell className="p5-flow" header={<PageHeader title={title} onBack={onBack} right={sortMenu} />} bodyClassName="p5-scroll p5-inventory-list" footer={footer}>
    <label className="p5-search p5-inventory-search">
      <svg className="p5-search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
      <input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索物品名称、品牌或备注" aria-label="搜索物品" />
    </label>
    <div className="p5-list-summary"><b>{summaryLabel ?? (query.trim() ? `找到 ${activeItemCount} 件物品` : `共 ${activeItemCount} 件物品`)}<small className="p5-list-summary-total"> · 合计 {totalPrice}</small></b><span>{!summaryLabel && sortLabels[sortKey]}</span>{summaryLabel && <span>{loading || error ? '' : `${activeItemCount} 条结果`}</span>}</div>
    {loading && <p className="p5-inventory-state" role="status">正在搜索所有冰箱…</p>}
    {error && <p className="p5-inventory-state p5-inventory-state-error" role="alert">{error} 请返回后重试。</p>}
    <section ref={categoryAnchorRef} className="p5-inventory-items" aria-live="polite">
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
          {itemRefrigerator && <button className="p5-inventory-fridge" type="button" onClick={() => onSelectFridge?.(itemRefrigerator)}><span>{itemRefrigerator.name}{item.storage_slot_name && `·${item.storage_slot_name}`}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg></button>}
          <button className="p5-inventory-open" type="button" onClick={() => onSelect(item)}>
            <span className="p5-inventory-main">
              <strong><span className={isEmpty ? 'p5-inventory-name-is-empty' : ''}>{item.item_name}</span><small className="p5-inventory-category"> · {item.subcategory_name}</small></strong>
              <span className="p5-inventory-meta">
                {!isEmpty && (item.production_date || item.best_before) && <span className="p5-inventory-meta-primary">
                  {item.production_date && <small>{getInventoryAddedDaysLabel(item)}</small>}
                  {item.best_before && <small className={`p5-inventory-expiry ${item.expiry_status === 'expired' ? 'is-expired' : item.expiry_status === 'expiring' ? 'is-expiring' : ''}`}>{getInventoryExpiryLabel(item)}</small>}
                </span>}
                {(item.product_description || (item.price != null && formatInventoryPrice(item.price))) && <span className="p5-inventory-meta-secondary">
                  {item.product_description && <small className="p5-inventory-note">{item.product_description}</small>}
                  {item.price != null && formatInventoryPrice(item.price) && <small className="p5-inventory-price">{formatInventoryPrice(item.price)}</small>}
                </span>}
              </span>
            </span>
          </button>
          <QuantityStepper
            className={`p5-inventory-quantity ${saveFailed ? 'is-error' : ''}`}
            value={quantity}
            onChange={value => updateQuantity(item, value)}
            onBlur={() => normalizeQuantity(item)}
            onDecrement={() => updateQuantity(item, stepQuantity(quantity, -1, 0))}
            onIncrement={() => updateQuantity(item, stepQuantity(quantity, 1, 0))}
            disabled={saving}
            ariaLabel={`${item.item_name} 数量`}
          >
            {saving && <small>保存中</small>}
            {saveFailed && <small>保存失败</small>}
          </QuantityStepper>
        </article>
      })}
      {!loading && !error && items.length === 0 && <p className="p5-inventory-empty">{emptyText}</p>}
    </section>
  </PageShell>{classifyDialogOpen && <CategoryPickerPanel top={classifyPanelTop} title="选择分类" query={categoryQuery} parents={categoryParents} children={categoryChildren} icons={icons} activeGroupId={activeCategoryGroupId} selectedCategoryId={selectedCategoryId} onQueryChange={setCategoryQuery} onSelectGroup={setActiveCategoryGroupId} onSelectCategory={category => { void classifySelected(category) }} onClose={() => { if (!classifying) setClassifyDialogOpen(false) }} onAddGroup={onAddGroup} onAddSubcategory={onAddSubcategory ? openSubcategoryCreator : undefined} error={classifyError} />}{renameDialogOpen && slot && <Dialog title="修改分层名字" onClose={() => setRenameDialogOpen(false)} closeLabel="关闭修改分层名字" closeDisabled={renamingSlot} dialogClassName="p5-slot-name-dialog"><label className="p5-slot-name-field"><span>分层名字</span><input autoFocus value={renameDraft} maxLength={120} onChange={event => setRenameDraft(event.target.value)} /></label>{renameError && <p className="p5-slot-name-error" role="alert">{renameError}</p>}<div className="modal-actions"><button className="modal-primary" type="button" disabled={renamingSlot} onClick={() => void saveSlotName()}>{renamingSlot ? '保存中…' : '保存'}</button><button className="modal-secondary" type="button" disabled={renamingSlot} onClick={() => setRenameDialogOpen(false)}>取消</button></div></Dialog>}{deleteDialogOpen && <Dialog title="确认删除物品" onClose={() => { if (!deleting) setDeleteDialogOpen(false) }} closeLabel="关闭删除确认" closeDisabled={deleting} dialogClassName="p5-delete-dialog"><p>将永久删除已选的 {selectedItems.length} 项物品，删除后无法恢复。</p><p className="p5-delete-summary">{getInventorySelectionSummary(selectedItems)}</p>{deleteError && <p className="p5-slot-name-error" role="alert">{deleteError}</p>}<div className="modal-actions"><button className="modal-danger" type="button" disabled={deleting} onClick={() => void deleteSelected()}>{deleting ? '删除中…' : '确认删除'}</button><button className="modal-secondary" type="button" disabled={deleting} onClick={() => setDeleteDialogOpen(false)}>取消</button></div></Dialog>}</>
}
