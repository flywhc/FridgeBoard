/** P9 食谱浏览、导入、历史和补货工作区。 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CategoryMatchResult, Icon, InventoryBatch, RecipeDay, RecipeEntry, RecipeHistoryWeek, RecipeIngredient, Refrigerator, RestockEntry } from './appTypes'
import { AppHeader, ConfirmDialog, HeaderTitle, PageHeader, P7Navigation, PageShell, RecipeCompletionIcon, RecipeIngredientList, SaveIcon, type RefreshState } from './sharedUi'
import { request } from './appApi'
import { addLocalCalendarDays, getLocalMonday, orderRecipeDaysByCompletion } from './recipeCalendar'
import { readPageCache, recipeCacheKey, writePageCache } from './pageCache'
import { getRefrigeratorWorkspacePath } from './refrigeratorAccess'
import { formatRestockClipboardText } from './restockClipboard'
import { splitRestockByWeek } from './restockGroups'
import { useDismissibleMenu } from './menuBehavior'
import { createNewRecipeEntry } from './recipeDraft'
import type { CategoryMatchState } from './categoryMatch'
import { recipeIngredientMatchText } from './recipeCategoryMatch'

type RecipeCache = { days: RecipeDay[]; restock: RestockEntry[] }
type RecipeImportMode = 'add' | 'overwrite'

export function RestockMissingLine({ missing }: { missing: RestockEntry['missing'] }) {
  return <p className="p9-restock-missing"><b>{missing.map(item => `${item.subcategory_name} × ${item.quantity}`).join('，')}</b></p>
}

export function RestockWeekDivider() {
  return <div className="p9-restock-week-divider" role="separator" aria-label="下周"><span>下周</span></div>
}

function RecipeIngredientEditorRow({
  ingredient,
  index,
  completed,
  matchText,
  onNameChange,
  onQuantityChange,
  onRemove,
}: {
  ingredient: RecipeIngredient
  index: number
  completed: boolean
  matchText: string
  onNameChange: (value: string) => void
  onQuantityChange: (value: number) => void
  onRemove: () => void
}) {
  return <div className="p9-ingredient"><div className="p9-ingredient-name"><input readOnly={completed} aria-label={`食材 ${index + 1}`} value={ingredient.subcategory_name} onChange={event => onNameChange(event.target.value)} />{matchText && <small className={ingredient.subcategory_id ? 'p9-category-match-category' : 'p9-category-match-status'} role="status">{matchText}</small>}</div><input readOnly={completed} aria-label={`数量 ${index + 1}`} type="number" min="1" value={ingredient.quantity} onChange={event => onQuantityChange(Math.max(1, Number(event.target.value)))} /><button disabled={completed} onClick={onRemove} aria-label="移除食材">×</button></div>
}

export function RecipeWorkspace({ refrigerator, icons, inventory, refreshNonce, onBack, onFridge, onMe, onInventoryChanged }: { refrigerator: Refrigerator; icons: Icon[]; inventory: InventoryBatch[]; refreshNonce: number; onBack: () => void; onFridge: () => void; onMe: () => void; onInventoryChanged: () => Promise<void> }) {
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
  const ingredientMatchSequenceRef = useRef(0)
  const currentViewRef = useRef(view)
  const [completingEntryId, setCompletingEntryId] = useState<string | null>(null)
  const [importingMode, setImportingMode] = useState<RecipeImportMode | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [savingEntry, setSavingEntry] = useState(false)
  const [ingredientMatchStates, setIngredientMatchStates] = useState<Record<string, CategoryMatchState>>({})
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useDismissibleMenu<HTMLSpanElement>(menuOpen, () => setMenuOpen(false))
  const [refreshState, setRefreshState] = useState<RefreshState>(initialCache?.isStale ? 'loading' : 'idle')
  const [refreshError, setRefreshError] = useState('')
  const canEditRecipes = refrigerator.access_role === 'owner'
  const recipesPath = getRefrigeratorWorkspacePath(refrigerator, 'recipes')
  const restockPath = getRefrigeratorWorkspacePath(refrigerator, 'restock')
  const categoryMatchPath = getRefrigeratorWorkspacePath(refrigerator, 'category-match')
  const editingIngredientNames = editing?.ingredients.map(item => item.subcategory_name).join('\u0000')
  useEffect(() => {
    currentViewRef.current = view
  }, [view])
  const load = useCallback(async (force = false) => {
    const cached = readPageCache<RecipeCache>(recipeCacheKey(refrigerator.id, monday))
    if (!force && cached && !cached.isStale) {
      setDays(cached.data.days); setRestock(cached.data.restock); setRefreshState('idle'); return
    }
    if (cached) { setDays(cached.data.days); setRestock(cached.data.restock) }
    setRefreshState('loading'); setRefreshError('')
    try {
      const [week, shortages] = await Promise.all([
        request<RecipeDay[]>(`${recipesPath}?week_start=${monday}`),
        request<RestockEntry[]>(`${restockPath}?week_start=${monday}`),
      ])
      setDays(week); setRestock(shortages); writePageCache(recipeCacheKey(refrigerator.id, monday), { days: week, restock: shortages }); setRefreshState('idle')
    } catch (error) {
      setRefreshState('error'); setRefreshError((error as Error).message)
      if (!cached) setMessage((error as Error).message)
    }
  }, [monday, refrigerator.id, recipesPath, restockPath])
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(refreshNonce > 0) }, 0)
    return () => window.clearTimeout(timer)
  }, [load, refreshNonce])
  const matchIngredient = useCallback(async (
    itemName: string,
    signal: AbortSignal,
  ): Promise<CategoryMatchResult> => {
    const fast = await request<CategoryMatchResult>(`${categoryMatchPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_name: itemName }),
      signal,
    })
    if (fast.status !== 'needs_ai' || !fast.request_id) return fast
    const ai = await request<CategoryMatchResult>(`${categoryMatchPath}/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_name: itemName, request_id: fast.request_id }),
      signal,
    })
    if (ai.request_id) return ai
    return { ...ai, request_id: fast.request_id }
  }, [categoryMatchPath])
  useEffect(() => {
    if (view !== 'edit' || !editing || editing.completed) return
    const sequence = ++ingredientMatchSequenceRef.current
    const timers: number[] = []
    const controllers: AbortController[] = []
    const editingId = editing.id || 'new'
    editing.ingredients.forEach((ingredient, index) => {
      const itemName = ingredient.subcategory_name.trim()
      const key = `${editingId}:${index}:${itemName}`
      if (ingredient.subcategory_id || itemName.length < 2) {
        setIngredientMatchStates(current => ({
          ...current,
          [key]: itemName.length < 2 ? 'idle' : 'matched',
        }))
        return
      }
      const timer = window.setTimeout(() => {
        const controller = new AbortController()
        controllers.push(controller)
        setIngredientMatchStates(current => ({ ...current, [key]: 'checking' }))
        void matchIngredient(itemName, controller.signal)
          .then(result => {
            if (sequence !== ingredientMatchSequenceRef.current || controller.signal.aborted) return
            if (result.status === 'needs_ai') {
              setIngredientMatchStates(current => ({ ...current, [key]: 'ai' }))
              return
            }
            if (result.status === 'matched' && result.subcategory_id) {
              setEditing(current => {
                if (!current || (current.id || 'new') !== editingId) return current
                const currentIngredient = current.ingredients[index]
                if (!currentIngredient || currentIngredient.subcategory_name.trim() !== itemName) return current
                return {
                  ...current,
                  ingredients: current.ingredients.map((value, position) => position === index
                    ? {
                        ...value,
                        subcategory_id: result.subcategory_id,
                        matched_category_name: result.subcategory_name,
                        category_match_state: 'matched',
                      }
                    : value),
                }
              })
              setIngredientMatchStates(current => ({ ...current, [key]: 'matched' }))
            } else {
              setIngredientMatchStates(current => ({ ...current, [key]: 'not_found' }))
            }
          })
          .catch(error => {
            if (sequence !== ingredientMatchSequenceRef.current || controller.signal.aborted) return
            setIngredientMatchStates(current => ({
              ...current,
              [key]: (error as Error).message === '请求被取消' ? 'idle' : 'not_found',
            }))
          })
      }, 450)
      timers.push(timer)
    })
    return () => {
      timers.forEach(timer => window.clearTimeout(timer))
      controllers.forEach(controller => controller.abort())
    }
  // 只监听可变的编辑字段；若依赖整个 editing 对象，一个食材匹配完成会取消其他并行匹配。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryMatchPath, editing?.completed, editing?.id, editingIngredientNames, matchIngredient, view])
  const classifyEntriesInBackground = useCallback(async (
    entries: RecipeEntry[],
    persistAfterNavigation = false,
  ) => {
    await Promise.all(entries.map(async entry => {
      let changed = false
      const ingredients = await Promise.all(entry.ingredients.map(async ingredient => {
        if (ingredient.subcategory_id || ingredient.subcategory_name.trim().length < 2) return ingredient
        const result = await matchIngredient(
          ingredient.subcategory_name.trim(),
          new AbortController().signal,
        ).catch(() => null)
        if (result?.status !== 'matched' || !result.subcategory_id) return ingredient
        changed = true
        return {
          ...ingredient,
          subcategory_id: result.subcategory_id,
          matched_category_name: result.subcategory_name,
        }
      }))
      if (!changed || (!persistAfterNavigation && currentViewRef.current !== 'week')) return
      await request(`${recipesPath}/${entry.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekday: entry.weekday,
          dish_name: entry.dish_name,
          method: entry.method,
          note: entry.note,
          ingredients: ingredients.map(({ subcategory_name, quantity, subcategory_id }) => ({
            subcategory_name,
            quantity,
            subcategory_id,
          })),
        }),
      }).catch(() => undefined)
    }))
  }, [matchIngredient, recipesPath])
  useEffect(() => () => {
    if (copyNoticeTimer.current !== null) window.clearTimeout(copyNoticeTimer.current)
  }, [])
  const showCopyNotice = (notice: string) => {
    if (copyNoticeTimer.current !== null) window.clearTimeout(copyNoticeTimer.current)
    setCopyNotice(notice)
    copyNoticeTimer.current = window.setTimeout(() => { setCopyNotice(''); copyNoticeTimer.current = null }, 10000)
  }
  const openHistory = async () => {
    setMenuOpen(false); setMessage('')
    try { setHistory(await request<RecipeHistoryWeek[]>(`${recipesPath}/history?week_start=${currentMonday}`)); setView('history') }
    catch (error) { setMessage((error as Error).message) }
  }
  const openHistoryWeek = async (week: RecipeHistoryWeek) => {
    setMessage('')
    try { setHistoryDays(await request<RecipeDay[]>(`${recipesPath}?week_start=${week.week_start}`)); setSelectedHistoryWeek(week); setView('history-detail') }
    catch (error) { setMessage((error as Error).message) }
  }
  const copyRestock = async () => {
    const value = formatRestockClipboardText(restock)
    if (!value) return
    try {
      if (!navigator.clipboard) throw new Error('当前浏览器不支持剪切板')
      await navigator.clipboard.writeText(value); showCopyNotice('已复制到剪切板')
    } catch { showCopyNotice('复制失败，请重试') }
  }
  const complete = async (entry: RecipeEntry) => {
    const isCompleting = !entry.completed
    setCompletingEntryId(entry.id)
    try {
      const requestComplete = request(`${recipesPath}/${entry.id}/${entry.completed ? 'undo' : 'complete'}`, { method: 'POST' })
      if (isCompleting) await Promise.all([requestComplete, new Promise(resolve => window.setTimeout(resolve, 420))]); else await requestComplete
      await Promise.all([load(true), onInventoryChanged()])
    } catch (error) { setMessage((error as Error).message) } finally { setCompletingEntryId(null) }
  }
  const importText = async (mode: RecipeImportMode) => {
    if (!canEditRecipes) return
    const targetWeekStart = importWeekStart ?? monday
    setImportingMode(mode)
    try {
      const imported = await request<RecipeEntry[]>(`${recipesPath}/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ week_start: targetWeekStart, text, mode }) })
      setText(''); setImportWeekStart(null); setView('week'); await load(true)
      void classifyEntriesInBackground(imported)
    } catch (error) { setMessage((error as Error).message) } finally { setImportingMode(null) }
  }
  const copyHistoryWeek = async (targetOffset: 0 | 7) => {
    if (!selectedHistoryWeek || !canEditRecipes) return
    const target = addLocalCalendarDays(currentMonday, targetOffset)
    try {
      const copied = await request<RecipeDay[]>(`${recipesPath}/copy?week_start=${currentMonday}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source_week_start: selectedHistoryWeek.week_start, target_week_start: target }) })
      setWeekOffset(targetOffset); window.localStorage.setItem(recipeWeekStorageKey, String(targetOffset)); setDays(copied); setView('week')
      const shortages = await request<RestockEntry[]>(`${restockPath}?week_start=${currentMonday}`)
      setRestock(shortages); writePageCache(recipeCacheKey(refrigerator.id, target), { days: copied, restock: shortages })
    } catch (error) { setMessage((error as Error).message) }
  }
  const deleteEntry = async () => {
    if (!editing || !editing.id || !canEditRecipes) return
    setDeleteDialogOpen(false)
    try {
      await request(`${recipesPath}/${editing.id}`, { method: 'DELETE' })
      setEditing(null); setView('week'); await load(true)
    } catch (error) { setMessage((error as Error).message) }
  }
  const saveEntry = async () => {
    if (!editing || !canEditRecipes) return
    setSavingEntry(true)
    try {
      const path = editing.id ? `${recipesPath}/${editing.id}` : `${recipesPath}?week_start=${monday}`
      const saved = await request<RecipeEntry>(path, { method: editing.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ weekday: editing.weekday, dish_name: editing.dish_name, method: editing.method, note: editing.note, ingredients: editing.ingredients.map(({ subcategory_name, quantity, subcategory_id }) => ({ subcategory_name, quantity, subcategory_id })) }) })
      setEditing(null); setView('week'); await load(true)
      void classifyEntriesInBackground([saved], true)
    } catch (error) { setMessage((error as Error).message) } finally { setSavingEntry(false) }
  }
  const startNewEntry = (weekday: number) => {
    if (!canEditRecipes) return
    setMessage('')
    setEditing(createNewRecipeEntry(weekday))
    setView('edit')
  }
  if (view === 'import') return <PageShell className="p7-shell p9-shell" header={<PageHeader title="导入食谱" onBack={() => { setImportWeekStart(null); setView('week') }} />} bodyClassName="p7-scroll p9-import" footer={<footer className="bottom-action-bar p9-import-actions"><button className="p9-import-overwrite" disabled={!text.trim() || importingMode !== null} onClick={() => void importText('overwrite')}>{importingMode === 'overwrite' ? '导入中…' : '导入并覆盖'}</button><button disabled={!text.trim() || importingMode !== null} onClick={() => void importText('add')}>{importingMode === 'add' ? '导入中…' : '导入并添加'}</button></footer>}><p>导入目标：{(importWeekStart ?? monday) === currentMonday ? '本周' : '下周'}。每行一道菜。支持：周二：鸡蛋炒河粉（鸡蛋×4、火腿、河粉）</p><textarea value={text} onChange={event => setText(event.target.value)} placeholder="周一：小炒肉（猪肉、叶菜）" /><p>导入后可逐项编辑；食材名称必须完全匹配冰箱库存中的食材名称。</p>{message && <p className="claim-error" role="alert">{message}</p>}</PageShell>
  if (view === 'restock') {
    const restockGroups = splitRestockByWeek(restock, monday)
    const renderRestockEntries = (entries: RestockEntry[]) => entries.map(item => <section key={`${item.week_start ?? 'current'}-${item.weekday}-${item.dish_name}`}><h2>{item.label} · {item.dish_name}</h2><RestockMissingLine missing={item.missing} /></section>)
    return <PageShell className="p7-shell p9-shell" header={<PageHeader title="补货清单" onBack={() => setView('week')} right={<button className="p7-icon-button p9-copy-button" onClick={() => void copyRestock()} aria-label="复制补货清单" title="复制补货清单"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="12" rx="1" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v11h3" /></svg></button>} />} bodyClassName="p7-scroll p9-list">{copyNotice && <p className={`p9-copy-notice ${copyNotice === '已复制到剪切板' ? 'is-success' : ''}`} role="status" aria-live="polite">{copyNotice}</p>}{restock.length ? <>{renderRestockEntries(restockGroups.current)}{restockGroups.next.length > 0 && <><RestockWeekDivider />{renderRestockEntries(restockGroups.next)}</>}</> : <p className="p9-empty">本周和下周食材都足够。</p>}</PageShell>
  }
  if (view === 'history') return <PageShell className="p7-shell p9-shell" header={<PageHeader title="食谱历史" onBack={() => setView('week')} />} bodyClassName="p7-scroll p9-list p9-history"><p>不含本周和下周，查看最近 8 周食谱。</p>{message && <p className="claim-error" role="alert">{message}</p>}{history.map(week => <button className="p9-history-row" key={week.week_start} onClick={() => void openHistoryWeek(week)}><span><b>{week.label}</b><small className="p9-history-preview">{week.preview || '没有安排'}</small></span><b aria-hidden="true">›</b></button>)}</PageShell>
  if (view === 'history-detail' && selectedHistoryWeek) return <PageShell className="p7-shell p9-shell" header={<PageHeader title="食谱历史" onBack={() => setView('history')} />} bodyClassName="p7-scroll p9-list p9-history-detail" footer={<footer className="bottom-action-bar p9-history-copy"><p>{canEditRecipes ? '复制会覆盖目标周现有的全部食谱。' : '日常访问只能查看历史食谱。'}</p>{canEditRecipes && <div><button onClick={() => void copyHistoryWeek(0)}>复制到本周</button><button className="p9-history-secondary" onClick={() => void copyHistoryWeek(7)}>复制到下周</button></div>}</footer>}><h2>{selectedHistoryWeek.label}</h2>{historyDays.map(day => <section key={day.weekday}><h2>{day.label}</h2>{day.entries.length ? day.entries.map(entry => <article key={entry.id}><div><b>{entry.dish_name}</b><small>{entry.ingredients.map(item => `${item.subcategory_name}×${item.quantity}`).join('、') || '未添加食材'}</small>{entry.method && <em className="p9-method">{entry.method}</em>}{entry.note && <em className="p9-note">{entry.note}</em>}</div></article>) : <p className="p9-empty">还没有安排</p>}</section>)}</PageShell>
  if (view === 'edit' && editing) return <PageShell className="p7-shell p9-shell" header={<PageHeader title="编辑食谱" onBack={() => { setEditing(null); setView('week') }} right={<button className="p7-icon-button p9-save-button" type="button" disabled={savingEntry || !editing.dish_name.trim() || editing.ingredients.some(item => !item.subcategory_name.trim())} onClick={() => void saveEntry()} aria-label="保存食谱" title="保存食谱"><SaveIcon /></button>} />} bodyClassName="p7-scroll p9-edit" footer={editing.id ? <footer className="bottom-action-bar p9-edit-actions"><button className="p9-delete-recipe" type="button" onClick={() => setDeleteDialogOpen(true)}>删除食谱</button></footer> : undefined}><label>星期<select disabled={editing.completed} value={editing.weekday} onChange={event => setEditing({ ...editing, weekday: Number(event.target.value) })}>{['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((label, weekday) => <option key={label} value={weekday}>{label}</option>)}</select></label><label>菜名<input readOnly={editing.completed} value={editing.dish_name} onChange={event => setEditing({ ...editing, dish_name: event.target.value })} maxLength={160} /></label><h2>食材</h2>{editing.ingredients.map((ingredient, index) => { const itemName = ingredient.subcategory_name.trim(); const key = `${editing.id || 'new'}:${index}:${itemName}`; const state = ingredientMatchStates[key] ?? ingredient.category_match_state ?? 'idle'; return <RecipeIngredientEditorRow key={key} ingredient={ingredient} index={index} completed={editing.completed} matchText={recipeIngredientMatchText(state, ingredient.matched_category_name)} onNameChange={value => setEditing({ ...editing, ingredients: editing.ingredients.map((current, position) => position === index ? { ...current, subcategory_name: value, subcategory_id: undefined, matched_category_name: undefined, category_match_state: 'idle' } : current) })} onQuantityChange={value => setEditing({ ...editing, ingredients: editing.ingredients.map((current, position) => position === index ? { ...current, quantity: value } : current) })} onRemove={() => setEditing({ ...editing, ingredients: editing.ingredients.filter((_, position) => position !== index) })} /> })}<button disabled={editing.completed} className="p9-add-ingredient" onClick={() => setEditing({ ...editing, ingredients: [...editing.ingredients, { subcategory_name: '', quantity: 1 }] })}>＋ 添加食材</button><label>做法<textarea value={editing.method ?? ''} onChange={event => setEditing({ ...editing, method: event.target.value })} maxLength={2000} placeholder="例如：先炒鸡蛋，再加入河粉翻炒" /></label><label>备注<textarea value={editing.note ?? ''} onChange={event => setEditing({ ...editing, note: event.target.value })} maxLength={1000} placeholder="例如：少放油，孩子那份不加辣" /></label><p>{editing.completed ? '完成状态下只能修改做法和备注。' : '名称只会与库存食材名称严格匹配；分类匹配仅用于归类，不会改变食谱扣减规则。'}</p>{message && <p className="claim-error" role="alert">{message}</p>}{deleteDialogOpen && <ConfirmDialog title="删除食谱" message={editing.completed ? `将删除“${editing.dish_name}”。该食谱已经完成，删除后不会恢复已扣减的库存。` : `将删除“${editing.dish_name}”，此操作无法撤销。`} confirmLabel="删除食谱" onConfirm={() => void deleteEntry()} onCancel={() => setDeleteDialogOpen(false)} />}</PageShell>

  const selectWeek = (offset: 0 | 7) => { setWeekOffset(offset); window.localStorage.setItem(recipeWeekStorageKey, String(offset)) }
  const refresh = () => load(true)
  const visibleDays = orderRecipeDaysByCompletion(days)
    return <PageShell className="p7-shell p7-top-level p9-shell" onRefresh={refresh} refreshState={refreshState} header={<AppHeader title={<HeaderTitle title="每周食谱" refreshState={refreshState} refreshError={refreshError} />} left={<button className="p7-icon-button" onClick={() => setView('restock')} aria-label="查看补货清单"><svg className="p9-cart-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.2 11h10.6l3-8H6.1" /><circle cx="9" cy="19" r="1.2" /><circle cx="17" cy="19" r="1.2" /></svg></button>} right={<span ref={menuRef} className="p9-header-menu"><button className="p7-icon-button" onClick={() => setMenuOpen(value => !value)} aria-expanded={menuOpen} aria-haspopup="menu" aria-label="食谱菜单"><svg className="p9-menu-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg></button>{menuOpen && <span className="p9-menu" role="menu">{canEditRecipes && <button role="menuitem" onClick={() => { setMenuOpen(false); setImportWeekStart(monday); setView('import') }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></svg><span>导入食谱</span></button>}<button role="menuitem" onClick={() => void openHistory()}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></svg><span>菜单历史</span></button></span>}</span>} />} bodyClassName="p7-scroll p9-list p9-week-list" footer={<P7Navigation active="recipes" onHome={onBack} onRecipes={() => undefined} onFridge={onFridge} onMe={onMe} />}><div className="p9-week-tabs"><button className={!weekOffset ? 'is-active' : ''} onClick={() => selectWeek(0)}>本周</button><button className={weekOffset ? 'is-active' : ''} onClick={() => selectWeek(7)}>下周</button></div>{message && <p className="claim-error" role="alert">{message}</p>}{visibleDays.map(day => <section key={day.weekday}><div className="p9-day-heading"><h2>{day.label}</h2>{canEditRecipes && <button className="p9-add-day-button" type="button" onClick={() => startNewEntry(day.weekday)} aria-label={`${day.label}添加食谱`} title={`${day.label}添加食谱`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button>}</div>{day.entries.length ? day.entries.map(entry => {
    const isCompleting = completingEntryId === entry.id
    const openEdit = () => { if (!canEditRecipes) return; setEditing({ ...entry, method: entry.method ?? null, ingredients: entry.ingredients.map(item => ({ ...item })) }); setView('edit') }
    return <article className={entry.completed ? 'is-complete' : 'is-editable'} key={entry.id} onClick={openEdit} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openEdit() } }} role="button" tabIndex={0} aria-label={entry.completed ? `编辑${entry.dish_name}（仅可修改做法和备注）` : `编辑${entry.dish_name}`}><div><b>{entry.dish_name}</b><small><RecipeIngredientList ingredients={entry.ingredients} missing={entry.missing} inventory={inventory} icons={icons} /></small>{entry.method && <em className="p9-method">{entry.method}</em>}{entry.note && <em className="p9-note">{entry.note}</em>}</div><span className="p9-entry-actions"><button className="p9-entry-action" type="button" disabled={isCompleting} onClick={event => { event.stopPropagation(); void complete(entry) }} aria-label={entry.completed ? `恢复${entry.dish_name}为未完成` : `完成${entry.dish_name}`}><RecipeCompletionIcon completed={entry.completed} /></button></span></article>
  }) : <p className="p9-empty">还没有安排</p>}</section>)}</PageShell>
}
