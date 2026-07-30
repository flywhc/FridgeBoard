import { useState } from 'react'
import type { Icon, InventoryBatch } from './appTypes'
import { CategoryIcon, PageHeader, PageShell } from './sharedUi'
import { filterInventory } from './inventoryListFilters'

function expiryLabel(item: InventoryBatch): string {
  if (item.expiry_status === 'expired') return '已过期'
  if (item.expiry_status === 'expiring') return '临期'
  return item.best_before ? `保质期至 ${item.best_before}` : '未设置保质期'
}

export function InventoryList({ inventory, icons, title, slotId, onBack, onAdd, onSelect }: {
  inventory: InventoryBatch[]; icons: Icon[]; title: string; slotId?: string; onBack: () => void; onAdd: () => void
  onSelect: (item: InventoryBatch) => void
}) {
  const [query, setQuery] = useState('')
  const items = filterInventory(inventory, query, slotId)
  return <PageShell className="p5-flow" header={<PageHeader title={title} onBack={onBack} />} bodyClassName="p5-scroll p5-inventory-list" footer={<footer className="bottom-action-bar"><button type="button" onClick={onAdd}>＋ 添加食材</button></footer>}>
      <label className="p5-search p5-inventory-search">
        <svg className="p5-search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
        <input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索食材名称、品牌或备注" aria-label="搜索食材" />
      </label>
      <p className="p5-list-summary">{query.trim() ? `找到 ${items.length} 件食材` : `共 ${items.length} 件食材`}</p>
      <section className="p5-inventory-items" aria-live="polite">
        {items.map(item => <button className="p5-inventory-item" key={item.id} onClick={() => onSelect(item)}>
          <span className="p5-inventory-icon"><CategoryIcon iconKey={item.icon_key} icons={icons} label={item.food_name} /></span>
          <span className="p5-inventory-main"><strong>{item.food_name}</strong><small>{item.subcategory_name} · ×{item.quantity}</small><small>{item.product_description || '未填写品牌 / 规格 / 备注'}</small></span>
          <span className={`p5-inventory-expiry ${item.expiry_status === 'expired' ? 'is-expired' : item.expiry_status === 'expiring' ? 'is-expiring' : ''}`}>{expiryLabel(item)}</span>
          <i aria-hidden="true">›</i>
        </button>)}
        {items.length === 0 && <p className="p5-inventory-empty">{query.trim() ? `没有找到包含“${query.trim()}”的食材。` : '这个范围内还没有食材。'}</p>}
      </section>
    </PageShell>
}
