/** P7 全冰箱库存搜索页；搜索结果保持冰箱上下文，并复用物品编辑入口。 */
import { useEffect, useState } from 'react'
import type { InventoryBatch, Refrigerator } from './appTypes'
import { request } from './appApi'
import { filterInventoryAcrossRefrigerators, type InventorySearchResult } from './inventorySearchUtils'
import { PageHeader, PageShell } from './sharedUi'

function formatExpiry(item: InventoryBatch): string {
  if (!item.best_before) return '未设置'
  if (item.expiry_status === 'expired') return `已过期 · ${item.best_before}`
  if (item.expiry_status === 'expiring') return `临期 · ${item.best_before}`
  return item.best_before
}

export function InventorySearch({ query, fridges, onBack, onSelectFridge, onOpenItem }: {
  query: string
  fridges: Refrigerator[]
  onBack: () => void
  onSelectFridge: (refrigerator: Refrigerator) => void
  onOpenItem: (result: InventorySearchResult) => void
}) {
  const [allItems, setAllItems] = useState<InventorySearchResult[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void Promise.all(fridges.map(async refrigerator => ({
      refrigerator,
      inventory: await request<InventoryBatch[]>(`/api/owner/refrigerators/${refrigerator.id}/inventory`),
    }))).then(workspaces => {
      if (!active) return
      setAllItems(workspaces.flatMap(({ refrigerator, inventory }) => inventory.map(item => ({ refrigerator, item }))))
      setState('ready')
    }).catch(reason => {
      if (!active) return
      setState('error')
      setError((reason as Error).message || '暂时无法读取库存。')
    })
    return () => { active = false }
  }, [fridges])

  const results = filterInventoryAcrossRefrigerators(allItems, query)
  return <PageShell className="p7-shell p13-shell" header={<PageHeader title="搜索物品" onBack={onBack} />} bodyClassName="p7-scroll p13-search-list">
    <div className="p13-search-summary"><b>搜索“{query}”</b>{state === 'ready' && <span>{results.length} 条结果</span>}</div>
    {state === 'loading' && <p className="p13-state" role="status">正在搜索所有冰箱…</p>}
    {state === 'error' && <p className="p13-state p13-state-error" role="alert">{error} 请返回后重试。</p>}
    {state === 'ready' && !results.length && <p className="p13-state">没有找到匹配的物品。</p>}
    {state === 'ready' && results.length > 0 && <div className="p13-results">{results.map(result => {
      const { refrigerator, item } = result
      const openItem = () => onOpenItem(result)
      return <article className="p13-result" key={`${refrigerator.id}-${item.id}`} onClick={openItem} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openItem() } }} tabIndex={0}>
        <div className="p13-result-main"><div className="p13-result-heading"><strong>{item.item_name}</strong><span className="p13-result-quantity">×{item.quantity}</span><button className="p13-fridge-link" type="button" onClick={event => { event.stopPropagation(); onSelectFridge(refrigerator) }}>{refrigerator.name}<span aria-hidden="true">›</span></button></div>{item.best_before && <span className={`p13-expiry ${item.expiry_status === 'expired' ? 'is-expired' : item.expiry_status === 'expiring' ? 'is-expiring' : ''}`}>有效期：{formatExpiry(item)}</span>}{item.production_date && <span>出厂/生产日期：{item.production_date}</span>}{item.product_description && <span className="p13-note">备注：{item.product_description}</span>}</div>
      </article>
    })}</div>}
  </PageShell>
}
