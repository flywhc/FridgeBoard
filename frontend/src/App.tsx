/** FridgeBoard 的所有者登录、P4 建冰箱/布局编辑和 P3 设备访问页。 */
import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import type { IScannerControls } from '@zxing/browser'

type Refrigerator = { id: string; name: string }
type Device = { id: string; kind: string; label: string; created_at: string; last_seen_at: string | null; revoked_at: string | null }
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

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
    || document.referrer.startsWith('android-app://')
}

function isAppleMobile() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

/** 遵循项目规范的手机一级页面品牌栏：两侧始终保留等宽热区。 */
function AppHeader({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return <header className="app-header"><span className="header-slot">{left}</span><span className="wordmark">家常食橱</span><span className="header-slot header-right">{right}</span></header>
}

/** 遵循项目规范的手机流程页导航栏，标题始终相对容器几何居中。 */
function PageHeader({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return <header className="page-header"><span className="header-slot">{onBack && <button className="header-button" onClick={onBack} aria-label="返回">‹</button>}</span><h1>{title}</h1><span className="header-slot header-right">{right}</span></header>
}

/** 将短效配对 URL 留在设备本地，转换为可由相机读取的二维码图像。 */
function PairingCode({ value, className = '' }: { value: string; className?: string }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    void QRCode.toDataURL(value, { errorCorrectionLevel: 'M', margin: 2, width: 640, color: { dark: '#000000', light: '#FFFFFF' } }).then(setSrc)
  }, [value])
  return src ? <img className={className} src={src} alt="用于连接手机的二维码" /> : <div className={`${className} qr-loading`} aria-label="正在生成二维码" />
}

function PairingSuccess({ refrigerator }: { refrigerator: Refrigerator }) {
  return <main className="pair-success">
    <AppHeader />
    <section className="success-center" aria-live="polite">
      <div className="connection-art" aria-hidden="true"><span className="art-fridge" /><span className="art-link">✓</span><span className="art-phone" /></div>
      <h1>已连接到家常食橱</h1><p>这台手机现在可以管理冰箱。</p>
      <div className="fridge-identity"><span className="mini-fridge" /><span><strong>{refrigerator.name}</strong><small>智能存储单元</small></span><b>已同步</b></div>
      <p className="transition-note">正在打开食材…</p>
    </section>
  </main>
}

function InstallationGuide() {
  const apple = isAppleMobile()
  return <main className="install-guide">
    <AppHeader />
    <section className="install-content"><h1>请先安装到手机</h1><p>首次连接需要在家常食橱应用内扫码。安装完成后，打开应用并再次扫描冰箱端二维码。</p>
      <h2>{apple ? '在 Safari 中安装' : '在浏览器中安装'}</h2>
      <ol className="install-steps">{apple ? <><li><b>1</b><span>点击 Safari 底部的<strong>分享</strong>按钮。</span></li><li><b>2</b><span>在菜单中选择<strong>添加到主屏幕</strong>。</span></li><li><b>3</b><span>从主屏幕打开<strong>家常食橱</strong>，选择“扫描二维码”。</span></li></> : <><li><b>1</b><span>打开浏览器菜单。</span></li><li><b>2</b><span>选择<strong>安装应用</strong>或<strong>添加到主屏幕</strong>。</span></li><li><b>3</b><span>打开<strong>家常食橱</strong>，选择“扫描二维码”。</span></li></>}</ol>
    </section>
  </main>
}

/** 在已安装 PWA 中调用浏览器原生二维码检测，成功后进入首次绑定领取页。 */
function PwaScanner({ onClose }: { onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [message, setMessage] = useState('正在打开相机…')
  useEffect(() => {
    let controls: IScannerControls | undefined
    let active = true
    const start = async () => {
      if (!videoRef.current) return
      try {
        const { BrowserQRCodeReader } = await import('@zxing/browser')
        if (!active || !videoRef.current) return
        const reader = new BrowserQRCodeReader()
        controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (!active || !result) return
          try {
            const url = new URL(result.getText())
            const token = url.pathname === '/pair' ? url.searchParams.get('bootstrap') : null
            if (!token) { setMessage('这不是家常食橱的首次连接二维码。'); return }
            controls?.stop()
            window.location.assign(`/pair?bootstrap=${encodeURIComponent(token)}`)
          } catch { setMessage('无法识别该二维码，请对准冰箱端页面后重试。') }
        })
        setMessage('将冰箱端上的二维码放入取景框。')
      } catch {
        if (active) setMessage('无法打开相机。请在系统设置中允许家常食橱使用相机后重试。')
      }
    }
    void start()
    return () => { active = false; controls?.stop() }
  }, [])
  return <main className="scanner-screen"><PageHeader title="扫描冰箱端二维码" onBack={onClose} /><div className="scanner-content"><div className="camera-frame"><video ref={videoRef} muted playsInline /><i /></div><p role="status">{message}</p></div></main>
}

function FridgeFirstBoot() {
  const [pairingUrl, setPairingUrl] = useState('')
  const [state, setState] = useState<'loading' | 'pending' | 'bound' | 'error'>('loading')
  useEffect(() => {
    void request<{ pairing_url: string }>('/api/kindle/first-boot-sessions', { method: 'POST' })
      .then(result => { setPairingUrl(result.pairing_url); setState('pending') })
      .catch(() => setState('error'))
  }, [])
  useEffect(() => {
    if (state !== 'pending') return
    const timer = window.setInterval(() => {
      void request<{ state: 'pending' | 'bound' }>('/api/kindle/first-boot-sessions/current')
        .then(result => { if (result.state === 'bound') setState('bound') })
        .catch(() => setState('error'))
    }, 4000)
    return () => window.clearInterval(timer)
  }, [state])
  if (state === 'bound') return <main className="fridge-first-boot"><header className="eink-header"><h1>家常食橱</h1></header><p>已连接。请在手机中管理冰箱。</p></main>
  return <main className="fridge-first-boot"><header className="eink-header"><h1>家常食橱</h1></header><div className="first-boot-content">{pairingUrl ? <PairingCode value={pairingUrl} className="fridge-qr" /> : <div className="fridge-qr qr-loading" />}<p>{state === 'error' ? '无法生成二维码，请刷新页面。' : '用手机相机扫码，安装应用'}</p></div></main>
}

function FridgePairingCode() {
  const [pairing, setPairing] = useState<{ pairing_url: string; expires_in_seconds: number } | null>(null)
  const [remaining, setRemaining] = useState(0)
  const [error, setError] = useState('')
  const create = () => void request<{ pairing_url: string; expires_in_seconds: number }>('/api/kindle/pairing-sessions', { method: 'POST' })
    .then(result => { setPairing(result); setRemaining(result.expires_in_seconds); setError('') }).catch(reason => setError(reason.message))
  useEffect(() => { create() }, [])
  useEffect(() => { if (!remaining) return; const timer = window.setInterval(() => setRemaining(value => Math.max(0, value - 1)), 1000); return () => window.clearInterval(timer) }, [remaining])
  const minutes = String(Math.floor(remaining / 60)).padStart(2, '0')
  const seconds = String(remaining % 60).padStart(2, '0')
  return <main className="fridge-pairing"><header className="eink-pair-header"><button onClick={() => window.location.assign('/fridge')} aria-label="返回">←</button><div><h1>连接手机</h1><p>扫描二维码，在手机上管理食材</p></div><button onClick={create} aria-label="重新生成二维码">↻</button></header><div className="eink-pair-content">{pairing ? <PairingCode value={pairing.pairing_url} className="fridge-qr" /> : <div className="fridge-qr qr-loading" />}<p className="fridge-timer">◷ 本次连接有效 {minutes}:{seconds}</p><p>安装 PWA 后请再扫一次</p>{error && <p role="alert">{error}</p>}</div><footer>⌂ 10分钟后回到首页</footer></main>
}

function DeviceManager({ refrigerator, devices, passcode, onBack, onCreatePasscode, onRemove }: { refrigerator: Refrigerator; devices: Device[]; passcode: string; onBack: () => void; onCreatePasscode: () => void; onRemove: (id: string) => void }) {
  const phones = devices.filter(device => device.kind === 'pwa' && !device.revoked_at)
  const displayDevice = devices.find(device => device.kind === 'kindle' && !device.revoked_at)
  return <main className="device-manager"><PageHeader title={refrigerator.name} onBack={onBack} right={<span aria-hidden="true">▱</span>} /><section className="fridge-heading"><i className="large-fridge" /><h2>{refrigerator.name}</h2></section><section><h3>可访问的手机</h3>{phones.length ? phones.map((device, index) => <div className="device-row" key={device.id}><i className="phone-icon" /><span><strong>{index === 0 ? '本机' : device.label}</strong><small>{index === 0 ? '当前正在使用' : `最后访问：${device.last_seen_at ? new Date(device.last_seen_at).toLocaleDateString('zh-CN') : '尚未同步'}`}</small></span>{index > 0 && <button className="remove-circle" onClick={() => onRemove(device.id)} aria-label={`移除 ${device.label}`}>×</button>}</div>) : <p className="muted">还没有手机访问这台冰箱。</p>}<p className="muted">移除后，该手机会从冰箱列表中消失；再次扫码可重新加入。</p></section><section className="fridge-device"><h3>冰箱端</h3>{displayDevice ? <div className="fridge-card"><i className="display-icon" /><span><strong>{displayDevice.label}</strong><small>已绑定；请在冰箱端选择“连接手机”以显示配对二维码。</small></span></div> : <p className="muted">尚未连接冰箱端设备。</p>}<button className="secondary-action" onClick={onCreatePasscode}>生成兼容绑定码</button>{passcode && <output className="passcode">{passcode}</output>}<p className="muted">兼容旧设备时，可改用六位绑定码。</p></section></main>
}

function BootstrapPairing({ token, onScan }: { token: string; onScan: () => void }) {
  const [mode, setMode] = useState<'sso' | 'local' | null>(null)
  const [fridges, setFridges] = useState<Refrigerator[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [newName, setNewName] = useState('家里冰箱')
  const [message, setMessage] = useState('')
  const [paired, setPaired] = useState<Refrigerator | null>(null)
  useEffect(() => {
    if (!isStandalone()) return
    void request<{ mode: 'sso' | 'local' }>('/api/auth/mode').then(async result => {
      setMode(result.mode)
      try {
        const available = await request<Refrigerator[]>('/api/owner/refrigerators')
        setFridges(available); setSelectedId(available[0]?.id ?? '')
      } catch {
        setMode(result.mode)
      }
    }).catch(error => setMessage(error.message))
  }, [])
  const login = () => {
    const returnTo = `${window.location.pathname}${window.location.search}`
    window.location.assign(`/api/auth/login?return_to=${encodeURIComponent(returnTo)}`)
  }
  const claim = async (event: FormEvent) => {
    event.preventDefault()
    try {
      const payload = selectedId ? { pairing_token: token, standalone: true, refrigerator_id: selectedId } : { pairing_token: token, standalone: true, new_refrigerator_name: newName, new_template_key: 'mini' }
      setPaired(await request<Refrigerator>('/api/first-boot-pairings/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }))
    } catch (error) {
      const detail = (error as Error).message
      setMessage(detail.includes('无效') || detail.includes('过期') || detail.includes('已使用')
        ? '该首次配对二维码已失效。请在冰箱端刷新二维码，然后点“扫描新的二维码”。'
        : detail)
    }
  }
  if (!isStandalone()) return <InstallationGuide />
  if (paired) return <PairingSuccess refrigerator={paired} />
  if (mode === 'sso' && !fridges.length && !message) return <main className="claim-screen"><PageHeader title="连接冰箱" /><p>登录后可选择已有冰箱，或新建一台冰箱。</p><button onClick={login}>登录 flycn</button></main>
  return <main className="claim-screen"><PageHeader title="连接这台冰箱" /><p>二维码仍有效时，直接连接即可；失效时可重新扫码。</p>{message && <p role="alert" className="claim-error">{message}</p>}<form onSubmit={claim}>{fridges.length ? <label>选择冰箱<select value={selectedId} onChange={event => setSelectedId(event.target.value)}><option value="">新建一台冰箱</option>{fridges.map(fridge => <option key={fridge.id} value={fridge.id}>{fridge.name}</option>)}</select></label> : null}{!selectedId && <label>冰箱名称<input value={newName} onChange={event => setNewName(event.target.value)} required maxLength={120} /></label>}<button type="submit">连接冰箱</button></form><button className="secondary-action scan-entry" onClick={onScan}>扫描新的二维码</button></main>
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
  const [creating, setCreating] = useState(false)
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
  const bootstrapToken = new URLSearchParams(window.location.search).get('bootstrap')
  const [pairedRefrigerator, setPairedRefrigerator] = useState<Refrigerator | null>(null)
  const [scanning, setScanning] = useState(false)

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
    }).then(fridge => setPairedRefrigerator(fridge)).catch(error => setMessage(error.message))
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
      setCreating(false); setMessage(`已创建「${fridge.name}」，现在可以直接添加食材。`); await loadOwner()
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
  const createPasscode = async (refrigeratorId?: string) => {
    const targetId = refrigeratorId ?? layout?.refrigerator_id
    if (!targetId) { setMessage('请先选择要绑定的冰箱。'); return }
    try { const result = await request<{ passcode: string }>('/api/owner/kindle-passcodes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refrigerator_id: targetId }) }); setPasscode(result.passcode); setMessage('请在冰箱端输入这组六位兼容绑定码；5 分钟内有效。') } catch (error) { setMessage((error as Error).message) }
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

  const currentPath = window.location.pathname
  const managedRefrigerator = fridges.find(fridge => fridge.id === deviceFridgeId)
  if (currentPath === '/fridge/pair') return <FridgePairingCode />
  if (currentPath.startsWith('/fridge')) return <FridgeFirstBoot />
  if (scanning) return <PwaScanner onClose={() => setScanning(false)} />
  if (bootstrapToken) return <BootstrapPairing token={bootstrapToken} onScan={() => setScanning(true)} />
  if (pairToken && !isStandalone()) return <InstallationGuide />
  if (pairedRefrigerator) return <PairingSuccess refrigerator={pairedRefrigerator} />
  if (managedRefrigerator) return <DeviceManager refrigerator={managedRefrigerator} devices={devices} passcode={passcode} onBack={() => { setDeviceFridgeId(''); setDevices([]); setPasscode('') }} onCreatePasscode={() => void createPasscode(managedRefrigerator.id)} onRemove={id => void removeDevice(id)} />
  if (ownerState === 'loading') return <main className="owner-start"><span className="wordmark">家常食橱</span><p>正在准备…</p></main>
  if (ownerState === 'signed-out') return <main className="owner-start"><span className="wordmark">家常食橱</span><h1>管理你的冰箱</h1><p>登录后可创建冰箱、编辑库存和管理设备。</p><button onClick={startOwnerLogin}>登录 flycn</button>{message && <p className="notice" role="status">{message}</p>}</main>
  if (!layout && (!fridges.length || creating)) return <main className="owner-start create-fridge"><span className="wordmark">家常食橱</span><h1>创建你的冰箱</h1><p>先选择与你家最接近的冰箱结构，之后仍可调整分格。</p>{isStandalone() && <button className="scan-entry" onClick={() => setScanning(true)}>扫描冰箱端二维码</button>}{message && <p className="notice" role="status">{message}</p>}<form onSubmit={createRefrigerator}><label>冰箱名称<input value={name} onChange={event => setName(event.target.value)} required maxLength={120} /></label><div className="templates">{templates.map(template => <label className={template.key === templateKey ? 'template selected' : 'template'} key={template.key}><input type="radio" name="template" value={template.key} checked={template.key === templateKey} onChange={() => setTemplateKey(template.key)} />{template.name}</label>)}</div>{selectedTemplate && <p className="muted">已选模板含 {selectedTemplate.zones.length} 个物理区域。</p>}<button disabled={saving}>{saving ? '创建中…' : '创建并预览'}</button></form>{fridges.length ? <button className="secondary-action" onClick={() => setCreating(false)}>返回我的冰箱</button> : null}</main>
  if (!layout) return <main className="owner-start fridge-list"><span className="wordmark">家常食橱</span><h1>我的冰箱</h1><p>选择一台冰箱继续管理。</p>{isStandalone() && <button className="scan-entry" onClick={() => setScanning(true)}>扫描冰箱端二维码</button>}{message && <p className="notice" role="status">{message}</p>}{fridges.map(fridge => <div className="fridge-list-item" key={fridge.id}><span><strong>{fridge.name}</strong><small>冰箱与食材</small></span><button onClick={() => void openLayout(fridge)}>打开</button><button className="secondary-action" onClick={() => void showDevices(fridge)}>设备</button></div>)}<button className="secondary-action" onClick={() => setCreating(true)}>新建冰箱</button></main>
  return <main className="workspace"><header><button className="back-button" onClick={() => { setLayout(null); setEditing(false); setEditingBatchId(null) }} aria-label="返回我的冰箱">‹</button><span className="wordmark">家常食橱</span><button className="secondary-action" onClick={() => void showDevices(fridges.find(fridge => fridge.id === layout.refrigerator_id) ?? { id: layout.refrigerator_id, name: '这台冰箱' })}>设备</button></header>{message && <p className="notice" role="status">{message}</p>}<section><h1>冰箱布局</h1><FridgePreview layout={layout} selectable /><div className="actions"><button className="secondary-action" onClick={() => setEditing(!editing)}>{editing ? '收起编辑' : '调整分格'}</button>{editing && <button onClick={() => void saveLayout()} disabled={saving}>{saving ? '保存中…' : '保存布局'}</button>}</div>{editing && <div className="editor">{layout.zones.map(zone => { const templateZone = templates.find(template => template.key === layout.template_key)?.zones.find(item => item.key === zone.key); return <fieldset key={zone.key}><legend>{zone.label}</legend>{templateZone?.adjustable_temperature && <label>温度<select value={zone.temperature_mode} onChange={event => changeTemperature(zone.key, event.target.value as 'cold' | 'frozen')}><option value="cold">冷藏</option><option value="frozen">冷冻</option></select></label>}<label>分格<select value={zone.slots.length} onChange={event => changeSlots(zone.key, Number(event.target.value))}>{(templateZone?.layout_kind === 'single_row' ? [1, 2, 3] : [1, 2, 3, 4, 5, 6]).map(count => <option key={count} value={count}>{templateZone?.layout_kind === 'single_row' ? `${count} 格` : `${count} 层`}</option>)}</select></label></fieldset>})}</div>}</section><section><h2>{editingBatchId ? '编辑食材' : '添加食材'}</h2><form onSubmit={addInventory}><label>名称<input value={foodName} onChange={event => setFoodName(event.target.value)} required /></label><label>大类<select value={categoryId} onChange={event => void chooseCategory(event.target.value)} required><option value="">请选择</option>{categories.filter(category => !category.parent_id).map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>小类<select value={subcategoryId} onChange={event => setSubcategoryId(event.target.value)} required disabled={!categoryId}><option value="">请选择</option>{subcategories.map(category => <option key={category.id} value={category.id}>{category.name}{category.is_custom ? '（自定义）' : ''}</option>)}</select></label><label>位置<select value={slotId} onChange={event => setSlotId(event.target.value)} required><option value="">请选择</option>{slots.map(slot => <option key={slot.id} value={slot.id}>{slot.key}</option>)}</select></label><label>数量<input type="number" min="1" value={quantity} onChange={event => setQuantity(Number(event.target.value))} required /></label><label>BBD<input type="date" value={bestBefore} onChange={event => setBestBefore(event.target.value)} /></label><button disabled={saving}>{saving ? '保存中…' : editingBatchId ? '保存修改' : '添加食材'}</button>{editingBatchId && <button className="secondary-action" type="button" onClick={() => setEditingBatchId(null)}>取消编辑</button>}</form>{categoryId && <form onSubmit={createCustomCategory}><label>自定义小类<input value={customCategoryName} onChange={event => setCustomCategoryName(event.target.value)} required placeholder="例如：乌鸡蛋" /></label><label>图标<select value={customIconKey} onChange={event => setCustomIconKey(event.target.value)}>{icons.map(icon => <option key={icon.key} value={icon.key}>{icon.label}</option>)}</select></label><button>创建自定义小类</button></form>}<h2>当前库存</h2>{inventory.length ? inventory.map(batch => <div className="row" key={batch.id}><span>{batch.subcategory_name} · {batch.food_name} ×{batch.quantity}{batch.expiry_status ? ` · ${batch.expiry_status === 'expired' ? '已过期' : batch.expiry_status === 'expiring' ? '临期' : '正常'}` : ''}</span><button className="secondary-action" onClick={() => editInventory(batch)}>编辑</button><button className="danger" onClick={() => void deleteInventory(batch.id)}>删除</button></div>) : <p>尚无库存；未填写 BBD 的食材不会显示风险提示。</p>}</section></main>
}
