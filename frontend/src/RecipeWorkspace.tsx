/** P9 食谱浏览、导入、历史和补货工作区。 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Category, CategoryMatchResult, CustomShoppingItem, Icon, InventoryBatch, RecipeDay, RecipeEntry, RecipeHistoryWeek, RecipeIngredient, Refrigerator, RestockEntry } from './appTypes'
import { AppHeader, ConfirmDialog, Dialog, HeaderTitle, OptionPickerField, PageHeader, P7Navigation, PageShell, QuantityStepper, RecipeCompletionIcon, RecipeIngredientList, RuntimeImage, SaveIcon, type RefreshState } from './sharedUi'
import { CategoryPickerPanel } from './CategoryPickerPanel'
import { request, streamRequest } from './appApi'
import { addLocalCalendarDays, getLocalMonday, orderRecipeDaysByCompletion } from './recipeCalendar'
import { readPageCache, recipeCacheKey, writePageCache } from './pageCache'
import { getRefrigeratorWorkspacePath } from './refrigeratorAccess'
import { formatRestockClipboardText } from './restockClipboard'
import { splitRestockByWeek } from './restockGroups'
import { useDismissibleMenu } from './menuBehavior'
import { createNewRecipeEntry } from './recipeDraft'
import type { CategoryMatchState } from './categoryMatch'
import { recipeIngredientMatchDisplayText } from './recipeCategoryMatch'
import { formatQuantity, parseQuantity, stepQuantity } from './quantity'
import { getRecipeHistoryPageKey } from './recipeHistoryPage'
import { getRecipeIngredientIcon } from './recipeAction'
import { appRuntime } from './runtime'
import { shareContent, type ShareResult } from './nativeBridge'
import { resolveIconVariant } from './iconVariants'
import { useTheme } from './theme'

type RecipeCache = { days: RecipeDay[]; restock: RestockEntry[]; customShoppingItems?: CustomShoppingItem[] }
type RecipeImportMode = 'add' | 'overwrite'

type CustomShoppingDraft = { id?: string; itemName: string; quantity: string }

const RECIPE_WEEKDAY_OPTIONS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((label, weekday) => ({ value: String(weekday), label }))

const shareResultNotices: Record<ShareResult, string> = {
  shared: '已打开分享',
  cancelled: '已取消分享',
  copied: '已复制到剪切板',
  unavailable: '分享不可用，请重试',
}

function emptyCustomShoppingDraft(): CustomShoppingDraft {
  return { itemName: '', quantity: '1' }
}

/** 购物清单自定义项目的多行录入模态框。 */
export function AddCustomShoppingDialog({ initialItems, saving, onClose, onSave }: { initialItems: CustomShoppingItem[]; saving: boolean; onClose: () => void; onSave: (items: CustomShoppingDraft[], deletedIds: string[]) => void }) {
  const [drafts, setDrafts] = useState<CustomShoppingDraft[]>(() => initialItems.length ? initialItems.map(item => ({ id: item.id, itemName: item.item_name, quantity: String(item.quantity) })) : [emptyCustomShoppingDraft()])
  const lastValidQuantities = useRef<Record<number, string>>(Object.fromEntries(initialItems.map((item, index) => [index, String(item.quantity)])))
  const [deletedIds, setDeletedIds] = useState<string[]>([])
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])
  const appendRow = (focus = true) => {
    setDrafts(current => [...current, emptyCustomShoppingDraft()])
    if (focus) window.setTimeout(() => inputRefs.current[drafts.length]?.focus(), 0)
  }
  const updateDraft = (index: number, change: Partial<CustomShoppingDraft>) => {
    setDrafts(current => current.map((item, position) => position === index ? { ...item, ...change } : item))
  }
  const removeDraft = (index: number) => {
    const item = drafts[index]
    if (item?.id) setDeletedIds(current => [...current, item.id!])
    setDrafts(current => current.filter((_, position) => position !== index))
  }
  const submit = () => {
    const items = drafts.map(item => ({ ...item, itemName: item.itemName.trim(), quantity: formatQuantity(Math.max(1, parseQuantity(item.quantity) ?? 1)) }))
    const emptyExistingIds = items.filter(item => item.id && !item.itemName).map(item => item.id!)
    const validItems = items.filter(item => item.itemName)
    if (validItems.length || deletedIds.length || emptyExistingIds.length) onSave(validItems, [...deletedIds, ...emptyExistingIds])
  }
  return <Dialog title="编辑购物清单" onClose={saving ? undefined : onClose} closeDisabled={saving} dialogClassName="p9-custom-shopping-dialog">
    <div className="p9-custom-shopping-rows">
      {drafts.map((item, index) => <div className="p9-custom-shopping-row" key={index}>
        <input ref={element => { inputRefs.current[index] = element }} autoFocus={index === 0} value={item.itemName} placeholder="物品名称" aria-label={`物品名称 ${index + 1}`} onChange={event => updateDraft(index, { itemName: event.target.value })} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); appendRow() } }} />
        <QuantityStepper value={item.quantity} min={1} onChange={quantity => { if (parseQuantity(quantity) !== null && parseQuantity(quantity)! >= 1) lastValidQuantities.current[index] = formatQuantity(parseQuantity(quantity)!); updateDraft(index, { quantity }) }} onBlur={() => updateDraft(index, { quantity: lastValidQuantities.current[index] ?? '1' })} onIncrement={() => { const next = stepQuantity(item.quantity, 1, 1); lastValidQuantities.current[index] = next; updateDraft(index, { quantity: next }) }} onDecrement={() => { const next = stepQuantity(item.quantity, -1, 1); lastValidQuantities.current[index] = next; updateDraft(index, { quantity: next }) }} ariaLabel={`数量 ${index + 1}`} className="p5-inventory-quantity" />
        <button className="p9-remove-shopping-row" type="button" onClick={() => removeDraft(index)} aria-label={`删除${item.itemName || `第 ${index + 1} 行`}`} title="删除这一行"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg></button>
      </div>)}
    </div>
    <button className="p9-add-shopping-row" type="button" onClick={() => appendRow()} aria-label="添加下一行" title="添加下一行"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button>
    <div className="modal-actions"><button className="modal-primary" type="button" disabled={saving || (!drafts.some(item => item.itemName.trim()) && !deletedIds.length)} onClick={submit}>{saving ? '保存中…' : '保存'}</button></div>
  </Dialog>
}

export function RestockMissingLine({ missing, inventory = [], icons = [] }: { missing: RestockEntry['missing']; inventory?: Pick<InventoryBatch, 'item_name' | 'icon_key'>[]; icons?: Icon[] }) {
  const theme = useTheme()
  return <p className="p9-restock-missing"><b>{missing.map((item, index) => {
    const icon = getRecipeIngredientIcon(item.subcategory_name, inventory, icons)
    const resolved = icon ? resolveIconVariant(icon, theme) : null
    return <span className="p9-restock-item" key={`${item.subcategory_name}-${index}`}>{resolved && <RuntimeImage className="p9-restock-item-icon" src={resolved.assetUrl} alt="" />}<span>{item.subcategory_name} × {item.quantity}</span>{index < missing.length - 1 && '，'}</span>
  })}</b></p>
}

export function RestockWeekDivider({ label = '下周' }: { label?: string }) {
  return <div className="p9-restock-week-divider" role="separator" aria-label={label}><span>{label}</span></div>
}

export function RecipeIngredientEditorRow({
  ingredient,
  index,
  completed,
  categoryName,
  matchText,
  onCategoryClick,
  onNameChange,
  onNameBlur,
  onQuantityChange,
  onRemove,
}: {
  ingredient: RecipeIngredient
  index: number
  completed: boolean
  categoryName: string
  matchText: string
  onCategoryClick: () => void
  onNameChange: (value: string) => void
  onNameBlur: (value: string) => void
  onQuantityChange: (value: number) => void
  onRemove: () => void
}) {
  const [quantityDraft, setQuantityDraft] = useState(formatQuantity(ingredient.quantity))
  const normalizeQuantity = () => {
    const parsed = parseQuantity(quantityDraft) ?? ingredient.quantity
    const normalized = formatQuantity(Math.max(0.01, parsed))
    setQuantityDraft(normalized)
    onQuantityChange(Number(normalized))
  }
  return <div className="p9-ingredient"><div className="p9-ingredient-name"><input readOnly={completed} aria-label={`食材 ${index + 1}`} value={ingredient.subcategory_name} onChange={event => onNameChange(event.target.value)} onBlur={event => onNameBlur(event.target.value)} /><button className="p9-category-link" type="button" disabled={completed} onClick={onCategoryClick} aria-label={categoryName ? `修改${categoryName}分类` : `为食材 ${index + 1}选择分类`}>{categoryName ? `分类：${categoryName}` : '选择分类'}</button>{matchText && !categoryName && <small className="p9-category-match-status" role="status">{matchText}</small>}</div><QuantityStepper value={quantityDraft} min={0.01} disabled={completed} onChange={value => { setQuantityDraft(value); const parsed = parseQuantity(value); if (parsed !== null && parsed >= 0.01) onQuantityChange(parsed) }} onBlur={normalizeQuantity} onIncrement={() => { const next = stepQuantity(quantityDraft, 1, 0.01); setQuantityDraft(next); onQuantityChange(Number(next)) }} onDecrement={() => { const next = stepQuantity(quantityDraft, -1, 0.01); setQuantityDraft(next); onQuantityChange(Number(next)) }} ariaLabel={`食材 ${index + 1} 数量`} className="p9-ingredient-quantity" /><button className="p9-remove-ingredient" type="button" disabled={completed} onClick={onRemove} aria-label={`移除食材 ${index + 1}`} title="移除食材"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg></button></div>
}

export function RecipeWorkspace({ refrigerator, categories = [], icons, inventory, refreshAt, initialView = 'week', onBack, onMe, onInventoryChanged }: { refrigerator: Refrigerator; categories?: Category[]; icons: Icon[]; inventory: InventoryBatch[]; refreshAt: number; initialView?: 'week' | 'restock'; onBack: () => void; onMe: () => void; onInventoryChanged: () => Promise<void> }) {
  const recipeWeekStorageKey = `fb-last-recipe-week:${refrigerator.id}`
  const [weekOffset, setWeekOffset] = useState(() => window.localStorage.getItem(recipeWeekStorageKey) === '7' ? 7 : 0)
  const currentMonday = getLocalMonday(new Date())
  const monday = addLocalCalendarDays(currentMonday, weekOffset)
  const initialCache = readPageCache<RecipeCache>(recipeCacheKey(refrigerator.id, monday))
  const [days, setDays] = useState<RecipeDay[]>(initialCache?.data.days ?? [])
  const [restock, setRestock] = useState<RestockEntry[]>(initialCache?.data.restock ?? [])
  const [customShoppingItems, setCustomShoppingItems] = useState<CustomShoppingItem[]>(initialCache?.data.customShoppingItems ?? [])
  const [history, setHistory] = useState<RecipeHistoryWeek[]>([])
  const [historyDays, setHistoryDays] = useState<RecipeDay[]>([])
  const [selectedHistoryWeek, setSelectedHistoryWeek] = useState<RecipeHistoryWeek | null>(null)
  const [text, setText] = useState('')
  const [importWeekStart, setImportWeekStart] = useState<string | null>(null)
  const [view, setView] = useState<'week' | 'import' | 'restock' | 'edit' | 'history' | 'history-detail'>(initialView)
  const [editing, setEditing] = useState<RecipeEntry | null>(null)
  const [message, setMessage] = useState('')
  const [copyNotice, setCopyNotice] = useState('')
  const copyNoticeTimer = useRef<number | null>(null)
  const ingredientMatchSequenceRef = useRef<Record<string, number>>({})
  const ingredientMatchControllersRef = useRef<Record<string, AbortController | undefined>>({})
  const currentViewRef = useRef(view)
  const [completingEntryId, setCompletingEntryId] = useState<string | null>(null)
  const [importingMode, setImportingMode] = useState<RecipeImportMode | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [savingEntry, setSavingEntry] = useState(false)
  const [customDialogOpen, setCustomDialogOpen] = useState(false)
  const [savingCustomItems, setSavingCustomItems] = useState(false)
  const [ingredientMatchStates, setIngredientMatchStates] = useState<Record<string, CategoryMatchState>>({})
  const [ingredientMatchTextLengths, setIngredientMatchTextLengths] = useState<Record<string, number>>({})
  const [ingredientMatchMessages, setIngredientMatchMessages] = useState<Record<string, string>>({})
  const [categoryPickerIndex, setCategoryPickerIndex] = useState<number | null>(null)
  const [categoryPickerQuery, setCategoryPickerQuery] = useState('')
  const [activeCategoryGroupId, setActiveCategoryGroupId] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useDismissibleMenu<HTMLSpanElement>(menuOpen, () => setMenuOpen(false))
  const [refreshState, setRefreshState] = useState<RefreshState>(initialCache?.isStale ? 'loading' : 'idle')
  const [refreshError, setRefreshError] = useState('')
  const canEditRecipes = refrigerator.access_role === 'owner'
  const categoryParents = categories.filter(category => !category.parent_id)
  const categoryChildren = categories.filter(category => category.parent_id)
  const recipesPath = getRefrigeratorWorkspacePath(refrigerator, 'recipes')
  const restockPath = getRefrigeratorWorkspacePath(refrigerator, 'restock')
  const customShoppingItemsPath = getRefrigeratorWorkspacePath(refrigerator, 'custom-shopping-items')
  const categoryMatchPath = getRefrigeratorWorkspacePath(refrigerator, 'category-match')
  useEffect(() => {
    currentViewRef.current = view
  }, [view])
  const load = useCallback(async (force = false) => {
    const cached = readPageCache<RecipeCache>(recipeCacheKey(refrigerator.id, monday))
    if (!force && cached && !cached.isStale) {
      setDays(cached.data.days); setRestock(cached.data.restock); setCustomShoppingItems(cached.data.customShoppingItems ?? [])
      try {
        const customItems = await request<CustomShoppingItem[]>(customShoppingItemsPath)
        setCustomShoppingItems(customItems)
        writePageCache(recipeCacheKey(refrigerator.id, monday), { ...cached.data, customShoppingItems: customItems })
        setRefreshState('idle')
      } catch (error) {
        setRefreshState('error'); setRefreshError((error as Error).message)
      }
      return
    }
    if (cached) { setDays(cached.data.days); setRestock(cached.data.restock); setCustomShoppingItems(cached.data.customShoppingItems ?? []) }
    setRefreshState('loading'); setRefreshError('')
    try {
      const [week, shortages, customItems] = await Promise.all([
        request<RecipeDay[]>(`${recipesPath}?week_start=${monday}`),
        request<RestockEntry[]>(`${restockPath}?week_start=${monday}`),
        request<CustomShoppingItem[]>(customShoppingItemsPath),
      ])
      setDays(week); setRestock(shortages); setCustomShoppingItems(customItems); writePageCache(recipeCacheKey(refrigerator.id, monday), { days: week, restock: shortages, customShoppingItems: customItems }); setRefreshState('idle')
    } catch (error) {
      setRefreshState('error'); setRefreshError((error as Error).message)
      if (!cached) setMessage((error as Error).message)
    }
  }, [customShoppingItemsPath, monday, refrigerator.id, recipesPath, restockPath])
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const cached = readPageCache<RecipeCache>(recipeCacheKey(refrigerator.id, monday))
      const changedSinceCache = refreshAt > 0 && (!cached || cached.savedAt < refreshAt)
      void load(changedSinceCache)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load, monday, refreshAt, refrigerator.id])
  const refresh = () => load(true)
  const openCustomShoppingDialog = async () => {
    if (savingCustomItems) return
    setSavingCustomItems(true)
    try {
      const items = await request<CustomShoppingItem[]>(customShoppingItemsPath)
      setCustomShoppingItems(items)
      setCustomDialogOpen(true)
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setSavingCustomItems(false)
    }
  }
  const matchIngredient = useCallback(async (
    itemName: string,
    signal: AbortSignal,
    onTextLength?: (length: number) => void,
    onStatus?: (message: string) => void,
  ): Promise<CategoryMatchResult> => {
    const fast = await request<CategoryMatchResult>(`${categoryMatchPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_name: itemName }),
      signal,
    })
    if (fast.status !== 'needs_ai' || !fast.request_id) return fast
    const ai = await streamRequest<CategoryMatchResult>(`${categoryMatchPath}/ai/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_name: itemName, request_id: fast.request_id }),
      signal,
    }, event => {
      if (event.type === 'status') onStatus?.(String(event.data.message ?? '正在自动匹配分类…'))
      if (event.type === 'token') onTextLength?.(Number(event.data.text_length ?? 0))
    })
    if (ai.request_id) return ai
    return { ...ai, request_id: fast.request_id }
  }, [categoryMatchPath])
  useEffect(() => () => {
    Object.values(ingredientMatchControllersRef.current).forEach(controller => controller?.abort())
  }, [])
  const cancelIngredientMatch = (index: number) => {
    if (!editing) return
    const rowKey = `${editing.id || 'new'}:${index}`
    ingredientMatchSequenceRef.current[rowKey] = (ingredientMatchSequenceRef.current[rowKey] ?? 0) + 1
    ingredientMatchControllersRef.current[rowKey]?.abort()
    delete ingredientMatchControllersRef.current[rowKey]
  }
  const updateIngredientName = (index: number, value: string) => {
    if (!editing) return
    cancelIngredientMatch(index)
    setEditing({
      ...editing,
      ingredients: editing.ingredients.map((current, position) => position === index
        ? { ...current, subcategory_name: value, subcategory_id: undefined, matched_category_name: undefined, category_match_state: 'idle' }
        : current),
    })
  }
  const matchIngredientOnBlur = useCallback((index: number, rawItemName: string) => {
    if (!editing || editing.completed) return
    const itemName = rawItemName.trim()
    if (editing.ingredients[index]?.subcategory_id) return
    const editingId = editing.id || 'new'
    const rowKey = `${editingId}:${index}`
    const key = `${rowKey}:${itemName}`
    const sequence = (ingredientMatchSequenceRef.current[rowKey] ?? 0) + 1
    ingredientMatchSequenceRef.current[rowKey] = sequence
    ingredientMatchControllersRef.current[rowKey]?.abort()
    if (itemName.length < 2) {
      setIngredientMatchStates(current => ({ ...current, [key]: 'idle' }))
      return
    }
    const controller = new AbortController()
    ingredientMatchControllersRef.current[rowKey] = controller
    setIngredientMatchMessages(current => ({ ...current, [key]: '' }))
    setIngredientMatchTextLengths(current => ({ ...current, [key]: 0 }))
    setIngredientMatchStates(current => ({ ...current, [key]: 'checking' }))
    void matchIngredient(
      itemName,
      controller.signal,
      length => setIngredientMatchTextLengths(current => ({ ...current, [key]: length })),
      status => setIngredientMatchMessages(current => ({ ...current, [key]: status })),
    )
      .then(result => {
        if (ingredientMatchSequenceRef.current[rowKey] !== sequence || controller.signal.aborted) return
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
                ? { ...value, subcategory_id: result.subcategory_id, matched_category_name: result.subcategory_name, category_match_state: 'matched' }
                : value),
            }
          })
          setIngredientMatchStates(current => ({ ...current, [key]: 'matched' }))
        } else {
          setIngredientMatchStates(current => ({ ...current, [key]: 'not_found' }))
        }
      })
      .catch(error => {
        if (ingredientMatchSequenceRef.current[rowKey] !== sequence || controller.signal.aborted) return
        setIngredientMatchStates(current => ({
          ...current,
          [key]: (error as Error).message === '请求被取消' ? 'idle' : 'not_found',
        }))
      })
      .finally(() => {
        if (ingredientMatchControllersRef.current[rowKey] === controller) delete ingredientMatchControllersRef.current[rowKey]
      })
  }, [editing, matchIngredient])
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
    const value = formatRestockClipboardText(restock, customShoppingItems)
    if (!value) return
    try {
      if (appRuntime.kind === 'capacitor') {
        const result = await shareContent({ title: '购物清单', text: value })
        showCopyNotice(shareResultNotices[result])
        return
      }
      if (!navigator.clipboard) throw new Error('当前浏览器不支持剪切板')
      await navigator.clipboard.writeText(value); showCopyNotice('已复制到剪切板')
    } catch { showCopyNotice('复制失败，请重试') }
  }
  const saveCustomShoppingItems = async (drafts: CustomShoppingDraft[], deletedIds: string[]) => {
    if (savingCustomItems) return
    setSavingCustomItems(true)
    try {
      const headers = { 'Content-Type': 'application/json' }
      const existing = drafts.filter(item => item.id)
      const newItems = drafts.filter(item => !item.id)
      const [updated, created] = await Promise.all([
        Promise.all(existing.map(item => request<CustomShoppingItem>(`${customShoppingItemsPath}/${item.id}`, { method: 'PUT', headers, body: JSON.stringify({ item_name: item.itemName, quantity: parseQuantity(item.quantity) ?? 1 }) }))),
        newItems.length ? request<CustomShoppingItem[]>(customShoppingItemsPath, { method: 'POST', headers, body: JSON.stringify({ items: newItems.map(item => ({ item_name: item.itemName, quantity: parseQuantity(item.quantity) ?? 1 })) }) }) : Promise.resolve([]),
      ])
      await Promise.all([...deletedIds.filter((id, index, ids) => ids.indexOf(id) === index).map(id => request(`${customShoppingItemsPath}/${id}`, { method: 'DELETE' }))])
      const savedItems = [...updated, ...created].sort((left, right) => left.display_order - right.display_order)
      setCustomShoppingItems(savedItems); setCustomDialogOpen(false)
      const cached = readPageCache<RecipeCache>(recipeCacheKey(refrigerator.id, monday))
      writePageCache(recipeCacheKey(refrigerator.id, monday), { days: cached?.data.days ?? days, restock: cached?.data.restock ?? restock, customShoppingItems: savedItems })
    } catch (error) { setMessage((error as Error).message) } finally { setSavingCustomItems(false) }
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
      writePageCache(recipeCacheKey(refrigerator.id, target), { days: copied, restock: shortages, customShoppingItems })
      setRestock(shortages)
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
  const openCategoryPicker = (index: number) => {
    if (!editing || editing.completed) return
    const currentCategory = categoryChildren.find(category => category.id === editing.ingredients[index]?.subcategory_id)
    setCategoryPickerQuery('')
    setActiveCategoryGroupId(currentCategory?.parent_id ?? categoryParents[0]?.id ?? '')
    setCategoryPickerIndex(index)
  }
  const selectIngredientCategory = (category: Category) => {
    if (!editing || categoryPickerIndex === null) return
    const index = categoryPickerIndex
    cancelIngredientMatch(index)
    setEditing(current => current ? {
      ...current,
      ingredients: current.ingredients.map((ingredient, position) => position === index
        ? { ...ingredient, subcategory_id: category.id, matched_category_name: category.name, category_match_state: 'matched' }
        : ingredient),
    } : current)
    setCategoryPickerIndex(null)
  }
  if (view === 'import') return <PageShell className="p7-shell p9-shell" header={<PageHeader title="导入食谱" onBack={() => { setImportWeekStart(null); setView('week') }} />} bodyClassName="p7-scroll p9-import" footer={<footer className="bottom-action-bar p9-import-actions"><button className="p9-import-overwrite" disabled={!text.trim() || importingMode !== null} onClick={() => void importText('overwrite')}>{importingMode === 'overwrite' ? '导入中…' : '导入并覆盖'}</button><button className="p9-import-add" disabled={!text.trim() || importingMode !== null} onClick={() => void importText('add')}>{importingMode === 'add' ? '导入中…' : '导入并添加'}</button></footer>}><p>导入目标：{(importWeekStart ?? monday) === currentMonday ? '本周' : '下周'}。每行一道菜。支持：周二：鸡蛋炒河粉（鸡蛋×4、火腿、河粉）</p><textarea value={text} onChange={event => setText(event.target.value)} placeholder="周一：小炒肉（猪肉、叶菜）" /><p>导入后可逐项编辑；库存判断要求分类一致，且库存物品名称包含食材名称。</p>{message && <p className="claim-error" role="alert">{message}</p>}</PageShell>
  if (view === 'restock') {
    const restockGroups = splitRestockByWeek(restock, monday)
    const renderRestockEntries = (entries: RestockEntry[]) => entries.map(item => <section key={`${item.week_start ?? 'current'}-${item.weekday}-${item.dish_name}`}><h2>{item.label} · {item.dish_name}</h2><RestockMissingLine missing={item.missing} inventory={inventory} icons={icons} /></section>)
    return <PageShell className="p7-shell p7-top-level p9-shell" onRefresh={refresh} refreshState={refreshState} header={<AppHeader title={<HeaderTitle title="购物清单" refreshState={refreshState} refreshError={refreshError} />} left={<button className="p7-icon-button p9-copy-button" onClick={() => void copyRestock()} aria-label={appRuntime.kind === 'capacitor' ? '分享购物清单' : '复制购物清单'} title={appRuntime.kind === 'capacitor' ? '分享购物清单' : '复制购物清单'}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="12" rx="1" /><path d="M16 8V5a2 2 0 0 0-2-2H5v11h3" /></svg></button>} right={<button className="p7-icon-button p9-add-shopping-button" onClick={() => void openCustomShoppingDialog()} disabled={savingCustomItems} aria-label="编辑购物清单" title="编辑购物清单"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button>} />} bodyClassName="p7-scroll p9-list" footer={<P7Navigation active="shopping" onHome={onBack} onRecipes={() => setView('week')} onShopping={() => undefined} onMe={onMe} />}>{copyNotice && <p className={`p9-copy-notice ${copyNotice === '已复制到剪切板' ? 'is-success' : ''}`} role="status" aria-live="polite">{copyNotice}</p>}<RestockWeekDivider label="本周" />{restock.length ? <>{renderRestockEntries(restockGroups.current)}{restockGroups.next.length > 0 && <><RestockWeekDivider />{renderRestockEntries(restockGroups.next)}</>}</> : <p className="p9-empty">本周和下周食材都足够。</p>}<RestockWeekDivider label="自定义" />{customShoppingItems.length ? <p className="p9-custom-shopping-list">{customShoppingItems.map(item => `${item.item_name} × ${item.quantity}`).join('，')}</p> : <p className="p9-empty">还没有自定义购物项。</p>}{customDialogOpen && <AddCustomShoppingDialog initialItems={customShoppingItems} saving={savingCustomItems} onClose={() => setCustomDialogOpen(false)} onSave={(items, deletedIds) => void saveCustomShoppingItems(items, deletedIds)} />}</PageShell>
  }
  if (view === 'history') return <PageShell key={getRecipeHistoryPageKey('history')} className="p7-shell p9-shell" header={<PageHeader title="食谱历史" onBack={() => setView('week')} />} bodyClassName="p7-scroll p9-list p9-history"><p>不含本周和下周，查看最近 8 周食谱。</p>{message && <p className="claim-error" role="alert">{message}</p>}{history.map(week => <button className="p9-history-row" key={week.week_start} onClick={() => void openHistoryWeek(week)}><span><b>{week.label}</b><small className="p9-history-preview">{week.preview || '没有安排'}</small></span><b aria-hidden="true">›</b></button>)}</PageShell>
  if (view === 'history-detail' && selectedHistoryWeek) return <PageShell key={getRecipeHistoryPageKey('history-detail')} className="p7-shell p9-shell" header={<PageHeader title="食谱历史" onBack={() => setView('history')} />} bodyClassName="p7-scroll p9-list p9-history-detail" footer={<footer className="bottom-action-bar p9-history-copy"><p>{canEditRecipes ? '复制会覆盖目标周现有的全部食谱。' : '日常访问只能查看历史食谱。'}</p>{canEditRecipes && <div><button onClick={() => void copyHistoryWeek(0)}>复制到本周</button><button className="p9-history-secondary" onClick={() => void copyHistoryWeek(7)}>复制到下周</button></div>}</footer>}><h2>{selectedHistoryWeek.label}</h2>{historyDays.map(day => <section key={day.weekday}><h2>{day.label}</h2>{day.entries.length ? day.entries.map(entry => <article key={entry.id}><div><b>{entry.dish_name}</b><small>{entry.ingredients.map(item => `${item.subcategory_name}×${item.quantity}`).join('、') || '未添加食材'}</small>{entry.method && <em className="p9-method">{entry.method}</em>}{entry.note && <em className="p9-note">{entry.note}</em>}</div></article>) : <p className="p9-empty">还没有安排</p>}</section>)}</PageShell>
  if (view === 'edit' && editing) return <PageShell className="p7-shell p9-shell" header={<PageHeader title="编辑食谱" onBack={() => { setCategoryPickerIndex(null); setEditing(null); setView('week') }} right={<button className="p7-icon-button p9-save-button" type="button" disabled={savingEntry || !editing.dish_name.trim() || editing.ingredients.some(item => !item.subcategory_name.trim())} onClick={() => void saveEntry()} aria-label="保存食谱" title="保存食谱"><SaveIcon /></button>} />} bodyClassName="p7-scroll p9-edit" footer={editing.id ? <footer className="bottom-action-bar p9-edit-actions"><button className="p9-delete-recipe" type="button" onClick={() => setDeleteDialogOpen(true)}>删除食谱</button></footer> : undefined}><OptionPickerField label="星期" value={String(editing.weekday)} options={RECIPE_WEEKDAY_OPTIONS} disabled={editing.completed} onChange={value => setEditing(current => current ? { ...current, weekday: Number(value) } : current)} /><label>菜名<input readOnly={editing.completed} value={editing.dish_name} onChange={event => setEditing({ ...editing, dish_name: event.target.value })} maxLength={160} /></label><h2>食材</h2>{editing.ingredients.map((ingredient, index) => { const key = `${editing.id || 'new'}:${index}`; const stateKey = `${key}:${ingredient.subcategory_name.trim()}`; const state = ingredientMatchStates[stateKey] ?? ingredient.category_match_state ?? 'idle'; const categoryName = ingredient.matched_category_name ?? categoryChildren.find(category => category.id === ingredient.subcategory_id)?.name ?? ''; return <RecipeIngredientEditorRow key={key} ingredient={ingredient} index={index} completed={editing.completed} categoryName={categoryName} matchText={recipeIngredientMatchDisplayText(state, categoryName, ingredientMatchTextLengths[stateKey] ?? 0, ingredientMatchMessages[stateKey] ?? '')} onCategoryClick={() => openCategoryPicker(index)} onNameChange={value => updateIngredientName(index, value)} onNameBlur={value => matchIngredientOnBlur(index, value)} onQuantityChange={value => setEditing({ ...editing, ingredients: editing.ingredients.map((current, position) => position === index ? { ...current, quantity: value } : current) })} onRemove={() => setEditing({ ...editing, ingredients: editing.ingredients.filter((_, position) => position !== index) })} /> })}<button disabled={editing.completed} className="p9-add-ingredient" onClick={() => setEditing({ ...editing, ingredients: [...editing.ingredients, { subcategory_name: '', quantity: 1 }] })}>＋ 添加食材</button><label>做法<textarea value={editing.method ?? ''} onChange={event => setEditing({ ...editing, method: event.target.value })} maxLength={2000} placeholder="例如：先炒鸡蛋，再加入河粉翻炒" /></label><label>备注<textarea value={editing.note ?? ''} onChange={event => setEditing({ ...editing, note: event.target.value })} maxLength={1000} placeholder="例如：少放油，孩子那份不加辣" /></label><p>{editing.completed ? '完成状态下只能修改做法和备注。' : '库存判断要求分类一致，且库存物品名称包含食材名称。分类匹配状态只表示食材已归类，不会改变这一规则。'}</p>{message && <p className="claim-error" role="alert">{message}</p>}{deleteDialogOpen && <ConfirmDialog title="删除食谱" message={editing.completed ? `将删除“${editing.dish_name}”。该食谱已经完成，删除后不会恢复已扣减的库存。` : `将删除“${editing.dish_name}”，此操作无法撤销。`} confirmLabel="删除食谱" onConfirm={() => void deleteEntry()} onCancel={() => setDeleteDialogOpen(false)} />}{categoryPickerIndex !== null && <CategoryPickerPanel title="选择分类" query={categoryPickerQuery} parents={categoryParents} children={categoryPickerQuery.trim() ? categoryChildren.filter(category => category.name.includes(categoryPickerQuery.trim())) : categoryChildren.filter(category => category.parent_id === activeCategoryGroupId)} icons={icons} activeGroupId={activeCategoryGroupId} selectedCategoryId={editing.ingredients[categoryPickerIndex]?.subcategory_id ?? undefined} onQueryChange={setCategoryPickerQuery} onSelectGroup={setActiveCategoryGroupId} onSelectCategory={selectIngredientCategory} onClose={() => setCategoryPickerIndex(null)} />}</PageShell>

  const selectWeek = (offset: 0 | 7) => { setWeekOffset(offset); window.localStorage.setItem(recipeWeekStorageKey, String(offset)) }
  const visibleDays = orderRecipeDaysByCompletion(days)
    return <PageShell className="p7-shell p7-top-level p9-shell" onRefresh={refresh} refreshState={refreshState} header={<AppHeader title={<HeaderTitle title="每周食谱" refreshState={refreshState} refreshError={refreshError} />} right={<span ref={menuRef} className="p9-header-menu"><button className="p7-icon-button" onClick={() => setMenuOpen(value => !value)} aria-expanded={menuOpen} aria-haspopup="menu" aria-label="食谱菜单"><svg className="p9-menu-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg></button>{menuOpen && <span className="p9-menu" role="menu">{canEditRecipes && <button role="menuitem" onClick={() => { setMenuOpen(false); setImportWeekStart(monday); setView('import') }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></svg><span>导入食谱</span></button>}<button role="menuitem" onClick={() => void openHistory()}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></svg><span>菜单历史</span></button></span>}</span>} />} bodyClassName="p7-scroll p9-list p9-week-list" footer={<P7Navigation active="recipes" onHome={onBack} onRecipes={() => undefined} onShopping={() => setView('restock')} onMe={onMe} />}><div className={`p9-week-tabs${weekOffset ? ' is-next' : ''}`}><button className={!weekOffset ? 'is-active' : ''} onClick={() => selectWeek(0)}>本周</button><button className={weekOffset ? 'is-active' : ''} onClick={() => selectWeek(7)}>下周</button></div>{message && <p className="claim-error" role="alert">{message}</p>}{visibleDays.map(day => <section key={day.weekday}><div className="p9-day-heading"><h2>{day.label}</h2>{canEditRecipes && <button className="p9-add-day-button" type="button" onClick={() => startNewEntry(day.weekday)} aria-label={`${day.label}添加食谱`} title={`${day.label}添加食谱`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button>}</div>{day.entries.length ? day.entries.map(entry => {
    const isCompleting = completingEntryId === entry.id
    const openEdit = () => { if (!canEditRecipes) return; setEditing({ ...entry, method: entry.method ?? null, ingredients: entry.ingredients.map(item => ({ ...item })) }); setView('edit') }
    return <article className={entry.completed ? 'is-complete' : 'is-editable'} key={entry.id} onClick={openEdit} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openEdit() } }} role="button" tabIndex={0} aria-label={entry.completed ? `编辑${entry.dish_name}（仅可修改做法和备注）` : `编辑${entry.dish_name}`}><div><b>{entry.dish_name}</b><small><RecipeIngredientList ingredients={entry.ingredients} categories={categories} missing={entry.missing} inventory={inventory} icons={icons} completed={entry.completed} /></small>{entry.method && <em className="p9-method">{entry.method}</em>}{entry.note && <em className="p9-note">{entry.note}</em>}</div><span className="p9-entry-actions"><button className="p9-entry-action" type="button" disabled={isCompleting} onClick={event => { event.stopPropagation(); void complete(entry) }} aria-label={entry.completed ? `恢复${entry.dish_name}为未完成` : `完成${entry.dish_name}`}><RecipeCompletionIcon completed={entry.completed} /></button></span></article>
  }) : <p className="p9-empty">还没有安排</p>}</section>)}</PageShell>
}
