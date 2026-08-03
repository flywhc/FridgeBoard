/** P5 物品录入、识别和按格位编辑工作区。 */
import { useEffect, useRef, useState } from 'react'
import type { BarcodeSuggestion, Category, Icon, IconGeneration, InventoryBatch, Layout, RecognitionField, RecognitionResult } from './appTypes'
import { FridgePreviewFrame } from './FridgeLayout'
import { CategoryIcon, NoticeDialog, PageHeader, PageShell } from './sharedUi'
import { request } from './appApi'
import { InventoryList } from './inventoryList'
import { formatInventoryScopeTitle, formatStorageSlotLabel } from './inventoryListFilters'
import { getPreselectedInventorySlotId } from './inventoryAddLocation'

function deduplicateCategories(items: Category[], keyOf: (item: Category) => string) {
  const seen = new Set<string>()
  return items.filter(item => {
    const key = keyOf(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function InventoryFlow({ layout, categories, icons, inventory, saving, initialSlotId, initialItemId, initialView = 'add', onBack, onCreateCategory, onCatalogChanged, onSave, onDelete }: {
  layout: Layout; categories: Category[]; icons: Icon[]; inventory: InventoryBatch[]; saving: boolean; onBack: () => void
  initialSlotId?: string; initialItemId?: string; initialView?: 'add' | 'list' | 'edit'
  onCreateCategory: (parentId: string, name: string, iconKey: string) => Promise<Category | undefined>
  onCatalogChanged: () => Promise<void>
  onSave: (draft: { id?: string; subcategoryId: string; slotId: string; itemName: string; quantity: number; bestBefore: string; description: string; productionDate: string; barcode: string }) => Promise<boolean>
  onDelete: (id: string) => Promise<boolean>
}) {
  type View = 'list' | 'add' | 'recognition' | 'location' | 'custom' | 'edit'
  const parents = categories.filter(item => !item.parent_id)
  const subcategories = categories.filter(item => item.parent_id)
  const returnToList = initialView !== 'add'
  const initialItem = initialItemId ? inventory.find(item => item.id === initialItemId) : undefined
  const [view, setView] = useState<View>(initialView === 'edit' && initialItem ? 'edit' : returnToList ? 'list' : 'add')
  const [customReturnView, setCustomReturnView] = useState<'add' | 'edit'>('add')
  const [draft, setDraft] = useState(() => initialItem ? { id: initialItem.id, subcategoryId: initialItem.subcategory_id, slotId: initialItem.storage_slot_id, itemName: initialItem.item_name, quantity: initialItem.quantity, bestBefore: initialItem.best_before ?? '', description: initialItem.product_description ?? '', productionDate: initialItem.production_date ?? '' } : { id: '', subcategoryId: '', slotId: initialSlotId ?? '', itemName: '', quantity: 1, bestBefore: '', description: '', productionDate: '' })
  const [quantityInput, setQuantityInput] = useState(() => String(initialItem?.quantity ?? 1))
  const [query, setQuery] = useState('')
  const [catalogExpanded, setCatalogExpanded] = useState(false)
  const [catalogTop, setCatalogTop] = useState(0)
  const [activeGroupId, setActiveGroupId] = useState(parents[0]?.id ?? '')
  const [recentCategories, setRecentCategories] = useState<Category[]>([])
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupError, setGroupError] = useState('')
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customIcon, setCustomIcon] = useState(icons[0]?.key ?? '')
  const [iconMode, setIconMode] = useState<'library' | 'agnes'>('library')
  const [generation, setGeneration] = useState<IconGeneration | null>(null)
  const [selectedCandidateId, setSelectedCandidateId] = useState('')
  const [generatingIcons, setGeneratingIcons] = useState(false)
  const [notice, setNotice] = useState('')
  const [errorNotice, setErrorNotice] = useState('')
  const [recognizing, setRecognizing] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [conflicts, setConflicts] = useState<Record<string, RecognitionField>>({})
  const [barcode, setBarcode] = useState('')
  const [barcodeCoverage, setBarcodeCoverage] = useState(0)
  const [locationOpen, setLocationOpen] = useState(false)
  const [addAnimation, setAddAnimation] = useState(false)
  const [slotTransitioning, setSlotTransitioning] = useState(false)
  const [locationSubmitting, setLocationSubmitting] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const lastProcessedBarcode = useRef<{ value: string; at: number }>({ value: '', at: 0 })
  const barcodeDetectedAt = useRef(0)
  const locationSubmittingRef = useRef(false)
  const slotTransitionTimerRef = useRef<number | null>(null)
  const catalogElementRef = useRef<HTMLElement | null>(null)
  const selectedChild = subcategories.find(item => item.id === draft.subcategoryId)
  const children = deduplicateCategories(
    subcategories.filter(item => item.parent_id === activeGroupId),
    item => item.name.trim(),
  )
  const matchingChildren = query.trim()
    ? deduplicateCategories(
      subcategories.filter(item => item.name.includes(query.trim())),
      item => item.name.trim(),
    )
    : children
  const recentDisplayCategories = deduplicateCategories(
    recentCategories,
    item => item.icon_key ?? item.id,
  ).slice(0, 16)
  const slots = layout.zones.flatMap(zone => zone.slots.map(slot => ({ ...slot, zone })))
  const selectedSlot = slots.find(slot => slot.id === draft.slotId)
  const listTitle = initialSlotId && selectedSlot ? formatInventoryScopeTitle(selectedSlot.zone.label, selectedSlot.key) : '全部物品'
  const update = (change: Partial<typeof draft>) => setDraft(current => ({ ...current, ...change }))
  const setQuantity = (value: number) => { const next = Math.max(1, Math.trunc(value)); update({ quantity: next }); setQuantityInput(String(next)) }
  const onQuantityInputChange = (value: string) => { setQuantityInput(value); const parsed = Number(value); if (Number.isInteger(parsed) && parsed >= 1) update({ quantity: parsed }) }
  const normalizeQuantityInput = () => { const parsed = Number(quantityInput); const next = Number.isInteger(parsed) && parsed >= 1 ? parsed : 1; setQuantity(next); return next }
  const stopCamera = () => { streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null }
  useEffect(() => {
    if (view !== 'recognition' || !cameraOpen) return
    let active = true
    void navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then(stream => { if (!active) { stream.getTracks().forEach(track => track.stop()); return }; streamRef.current = stream; if (videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play().catch(() => undefined) }; setCameraReady(true) })
      .catch(() => { setCameraOpen(false); setNotice('无法打开相机。你仍可手工填写物品信息，或在系统设置中允许相机权限后重试。'); setView('add') })
    return () => { active = false; setCameraReady(false); stopCamera() }
  }, [view, cameraOpen])
  useEffect(() => {
    void request<Category[]>(`/api/owner/refrigerators/${layout.refrigerator_id}/categories/recent`)
      .then(setRecentCategories)
      .catch(error => setNotice(error.message))
  }, [layout.refrigerator_id, inventory.length])
  useEffect(() => {
    if (!catalogExpanded) return
    const updateCatalogTop = () => setCatalogTop(
      Math.max(0, catalogElementRef.current?.getBoundingClientRect().top ?? 0),
    )
    window.addEventListener('resize', updateCatalogTop)
    return () => window.removeEventListener('resize', updateCatalogTop)
  }, [catalogExpanded])
  useEffect(() => () => {
    if (slotTransitionTimerRef.current !== null) window.clearTimeout(slotTransitionTimerRef.current)
  }, [])
  const registerBarcode = (rawValue: string) => {
    const value = rawValue.trim()
    const now = Date.now()
    if (!value || (lastProcessedBarcode.current.value === value && now - lastProcessedBarcode.current.at < 10_000)) return
    lastProcessedBarcode.current = { value, at: now }
    // lookupBarcode 依赖下方的识别结果归一化逻辑；扫描回调只在组件完成渲染后触发。
    setBarcode(value)
  }
  useEffect(() => {
    if (view !== 'recognition' || !cameraOpen || !cameraReady || !streamRef.current || !videoRef.current) return
    let controls: { stop: () => void } | undefined
    let active = true
    const start = async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const stream = streamRef.current
        const video = videoRef.current
        if (!active || !stream || !video) return
        controls = await new BrowserMultiFormatReader().decodeFromStream(stream, video, (result) => {
          if (!result) return
          const points = result.getResultPoints()
          const xs = points.map(point => point.getX())
          const ys = points.map(point => point.getY())
          const coverage = xs.length > 1 && ys.length > 1
            ? ((Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))) / (video.videoWidth * video.videoHeight)
            : 0
          setBarcodeCoverage(coverage)
          barcodeDetectedAt.current = Date.now()
          registerBarcode(result.getText())
        })
      } catch { if (active) setNotice('无法启动条码识别，请确认相机权限或继续手工填写。') }
    }
    void start()
    return () => { active = false; controls?.stop() }
  }, [view, cameraOpen, cameraReady])
  const applySuggestion = (suggestion: Partial<BarcodeSuggestion> | Record<string, RecognitionField>) => {
    const next: Partial<typeof draft> = {}
    const nextConflicts: Record<string, RecognitionField> = {}
    const values: Record<string, RecognitionField> = 'item_name' in suggestion && typeof suggestion.item_name === 'object'
      ? suggestion as Record<string, RecognitionField>
      : Object.fromEntries(Object.entries(suggestion).filter(([, value]) => value != null).map(([key, value]) => [key, { value: String(value), confidence: 1 }]))
    const recognizedChild = values.subcategory_name && subcategories.filter(item => item.name === values.subcategory_name?.value)
    if (recognizedChild?.length === 1) values.subcategory_id = { ...values.subcategory_name!, value: recognizedChild[0].id }
    if (values.subcategory_name && recognizedChild?.length !== 1) setNotice('识别到的分类需要你在选择物品中确认。')
    const mapping: Record<string, keyof typeof draft> = { item_name: 'itemName', product_description: 'description', subcategory_id: 'subcategoryId', production_date: 'productionDate', best_before: 'bestBefore' }
    for (const [source, field] of Object.entries(mapping)) {
      const candidate = values[source]
      if (!candidate?.value) continue
      if (draft[field] && draft[field] !== candidate.value) nextConflicts[field] = candidate
      else next[field] = candidate.value as never
    }
    if (Object.keys(next).length) update(next)
    if (values.barcode?.value && !barcode) setBarcode(values.barcode.value)
    if (Object.keys(nextConflicts).length) setConflicts(nextConflicts)
  }
  const recognize = async () => {
    const video = videoRef.current
    if (!video || video.videoWidth === 0) { setNotice('相机尚未就绪，请稍后重试或继续手工填写。'); return }
    const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    const image = await new Promise<string | null>(resolve => canvas.toBlob(blob => { if (!blob) return resolve(null); const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1] ?? null); reader.readAsDataURL(blob) }, 'image/jpeg', 0.82))
    if (!image) { setNotice('无法获取当前画面，请继续手工填写。'); return }
    setRecognizing(true); setNotice('')
    try { applySuggestion((await request<RecognitionResult>('/api/recognition', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_base64: image, content_type: 'image/jpeg' }) })).fields) } catch (error) { setNotice((error as Error).message) } finally { setRecognizing(false) }
  }
  async function lookupBarcode(value = barcode) {
    if (!value.trim()) { setNotice('尚未识别到条码，请对准包装条码后重试。'); return }
    try { applySuggestion(await request<BarcodeSuggestion>(`/api/owner/refrigerators/${layout.refrigerator_id}/barcode/${encodeURIComponent(value)}`)); setNotice('已找到这台冰箱之前确认过的商品信息。') } catch { setNotice('未找到已确认商品，请继续手工填写或使用 AI 识别。') }
  }
  const chooseChild = (child: Category) => {
    update({ subcategoryId: child.id, itemName: draft.itemName || child.name })
    setCatalogExpanded(false)
  }
  const openCatalog = () => {
    setActiveGroupId(selectedChild?.parent_id ?? activeGroupId)
    setCatalogTop(Math.max(0, catalogElementRef.current?.getBoundingClientRect().top ?? 0))
    setCatalogExpanded(true)
  }
  const openCustomCategory = () => {
    setCustomReturnView(view === 'edit' ? 'edit' : 'add')
    setCustomName('')
    setGeneration(null)
    setCatalogExpanded(false)
    setView('custom')
  }
  const advance = async () => {
    if (!draft.itemName.trim() || !draft.subcategoryId) { setErrorNotice('请先选择物品小类并填写物品名称。'); return }
    const preselectedSlotId = getPreselectedInventorySlotId(initialSlotId, slots)
    if (preselectedSlotId) {
      await save(preselectedSlotId)
      return
    }
    const fallback = slots[0]?.id ?? ''
    try {
      const result = await request<{ storage_slot_id: string | null }>(`/api/owner/refrigerators/${layout.refrigerator_id}/inventory/default-location`)
      update({
        slotId: slots.some(slot => slot.id === result.storage_slot_id) ? result.storage_slot_id! : fallback,
      })
    } catch (error) {
      update({ slotId: fallback }); setErrorNotice((error as Error).message); return
    }
    setLocationOpen(true)
  }
  const resetDraft = () => { setDraft({ id: '', subcategoryId: '', slotId: initialSlotId ?? '', itemName: '', quantity: 1, bestBefore: '', description: '', productionDate: '' }); setQuantityInput('1'); setBarcode(''); setBarcodeCoverage(0); setConflicts({}); setCatalogExpanded(false) }
  const openAdd = () => { resetDraft(); setNotice(''); setView('add') }
  const save = async (slotId = draft.slotId) => { if (!slotId) { setNotice('请选择存放位置。'); return }; const quantity = normalizeQuantityInput(); if (await onSave({ ...draft, slotId, quantity, barcode })) { resetDraft(); setView(returnToList ? 'list' : 'add'); setNotice(returnToList ? '' : '已加入冰箱。') } }
  const saveFromLocation = async (slotId = draft.slotId) => {
    if (!slotId || locationSubmittingRef.current || saving || addAnimation) return
    locationSubmittingRef.current = true
    setLocationSubmitting(true)
    const quantity = normalizeQuantityInput()
    if (!await onSave({ ...draft, slotId, quantity, barcode })) { locationSubmittingRef.current = false; setLocationSubmitting(false); return }
    setAddAnimation(true)
    window.setTimeout(() => { locationSubmittingRef.current = false; setAddAnimation(false); setLocationSubmitting(false); setLocationOpen(false); resetDraft(); setNotice('') }, 550)
  }
  const selectLocationSlot = (slotId: string) => {
    if (slotTransitioning || locationSubmitting || addAnimation || slotId === draft.slotId) return
    update({ slotId })
    setSlotTransitioning(true)
    slotTransitionTimerRef.current = window.setTimeout(() => {
      slotTransitionTimerRef.current = null
      setSlotTransitioning(false)
      void saveFromLocation(slotId)
    }, 300)
  }
  const openRecognition = () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setNotice('当前设备不支持相机。你仍可手工填写物品信息。')
      return
    }
    setNotice(''); setBarcode(''); setBarcodeCoverage(0); lastProcessedBarcode.current = { value: '', at: 0 }; barcodeDetectedAt.current = 0; setCameraOpen(true); setView('recognition')
  }
  const closeRecognition = () => { setCameraOpen(false); setView('add') }
  const runAutoRecognition = async () => {
    if (!cameraReady) { setNotice('相机尚未就绪，请稍后重试。'); return }
    setRecognizing(true); setNotice('')
    try {
      if (barcode && barcodeCoverage >= .5 && Date.now() - barcodeDetectedAt.current <= 750) await lookupBarcode(barcode)
      else await recognize()
      closeRecognition()
    } finally { setRecognizing(false) }
  }
  const startEdit = (item: InventoryBatch) => { setDraft({ id: item.id, subcategoryId: item.subcategory_id, slotId: item.storage_slot_id, itemName: item.item_name, quantity: item.quantity, bestBefore: item.best_before ?? '', description: item.product_description ?? '', productionDate: item.production_date ?? '' }); setQuantityInput(String(item.quantity)); setBarcode(item.barcode ?? ''); setNotice(''); setView('edit') }
  const generateIcons = async () => {
    if (!customName.trim()) { setNotice('请先填写小类名称。'); return }
    if (generatingIcons) return
    setGeneratingIcons(true)
    setNotice('正在通过 Agnes AI 生成四个候选…')
    try {
      if (generation) {
        await request<void>(`/api/owner/refrigerators/${layout.refrigerator_id}/icon-candidates/${generation.id}`, { method: 'DELETE' })
        setGeneration(null); setSelectedCandidateId('')
      }
      const result = await request<IconGeneration>(`/api/owner/refrigerators/${layout.refrigerator_id}/icon-candidates`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subcategory_name: customName }) })
      setGeneration(result); setSelectedCandidateId(result.candidates[0]?.id ?? ''); setNotice('请选择一个候选图标。')
    } catch (error) { setNotice((error as Error).message) } finally { setGeneratingIcons(false) }
  }
  const cancelGeneratedIcons = () => {
    if (!generation) return
    const generationId = generation.id
    setGeneration(null); setSelectedCandidateId('')
    void request<void>(`/api/owner/refrigerators/${layout.refrigerator_id}/icon-candidates/${generationId}`, { method: 'DELETE' }).catch(() => undefined)
  }
  const confirmGeneratedIcon = async () => {
    if (!generation || !selectedCandidateId || !activeGroupId) return
    try {
      const created = await request<Category>(`/api/owner/refrigerators/${layout.refrigerator_id}/icon-candidates/${generation.id}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ candidate_id: selectedCandidateId, parent_id: activeGroupId, subcategory_name: customName }) })
      await onCatalogChanged(); update({ subcategoryId: created.id, itemName: draft.itemName || created.name }); setGeneration(null); setView(customReturnView)
    } catch (error) { setNotice((error as Error).message) }
  }
  const createGroup = async () => {
    const name = groupName.trim()
    if (!name) { setGroupError('请输入大类名称。'); return }
    if (creatingGroup) return
    setCreatingGroup(true); setGroupError('')
    try {
      const created = await request<Category>(`/api/owner/refrigerators/${layout.refrigerator_id}/categories/groups`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
      await onCatalogChanged(); setActiveGroupId(created.id); setGroupDialogOpen(false); setGroupName('')
    } catch (error) { setGroupError((error as Error).message) } finally { setCreatingGroup(false) }
  }
  const openGroupDialog = () => { setGroupName(''); setGroupError(''); setGroupDialogOpen(true) }
  const backFrom = () => { if (view === 'location') setView('edit'); else if (view === 'edit') setView(returnToList ? 'list' : 'add'); else if (view === 'custom') { cancelGeneratedIcons(); setView(customReturnView) } else onBack() }

  const catalogPanel = catalogExpanded ? <div className="p5-catalog-panel" role="dialog" aria-modal="true" aria-label="选择物品" style={{ top: `${catalogTop}px` }}><div className="p5-catalog-dialog-heading"><strong>选择物品</strong><label><svg className="p5-search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索全部小类" aria-label="搜索全部小类" /></label><button type="button" onClick={() => setCatalogExpanded(false)} aria-label="关闭选择物品">×</button></div><div className="p5-catalog-body"><aside>{parents.map(group => <button className={group.id === activeGroupId ? 'is-selected' : ''} key={group.id} onClick={() => setActiveGroupId(group.id)}>{group.name}</button>)}<button className="p5-add-group" onClick={openGroupDialog}>＋ 添加大类</button></aside><div className="p5-catalog-items"><div className="p5-icon-grid">{matchingChildren.map(child => <button className={child.id === draft.subcategoryId ? 'is-selected' : ''} key={child.id} onClick={() => chooseChild(child)}><span><CategoryIcon iconKey={child.icon_key} icons={icons} label={child.name} /></span><b>{child.name}</b></button>)}</div><button className="p5-new-subcategory" onClick={openCustomCategory}>＋ 新建小类</button></div></div></div> : null
  const catalogSection = <section ref={element => { catalogElementRef.current = element }} className="p5-catalog"><div className="p5-catalog-heading"><span>选择物品</span><label><svg className="p5-search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索全部小类" aria-label="搜索全部小类" /></label><button type="button" onClick={openCatalog} aria-label="展开选择物品"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 10 6 6 6-6" /></svg></button></div><div className="p5-parent-grid">{(query.trim() ? matchingChildren : recentDisplayCategories).map(child => <button className={child.id === draft.subcategoryId ? 'is-selected' : ''} key={child.id} onClick={() => chooseChild(child)}><CategoryIcon iconKey={child.icon_key} icons={icons} label={child.name} /><b>{child.name}</b></button>)}</div>{catalogPanel}</section>
  const groupDialog = groupDialogOpen && <div className="p5-group-modal" role="dialog" aria-modal="true" aria-labelledby="p5-group-dialog-title"><form className="p5-group-dialog" onSubmit={event => { event.preventDefault(); void createGroup() }}><button type="button" className="p5-group-close" onClick={() => setGroupDialogOpen(false)} disabled={creatingGroup} aria-label="关闭添加大类">×</button><h2 id="p5-group-dialog-title">添加大类</h2><p>为物品选择器新增一个导航大类。</p><label className="p5-group-field"><span>大类名称</span><input autoFocus value={groupName} maxLength={80} onChange={event => { setGroupName(event.target.value); setGroupError('') }} placeholder="请输入名称" disabled={creatingGroup} /></label>{groupError && <p className="p5-group-error" role="alert">{groupError}</p>}<div className="p5-group-actions"><button type="button" onClick={() => setGroupDialogOpen(false)} disabled={creatingGroup}>取消</button><button type="submit" disabled={creatingGroup}>{creatingGroup ? '添加中…' : '添加大类'}</button></div></form></div>

  if (view === 'list') return <InventoryList inventory={inventory} icons={icons} title={listTitle} slotId={initialSlotId} onBack={onBack} onAdd={openAdd} onSelect={startEdit} />

  if (view === 'custom') return <PageShell className="p5-flow" header={<PageHeader title="新建小类" onBack={backFrom} right={<button className="p5-header-action" onClick={() => { cancelGeneratedIcons(); setView(customReturnView) }} aria-label="关闭">×</button>} />} bodyClassName="p5-scroll p5-custom" footer={<footer className="bottom-action-bar"><button disabled={!customName.trim() || saving || generatingIcons || (iconMode === 'library' ? !customIcon : !selectedCandidateId)} onClick={() => { if (iconMode === 'agnes') { void confirmGeneratedIcon(); return }; void onCreateCategory(activeGroupId, customName, customIcon).then(created => { if (created) { update({ subcategoryId: created.id, itemName: draft.itemName || created.name }); setView(customReturnView) } }) }}>{saving ? '加入中…' : '确认并加入图库'}</button></footer>}>
    <div className="category-pill">所属大类：{parents.find(item => item.id === activeGroupId)?.name}</div>
    <label className="p5-name-input"><span>小类名称</span><input autoFocus value={customName} onChange={event => setCustomName(event.target.value)} placeholder="请输入名称" /></label>
    <section><div className="p5-tabs"><button className={iconMode === 'library' ? 'is-active' : ''} onClick={() => { cancelGeneratedIcons(); setIconMode('library') }}>从图库选择</button><button className={iconMode === 'agnes' ? 'is-active' : ''} onClick={() => setIconMode('agnes')}>Agnes AI 生成</button></div>{iconMode === 'library' ? <div className="p5-icon-grid p5-custom-grid">{icons.map(icon => <button className={customIcon === icon.key ? 'is-selected' : ''} key={icon.key} onClick={() => setCustomIcon(icon.key)}><span><img className="food-icon" src={icon.asset_url} alt="" /></span><b>{icon.label}</b></button>)}</div> : <><button className="p5-generate-icons" type="button" disabled={generatingIcons || !customName.trim()} onClick={() => void generateIcons()}>{generatingIcons ? '生成中…' : '生成 4 个候选'}</button>{generation && <div className="p5-icon-grid p5-custom-grid">{generation.candidates.map(candidate => <button className={selectedCandidateId === candidate.id ? 'is-selected' : ''} key={candidate.id} onClick={() => setSelectedCandidateId(candidate.id)}><span><img className="food-icon" src={candidate.asset_url} alt="" /></span><b>候选</b></button>)}</div>}</>}</section>
    {notice && <p className="p5-inline-notice" role="status">{notice}</p>}
  </PageShell>

  if (view === 'location') return <PageShell className="p5-flow" header={<PageHeader title="确认位置与数量" onBack={backFrom} />} bodyClassName="p5-scroll p5-location" footer={<footer className="bottom-action-bar"><button disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '确认加入'}</button></footer>}>
    <FridgePreviewFrame variant="location" className="p5-location-preview" layout={layout} activeSlotId={draft.slotId} onSelectSlot={slotId => update({ slotId })} />
    <b className="p5-location-label">{selectedSlot ? `${selectedSlot.zone.label} · ${selectedSlot.key}` : '请选择一个分区'}</b><p>点选分区可更改</p>
    <div className="p5-food-summary"><span><CategoryIcon iconKey={selectedChild?.icon_key ?? null} icons={icons} label={draft.itemName} /></span><div><strong>{draft.itemName} · {selectedChild?.name}</strong>{draft.bestBefore && <small>BBD {draft.bestBefore}</small>}</div><b className="p5-summary-quantity">×{draft.quantity}</b></div>
    {notice && <p className="p5-inline-notice" role="status">{notice}</p>}
  </PageShell>

  if (view === 'edit') return <PageShell className="p5-flow" header={<PageHeader title="编辑物品" onBack={backFrom} right={<button className="save-text" onClick={() => void save()} disabled={saving}>保存</button>} />} bodyClassName="p5-scroll p5-edit">
    <div className="p5-edit-name"><span><CategoryIcon iconKey={selectedChild?.icon_key ?? null} icons={icons} label={draft.itemName} /></span><input value={draft.itemName} onChange={event => update({ itemName: event.target.value })} /></div>
    <button ref={element => { catalogElementRef.current = element }} className="p5-row-link p5-subcategory-link" onClick={openCatalog}><span><small>类别</small><b>{selectedChild?.name ?? '请选择'}</b></span><i>›</i></button>
    {catalogPanel}
    {groupDialog}
    <label className="p5-field"><span>品牌规格备注</span><input value={draft.description} onChange={event => update({ description: event.target.value })} placeholder="例：蒙牛 250ml × 6" /></label>
    <div className="p5-date-row"><label className="p5-field"><span>生产日期</span><input type="date" value={draft.productionDate} onChange={event => update({ productionDate: event.target.value })} /></label><label className="p5-field"><span>保质期至（可选）</span><input type="date" value={draft.bestBefore} onChange={event => update({ bestBefore: event.target.value })} /></label></div>
    <div className="p5-large-quantity"><span>数量</span><div><button onClick={() => setQuantity(draft.quantity - 1)}>−</button><b>{draft.quantity}</b><button onClick={() => setQuantity(draft.quantity + 1)}>＋</button></div></div>
    <button className="p5-row-link p5-slot-link" onClick={() => setView('location')}><span><small>存放位置</small><b>{selectedSlot ? formatStorageSlotLabel(selectedSlot.zone.label, selectedSlot.key) : '请选择'}</b></span><i>›</i></button>
    <button className="p5-delete" onClick={() => void onDelete(draft.id).then(deleted => { if (deleted) { setView(returnToList ? 'list' : 'add'); setNotice(returnToList ? '' : '物品已删除。') } })}>删除物品</button>
  </PageShell>

  if (view === 'recognition') return <PageShell className="p6-recognition" header={<PageHeader title="识别物品" onBack={closeRecognition} />} bodyClassName="p6-recognition-camera">
    <video ref={videoRef} muted playsInline autoPlay />
    {!cameraOpen && <p className="p6-camera-message">正在打开相机…</p>}
    {notice && <p className="p6-camera-message" role="status">{notice}</p>}
    <footer className="p6-recognition-footer"><button type="button" disabled={recognizing || !cameraReady} onClick={() => void runAutoRecognition()}>{recognizing ? '识别中…' : '自动识别'}</button><small>条码占画面一半以上时优先扫码，否则识别物品</small></footer>
  </PageShell>

  return <PageShell className="p5-flow" header={<PageHeader title="添加物品" onBack={backFrom} right={<button className="p6-scan-button" type="button" onClick={openRecognition} aria-label="打开扫码和物品识别"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" /><path d="M7 12h10" /></svg></button>} />} bodyClassName="p5-scroll p5-add" footer={<footer className="bottom-action-bar"><button onClick={() => void advance()}>加入冰箱</button></footer>}>
    {Object.keys(conflicts).length > 0 && <section className="p6-conflicts" aria-live="polite"><h2>确认识别结果</h2><p>以下字段已有值，本次识别不会自动覆盖。</p>{Object.entries(conflicts).map(([field, value]) => <div key={field}><b>{field === 'itemName' ? '物品名称' : field === 'description' ? '品牌 / 规格 / 备注' : field === 'productionDate' ? '生产日期' : field === 'bestBefore' ? '保质期至' : field === 'barcode' ? '条码' : '小类'}</b><span>当前：{field === 'barcode' ? barcode : String(draft[field as keyof typeof draft])}</span><span>识别：{value.value}（{Math.round(value.confidence * 100)}%）</span><button onClick={() => { if (field === 'barcode') setBarcode(value.value); else update({ [field]: value.value } as Partial<typeof draft>); setConflicts(current => { const next = { ...current }; delete next[field]; return next }) }}>采用识别值</button><button className="p6-keep" onClick={() => setConflicts(current => { const next = { ...current }; delete next[field]; return next })}>保留当前值</button></div>)}</section>}
    {catalogSection}
    <section className="p5-food-name"><span>物品名称</span><div className="p5-food-name-row"><input value={draft.itemName} onChange={event => update({ itemName: event.target.value })} placeholder="请输入物品名称" /><span className="p5-food-quantity-mark" aria-hidden="true">×</span><div className="p5-quantity-control"><button type="button" onClick={() => setQuantity(draft.quantity + 1)} aria-label="增加数量"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 14 6-6 6 6" /></svg></button><input className="p5-food-quantity-input" aria-label="数量" type="number" min="1" inputMode="numeric" value={quantityInput} onChange={event => onQuantityInputChange(event.target.value)} onBlur={normalizeQuantityInput} /><button type="button" onClick={() => setQuantity(draft.quantity - 1)} aria-label="减少数量"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 10 6 6 6-6" /></svg></button></div>{selectedChild && <span className="p5-selected-icon"><CategoryIcon iconKey={selectedChild.icon_key} icons={icons} label="" /></span>}</div></section>
    <div className="p5-date-row"><label className="p5-field"><span>生产日期</span><input type="date" value={draft.productionDate} onChange={event => update({ productionDate: event.target.value })} /></label><label className="p5-field"><span>保质期至（可不填）</span><input type="date" value={draft.bestBefore} onChange={event => update({ bestBefore: event.target.value })} /></label></div>
    <label className="p5-field"><span>品牌 / 规格 / 备注</span><input value={draft.description} onChange={event => update({ description: event.target.value })} placeholder="例：光明 950ml 有折扣" /></label>
    {locationOpen && <div className="p5-location-modal" role="dialog" aria-modal="true" aria-labelledby="p5-location-modal-title"><section className={`p5-location-dialog ${addAnimation ? 'is-animating' : ''}`}><button type="button" className="p5-location-close" disabled={saving || addAnimation || locationSubmitting || slotTransitioning} onClick={() => setLocationOpen(false)} aria-label="关闭位置选择">×</button><h2 id="p5-location-modal-title">选择存放位置</h2><FridgePreviewFrame variant="location" className="p5-location-preview" layout={layout} activeSlotId={draft.slotId} onSelectSlot={selectLocationSlot} />{addAnimation && <div className="p5-add-success" role="status"><CategoryIcon iconKey={selectedChild?.icon_key ?? null} icons={icons} label="" /><b>已加入冰箱</b></div>}{notice && <p className="p5-inline-notice" role="status">{notice}</p>}<button className="p5-location-submit" disabled={saving || addAnimation || locationSubmitting || slotTransitioning || !draft.slotId} onClick={() => void saveFromLocation()}>{saving || locationSubmitting ? '添加中…' : selectedSlot ? `添加到 ${formatStorageSlotLabel(selectedSlot.zone.label, selectedSlot.key)}` : '添加到此位置'}</button></section></div>}
    {errorNotice && <NoticeDialog title="暂时无法继续" message={errorNotice} onClose={() => setErrorNotice('')} />}
  </PageShell>
}
