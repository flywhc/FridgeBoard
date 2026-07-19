/** FridgeBoard 的所有者登录、P4 建冰箱/布局编辑和 P3 设备访问页。 */
import { FormEvent, useEffect, useState } from 'react'

type Refrigerator = { id: string; name: string }
type Device = { id: string; kind: string; label: string; revoked_at: string | null }
type ZoneTemplate = { key: string; label: string; temperature_mode: 'cold' | 'frozen'; layout_kind: 'vertical' | 'single_row'; adjustable_temperature: boolean }
type Template = { key: string; name: string; zones: ZoneTemplate[] }
type LayoutZone = { key: string; label: string; temperature_mode: 'cold' | 'frozen'; slots: { id: string; key: string }[] }
type Layout = { refrigerator_id: string; template_key: string; zones: LayoutZone[] }
type Category = { id: string; parent_id: string | null; name: string; icon_key: string | null; is_custom: boolean }
type InventoryBatch = { id: string; category_id: string; category_name: string; subcategory_id: string; subcategory_name: string; storage_slot_id: string; food_name: string; quantity: number; best_before: string | null; expiry_status: string | null }
type Icon = { key: string; label: string; asset_url: string }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', ...init })
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? '请求失败，请稍后重试。')
  return response.status === 204 ? (undefined as T) : response.json() as Promise<T>
}

function FridgePreview({ layout, selectable = false }: { layout: Layout; selectable?: boolean }) {
  return <div className="fridge-preview" aria-label="冰箱布局预览">
    {layout.zones.map(zone => <div className={`zone ${zone.temperature_mode}`} key={zone.key}>
      <strong>{zone.label}</strong><div className="slots">{zone.slots.map(slot => <button type="button" key={slot.id} className="slot" disabled={!selectable} title={slot.key}>{selectable ? '选择位置' : ''}</button>)}</div>
    </div>)}
  </div>
}

export function App() {
  const [message, setMessage] = useState('')
  const [ownerState, setOwnerState] = useState<'loading' | 'signed-in' | 'signed-out'>('loading')
  const [fridges, setFridges] = useState<Refrigerator[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [name, setName] = useState('家里冰箱')
  const [templateKey, setTemplateKey] = useState('top_freezer_single')
  const [layout, setLayout] = useState<Layout | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [passcode, setPasscode] = useState('')
  const [kindleCode, setKindleCode] = useState('')
  const [devices, setDevices] = useState<Device[]>([])
  const [deviceFridgeId, setDeviceFridgeId] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [inventory, setInventory] = useState<InventoryBatch[]>([])
  const [foodName, setFoodName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [subcategoryId, setSubcategoryId] = useState('')
  const [slotId, setSlotId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [bestBefore, setBestBefore] = useState('')
  const [customCategoryName, setCustomCategoryName] = useState('')
  const [customIconKey, setCustomIconKey] = useState('egg')
  const [icons, setIcons] = useState<Icon[]>([])
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null)
  const pairToken = new URLSearchParams(window.location.search).get('token')

  const loadOwner = async () => {
    try { setFridges(await request<Refrigerator[]>('/api/owner/refrigerators')); setOwnerState('signed-in') }
    catch { setFridges([]); setOwnerState('signed-out') }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void request<Template[]>('/api/refrigerator-templates').then(setTemplates).catch(error => setMessage(error.message))
      void request<Icon[]>('/api/icon-library').then(setIcons).catch(error => setMessage(error.message))
      void loadOwner()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true
    if (!pairToken || !standalone) return
    void request<Refrigerator>('/api/pairings/consume', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairing_token: pairToken, standalone: true, label: '我的手机' }),
    }).then(fridge => setMessage(`已自动配对：${fridge.name}`)).catch(error => setMessage(error.message))
  }, [pairToken])
  const selectedTemplate = templates.find(template => template.key === templateKey)

  const loadInventoryWorkspace = async (fridge: Refrigerator) => {
    const [savedLayout, savedCategories, savedInventory] = await Promise.all([
      request<Layout>(`/api/owner/refrigerators/${fridge.id}/layout`),
      request<Category[]>(`/api/owner/refrigerators/${fridge.id}/categories`),
      request<InventoryBatch[]>(`/api/owner/refrigerators/${fridge.id}/inventory`),
    ])
    setLayout(savedLayout); setCategories(savedCategories); setInventory(savedInventory); setEditing(false)
  }

  const createRefrigerator = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true)
    try {
      const fridge = await request<Refrigerator>('/api/owner/refrigerators', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, template_key: templateKey }) })
      await loadInventoryWorkspace(fridge)
      setMessage(`已创建「${fridge.name}」，现在可以直接添加食材。`); await loadOwner()
    } catch (error) { setMessage((error as Error).message) } finally { setSaving(false) }
  }
  const openLayout = async (fridge: Refrigerator) => {
    try {
      await loadInventoryWorkspace(fridge)
      setMessage(`正在管理「${fridge.name}」的库存。`)
    } catch (error) { setMessage((error as Error).message) }
  }
  const changeSlots = (key: string, slots: number) => setLayout(current => current && ({ ...current, zones: current.zones.map(zone => zone.key === key ? { ...zone, slots: Array.from({ length: slots }, (_, index) => ({ id: `draft-${key}-${index}`, key: `${key}-${index + 1}` })) } : zone) }))
  const changeTemperature = (key: string, temperature: 'cold' | 'frozen') => setLayout(current => current && ({ ...current, zones: current.zones.map(zone => zone.key === key ? { ...zone, temperature_mode: temperature } : zone) }))
  const saveLayout = async () => {
    if (!layout) return; setSaving(true)
    try { const saved = await request<Layout>(`/api/owner/refrigerators/${layout.refrigerator_id}/layout`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(layout.zones.map(zone => ({ zone_key: zone.key, temperature_mode: zone.temperature_mode, slot_count: zone.slots.length }))) }); setLayout(saved); setEditing(false); setMessage('布局已保存；此预览将与位置选择器和冰箱端保持一致。') } catch (error) { setMessage((error as Error).message) } finally { setSaving(false) }
  }
  const startOwnerLogin = () => { if (import.meta.env.DEV) { void request('/api/auth/development-login', { method: 'POST' }).then(loadOwner).catch(error => setMessage(error.message)); return }; window.location.assign('/api/auth/login') }
  const createPasscode = async () => {
    if (!layout) { setMessage('请先在“我的冰箱”中打开要绑定的冰箱。'); return }
    try { const result = await request<{ passcode: string }>('/api/owner/kindle-passcodes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refrigerator_id: layout.refrigerator_id }) }); setPasscode(result.passcode); setMessage('请在 Kindle 输入这组六位 Passcode；5 分钟内有效。') } catch (error) { setMessage((error as Error).message) }
  }
  const bindKindle = async (event: FormEvent) => {
    event.preventDefault()
    try { const fridge = await request<Refrigerator>('/api/kindle/bind', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passcode: kindleCode, label: '厨房 Kindle' }) }); setMessage(`Kindle 已绑定到 ${fridge.name}。`) } catch (error) { setMessage((error as Error).message) }
  }
  const showDevices = async (fridge: Refrigerator) => {
    try { setDevices(await request<Device[]>(`/api/owner/refrigerators/${fridge.id}/devices`)); setDeviceFridgeId(fridge.id); setMessage(`正在管理：${fridge.name}`) } catch (error) { setMessage((error as Error).message) }
  }
  const removeDevice = async (deviceId: string) => {
    try { await request<void>(`/api/owner/refrigerators/${deviceFridgeId}/devices/${deviceId}`, { method: 'DELETE' }); setDevices(current => current.filter(device => device.id !== deviceId)); setMessage('设备已移除。') } catch (error) { setMessage((error as Error).message) }
  }
  const subcategories = categories.filter(category => category.parent_id === categoryId)
  const slots = layout?.zones.flatMap(zone => zone.slots) ?? []
  const addInventory = async (event: FormEvent) => {
    event.preventDefault()
    if (!layout) return
    setSaving(true)
    try {
      const payload = { category_id: categoryId, subcategory_id: subcategoryId, storage_slot_id: slotId, food_name: foodName, quantity, best_before: bestBefore || null }
      const batch = await request<InventoryBatch>(`/api/owner/refrigerators/${layout.refrigerator_id}/inventory${editingBatchId ? `/${editingBatchId}` : ''}`, {
        method: editingBatchId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setInventory(current => [...current.filter(item => item.id !== batch.id), batch])
      setFoodName(''); setBestBefore(''); setQuantity(1); setEditingBatchId(null); setMessage('库存已保存。')
    } catch (error) { setMessage((error as Error).message) } finally { setSaving(false) }
  }
  const deleteInventory = async (batchId: string) => {
    if (!layout) return
    try { await request<void>(`/api/owner/refrigerators/${layout.refrigerator_id}/inventory/${batchId}`, { method: 'DELETE' }); setInventory(current => current.filter(item => item.id !== batchId)); setMessage('库存已删除。') } catch (error) { setMessage((error as Error).message) }
  }
  const editInventory = (batch: InventoryBatch) => {
    setEditingBatchId(batch.id); setFoodName(batch.food_name); setCategoryId(batch.category_id)
    setSubcategoryId(batch.subcategory_id); setSlotId(batch.storage_slot_id); setQuantity(batch.quantity)
    setBestBefore(batch.best_before ?? ''); setMessage(`正在编辑「${batch.food_name}」。修改后点“保存修改”。`)
  }
  const createCustomCategory = async (event: FormEvent) => {
    event.preventDefault()
    if (!layout || !categoryId) return
    try {
      const created = await request<Category>(`/api/owner/refrigerators/${layout.refrigerator_id}/categories`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_id: categoryId, name: customCategoryName, icon_key: customIconKey }),
      })
      setCategories(current => [...current, created]); setSubcategoryId(created.id); setCustomCategoryName('')
      setMessage(`已创建自定义小类「${created.name}」，可在后续录入中复用。`)
    } catch (error) { setMessage((error as Error).message) }
  }
  const chooseCategory = async (nextCategoryId: string) => {
    setCategoryId(nextCategoryId); setSubcategoryId(''); setSlotId('')
    if (!layout || !nextCategoryId) return
    try {
      const result = await request<{ storage_slot_id: string | null }>(`/api/owner/refrigerators/${layout.refrigerator_id}/inventory/default-location?category_id=${encodeURIComponent(nextCategoryId)}`)
      if (result.storage_slot_id) setSlotId(result.storage_slot_id)
    } catch (error) { setMessage((error as Error).message) }
  }

  return <main className="panel">
    <p className="eyebrow">FridgeBoard · P5</p><h1>创建你的冰箱与库存</h1>
    {message && <p className="notice" role="status">{message}</p>}
    <section><h2>所有者登录</h2><p>{ownerState === 'signed-in' ? '已登录，可以创建和编辑冰箱。' : '使用 flycn 账号管理冰箱和设备。'}</p>{ownerState !== 'signed-in' && <button onClick={startOwnerLogin}>登录 flycn</button>}</section>
    {ownerState === 'signed-in' && <section><h2>1. 名称与模板</h2><form onSubmit={createRefrigerator}><label>冰箱名称<input value={name} onChange={event => setName(event.target.value)} required maxLength={120} /></label><div className="templates">{templates.map(template => <label className={template.key === templateKey ? 'template selected' : 'template'} key={template.key}><input type="radio" name="template" value={template.key} checked={template.key === templateKey} onChange={() => setTemplateKey(template.key)} />{template.name}</label>)}</div>{selectedTemplate && <p>已选模板含 {selectedTemplate.zones.length} 个物理区域，可在下一步调整分格。</p>}<button disabled={saving}>{saving ? '保存中…' : '创建并预览'}</button></form></section>}
    {layout && <section><h2>2. 布局预览</h2><FridgePreview layout={layout} selectable /><div className="actions"><button onClick={() => setEditing(!editing)}>{editing ? '收起编辑' : '编辑分格'}</button>{editing && <button onClick={() => void saveLayout()} disabled={saving}>{saving ? '保存中…' : '保存布局'}</button>}</div>{editing && <div className="editor">{layout.zones.map(zone => { const templateZone = templates.find(template => template.key === layout.template_key)?.zones.find(item => item.key === zone.key); return <fieldset key={zone.key}><legend>{zone.label}</legend>{templateZone?.adjustable_temperature && <label>温度<select value={zone.temperature_mode} onChange={event => changeTemperature(zone.key, event.target.value as 'cold' | 'frozen')}><option value="cold">冷藏</option><option value="frozen">冷冻</option></select></label>}<label>分格<select value={zone.slots.length} onChange={event => changeSlots(zone.key, Number(event.target.value))}>{(templateZone?.layout_kind === 'single_row' ? [1, 2, 3] : [1, 2, 3, 4, 5, 6]).map(count => <option key={count} value={count}>{templateZone?.layout_kind === 'single_row' ? `${count} 格` : `${count} 层`}</option>)}</select></label></fieldset>})}</div>}</section>}
    <section><h2>我的冰箱</h2>{fridges.length ? fridges.map(fridge => <div className="row" key={fridge.id}><span>{fridge.name}</span><button onClick={() => void openLayout(fridge)}>查看布局</button><button onClick={() => void showDevices(fridge)}>管理设备</button></div>) : <p>创建后会显示在这里。</p>}{devices.map(device => <div className="row" key={device.id}><span>{device.label} · {device.kind}</span>{device.revoked_at ? <em>已移除</em> : <button className="danger" onClick={() => void removeDevice(device.id)}>移除</button>}</div>)}</section>
    {layout && <section><h2>3. {editingBatchId ? '编辑食材' : '添加食材'}</h2><form onSubmit={addInventory}><label>名称<input value={foodName} onChange={event => setFoodName(event.target.value)} required /></label><label>大类<select value={categoryId} onChange={event => void chooseCategory(event.target.value)} required><option value="">请选择</option>{categories.filter(category => !category.parent_id).map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>小类<select value={subcategoryId} onChange={event => setSubcategoryId(event.target.value)} required disabled={!categoryId}><option value="">请选择</option>{subcategories.map(category => <option key={category.id} value={category.id}>{category.name}{category.is_custom ? '（自定义）' : ''}</option>)}</select></label><label>位置<select value={slotId} onChange={event => setSlotId(event.target.value)} required><option value="">请选择</option>{slots.map(slot => <option key={slot.id} value={slot.id}>{slot.key}</option>)}</select></label><label>数量<input type="number" min="1" value={quantity} onChange={event => setQuantity(Number(event.target.value))} required /></label><label>BBD<input type="date" value={bestBefore} onChange={event => setBestBefore(event.target.value)} /></label><button disabled={saving}>{saving ? '保存中…' : editingBatchId ? '保存修改' : '添加食材'}</button>{editingBatchId && <button type="button" onClick={() => setEditingBatchId(null)}>取消编辑</button>}</form>{categoryId && <form onSubmit={createCustomCategory}><label>自定义小类<input value={customCategoryName} onChange={event => setCustomCategoryName(event.target.value)} required placeholder="例如：乌鸡蛋" /></label><label>图标<select value={customIconKey} onChange={event => setCustomIconKey(event.target.value)}>{icons.map(icon => <option key={icon.key} value={icon.key}>{icon.label}</option>)}</select></label><button>创建自定义小类</button></form>}<h3>当前库存</h3>{inventory.length ? inventory.map(batch => <div className="row" key={batch.id}><span>{batch.subcategory_name} · {batch.food_name} ×{batch.quantity}{batch.expiry_status ? ` · ${batch.expiry_status === 'expired' ? '已过期' : batch.expiry_status === 'expiring' ? '临期' : '正常'}` : ''}</span><button onClick={() => editInventory(batch)}>编辑</button><button className="danger" onClick={() => void deleteInventory(batch.id)}>删除</button></div>) : <p>尚无库存；未填写 BBD 的食材不会显示风险提示。</p>}</section>}
    <section><h2>绑定 Kindle</h2><p>先打开目标冰箱的布局，再生成 Passcode。</p><button onClick={() => void createPasscode()}>生成 Kindle Passcode</button>{passcode && <output className="passcode">{passcode}</output>}<form onSubmit={bindKindle}><label>Kindle Passcode<input value={kindleCode} onChange={event => setKindleCode(event.target.value)} inputMode="numeric" pattern="[0-9]{6}" required /></label><button>绑定 Kindle</button></form></section>
  </main>
}
