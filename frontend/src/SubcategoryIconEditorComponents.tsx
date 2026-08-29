export function ThemeSlotStatusIcon({ borrowed, onBorrowedClick, borrowedLabel }: { borrowed: boolean; onBorrowedClick: () => void; borrowedLabel: string }) {
  const className = `p5-theme-icon-status${borrowed ? ' is-borrowed' : ''}`
  if (borrowed) return <button className={className} type="button" onClick={onBorrowedClick} aria-label={`${borrowedLabel}，选择借用主题`} title="选择借用主题">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.3 9a3 3 0 1 1 5.7 1.5c0 2-2.5 2.1-2.5 4M12.5 18h.01" /></svg>
  </button>
  return <span className={className} aria-label="已选择">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
  </span>
}

export function IconPagination({ page, pageCount, label, onChange }: { page: number; pageCount: number; label: string; onChange: (page: number) => void }) {
  if (pageCount <= 1) return null
  return <nav className="p5-online-pagination" aria-label={label}>
    <button className="p9-category-link" type="button" disabled={page === 0} onClick={() => onChange(Math.max(0, page - 1))}>上一页</button>
    <span aria-live="polite">{page + 1} / {pageCount}</span>
    <button className="p9-category-link" type="button" disabled={page >= pageCount - 1} onClick={() => onChange(Math.min(pageCount - 1, page + 1))}>下一页</button>
  </nav>
}
