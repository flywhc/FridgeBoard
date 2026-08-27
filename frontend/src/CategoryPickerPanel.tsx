import type { Category, Icon } from './appTypes'
import { CategoryIcon } from './sharedUi'

export function CategoryPickerPanel({ top, title, itemName, query, parents, children, icons, activeGroupId, selectedCategoryId, onQueryChange, onSelectGroup, onSelectCategory, onClose, onAddGroup, onAddSubcategory, onEditSubcategory, error }: {
  top?: number
  title: string
  itemName?: string
  query: string
  parents: Category[]
  children: Category[]
  icons: Icon[]
  activeGroupId: string
  selectedCategoryId?: string
  onQueryChange: (query: string) => void
  onSelectGroup: (groupId: string) => void
  onSelectCategory: (category: Category) => void
  onClose: () => void
  onAddGroup?: () => void
  onAddSubcategory?: (itemName?: string) => void
  onEditSubcategory?: (category: Category) => void
  error?: string
}) {
  return <div className="p5-catalog-panel" role="dialog" aria-modal="true" aria-label={title} style={top === undefined ? undefined : { top: `${top}px` }}>
    <div className="p5-catalog-dialog-heading">
      <strong>{title}</strong>
      <form className="p5-search p5-catalog-search" onSubmit={event => { event.preventDefault(); const value = query.trim(); if (value) onQueryChange(value) }}>
        <button type="submit" className="p5-search-submit" aria-label="搜索"><svg className="p5-search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg></button>
        <input type="text" value={query} onChange={event => onQueryChange(event.target.value)} placeholder="搜索全部小类" aria-label="搜索全部小类" />
      </form>
      <button type="button" onClick={onClose} aria-label={`关闭${title}`}><span className="header-button-glyph" aria-hidden="true">×</span></button>
    </div>
    <div className="p5-catalog-body">
      <aside>
        {parents.map(group => <button type="button" className={group.id === activeGroupId ? 'is-selected' : ''} key={group.id} onClick={() => onSelectGroup(group.id)}>{group.name}</button>)}
        {onAddGroup && <button type="button" className="p5-add-group" onClick={onAddGroup}>＋ 添加大类</button>}
      </aside>
      <div className="p5-catalog-items">
        {error && <p className="p5-catalog-error" role="alert">{error}</p>}
        <div className="p5-icon-grid">
          {children.map(child => <div className="p5-category-option" key={child.id}><button type="button" className={child.id === selectedCategoryId ? 'is-selected' : ''} onClick={() => onSelectCategory(child)}><CategoryIcon iconKey={child.icon_key} icons={icons} label={child.name} /><b>{child.name}</b></button>{child.is_custom && onEditSubcategory && <button type="button" className="p5-edit-subcategory" aria-label={`编辑${child.name}`} title={`编辑${child.name}`} onClick={() => onEditSubcategory(child)}><span aria-hidden="true">✎</span></button>}</div>)}
        </div>
        {onAddSubcategory && <button type="button" className="p5-new-subcategory" onClick={() => onAddSubcategory(itemName)}>＋ 新建小类</button>}
      </div>
    </div>
  </div>
}
