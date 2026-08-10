/** P7 全冰箱库存搜索页；结果复用 P5 物品列表的布局和数量编辑能力。 */
import { useEffect, useMemo, useState } from 'react'
import type { Icon, InventoryBatch, Refrigerator } from './appTypes'
import { request } from './appApi'
import { filterInventoryAcrossRefrigerators, type InventorySearchResult } from './inventorySearchUtils'
import { InventoryList } from './inventoryList'
import { inventorySearchCacheKey, readPageCache, writePageCache } from './pageCache'
import { getRefrigeratorWorkspacePath } from './refrigeratorAccess'

type InventorySearchCache = { inventory: InventoryBatch[]; icons: Icon[] }

export function InventorySearch({ query, fridges, onBack, onSelectFridge, onOpenItem, onMoveSelected, onDeleteSelected }: {
  query: string
  fridges: Refrigerator[]
  onBack: () => void
  onSelectFridge: (refrigerator: Refrigerator) => void
  onOpenItem: (result: InventorySearchResult) => void
  onMoveSelected?: (items: InventoryBatch[], icons: Icon[]) => void
  onDeleteSelected?: (items: InventoryBatch[]) => Promise<boolean>
}) {
  const [allItems, setAllItems] = useState<InventorySearchResult[]>([])
  const [icons, setIcons] = useState<Icon[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const cached = fridges.map(refrigerator => ({
      refrigerator,
      snapshot: readPageCache<InventorySearchCache>(inventorySearchCacheKey(refrigerator.id)),
    }))
    const cachedWorkspaces = cached.filter(({ snapshot }) => snapshot).map(({ refrigerator, snapshot }) => ({
      refrigerator,
      inventory: snapshot!.data.inventory,
      icons: snapshot!.data.icons,
    }))
    const missing = cached.filter(({ snapshot }) => !snapshot).map(({ refrigerator }) => refrigerator)
    const apply = (workspaces: typeof cachedWorkspaces) => {
      if (!active) return
      setAllItems(workspaces.flatMap(({ refrigerator, inventory }) => inventory.map(item => ({ refrigerator, item }))))
      setIcons(Array.from(new Map(workspaces.flatMap(workspace => workspace.icons).map(icon => [icon.key, icon])).values()))
      setState('ready')
    }
    if (!missing.length) {
      apply(cachedWorkspaces)
      return () => { active = false }
    }
    void Promise.all(missing.map(async refrigerator => {
      const [inventory, refrigeratorIcons] = await Promise.all([
        request<InventoryBatch[]>(`${getRefrigeratorWorkspacePath(refrigerator, 'inventory')}?include_zero=true`),
        request<Icon[]>(getRefrigeratorWorkspacePath(refrigerator, 'icons')),
      ])
      writePageCache(inventorySearchCacheKey(refrigerator.id), { inventory, icons: refrigeratorIcons })
      return { refrigerator, inventory, icons: refrigeratorIcons }
    })).then(workspaces => {
      apply([...cachedWorkspaces, ...workspaces])
    }).catch(reason => {
      if (!active) return
      setState('error')
      setError((reason as Error).message || '暂时无法读取库存。')
    })
    return () => { active = false }
  }, [fridges])

  const refrigeratorByItemId = useMemo(
    () => Object.fromEntries(allItems.map(result => [result.item.id, result.refrigerator])),
    [allItems],
  )
  const inventory = allItems.map(result => result.item)
  const openItem = (item: InventoryBatch) => {
    const result = allItems.find(candidate => candidate.item.id === item.id)
    if (result) onOpenItem(result)
  }
  const saveQuantity = async (item: InventoryBatch, quantity: number, refrigerator?: Refrigerator): Promise<boolean> => {
    const itemResult = allItems.find(candidate => candidate.item.id === item.id)
    const target = refrigerator ?? itemResult?.refrigerator
    if (!target) return false
    try {
      const inventoryPath = getRefrigeratorWorkspacePath(target, 'inventory')
      const saved = await request<InventoryBatch>(`${inventoryPath}/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subcategory_id: item.subcategory_id,
          storage_slot_id: item.storage_slot_id,
          item_name: item.item_name,
          quantity,
          best_before: item.best_before,
          product_description: item.product_description,
          production_date: item.production_date,
          best_before_changed: false,
          barcode: item.barcode,
        }),
      })
      setAllItems(current => current.map(candidate => candidate.item.id === saved.id ? { ...candidate, item: saved } : candidate))
      const cached = readPageCache<InventorySearchCache>(inventorySearchCacheKey(target.id))
      if (cached) {
        writePageCache(inventorySearchCacheKey(target.id), {
          inventory: cached.data.inventory.map(candidate => candidate.id === saved.id ? saved : candidate),
          icons: cached.data.icons,
        })
      }
      return true
    } catch {
      return false
    }
  }

  const results = filterInventoryAcrossRefrigerators(allItems, query)
  return <InventoryList
    inventory={inventory}
    icons={icons}
    title="搜索物品"
    initialQuery={query}
    summaryLabel={`搜索“${query}”`}
    refrigeratorByItemId={refrigeratorByItemId}
    onSelectFridge={onSelectFridge}
    loading={state === 'loading'}
    error={state === 'error' ? error : ''}
    emptyMessage={results.length ? undefined : `没有找到匹配“${query}”的物品。`}
    onBack={onBack}
    onSelect={openItem}
    onMoveSelected={onMoveSelected}
    onDeleteSelected={onDeleteSelected}
    onSaveQuantity={saveQuantity}
  />
}
