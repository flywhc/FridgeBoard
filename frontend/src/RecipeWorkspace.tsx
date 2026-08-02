/** P9 食谱浏览、导入、历史和补货工作区。 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Icon, RecipeDay, RecipeEntry, RecipeHistoryWeek, Refrigerator, RestockEntry } from './appTypes'
import { AppHeader, HeaderTitle, PageHeader, P7Navigation, PageShell, RecipeCompletionIcon, RecipeIngredientList, type RefreshState } from './sharedUi'
import { request } from './appApi'
import { addLocalCalendarDays, getLocalMonday } from './recipeCalendar'
import { readPageCache, recipeCacheKey, writePageCache } from './pageCache'

type RecipeCache = { days: RecipeDay[]; restock: RestockEntry[] }

export function RecipeWorkspace({ refrigerator, icons, refreshNonce, onBack, onFridge, onMe }: { refrigerator: Refrigerator; icons: Icon[]; refreshNonce: number; onBack: () => void; onFridge: () => void; onMe: () => void }) {
  const recipeWeekStorageKey = `fb-last-recipe-week:${refrigerator.id}`
  const [weekOffset, setWeekOffset] = useState(() => window.localStorage.getItem(recipeWeekStorageKey) === '7' ? 7 : 0)
  const currentMonday = getLocalMonday(new Date())
  const monday = addLocalCalendarDays(currentMonday, weekOffset)
  const initialCache = readPageCache<RecipeCache>(recipeCacheKey(refrigerator.id, monday))
  const [days, setDays] = useState<RecipeDay[]>(initialCache?.data.days ?? [])
  const [restock, setRestock] = useState<RestockEntry[]>(initialCache?.data.restock ?? [])
  const [history, setHistory] = useState<RecipeHistoryWeek[]>([])
  const [historyDays, setHistoryDays] = useState<RecipeDay[]>([])
  const [selectedHistoryWeek, setSelectedHistoryWeek] = useState<RecipeHistoryWeek | null>(null)
  const [text, setText] = useState('')
  const [importWeekStart, setImportWeekStart] = useState<string | null>(null)
  const [view, setView] = useState<'week' | 'import' | 'restock' | 'edit' | 'history' | 'history-detail'>('week')
  const [editing, setEditing] = useState<RecipeEntry | null>(null)
  const [message, setMessage] = useState('')
  const [copyNotice, setCopyNotice] = useState('')
  const copyNoticeTimer = useRef<number | null>(null)
  const [completingEntryId, setCompletingEntryId] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [refreshState, setRefreshState] = useState<RefreshState>(initialCache?.isStale ? 'loading' : 'idle')
  const [refreshError, setRefreshError] = useState('')
  const load = useCallback(async (force = false) => {
    const cached = readPageCache<RecipeCache>(recipeCacheKey(refrigerator.id, monday))
    if (!force && cached && !cached.isStale) {
      setDays(cached.data.days); setRestock(cached.data.restock); setRefreshState('idle'); return
    }
    if (cached) { setDays(cached.data.days); setRestock(cached.data.restock) }
    setRefreshState('loading'); setRefreshError('')
    try {
      const [week, shortages] = await Promise.all([
        request<RecipeDay[]>(`/api/owner/refrigerators/${refrigerator.id}/recipes?week_start=${monday}`),
        request<RestockEntry[]>(`/api/owner/refrigerators/${refrigerator.id}/restock?week_start=${monday}`),
      ])
      setDays(week); setRestock(shortages); writePageCache(recipeCacheKey(refrigerator.id, monday), { days: week, restock: shortages }); setRefreshState('idle')
    } catch (error) {
      setRefreshState('error'); setRefreshError((error as Error).message)
      if (!cached) setMessage((error as Error).message)
    }
  }, [monday, refrigerator.id])
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(refreshNonce > 0) }, 0)
    return () => window.clearTimeout(timer)
  }, [load, refreshNonce])
  useEffect(() => () => {
    if (copyNoticeTimer.current !== null) window.clearTimeout(copyNoticeTimer.current)
  }, [])
  useEffect(() => {
    if (!menuOpen) return
    const closeWhenOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.p9-header-menu')) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeWhenOutside)
    return () => document.removeEventListener('pointerdown', closeWhenOutside)
  }, [menuOpen])
  const showCopyNotice = (notice: string) => {
    if (copyNoticeTimer.current !== null) window.clearTimeout(copyNoticeTimer.current)
    setCopyNotice(notice)
    copyNoticeTimer.current = window.setTimeout(() => { setCopyNotice(''); copyNoticeTimer.current = null }, 10000)
  }
  const openHistory = async () => {
    setMenuOpen(false); setMessage('')
    try { setHistory(await request<RecipeHistoryWeek[]>(`/api/owner/refrigerators/${refrigerator.id}/recipes/history?week_start=${currentMonday}`)); setView('history') }
    catch (error) { setMessage((error as Error).message) }
  }
  const openHistoryWeek = async (week: RecipeHistoryWeek) => {
    setMessage('')
    try { setHistoryDays(await request<RecipeDay[]>(`/api/owner/refrigerators/${refrigerator.id}/recipes?week_start=${week.week_start}`)); setSelectedHistoryWeek(week); setView('history-detail') }
    catch (error) { setMessage((error as Error).message) }
  }
  const copyRestock = async () => {
    const value = restock.flatMap(item => item.missing.map(missing => `${item.label} ${item.dish_name}：${missing.subcategory_name}×${missing.quantity}`)).join('\n')
    if (!value) return
    try {
      if (!navigator.clipboard) throw new Error('当前浏览器不支持剪切板')
      await navigator.clipboard.writeText(value); showCopyNotice('已复制到剪切板')
    } catch { showCopyNotice('复制失败，请重试') }
  }
  const complete = async (entry: RecipeEntry) => {
    const isCompleting = !entry.completed
    if (isCompleting) setCompletingEntryId(entry.id)
    try {
      const requestComplete = request(`/api/owner/refrigerators/${refrigerator.id}/recipes/${entry.id}/${entry.completed ? 'undo' : 'complete'}`, { method: 'POST' })
      if (isCompleting) await Promise.all([requestComplete, new Promise(resolve => window.setTimeout(resolve, 420))]); else await requestComplete
      await load(true)
    } catch (error) { setMessage((error as Error).message) } finally { if (isCompleting) setCompletingEntryId(null) }
  }
  const importText = async () => {
    const targetWeekStart = importWeekStart ?? monday
    try { await request(`/api/owner/refrigerators/${refrigerator.id}/recipes/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ week_start: targetWeekStart, text }) }); setText(''); setImportWeekStart(null); setView('week'); await load(true) }
    catch (error) { setMessage((error as Error).message) }
  }
  const copyHistoryWeek = async (targetOffset: 0 | 7) => {
    if (!selectedHistoryWeek) return
    const target = addLocalCalendarDays(currentMonday, targetOffset)
    try {
      const copied = await request<RecipeDay[]>(`/api/owner/refrigerators/${refrigerator.id}/recipes/copy?week_start=${currentMonday}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source_week_start: selectedHistoryWeek.week_start, target_week_start: target }) })
      setWeekOffset(targetOffset); window.localStorage.setItem(recipeWeekStorageKey, String(targetOffset)); setDays(copied); setView('week')
      const shortages = await request<RestockEntry[]>(`/api/owner/refrigerators/${refrigerator.id}/restock?week_start=${currentMonday}`)
      setRestock(shortages); writePageCache(recipeCacheKey(refrigerator.id, target), { days: copied, restock: shortages })
    } catch (error) { setMessage((error as Error).message) }
  }
  const saveEntry = async () => {
    if (!editing) return
    try {
      const path = editing.id ? `/api/owner/refrigerators/${refrigerator.id}/recipes/${editing.id}` : `/api/owner/refrigerators/${refrigerator.id}/recipes?week_start=${monday}`
      await request(path, { method: editing.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ weekday: editing.weekday, dish_name: editing.dish_name, note: editing.note, ingredients: editing.ingredients }) })
      setEditing(null); setView('week'); await load(true)
    } catch (error) { setMessage((error as Error).message) }
  }
  if (view === 'import') return <PageShell className="p7-shell p9-shell" header={<PageHeader title="粘贴食谱导入" onBack={() => { setImportWeekStart(null); setView('week') }} />} bodyClassName="p7-scroll p9-import" footer={<footer className="bottom-action-bar"><button disabled={!text.trim()} onClick={() => void importText()}>解析并导入</button></footer>}><p>导入目标：{(importWeekStart ?? monday) === currentMonday ? '本周' : '下周'}。每行一道菜。支持：周二：鸡蛋炒河粉（鸡蛋×4、火腿、河粉）</p><textarea value={text} onChange={event => setText(event.target.value)} placeholder="周一：小炒肉（猪肉、叶菜）" /><p>导入后可逐项编辑；食材必须完全匹配已有小类。</p>{message && <p className="claim-error" role="alert">{message}</p>}</PageShell>
  if (view === 'restock') return <PageShell className="p7-shell p9-shell" header={<PageHeader title="补货清单" onBack={() => setView('week')} right={<button className="p7-icon-button p9-copy-button" onClick={() => void copyRestock()} aria-label="复制补货清单" title="复制补货清单"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="12" rx="1" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v11h3" /></svg></button>} />} bodyClassName="p7-scroll p9-list">{copyNotice && <p className={`p9-copy-notice ${copyNotice === '已复制到剪切板' ? 'is-success' : ''}`} role="status" aria-live="polite">{copyNotice}</p>}{restock.length ? restock.map(item => <section key={`${item.weekday}-${item.dish_name}`}><h2>{item.label} · {item.dish_name}</h2>{item.missing.map(missing => <p key={missing.subcategory_name}>缺少 <b>{missing.subcategory_name} × {missing.quantity}</b></p>)}</section>) : <p className="p9-empty">本周和下周食材都足够。</p>}</PageShell>
  if (view === 'history') return <PageShell className="p7-shell p9-shell" header={<PageHeader title="食谱历史" onBack={() => setView('week')} />} bodyClassName="p7-scroll p9-list p9-history"><p>不含本周和下周，查看最近 8 周食谱。</p>{message && <p className="claim-error" role="alert">{message}</p>}{history.map(week => <button className="p9-history-row" key={week.week_start} onClick={() => void openHistoryWeek(week)}><span><b>{week.label}</b><small className="p9-history-preview">{week.preview || '没有安排'}</small></span><b aria-hidden="true">›</b></button>)}</PageShell>
  if (view === 'history-detail' && selectedHistoryWeek) return <PageShell className="p7-shell p9-shell" header={<PageHeader title="食谱历史" onBack={() => setView('history')} />} bodyClassName="p7-scroll p9-list p9-history-detail" footer={<footer className="bottom-action-bar p9-history-copy"><p>复制会覆盖目标周现有的全部食谱。</p><div><button onClick={() => void copyHistoryWeek(0)}>复制到本周</button><button className="p9-history-secondary" onClick={() => void copyHistoryWeek(7)}>复制到下周</button></div></footer>}><h2>{selectedHistoryWeek.label}</h2>{historyDays.map(day => <section key={day.weekday}><h2>{day.label}</h2>{day.entries.length ? day.entries.map(entry => <article key={entry.id}><div><b>{entry.dish_name}</b><small>{entry.ingredients.map(item => `${item.subcategory_name}×${item.quantity}`).join('、') || '未添加食材'}</small>{entry.note && <em className="p9-note">备注：{entry.note}</em>}</div></article>) : <p className="p9-empty">还没有安排</p>}</section>)}</PageShell>
  if (view === 'edit' && editing) return <PageShell className="p7-shell p9-shell" header={<PageHeader title="编辑食谱" onBack={() => { setEditing(null); setView('week') }} />} bodyClassName="p7-scroll p9-edit" footer={<footer className="bottom-action-bar"><button disabled={!editing.dish_name.trim() || editing.ingredients.some(item => !item.subcategory_name.trim())} onClick={() => void saveEntry()}>{editing.completed ? '保存备注' : '保存'}</button></footer>}><label>星期<select disabled={editing.completed} value={editing.weekday} onChange={event => setEditing({ ...editing, weekday: Number(event.target.value) })}>{['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((label, weekday) => <option key={label} value={weekday}>{label}</option>)}</select></label><label>菜名<input readOnly={editing.completed} value={editing.dish_name} onChange={event => setEditing({ ...editing, dish_name: event.target.value })} maxLength={160} /></label><h2>食材</h2>{editing.ingredients.map((ingredient, index) => <div className="p9-ingredient" key={index}><input readOnly={editing.completed} aria-label={`食材 ${index + 1}`} value={ingredient.subcategory_name} onChange={event => setEditing({ ...editing, ingredients: editing.ingredients.map((value, position) => position === index ? { ...value, subcategory_name: event.target.value } : value) })} /><input readOnly={editing.completed} aria-label={`数量 ${index + 1}`} type="number" min="1" value={editing.ingredients[index].quantity} onChange={event => setEditing({ ...editing, ingredients: editing.ingredients.map((value, position) => position === index ? { ...value, quantity: Math.max(1, Number(event.target.value)) } : value) })} /><button disabled={editing.completed} onClick={() => setEditing({ ...editing, ingredients: editing.ingredients.filter((_, position) => position !== index) })} aria-label="移除食材">×</button></div>)}<button disabled={editing.completed} className="p9-add-ingredient" onClick={() => setEditing({ ...editing, ingredients: [...editing.ingredients, { subcategory_name: '', quantity: 1 }] })}>＋ 添加食材</button><label>备注<textarea value={editing.note ?? ''} onChange={event => setEditing({ ...editing, note: event.target.value })} maxLength={1000} placeholder="例如：少放油，孩子那份不加辣" /></label><p>{editing.completed ? '完成状态下只能修改备注。' : '名称只会与现有小类完全匹配；未匹配项会保留在补货清单，直到手动改正。'}</p>{message && <p className="claim-error" role="alert">{message}</p>}</PageShell>

  const selectWeek = (offset: 0 | 7) => { setWeekOffset(offset); window.localStorage.setItem(recipeWeekStorageKey, String(offset)) }
  const refresh = () => load(true)
  return <PageShell className="p7-shell p7-top-level p9-shell" onRefresh={refresh} refreshState={refreshState} header={<AppHeader title={<HeaderTitle title="每周食谱" refreshState={refreshState} refreshError={refreshError} />} left={<button className="p7-icon-button" onClick={() => setView('restock')} aria-label="查看补货清单"><svg className="p9-cart-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.2 11h10.6l3-8H6.1" /><circle cx="9" cy="19" r="1.2" /><circle cx="17" cy="19" r="1.2" /></svg></button>} right={<span className="p9-header-menu"><button className="p7-icon-button" onClick={() => setMenuOpen(value => !value)} aria-expanded={menuOpen} aria-haspopup="menu" aria-label="食谱菜单"><svg className="p9-menu-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg></button>{menuOpen && <span className="p9-menu" role="menu"><button role="menuitem" onClick={() => { setMenuOpen(false); setImportWeekStart(monday); setView('import') }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></svg><span>导入食谱</span></button><button role="menuitem" onClick={() => void openHistory()}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></svg><span>菜单历史</span></button></span>}</span>} />} bodyClassName="p7-scroll p9-list" footer={<P7Navigation active="recipes" onHome={onBack} onRecipes={() => undefined} onFridge={onFridge} onMe={onMe} />}><div className="p9-week-tabs"><button className={!weekOffset ? 'is-active' : ''} onClick={() => selectWeek(0)}>本周</button><button className={weekOffset ? 'is-active' : ''} onClick={() => selectWeek(7)}>下周</button></div>{message && <p className="claim-error" role="alert">{message}</p>}{days.map(day => <section key={day.weekday}><h2>{day.label}</h2>{day.entries.length ? day.entries.map(entry => {
    const isCompleting = completingEntryId === entry.id
    const openEdit = () => { setEditing({ ...entry, ingredients: entry.ingredients.map(item => ({ ...item })) }); setView('edit') }
    return <article className={entry.completed ? 'is-complete' : 'is-editable'} key={entry.id} onClick={openEdit} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openEdit() } }} role="button" tabIndex={0} aria-label={entry.completed ? `编辑${entry.dish_name}（仅可修改备注）` : `编辑${entry.dish_name}`}><div><b>{entry.dish_name}</b><small><RecipeIngredientList ingredients={entry.ingredients} icons={icons} /></small>{entry.missing.length > 0 && <em>缺少：<RecipeIngredientList ingredients={entry.missing} icons={icons} /></em>}{entry.note && <em className="p9-note">备注：{entry.note}</em>}</div><span className="p9-entry-actions"><button className="p9-entry-action" type="button" disabled={isCompleting} onClick={event => { event.stopPropagation(); void complete(entry) }} aria-label={entry.completed ? `恢复${entry.dish_name}为未完成` : `完成${entry.dish_name}`}><RecipeCompletionIcon completed={entry.completed} /></button></span></article>
  }) : <button className="p9-empty p9-empty-action" onClick={() => { setEditing({ id: '', weekday: day.weekday, dish_name: '', note: null, completed: false, ingredients: [], missing: [] }); setView('edit') }} aria-label={`${day.label}添加食谱`}>＋ 添加食谱</button>}</section>)}</PageShell>
}
