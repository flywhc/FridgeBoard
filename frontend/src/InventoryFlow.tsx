/** P5 食材录入、识别和按格位编辑工作区。 */
import { useEffect, useRef, useState } from 'react'
import type { IScannerControls } from '@zxing/browser'
import type { BarcodeSuggestion, Category, Icon, InventoryBatch, Layout, RecognitionField, RecognitionResult } from './appTypes'
import { OpenFridge } from './FridgeLayout'
import { CategoryIcon, PageHeader, PageShell } from './sharedUi'
import { request } from './appApi'
import { InventoryList } from './inventoryList'
import { formatInventoryScopeTitle } from './inventoryListFilters'

export function InventoryFlow({ layout, categories, icons, inventory, saving, initialSlotId, initialView = 'add', onBack, onChooseCategory, onCreateCategory, onSave, onDelete }: {
  layout: Layout; categories: Category[]; icons: Icon[]; inventory: InventoryBatch[]; saving: boolean; onBack: () => void
  initialSlotId?: string; initialView?: 'add' | 'list'
  onChooseCategory: (id: string) => Promise<string | undefined>; onCreateCategory: (parentId: string, name: string, iconKey: string) => Promise<Category | undefined>
  onSave: (draft: { id?: string; categoryId: string; subcategoryId: string; slotId: string; foodName: string; quantity: number; bestBefore: string; description: string; productionDate: string; barcode: string }) => Promise<boolean>
  onDelete: (id: string) => Promise<boolean>
}) {
  type View = 'list' | 'add' | 'location' | 'library' | 'custom' | 'edit'
  const parents = categories.filter(item => !item.parent_id)
  const returnToList = initialView === 'list'
  const [view, setView] = useState<View>(returnToList ? 'list' : 'add')
  const [draft, setDraft] = useState({ id: '', categoryId: '', subcategoryId: '', slotId: initialSlotId ?? '', foodName: '', quantity: 1, bestBefore: '', description: '', productionDate: '' })
  const [quantityInput, setQuantityInput] = useState('1')
  const [query, setQuery] = useState('')
  const [libraryOrigin, setLibraryOrigin] = useState<'add' | 'edit'>('add')
  const [customName, setCustomName] = useState('')
  const [customIcon, setCustomIcon] = useState(icons[0]?.key ?? '')
  const [notice, setNotice] = useState('')
  const [recognizing, setRecognizing] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [conflicts, setConflicts] = useState<Record<string, RecognitionField>>({})
  const [barcode, setBarcode] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const lastProcessedBarcode = useRef<{ value: string; at: number }>({ value: '', at: 0 })
  const parent = parents.find(item => item.id === draft.categoryId)
  const children = categories.filter(item => item.parent_id === draft.categoryId)
  const selectedChild = children.find(item => item.id === draft.subcategoryId)
  const matchingChildren = children.filter(item => item.name.includes(query.trim()))
  const slots = layout.zones.flatMap(zone => zone.slots.map(slot => ({ ...slot, zone })))
  const selectedSlot = slots.find(slot => slot.id === draft.slotId)
  const listTitle = initialSlotId && selectedSlot ? formatInventoryScopeTitle(selectedSlot.zone.label, selectedSlot.key) : '全部食材'
  const update = (change: Partial<typeof draft>) => setDraft(current => ({ ...current, ...change }))
  const setQuantity = (value: number) => { const next = Math.max(1, Math.trunc(value)); update({ quantity: next }); setQuantityInput(String(next)) }
  const onQuantityInputChange = (value: string) => { setQuantityInput(value); const parsed = Number(value); if (Number.isInteger(parsed) && parsed >= 1) update({ quantity: parsed }) }
  const normalizeQuantityInput = () => { const parsed = Number(quantityInput); const next = Number.isInteger(parsed) && parsed >= 1 ? parsed : 1; setQuantity(next); return next }
  const stopCamera = () => { streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null }
  const openCamera = () => {
    if (cameraReady) return
    if (!navigator.mediaDevices?.getUserMedia) { setNotice('当前设备不支持相机。你仍可手工填写食材信息。'); return }
    setNotice('')
    setCameraOpen(true)
  }
  useEffect(() => {
    if (view !== 'add' || !cameraOpen) return
    let active = true
    void navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then(stream => { if (!active) { stream.getTracks().forEach(track => track.stop()); return }; streamRef.current = stream; if (videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play().catch(() => undefined) }; setCameraReady(true) })
      .catch(() => { setCameraOpen(false); setNotice('无法打开相机。你仍可手工填写食材信息，或在系统设置中允许相机权限后重试。') })
    return () => { active = false; setCameraReady(false); stopCamera() }
  }, [view, cameraOpen])
  const registerBarcode = (rawValue: string) => {
    const value = rawValue.trim()
    const now = Date.now()
    if (!value || (lastProcessedBarcode.current.value === value && now - lastProcessedBarcode.current.at < 10_000)) return
    lastProcessedBarcode.current = { value, at: now }
    // lookupBarcode 依赖下方的识别结果归一化逻辑；扫描回调只在组件完成渲染后触发。
    // eslint-disable-next-line react-hooks/immutability
    setBarcode(value); void lookupBarcode(value)
  }
  useEffect(() => {
    if (view !== 'add' || !cameraOpen || !cameraReady || !streamRef.current || !videoRef.current) return
    let controls: IScannerControls | undefined
    let active = true
    const start = async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const stream = streamRef.current
        const video = videoRef.current
        if (!active || !stream || !video) return
        controls = await new BrowserMultiFormatReader().decodeFromStream(stream, video, (result, error) => {
          if (result) registerBarcode(result.getText())
          if (error && error.name !== 'NotFoundException') setNotice('正在识别条码，请将条码放入取景框。')
        })
      } catch { if (active) setNotice('无法启动条码识别，请确认相机权限或继续手工填写。') }
    }
    void start()
    return () => { active = false; controls?.stop() }
    // 扫描器只在相机流就绪或重新进入录入页时启动。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, cameraOpen, cameraReady])
  const applySuggestion = (suggestion: Partial<BarcodeSuggestion> | Record<string, RecognitionField>) => {
    const next: Partial<typeof draft> = {}
    const nextConflicts: Record<string, RecognitionField> = {}
    const values: Record<string, RecognitionField> = 'food_name' in suggestion && typeof suggestion.food_name === 'object'
      ? suggestion as Record<string, RecognitionField>
      : Object.fromEntries(Object.entries(suggestion).filter(([, value]) => value != null).map(([key, value]) => [key, { value: String(value), confidence: 1 }]))
    const recognizedParent = values.category_name && parents.find(item => item.name === values.category_name.value)
    if (recognizedParent) values.category_id = { ...values.category_name, value: recognizedParent.id }
    const recognizedChild = values.subcategory_name && categories.filter(item => item.parent_id === (recognizedParent?.id ?? draft.categoryId) && item.name === values.subcategory_name?.value)
    if (recognizedChild?.length === 1) values.subcategory_id = { ...values.subcategory_name!, value: recognizedChild[0].id }
    if (values.category_name && !recognizedParent || values.subcategory_name && recognizedChild?.length !== 1) setNotice('识别到的分类需要你在图库中确认。')
    const mapping: Record<string, keyof typeof draft> = { food_name: 'foodName', product_description: 'description', category_id: 'categoryId', subcategory_id: 'subcategoryId', production_date: 'productionDate', best_before: 'bestBefore' }
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
  const chooseParent = (id: string) => { update({ categoryId: id, subcategoryId: '', slotId: initialSlotId ?? '' }); void onChooseCategory(id).then(slotId => { if (!initialSlotId && slotId) update({ slotId }) }) }
  const chooseChild = (child: Category) => { update({ subcategoryId: child.id, foodName: draft.foodName || child.name }); setView(libraryOrigin) }
  const openLibrary = () => { if (draft.categoryId) { setLibraryOrigin('add'); setView('library') } }
  const advance = () => {
    if (!draft.foodName.trim() || !draft.categoryId || !draft.subcategoryId) { setNotice('请先填写名称并选择大类和小类。'); return }
    setNotice(''); setView('location')
  }
  const resetDraft = () => { setDraft({ id: '', categoryId: '', subcategoryId: '', slotId: initialSlotId ?? '', foodName: '', quantity: 1, bestBefore: '', description: '', productionDate: '' }); setQuantityInput('1'); setBarcode('') }
  const openAdd = () => { resetDraft(); setNotice(''); setView('add') }
  const save = async () => { if (!draft.slotId) { setNotice('请选择存放位置。'); return }; const quantity = normalizeQuantityInput(); if (await onSave({ ...draft, quantity, barcode })) { resetDraft(); setView(returnToList ? 'list' : 'add'); setNotice(returnToList ? '' : '已加入冰箱。') } }
  const startEdit = (item: InventoryBatch) => { setDraft({ id: item.id, categoryId: item.category_id, subcategoryId: item.subcategory_id, slotId: item.storage_slot_id, foodName: item.food_name, quantity: item.quantity, bestBefore: item.best_before ?? '', description: item.product_description ?? '', productionDate: item.production_date ?? '' }); setQuantityInput(String(item.quantity)); setBarcode(item.barcode ?? ''); setNotice(''); setView('edit') }
  const backFrom = () => { if (view === 'location') setView('edit'); else if (view === 'edit') setView(returnToList ? 'list' : 'add'); else if (view === 'library') setView(libraryOrigin); else if (view === 'custom') setView('library'); else onBack() }

  if (view === 'list') return <InventoryList inventory={inventory} icons={icons} title={listTitle} slotId={initialSlotId} onBack={onBack} onAdd={openAdd} onSelect={startEdit} />

  if (view === 'library') return <PageShell className="p5-flow" header={<PageHeader title="选择小类" onBack={backFrom} />} bodyClassName="p5-scroll p5-library" footer={<footer className="p5-note">选择后，名称为空时自动填入。</footer>}>
    <div className="category-pill"><CategoryIcon iconKey={parent?.icon_key ?? null} icons={icons} label={parent?.name ?? ''} />{parent?.name ?? '请选择大类'}</div>
    <label className="p5-search"><span aria-hidden="true">⌕</span><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索小类" /></label>
    <section><h2>常用</h2><div className="p5-icon-grid p5-common">{children.slice(0, 4).map(child => <button key={child.id} onClick={() => chooseChild(child)}><span><CategoryIcon iconKey={child.icon_key} icons={icons} label={child.name} /></span><b>{child.name}</b></button>)}</div></section>
    <hr /><section><h2>所有{parent?.name ?? '小类'}</h2><div className="p5-icon-grid">{matchingChildren.map(child => <button key={child.id} onClick={() => chooseChild(child)}><span><CategoryIcon iconKey={child.icon_key} icons={icons} label={child.name} /></span><b>{child.name}</b></button>)}<button className="p5-new-category" onClick={() => { setCustomName(''); setCustomIcon(icons[0]?.key ?? ''); setView('custom') }}><span>＋</span><b>新建小类</b></button></div></section>
  </PageShell>

  if (view === 'custom') return <PageShell className="p5-flow" header={<PageHeader title="新建小类" onBack={backFrom} right={<button className="p5-header-action" onClick={() => setView('add')} aria-label="关闭">×</button>} />} bodyClassName="p5-scroll p5-custom" footer={<footer className="bottom-action-bar"><button disabled={!customName.trim() || !customIcon || saving} onClick={() => void onCreateCategory(draft.categoryId, customName, customIcon).then(created => { if (created) { update({ subcategoryId: created.id, foodName: draft.foodName || created.name }); setView(libraryOrigin) } })}>{saving ? '加入中…' : '确认并加入图库'}</button></footer>}>
    <div className="category-pill"><CategoryIcon iconKey={parent?.icon_key ?? null} icons={icons} label={parent?.name ?? ''} />所属大类：{parent?.name}</div>
    <label className="p5-name-input"><span>小类名称</span><input autoFocus value={customName} onChange={event => setCustomName(event.target.value)} placeholder="请输入名称" /></label>
    <section><div className="p5-tabs"><button className="is-active">从图库选择</button><button onClick={() => setNotice('AI 图标尚未通过图标 spike，当前请从图库选择。')}>AI 生成</button></div><div className="p5-icon-grid p5-custom-grid">{icons.map(icon => <button className={customIcon === icon.key ? 'is-selected' : ''} key={icon.key} onClick={() => setCustomIcon(icon.key)}><span><img className="food-icon" src={icon.asset_url} alt="" /></span><b>{icon.label}</b></button>)}</div></section>
    {notice && <p className="p5-inline-notice" role="status">{notice}</p>}
  </PageShell>

  if (view === 'location') return <PageShell className="p5-flow" header={<PageHeader title="确认位置与数量" onBack={backFrom} right={<span className="flow-step">2 / 2</span>} />} bodyClassName="p5-scroll p5-location" footer={<footer className="bottom-action-bar"><button disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '确认加入'}</button></footer>}>
    <div className="p5-location-preview"><OpenFridge layout={layout} activeSlotId={draft.slotId} onSelectSlot={slotId => update({ slotId })} /></div>
    <b className="p5-location-label">{selectedSlot ? `${selectedSlot.zone.label} · ${selectedSlot.key}` : '请选择一个分区'}</b><p>点选分区可更改</p>
    <div className="p5-food-summary"><span><CategoryIcon iconKey={selectedChild?.icon_key ?? parent?.icon_key ?? null} icons={icons} label={draft.foodName} /></span><div><strong>{draft.foodName} · {selectedChild?.name}</strong>{draft.bestBefore && <small>BBD {draft.bestBefore}</small>}</div><b className="p5-summary-quantity">×{draft.quantity}</b></div>
    {notice && <p className="p5-inline-notice" role="status">{notice}</p>}
  </PageShell>

  if (view === 'edit') return <PageShell className="p5-flow" header={<PageHeader title="编辑食材" onBack={backFrom} right={<button className="save-text" onClick={() => void save()} disabled={saving}>保存</button>} />} bodyClassName="p5-scroll p5-edit">
    <div className="p5-edit-name"><span><CategoryIcon iconKey={selectedChild?.icon_key ?? parent?.icon_key ?? null} icons={icons} label={draft.foodName} /></span><input value={draft.foodName} onChange={event => update({ foodName: event.target.value })} /></div>
    <button className="p5-row-link" onClick={() => { setLibraryOrigin('edit'); setView('library') }}><span><small>分类</small><b>{parent?.name} · {selectedChild?.name}</b></span><i>›</i></button>
    <label className="p5-field"><span>品牌规格备注</span><input value={draft.description} onChange={event => update({ description: event.target.value })} placeholder="例：蒙牛 250ml × 6" /></label>
    <div className="p5-date-row"><label className="p5-field"><span>生产日期</span><input type="date" value={draft.productionDate} onChange={event => update({ productionDate: event.target.value })} /></label><label className="p5-field"><span>保质期至（可选）</span><input type="date" value={draft.bestBefore} onChange={event => update({ bestBefore: event.target.value })} /></label></div>
    <div className="p5-large-quantity"><span>数量</span><div><button onClick={() => update({ quantity: Math.max(1, draft.quantity - 1) })}>−</button><b>{draft.quantity}</b><button onClick={() => update({ quantity: draft.quantity + 1 })}>＋</button></div></div>
    <button className="p5-row-link p5-slot-link" onClick={() => setView('location')}><span><small>存放位置</small><b>{selectedSlot ? `${selectedSlot.zone.label} ${selectedSlot.key}` : '请选择'}</b></span><i>›</i></button>
    <button className="p5-primary-inline" disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '保存修改'}</button><button className="p5-delete" onClick={() => void onDelete(draft.id).then(deleted => { if (deleted) { setView(returnToList ? 'list' : 'add'); setNotice(returnToList ? '' : '食材已删除。') } })}>删除食材</button>
  </PageShell>

  return <PageShell className="p5-flow" header={<PageHeader title="添加食材" onBack={backFrom} right={<span className="flow-step">1 / 2</span>} />} bodyClassName="p5-scroll p5-add" footer={<footer className="bottom-action-bar"><button onClick={advance}>加入冰箱</button></footer>}>
    <div className={`p5-viewfinder ${cameraOpen ? 'is-open' : ''}`} role="button" tabIndex={cameraOpen ? -1 : 0} aria-label="点击识别物品和条码" onClick={openCamera} onKeyDown={event => { if (!cameraOpen && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openCamera() } }}><video ref={videoRef} muted playsInline autoPlay /><i />{!cameraOpen && <span className="p6-viewfinder-prompt">点击识别物品和条码</span>}</div>
    <p className="p6-barcode-hint" role="status" aria-live="polite">{notice || '自动识别条码'}</p><div className="p6-camera-actions" aria-label="识别方式"><button type="button" disabled={recognizing} onClick={() => void recognize()}>{recognizing ? '识别中…' : '识别物品'}</button></div>
    {Object.keys(conflicts).length > 0 && <section className="p6-conflicts" aria-live="polite"><h2>确认识别结果</h2><p>以下字段已有值，本次识别不会自动覆盖。</p>{Object.entries(conflicts).map(([field, value]) => <div key={field}><b>{field === 'foodName' ? '食材名称' : field === 'description' ? '品牌 / 规格 / 备注' : field === 'productionDate' ? '生产日期' : field === 'bestBefore' ? '保质期至' : field === 'barcode' ? '条码' : field === 'categoryId' ? '大类' : '小类'}</b><span>当前：{field === 'barcode' ? barcode : String(draft[field as keyof typeof draft])}</span><span>识别：{value.value}（{Math.round(value.confidence * 100)}%）</span><button onClick={() => { if (field === 'barcode') setBarcode(value.value); else update({ [field]: value.value } as Partial<typeof draft>); setConflicts(current => { const next = { ...current }; delete next[field]; return next }) }}>采用识别值</button><button className="p6-keep" onClick={() => setConflicts(current => { const next = { ...current }; delete next[field]; return next })}>保留当前值</button></div>)}</section>}
    <section><div className="p5-section-label"><span>食材分类</span>{parent && selectedChild && <b>{parent.name} · {selectedChild.name}</b>}</div><div className="p5-parent-grid">{parents.map(item => <button className={item.id === draft.categoryId ? 'is-selected' : ''} key={item.id} onClick={() => chooseParent(item.id)}><CategoryIcon iconKey={item.icon_key} icons={icons} label={item.name} /><b>{item.name}</b></button>)}</div></section>
    <section className="p5-food-name"><span>食材名称</span><div className="p5-food-name-row"><input value={draft.foodName} onChange={event => update({ foodName: event.target.value })} placeholder="请输入食材名称" /><span className="p5-food-quantity-mark" aria-hidden="true">×</span><div className="p5-quantity-control"><button type="button" onClick={() => setQuantity(draft.quantity + 1)} aria-label="增加数量"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 14 6-6 6 6" /></svg></button><input className="p5-food-quantity-input" aria-label="数量" type="number" min="1" inputMode="numeric" value={quantityInput} onChange={event => onQuantityInputChange(event.target.value)} onBlur={normalizeQuantityInput} /><button type="button" onClick={() => setQuantity(draft.quantity - 1)} aria-label="减少数量"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 10 6 6 6-6" /></svg></button></div><button type="button" className="p5-food-picker-icon" disabled={!draft.categoryId} onClick={openLibrary} aria-label="选择小类图标"><CategoryIcon iconKey={selectedChild?.icon_key ?? parent?.icon_key ?? null} icons={icons} label="" /></button><button type="button" className="p5-food-picker-arrow" disabled={!draft.categoryId} onClick={openLibrary} aria-label="选择小类"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg></button></div></section>
    <div className="p5-date-row"><label className="p5-field"><span>生产日期</span><input type="date" value={draft.productionDate} onChange={event => update({ productionDate: event.target.value })} /></label><label className="p5-field"><span>保质期至（可不填）</span><input type="date" value={draft.bestBefore} onChange={event => update({ bestBefore: event.target.value })} /></label></div>
    <label className="p5-field"><span>品牌 / 规格 / 备注</span><input value={draft.description} onChange={event => update({ description: event.target.value })} placeholder="例：光明 950ml 有折扣" /></label>
  </PageShell>
}
