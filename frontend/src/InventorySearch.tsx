/** P7 全冰箱库存搜索页；结果复用 P5 物品列表的布局和数量编辑能力。 */
import { useEffect, useMemo, useState } from 'react'
import type { Icon, InventoryBatch, Layout, Refrigerator } from './appTypes'
import { request } from './appApi'
import { filterInventoryAcrossRefrigerators, type InventorySearchResult } from './inventorySearchUtils'
import { InventoryList } from './inventoryList'
import { inventorySearchCacheKey, readPageCache, writePageCache } from './pageCache'
import { getRefrigeratorWorkspacePath } from './refrigeratorAccess'
import { pageRefreshGuard } from './pageRefreshGuard'

type InventorySearchCache = { inventory: InventoryBatch[]; icons: Icon[]; layout?: Layout }
type CachedSearchWorkspace = { refrigerator: Refrigerator; inventory: InventoryBatch[]; icons: Icon[]; layout?: Layout }

function readCachedSearchWorkspaces(fridges: Refrigerator[]): CachedSearchWorkspace[] {
  return fridges.flatMap(refrigerator => {
    const snapshot = readPageCache<InventorySearchCache>(inventorySearchCacheKey(refrigerator.id))
    return snapshot ? [{ refrigerator, ...snapshot.data }] : []
  })
}

export function InventorySearch({ query, fridges, onBack, onSelectFridge, onOpenItem, onMoveSelected, onDeleteSelected, onInventoryChanged, refreshGeneration = pageRefreshGuard.currentGeneration() }: {
  query: string
  fridges: Refrigerator[]
  onBack: () => void
  onSelectFridge: (refrigerator: Refrigerator) => void
  onOpenItem: (result: InventorySearchResult) => void
  onMoveSelected?: (items: InventoryBatch[], icons: Icon[]) => void
  onDeleteSelected?: (items: InventoryBatch[]) => Promise<boolean>
  onInventoryChanged?: (refrigerator: Refrigerator, saved: InventoryBatch) => void
  refreshGeneration?: number
}) {
  const initialCachedWorkspaces = useMemo(() => readCachedSearchWorkspaces(fridges), [fridges])
  const [allItems, setAllItems] = useState<InventorySearchResult[]>(() => initialCachedWorkspaces.flatMap(({ refrigerator, inventory }) => inventory.map(item => ({ refrigerator, item }))))
  const [icons, setIcons] = useState<Icon[]>(() => Array.from(new Map(initialCachedWorkspaces.flatMap(workspace => workspace.icons).map(icon => [icon.key, icon])).values()))
  const [layoutsByRefrigeratorId, setLayoutsByRefrigeratorId] = useState<Record<string, Layout>>(() => Object.fromEntries(initialCachedWorkspaces.flatMap(workspace => workspace.layout ? [[workspace.refrigerator.id, workspace.layout]] : [])))
  const [state, setState] = useState<'loading' | 'ready' | 'error'>(initialCachedWorkspaces.length ? 'ready' : 'loading')
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')

  useEffect(() => {
    let active = true
    // 延后清理，避免属性触发的刷新在 effect 中同步级联渲染。
    void Promise.resolve().then(() => {
      if (!active) return
      setError('')
      setWarning('')
    })
    const cachedWorkspaces = readCachedSearchWorkspaces(fridges)
    const cachedRefrigeratorIds = new Set(cachedWorkspaces.map(({ refrigerator }) => refrigerator.id))
    const missing = fridges.filter(refrigerator => !cachedRefrigeratorIds.has(refrigerator.id))
    const apply = (workspaces: typeof cachedWorkspaces, layouts: Record<string, Layout>) => {
      if (!active) return
      setAllItems(workspaces.flatMap(({ refrigerator, inventory }) => inventory.map(item => ({ refrigerator, item }))))
      setIcons(Array.from(new Map(workspaces.flatMap(workspace => workspace.icons).map(icon => [icon.key, icon])).values()))
      setLayoutsByRefrigeratorId(layouts)
      setState('ready')
    }
    const inventoryRequests = missing.map(async refrigerator => {
      const key = inventorySearchCacheKey(refrigerator.id)
      const scope = pageRefreshGuard.begin(key, refreshGeneration)
      if (!scope) return null
      try {
        const [inventory, refrigeratorIcons, layout] = await Promise.all([
          request<InventoryBatch[]>(`${getRefrigeratorWorkspacePath(refrigerator, 'inventory')}?include_zero=true`, { signal: scope.controller.signal }),
          request<Icon[]>(getRefrigeratorWorkspacePath(refrigerator, 'icons'), { signal: scope.controller.signal }),
          request<Layout>(getRefrigeratorWorkspacePath(refrigerator, 'layout'), { signal: scope.controller.signal }),
        ])
        if (!pageRefreshGuard.canCommit(scope)) return null
        writePageCache(key, { inventory, icons: refrigeratorIcons, layout })
        return { refrigerator, inventory, icons: refrigeratorIcons, layout }
      } finally {
        pageRefreshGuard.release(scope)
      }
    })
    const cachedLayouts = Object.fromEntries(cachedWorkspaces.flatMap(workspace => workspace.layout ? [[workspace.refrigerator.id, workspace.layout]] : []))
    if (cachedWorkspaces.length) apply(cachedWorkspaces, cachedLayouts)
    if (!missing.length) return () => { active = false }
    void Promise.allSettled(inventoryRequests).then(results => {
      if (!active || !pageRefreshGuard.isGenerationCurrent(refreshGeneration)) return
      const workspaces = results.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : [])
      const failures = results.filter(result => result.status === 'rejected')
      const available = [...cachedWorkspaces, ...workspaces]
      if (available.length) {
        apply(available, { ...cachedLayouts, ...Object.fromEntries(workspaces.map(workspace => [workspace.refrigerator.id, workspace.layout])) })
        if (!failures.length) setWarning('')
        else setWarning('部分冰箱暂时无法刷新，当前显示已有缓存结果。')
        return
      }
      setState('error')
      setError(failures[0]?.status === 'rejected' ? failures[0].reason instanceof Error ? failures[0].reason.message : '暂时无法读取库存。' : '暂时无法读取库存。')
    })
    return () => { active = false }
  }, [fridges, refreshGeneration])

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
    const operation = pageRefreshGuard.beginOperation(refreshGeneration)
    if (!operation) return false
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
        signal: operation.controller.signal,
      })
      if (!pageRefreshGuard.canCommitOperation(operation)) return false
      setAllItems(current => current.map(candidate => candidate.item.id === saved.id ? { ...candidate, item: saved } : candidate))
      pageRefreshGuard.markMutation(inventorySearchCacheKey(target.id))
      const cached = readPageCache<InventorySearchCache>(inventorySearchCacheKey(target.id))
      if (cached) {
        writePageCache(inventorySearchCacheKey(target.id), {
          inventory: cached.data.inventory.map(candidate => candidate.id === saved.id ? saved : candidate),
          icons: cached.data.icons,
          layout: cached.data.layout,
        })
      }
      onInventoryChanged?.(target, saved)
      return true
    } catch (reason) {
      if (!pageRefreshGuard.isGenerationCurrent(refreshGeneration)) return false
      const requestError = reason as Error & { status?: number }
      if (requestError.status === 404 || /不存在|已删除/.test(requestError.message)) {
        setWarning('该物品已不存在，未保存更改。')
      }
      return false
    } finally {
      pageRefreshGuard.releaseOperation(operation)
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
    layoutsByRefrigeratorId={layoutsByRefrigeratorId}
    onSelectFridge={onSelectFridge}
    loading={state === 'loading'}
    error={state === 'error' ? error : ''}
    warning={warning}
    emptyMessage={results.length ? undefined : `没有找到匹配“${query}”的物品。`}
    onBack={onBack}
    onSelect={openItem}
    onMoveSelected={onMoveSelected}
    onDeleteSelected={onDeleteSelected}
    onSaveQuantity={saveQuantity}
  />
}
