/** P7 全冰箱库存搜索页；结果复用 P5 物品列表的布局和数量编辑能力。 */
import { useEffect, useMemo, useState } from 'react'
import type { Icon, InventoryBatch, Refrigerator } from './appTypes'
import { request } from './appApi'
import { filterInventoryAcrossRefrigerators, type InventorySearchResult } from './inventorySearchUtils'
import { InventoryList } from './inventoryList'
import { getRefrigeratorWorkspacePath } from './refrigeratorAccess'

export function InventorySearch({ query, fridges, onBack, onSelectFridge, onOpenItem, onMoveSelected }: {
  query: string
  fridges: Refrigerator[]
  onBack: () => void
  onSelectFridge: (refrigerator: Refrigerator) => void
  onOpenItem: (result: InventorySearchResult) => void
  onMoveSelected?: (items: InventoryBatch[], icons: Icon[]) => void
}) {
  const [allItems, setAllItems] = useState<InventorySearchResult[]>([])
  const [icons, setIcons] = useState<Icon[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void Promise.all(fridges.map(async refrigerator => {
      const [inventory, refrigeratorIcons] = await Promise.all([
        request<InventoryBatch[]>(`${getRefrigeratorWorkspacePath(refrigerator, 'inventory')}?include_zero=true`),
        request<Icon[]>(getRefrigeratorWorkspacePath(refrigerator, 'icons')),
      ])
      return { refrigerator, inventory, icons: refrigeratorIcons }
    })).then(workspaces => {
      if (!active) return
      setAllItems(workspaces.flatMap(({ refrigerator, inventory }) => inventory.map(item => ({ refrigerator, item }))))
      setIcons(Array.from(new Map(workspaces.flatMap(workspace => workspace.icons).map(icon => [icon.key, icon])).values()))
      setState('ready')
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
    onSaveQuantity={saveQuantity}
  />
}
