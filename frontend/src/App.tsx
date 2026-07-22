/** FridgeBoard 的所有者登录、P4 建冰箱/布局编辑和 P3 设备访问页。 */
import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import type { IScannerControls } from '@zxing/browser'

type Refrigerator = { id: string; name: string }
type Device = { id: string; kind: string; label: string; created_at: string; last_seen_at: string | null; revoked_at: string | null }
type ZoneGeometry = { x: number; y: number; width: number; height: number; layout_kind: 'vertical' | 'single_row' }
type ZoneTemplate = { key: string; label: string; temperature_mode: 'cold' | 'frozen'; geometry: ZoneGeometry; layout_kind: 'vertical' | 'single_row'; adjustable_temperature: boolean; is_door: boolean }
type Template = { key: string; name: string; zones: ZoneTemplate[] }
type LayoutZone = { key: string; label: string; temperature_mode: 'cold' | 'frozen'; geometry: ZoneGeometry; slots: { id: string; key: string }[]; is_door: boolean }
type Layout = { refrigerator_id: string; template_key: string; zones: LayoutZone[] }
type Category = { id: string; parent_id: string | null; name: string; icon_key: string | null; is_custom: boolean }
type InventoryBatch = { id: string; category_id: string; category_name: string; subcategory_id: string; subcategory_name: string; icon_key: string | null; storage_slot_id: string; food_name: string; quantity: number; production_date: string | null; best_before: string | null; product_description: string | null; barcode: string | null; expiry_status: string | null }
type Icon = { key: string; label: string; asset_url: string }
type RecognitionField = { value: string; confidence: number }
type RecognitionResult = { fields: Record<string, RecognitionField> }
type BarcodeSuggestion = { food_name: string; category_id: string; subcategory_id: string; product_description: string | null; barcode: string }

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

/** P4 以设计稿的开门冰箱图形呈现布局；分格数量始终来自当前草稿或已保存布局。 */
function OpenFridge({ layout, activeZoneKey, onSelect }: { layout: Layout; activeZoneKey?: string; onSelect?: (key: string) => void }) {
  const cabinetZones = layout.zones.filter(zone => !zone.is_door)
  const door = layout.zones.find(zone => zone.is_door)
  const top = cabinetZones[0]
  const middle = cabinetZones.slice(1, -1)
  const bottom = cabinetZones[cabinetZones.length - 1]
  const wide = layout.template_key === 'side_by_side' || layout.template_key === 'french_door'
  const isMini = layout.template_key === 'mini'
  const doorBands = [...new Map(cabinetZones.map(zone => [zone.geometry.y, zone.geometry.height])).entries()]
    .sort(([left], [right]) => left - right)
  const doorRows = isMini ? '1fr' : doorBands.map(([, height]) => `${height}fr`).join(' ')
  const doorContent = door ? Array.from({ length: Math.max(door.slots.length, 1) }, (_, index) => <i key={index} />) : null
  const doorPanel = door && onSelect
    ? <button type="button" className={`door-zone ${door.temperature_mode} ${door.key === activeZoneKey ? 'is-active' : ''}`} onClick={() => onSelect(door.key)} style={{ gridTemplateRows: `repeat(${Math.max(door.slots.length, 1)}, minmax(0, 1fr))` }} aria-label={`${door.label}，${door.slots.length} 格`}>{doorContent}</button>
    : door ? <span className={`door-zone ${door.temperature_mode}`} style={{ gridTemplateRows: `repeat(${Math.max(door.slots.length, 1)}, minmax(0, 1fr))` }}>{doorContent}</span> : <div className="door-empty" />
  const zoneStyle = (item: LayoutZone) => item.geometry.layout_kind === 'single_row'
    ? { gridTemplateRows: '1fr', gridTemplateColumns: `repeat(${Math.max(item.slots.length, 1)}, minmax(0, 1fr))`, gridAutoFlow: 'column' as const }
    : { gridTemplateRows: `repeat(${Math.max(item.slots.length, 1)}, minmax(0, 1fr))` }
  const zone = (item: LayoutZone, compact = false) => onSelect
    ? <button type="button" key={item.key} onClick={() => onSelect(item.key)} className={`open-fridge-zone ${item.temperature_mode} ${item.geometry.layout_kind === 'single_row' ? 'is-row' : ''} ${item.key === activeZoneKey ? 'is-active' : ''} ${compact ? 'is-compact' : ''}`} style={zoneStyle(item)} aria-label={`${item.label}，${item.slots.length} 格`}>{Array.from({ length: Math.max(item.slots.length, 1) }, (_, index) => <i key={index} />)}</button>
    : <span key={item.key} className={`open-fridge-zone ${item.temperature_mode} ${item.geometry.layout_kind === 'single_row' ? 'is-row' : ''} ${compact ? 'is-compact' : ''}`} style={zoneStyle(item)}>{Array.from({ length: Math.max(item.slots.length, 1) }, (_, index) => <i key={index} />)}</span>
  const wideZone = (item: LayoutZone) => onSelect
    ? <button type="button" key={item.key} onClick={() => onSelect(item.key)} className={`open-fridge-wide-zone ${item.temperature_mode} ${item.key === activeZoneKey ? 'is-active' : ''}`} style={{ left: `${item.geometry.x}%`, top: `${item.geometry.y}%`, width: `${item.geometry.width}%`, height: `${item.geometry.height}%`, gridTemplateRows: `repeat(${Math.max(item.slots.length, 1)}, minmax(0, 1fr))` }} aria-label={`${item.label}，${item.slots.length} 格`}>{Array.from({ length: Math.max(item.slots.length, 1) }, (_, index) => <i key={index} />)}</button>
    : <span key={item.key} className={`open-fridge-wide-zone ${item.temperature_mode}`} style={{ left: `${item.geometry.x}%`, top: `${item.geometry.y}%`, width: `${item.geometry.width}%`, height: `${item.geometry.height}%`, gridTemplateRows: `repeat(${Math.max(item.slots.length, 1)}, minmax(0, 1fr))` }}>{Array.from({ length: Math.max(item.slots.length, 1) }, (_, index) => <i key={index} />)}</span>
  if (wide) return <div className={`open-fridge open-fridge-wide ${layout.template_key}`} aria-label="冰箱布局预览">
    <div className="open-fridge-cabinet">{cabinetZones.map(wideZone)}</div>
    <span className="open-fridge-hinges" aria-hidden="true"><i /><i /></span>
    <div className="open-fridge-door" aria-label="冰箱门">{doorPanel}</div>
  </div>
  return <div className={`open-fridge ${layout.template_key}`} aria-label="冰箱布局预览">
    <div className={`open-fridge-cabinet ${middle.length ? 'has-middle' : 'two-zone'}`} style={{ gridTemplateRows: doorRows }}>
      {top && zone(top)}
      {middle.length ? <div className={`open-fridge-middle ${middle.length === 1 ? 'is-single' : ''}`}>{middle.map(item => zone(item, true))}</div> : null}
      {bottom && zone(bottom)}
    </div>
    <span className="open-fridge-hinges" aria-hidden="true"><i /><i /></span>
    <div className="open-fridge-door" aria-label="冰箱门">{doorPanel}</div>
  </div>
}

function TemplateSilhouette({ template, selected, onSelect }: { template: Template; selected: boolean; onSelect: () => void }) {
  return <button type="button" aria-label={template.name} className={`template-choice ${selected ? 'is-selected' : ''}`} onClick={onSelect} aria-pressed={selected}>
    <span className="template-preview" aria-hidden="true"><OpenFridge layout={makeDraftLayout(template)} /></span>
    <span className="template-name">{template.name}</span>
    {selected && <b>✓</b>}
  </button>
}

function CategoryIcon({ iconKey, icons }: { iconKey: string | null; icons: Icon[]; label?: string }) {
  const icon = icons.find(item => item.key === iconKey) ?? icons[0]
  return icon ? <img className="food-icon" src={icon.asset_url} alt="" /> : <span className="food-icon-fallback" aria-hidden="true">●</span>
}

/** P5 食材录入流程：将草稿中的五个页面映射为可完成的库存操作。 */
function InventoryFlow({ layout, categories, icons, inventory, saving, onBack, onChooseCategory, onCreateCategory, onSave, onDelete }: {
  layout: Layout; categories: Category[]; icons: Icon[]; inventory: InventoryBatch[]; saving: boolean; onBack: () => void
  onChooseCategory: (id: string) => Promise<string | undefined>; onCreateCategory: (parentId: string, name: string, iconKey: string) => Promise<Category | undefined>
  onSave: (draft: { id?: string; categoryId: string; subcategoryId: string; slotId: string; foodName: string; quantity: number; bestBefore: string; description: string; productionDate: string; barcode: string }) => Promise<boolean>
  onDelete: (id: string) => Promise<boolean>
}) {
  type View = 'add' | 'location' | 'library' | 'custom' | 'edit'
  const parents = categories.filter(item => !item.parent_id)
  const [view, setView] = useState<View>('add')
  const [draft, setDraft] = useState({ id: '', categoryId: '', subcategoryId: '', slotId: '', foodName: '', quantity: 1, bestBefore: '', description: '', productionDate: '' })
  const [query, setQuery] = useState('')
  const [libraryOrigin, setLibraryOrigin] = useState<'add' | 'edit'>('add')
  const [customName, setCustomName] = useState('')
  const [customIcon, setCustomIcon] = useState(icons[0]?.key ?? '')
  const [notice, setNotice] = useState('')
  const [recognizing, setRecognizing] = useState(false)
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
  const update = (change: Partial<typeof draft>) => setDraft(current => ({ ...current, ...change }))
  const stopCamera = () => { streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null }
  useEffect(() => {
    if (view !== 'add' || !navigator.mediaDevices?.getUserMedia) return
    let active = true
    void navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then(stream => { if (!active) { stream.getTracks().forEach(track => track.stop()); return }; streamRef.current = stream; if (videoRef.current) videoRef.current.srcObject = stream })
      .catch(() => setNotice('无法打开相机。你仍可手工填写食材信息，或在系统设置中允许相机权限。'))
    return () => { active = false; stopCamera() }
  }, [view])
  const registerBarcode = (rawValue: string) => {
    const value = rawValue.trim()
    const now = Date.now()
    if (!value || (lastProcessedBarcode.current.value === value && now - lastProcessedBarcode.current.at < 10_000)) return
    lastProcessedBarcode.current = { value, at: now }
    setBarcode(value); void lookupBarcode(value)
  }
  useEffect(() => {
    const BarcodeDetector = (window as Window & { BarcodeDetector?: new (options: { formats: string[] }) => { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector
    if (view !== 'add') return
    let controls: IScannerControls | undefined
    let active = true
    let busy = false
    const start = async () => {
      if (!videoRef.current) return
      if (BarcodeDetector) {
        try {
          const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code'] })
          const timer = window.setInterval(() => {
            if (busy || !videoRef.current || videoRef.current.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
            busy = true
            void detector.detect(videoRef.current).then(result => { if (result[0]?.rawValue) registerBarcode(result[0].rawValue) }).catch(() => undefined).finally(() => { busy = false })
          }, 800)
          controls = { stop: () => window.clearInterval(timer) } as IScannerControls
          return
        } catch { /* 继续使用 ZXing 回退。 */ }
      }
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        if (!active || !videoRef.current) return
        controls = await new BrowserMultiFormatReader().decodeFromVideoElement(videoRef.current, result => { if (result) registerBarcode(result.getText()) })
      } catch { if (active) setNotice('此浏览器无法自动识别条码；你仍可手动输入或粘贴编码。') }
    }
    void start()
    return () => { active = false; controls?.stop() }
    // 扫描器只在录入页面进入时创建；状态变化不应反复请求相机。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])
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
    if (values.barcode?.value && (!barcode || barcode === values.barcode.value)) setBarcode(values.barcode.value)
    else if (values.barcode?.value) nextConflicts.barcode = values.barcode
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
    try { applySuggestion(await request<BarcodeSuggestion>(`/api/owner/refrigerators/${layout.refrigerator_id}/barcode/${encodeURIComponent(value)}`)); setNotice('已找到这台冰箱之前确认过的商品信息。') } catch { setNotice('未找到已确认商品；已保留条码，你可以继续手工填写或使用 AI 识别。') }
  }
  const chooseParent = (id: string) => { update({ categoryId: id, subcategoryId: '', slotId: '' }); void onChooseCategory(id).then(slotId => { if (slotId) update({ slotId }) }) }
  const chooseChild = (child: Category) => { update({ subcategoryId: child.id, foodName: draft.foodName || child.name }); setView(libraryOrigin) }
  const advance = () => {
    if (!draft.foodName.trim() || !draft.categoryId || !draft.subcategoryId) { setNotice('请先填写名称并选择大类和小类。'); return }
    setNotice(''); setView('location')
  }
  const save = async () => { if (!draft.slotId) { setNotice('请选择存放位置。'); return }; if (await onSave({ ...draft, barcode })) { setView('add'); setDraft({ id: '', categoryId: '', subcategoryId: '', slotId: '', foodName: '', quantity: 1, bestBefore: '', description: '', productionDate: '' }); setBarcode(''); setNotice('已加入冰箱。') } }
  const startEdit = (item: InventoryBatch) => { setDraft({ id: item.id, categoryId: item.category_id, subcategoryId: item.subcategory_id, slotId: item.storage_slot_id, foodName: item.food_name, quantity: item.quantity, bestBefore: item.best_before ?? '', description: item.product_description ?? '', productionDate: item.production_date ?? '' }); setBarcode(item.barcode ?? ''); setNotice(''); setView('edit') }
  const backFrom = () => { if (view === 'location' || view === 'edit') setView('add'); else if (view === 'library') setView(libraryOrigin); else if (view === 'custom') setView('library'); else onBack() }

  if (view === 'library') return <main className="p5-flow"><PageHeader title="选择小类" onBack={backFrom} right={<button className="p5-header-action" onClick={() => setView(libraryOrigin)} aria-label="关闭">×</button>} /><div className="p5-scroll p5-library">
    <div className="category-pill"><CategoryIcon iconKey={parent?.icon_key ?? null} icons={icons} label={parent?.name ?? ''} />{parent?.name ?? '请选择大类'}</div>
    <label className="p5-search"><span aria-hidden="true">⌕</span><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索小类" /></label>
    <section><h2>常用</h2><div className="p5-icon-grid p5-common">{children.slice(0, 4).map(child => <button key={child.id} onClick={() => chooseChild(child)}><span><CategoryIcon iconKey={child.icon_key} icons={icons} label={child.name} /></span><b>{child.name}</b></button>)}</div></section>
    <hr /><section><h2>所有{parent?.name ?? '小类'}</h2><div className="p5-icon-grid">{matchingChildren.map(child => <button key={child.id} onClick={() => chooseChild(child)}><span><CategoryIcon iconKey={child.icon_key} icons={icons} label={child.name} /></span><b>{child.name}</b></button>)}<button className="p5-new-category" onClick={() => { setCustomName(''); setCustomIcon(icons[0]?.key ?? ''); setView('custom') }}><span>＋</span><b>新建小类</b></button></div></section>
  </div><footer className="p5-note">选择后，名称为空时自动填入。</footer></main>

  if (view === 'custom') return <main className="p5-flow"><PageHeader title="新建小类" onBack={backFrom} right={<button className="p5-header-action" onClick={() => setView('add')} aria-label="关闭">×</button>} /><div className="p5-scroll p5-custom">
    <div className="category-pill"><CategoryIcon iconKey={parent?.icon_key ?? null} icons={icons} label={parent?.name ?? ''} />所属大类：{parent?.name}</div>
    <label className="p5-name-input"><span>小类名称</span><input autoFocus value={customName} onChange={event => setCustomName(event.target.value)} placeholder="请输入名称" /></label>
    <section><div className="p5-tabs"><button className="is-active">从图库选择</button><button onClick={() => setNotice('AI 图标尚未通过图标 spike，当前请从图库选择。')}>AI 生成</button></div><div className="p5-icon-grid p5-custom-grid">{icons.map(icon => <button className={customIcon === icon.key ? 'is-selected' : ''} key={icon.key} onClick={() => setCustomIcon(icon.key)}><span><img className="food-icon" src={icon.asset_url} alt="" /></span><b>{icon.label}</b></button>)}</div></section>
    {notice && <p className="p5-inline-notice" role="status">{notice}</p>}
  </div><footer className="bottom-action-bar"><button disabled={!customName.trim() || !customIcon || saving} onClick={() => void onCreateCategory(draft.categoryId, customName, customIcon).then(created => { if (created) { update({ subcategoryId: created.id, foodName: draft.foodName || created.name }); setView(libraryOrigin) } })}>{saving ? '加入中…' : '确认并加入图库'}</button></footer></main>

  if (view === 'location') return <main className="p5-flow"><PageHeader title="确认位置与数量" onBack={backFrom} right={<span className="flow-step">2 / 2</span>} /><div className="p5-scroll p5-location">
    <div className="p5-location-fridge">{layout.zones.map(zone => <div className="p5-location-zone" key={zone.key}><strong>{zone.label}</strong><div>{zone.slots.map(slot => <button key={slot.id} className={slot.id === draft.slotId ? 'is-selected' : ''} onClick={() => update({ slotId: slot.id })} aria-label={`选择${zone.label}${slot.key}`}><i /></button>)}</div></div>)}</div>
    <b className="p5-location-label">{selectedSlot ? `${selectedSlot.zone.label} · ${selectedSlot.key}` : '请选择一个分区'}</b><p>点选分区可更改</p>
    <div className="p5-food-summary"><span><CategoryIcon iconKey={selectedChild?.icon_key ?? parent?.icon_key ?? null} icons={icons} label={draft.foodName} /></span><div><strong>{draft.foodName} · {selectedChild?.name}</strong>{draft.bestBefore && <small>BBD {draft.bestBefore}</small>}</div><div className="p5-quantity"><button onClick={() => update({ quantity: Math.max(1, draft.quantity - 1) })} aria-label="减少数量">−</button><b>{draft.quantity}</b><button onClick={() => update({ quantity: draft.quantity + 1 })} aria-label="增加数量">＋</button></div></div>
    {notice && <p className="p5-inline-notice" role="status">{notice}</p>}
  </div><footer className="bottom-action-bar"><button disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '确认加入'}</button></footer></main>

  if (view === 'edit') return <main className="p5-flow"><PageHeader title="编辑食材" onBack={backFrom} right={<button className="save-text" onClick={() => void save()} disabled={saving}>保存</button>} /><div className="p5-scroll p5-edit">
    <div className="p5-edit-name"><span><CategoryIcon iconKey={selectedChild?.icon_key ?? parent?.icon_key ?? null} icons={icons} label={draft.foodName} /></span><input value={draft.foodName} onChange={event => update({ foodName: event.target.value })} /></div>
    <button className="p5-row-link" onClick={() => { setLibraryOrigin('edit'); setView('library') }}><span><small>分类</small><b>{parent?.name} · {selectedChild?.name}</b></span><i>›</i></button>
    <label className="p5-field"><span>品牌规格备注</span><input value={draft.description} onChange={event => update({ description: event.target.value })} placeholder="例：蒙牛 250ml × 6" /></label>
    <div className="p5-date-row"><label className="p5-field"><span>生产日期</span><input type="date" value={draft.productionDate} onChange={event => update({ productionDate: event.target.value })} /></label><label className="p5-field"><span>保质期至（可选）</span><input type="date" value={draft.bestBefore} onChange={event => update({ bestBefore: event.target.value })} /></label></div>
    <div className="p5-large-quantity"><span>数量</span><div><button onClick={() => update({ quantity: Math.max(1, draft.quantity - 1) })}>−</button><b>{draft.quantity}</b><button onClick={() => update({ quantity: draft.quantity + 1 })}>＋</button></div></div>
    <button className="p5-row-link p5-slot-link" onClick={() => setView('location')}><span><small>存放位置</small><b>{selectedSlot ? `${selectedSlot.zone.label} ${selectedSlot.key}` : '请选择'}</b></span><i>›</i></button>
    <button className="p5-primary-inline" disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '保存修改'}</button><button className="p5-delete" onClick={() => void onDelete(draft.id).then(deleted => { if (deleted) { setView('add'); setNotice('食材已删除。') } })}>删除食材</button>
  </div></main>

  return <main className="p5-flow"><PageHeader title="添加食材" onBack={backFrom} right={<span className="flow-step">1 / 2</span>} /><div className="p5-scroll p5-add">
    {notice && <p className="p5-inline-notice" role="status">{notice}</p>}
    <div className="p5-viewfinder"><video ref={videoRef} muted playsInline autoPlay /><i /><span>条码可手动输入或由相机扫描</span><div className="p6-camera-actions"><button disabled={recognizing} onClick={() => void recognize()}>{recognizing ? '识别中…' : '✦ 识别包装'}</button><button disabled={recognizing} onClick={() => void lookupBarcode()}>查询条码</button></div></div>
    <label className="p5-field p6-barcode"><span>条码 / 二维码（可选）</span><input value={barcode} onChange={event => setBarcode(event.target.value)} inputMode="numeric" placeholder="扫描后输入或粘贴编码" /></label>
    {Object.keys(conflicts).length > 0 && <section className="p6-conflicts" aria-live="polite"><h2>确认识别结果</h2><p>以下字段已有值，本次识别不会自动覆盖。</p>{Object.entries(conflicts).map(([field, value]) => <div key={field}><b>{field === 'foodName' ? '食材名称' : field === 'description' ? '品牌 / 规格 / 备注' : field === 'productionDate' ? '生产日期' : field === 'bestBefore' ? '保质期至' : field === 'barcode' ? '条码' : field === 'categoryId' ? '大类' : '小类'}</b><span>当前：{field === 'barcode' ? barcode : String(draft[field as keyof typeof draft])}</span><span>识别：{value.value}（{Math.round(value.confidence * 100)}%）</span><button onClick={() => { if (field === 'barcode') setBarcode(value.value); else update({ [field]: value.value } as Partial<typeof draft>); setConflicts(current => { const next = { ...current }; delete next[field]; return next }) }}>采用识别值</button><button className="p6-keep" onClick={() => setConflicts(current => { const next = { ...current }; delete next[field]; return next })}>保留当前值</button></div>)}</section>}
    <section><div className="p5-section-label"><span>食材分类</span>{parent && selectedChild && <b>{parent.name} · {selectedChild.name}</b>}</div><div className="p5-parent-grid">{parents.map(item => <button className={item.id === draft.categoryId ? 'is-selected' : ''} key={item.id} onClick={() => chooseParent(item.id)}><CategoryIcon iconKey={item.icon_key} icons={icons} label={item.name} /><b>{item.name}</b></button>)}</div></section>
    <label className="p5-food-name"><span>食材名称</span><div><CategoryIcon iconKey={selectedChild?.icon_key ?? parent?.icon_key ?? null} icons={icons} label="" /><input value={draft.foodName} onChange={event => update({ foodName: event.target.value })} placeholder="请输入食材名称" /></div></label>
    <button className="p5-row-link p5-subcategory-link" disabled={!draft.categoryId} onClick={() => { setLibraryOrigin('add'); setView('library') }}><span><small>小类</small><b>{selectedChild?.name ?? '选择小类'}</b></span><i>›</i></button>
    <div className="p5-date-row"><label className="p5-field"><span>生产日期</span><input type="date" value={draft.productionDate} onChange={event => update({ productionDate: event.target.value })} /></label><label className="p5-field"><span>保质期至（可不填）</span><input type="date" value={draft.bestBefore} onChange={event => update({ bestBefore: event.target.value })} /></label></div>
    <label className="p5-field"><span>品牌 / 规格 / 备注</span><input value={draft.description} onChange={event => update({ description: event.target.value })} placeholder="例：光明 950ml 有折扣" /></label>
    {inventory.length > 0 && <section className="p5-existing"><h2>当前库存</h2>{inventory.map(item => <button key={item.id} onClick={() => startEdit(item)}><span><CategoryIcon iconKey={item.icon_key} icons={icons} label={item.food_name} /></span><b>{item.food_name}<small>{item.subcategory_name} · ×{item.quantity}</small></b><i>编辑 ›</i></button>)}</section>}
  </div><footer className="bottom-action-bar"><button onClick={advance}>加入冰箱</button></footer></main>
}

function templateCaption(templateKey: string): string {
  return ({
    top_freezer_single: '上冷冻 · 下冷藏', bottom_freezer_single: '上冷藏 · 下冷冻',
    side_by_side: '左冷冻 · 右冷藏', french_door: '上部双冷藏 · 下冷冻',
    mini: '上冷冻 · 下冷藏', three_door: '上冷藏 · 中间可调 · 下冷冻',
    dual_middle: '上冷藏 · 中间分区 · 下冷冻',
  } as Record<string, string>)[templateKey] ?? ''
}

function makeDraftLayout(template: Template): Layout {
  return { refrigerator_id: 'draft', template_key: template.key, zones: template.zones.map(zone => {
    const count = zone.is_door ? 5 : template.key === 'dual_middle' && zone.key === 'middle' ? 2 : template.key === 'mini' ? (zone.key === 'freezer' ? 1 : 2) : zone.layout_kind === 'single_row' ? 1 : 3
    const geometry = { ...zone.geometry, layout_kind: zone.layout_kind }
    return { key: zone.key, label: zone.label, temperature_mode: zone.temperature_mode, geometry, is_door: zone.is_door, slots: Array.from({ length: count }, (_, index) => ({ id: `draft-${zone.key}-${index}`, key: `${zone.key}-${index + 1}` })) }
  }) }
}

export function App() {
  const [message, setMessage] = useState('')
  const [ownerState, setOwnerState] = useState<'loading' | 'signed-in' | 'signed-out'>('loading')
  const [fridges, setFridges] = useState<Refrigerator[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [name, setName] = useState('家里冰箱')
  const [templateKey, setTemplateKey] = useState('top_freezer_single')
  const [layout, setLayout] = useState<Layout | null>(null)
  const [setupStep, setSetupStep] = useState<'none' | 'setup' | 'preview' | 'editor'>('none')
  const [draftLayout, setDraftLayout] = useState<Layout | null>(null)
  const [activeZoneKey, setActiveZoneKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [passcode, setPasscode] = useState('')
  const [creating, setCreating] = useState(false)
  const [devices, setDevices] = useState<Device[]>([])
  const [deviceFridgeId, setDeviceFridgeId] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [inventory, setInventory] = useState<InventoryBatch[]>([])
  const [icons, setIcons] = useState<Icon[]>([])
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
    setLayout(savedLayout); setCategories(savedCategories); setInventory(savedInventory)
  }

  const createRefrigerator = async () => {
    if (!draftLayout) return
    setSaving(true)
    try {
      const fridge = await request<Refrigerator>('/api/owner/refrigerators', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, template_key: templateKey, layout: draftLayout.zones.map(zone => ({ zone_key: zone.key, temperature_mode: zone.temperature_mode, slot_count: zone.slots.length })) }) })
      await loadInventoryWorkspace(fridge)
      setCreating(false); setSetupStep('none'); setDraftLayout(null); setMessage(`已创建「${fridge.name}」，现在可以直接添加食材。`); await loadOwner()
    } catch (error) { setMessage((error as Error).message) } finally { setSaving(false) }
  }
  const openLayout = async (fridge: Refrigerator) => {
    try {
      await loadInventoryWorkspace(fridge)
      setMessage(`正在管理「${fridge.name}」的库存。`)
    } catch (error) { setMessage((error as Error).message) }
  }
  const changeSlots = (key: string, slots: number) => {
    const update = (current: Layout | null) => current && ({ ...current, zones: current.zones.map(zone => zone.key === key ? { ...zone, slots: Array.from({ length: slots }, (_, index) => ({ id: `draft-${key}-${index}`, key: `${key}-${index + 1}` })) } : zone) })
    if (setupStep === 'editor') setDraftLayout(update); else setLayout(update)
  }
  const changeTemperature = (key: string, temperature: 'cold' | 'frozen') => {
    const update = (current: Layout | null) => current && ({ ...current, zones: current.zones.map(zone => zone.key === key ? { ...zone, temperature_mode: temperature } : zone) })
    if (setupStep === 'editor') setDraftLayout(update); else setLayout(update)
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
  const chooseCategory = async (nextCategoryId: string) => {
    if (!layout || !nextCategoryId) return undefined
    try {
      const result = await request<{ storage_slot_id: string | null }>(`/api/owner/refrigerators/${layout.refrigerator_id}/inventory/default-location?category_id=${encodeURIComponent(nextCategoryId)}`)
      return result.storage_slot_id ?? undefined
    } catch (error) { setMessage((error as Error).message); return undefined }
  }
  const saveP5Inventory = async (draft: { id?: string; categoryId: string; subcategoryId: string; slotId: string; foodName: string; quantity: number; bestBefore: string; description: string; productionDate: string; barcode: string }) => {
    if (!layout) return false
    setSaving(true)
    try {
      const batch = await request<InventoryBatch>(`/api/owner/refrigerators/${layout.refrigerator_id}/inventory${draft.id ? `/${draft.id}` : ''}`, {
        method: draft.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_id: draft.categoryId, subcategory_id: draft.subcategoryId, storage_slot_id: draft.slotId, food_name: draft.foodName, quantity: draft.quantity, best_before: draft.bestBefore || null, product_description: draft.description || null, production_date: draft.productionDate || null, barcode: draft.barcode || null }),
      })
      setInventory(current => [...current.filter(item => item.id !== batch.id), batch])
      return true
    } catch (error) { setMessage((error as Error).message); return false } finally { setSaving(false) }
  }
  const createP5Category = async (parentId: string, categoryName: string, iconKey: string) => {
    if (!layout) return undefined
    setSaving(true)
    try {
      const created = await request<Category>(`/api/owner/refrigerators/${layout.refrigerator_id}/categories`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parent_id: parentId, name: categoryName, icon_key: iconKey }),
      })
      setCategories(current => [...current, created])
      return created
    } catch (error) { setMessage((error as Error).message); return undefined } finally { setSaving(false) }
  }
  const deleteP5Inventory = async (batchId: string) => {
    if (!layout) return false
    try { await request<void>(`/api/owner/refrigerators/${layout.refrigerator_id}/inventory/${batchId}`, { method: 'DELETE' }); setInventory(current => current.filter(item => item.id !== batchId)); return true } catch (error) { setMessage((error as Error).message); return false }
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
  if (!layout && (!fridges.length || creating || setupStep !== 'none')) {
    const step = setupStep === 'none' ? 'setup' : setupStep
    const currentDraft = draftLayout ?? (selectedTemplate ? makeDraftLayout(selectedTemplate) : null)
    const selectedZone = currentDraft?.zones.find(zone => zone.key === activeZoneKey) ?? currentDraft?.zones[0]
    const templateZone = selectedTemplate?.zones.find(zone => zone.key === selectedZone?.key)
    const leaveSetup = () => { setSetupStep('none'); setCreating(false); setDraftLayout(null); setActiveZoneKey('') }
    if (step === 'setup') return <main className="p4-flow">
      <PageHeader title="设置这台冰箱" onBack={fridges.length ? leaveSetup : undefined} right={<span className="flow-step">1 / 2</span>} />
      <div className="p4-content setup-content"><label className="fridge-name-field"><span>冰箱名称</span><input value={name} onChange={event => setName(event.target.value)} required maxLength={120} /></label>
        {currentDraft && <><div className="setup-preview"><OpenFridge layout={currentDraft} /></div><p className="layout-caption">{templateCaption(currentDraft.template_key)}</p></>}
        <section className="template-section"><h2>选择外形</h2><div className="template-grid">{templates.map(template => <TemplateSilhouette key={template.key} template={template} selected={template.key === templateKey} onSelect={() => { setTemplateKey(template.key); setDraftLayout(makeDraftLayout(template)); setActiveZoneKey(template.zones[0]?.key ?? '') }} />)}</div></section>
      </div><footer className="bottom-action-bar"><button disabled={!selectedTemplate || !name.trim()} onClick={() => { if (!selectedTemplate) return; const next = draftLayout ?? makeDraftLayout(selectedTemplate); setDraftLayout(next); setActiveZoneKey(next.zones[0]?.key ?? ''); setSetupStep('preview') }}>使用这个布局</button></footer>
    </main>
    if (!currentDraft) return null
    if (step === 'preview') return <main className="p4-flow">
      <PageHeader title="预览这台冰箱" onBack={() => setSetupStep('setup')} right={<span className="flow-step">2 / 2</span>} />
      <div className="p4-content preview-content"><OpenFridge layout={currentDraft} /><button className="secondary-action edit-layout-button" onClick={() => setSetupStep('editor')}>编辑布局</button><p className="quiet-note">创建后仍可在手机端调整布局</p></div>
      <footer className="bottom-action-bar"><button disabled={saving} onClick={() => void createRefrigerator()}>{saving ? '创建中…' : '创建冰箱'}</button></footer>
    </main>
    return <main className="p4-flow">
      <PageHeader title="布局方案" onBack={() => setSetupStep('preview')} right={<button className="save-text" onClick={() => setSetupStep('preview')}>保存</button>} />
      <div className="p4-content editor-content"><OpenFridge layout={currentDraft} activeZoneKey={selectedZone?.key} onSelect={setActiveZoneKey} />
        <div className="zone-tabs" role="tablist">{currentDraft.zones.map(zone => <button key={zone.key} type="button" role="tab" aria-selected={zone.key === selectedZone?.key} className={zone.key === selectedZone?.key ? 'is-active' : ''} onClick={() => setActiveZoneKey(zone.key)}>{zone.label.replace('区', '')}</button>)}</div>
        {selectedZone && <section className="partition-panel"><div className="partition-heading"><h2>分格</h2><span>{selectedZone.label}</span></div><div className="partition-options">{(templateZone?.layout_kind === 'single_row' ? [1, 2, 3] : [1, 2, 3, 4, 5, 6]).map(count => { const isRow = templateZone?.layout_kind === 'single_row'; return <button key={count} type="button" className={count === selectedZone.slots.length ? 'is-selected' : ''} onClick={() => changeSlots(selectedZone.key, count)} aria-label={`${count}${isRow ? '格' : '层'}`}><span className={`partition-glyph ${isRow ? 'is-row' : ''}`} style={isRow ? { gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` } : { gridTemplateRows: `repeat(${count}, minmax(0, 1fr))` }}>{Array.from({ length: count }, (_, index) => <i key={index} />)}</span><b>{count}</b></button> })}</div>{templateZone?.adjustable_temperature && <div className="temperature-choice"><span>温度</span><button type="button" className={selectedZone.temperature_mode === 'cold' ? 'is-selected' : ''} onClick={() => changeTemperature(selectedZone.key, 'cold')}>冷藏</button><button type="button" className={selectedZone.temperature_mode === 'frozen' ? 'is-selected' : ''} onClick={() => changeTemperature(selectedZone.key, 'frozen')}>冷冻</button></div>}</section>}
      </div><footer className="bottom-action-bar"><p>保存后回到预览</p></footer>
    </main>
  }
  if (!layout) return <main className="owner-start fridge-list"><span className="wordmark">家常食橱</span><h1>我的冰箱</h1><p>选择一台冰箱继续管理。</p>{isStandalone() && <button className="scan-entry" onClick={() => setScanning(true)}>扫描冰箱端二维码</button>}{message && <p className="notice" role="status">{message}</p>}{fridges.map(fridge => <div className="fridge-list-item" key={fridge.id}><span><strong>{fridge.name}</strong><small>冰箱与食材</small></span><button onClick={() => void openLayout(fridge)}>打开</button><button className="secondary-action" onClick={() => void showDevices(fridge)}>设备</button></div>)}<button className="secondary-action" onClick={() => { setCreating(true); setSetupStep('setup') }}>新建冰箱</button></main>
  return <InventoryFlow layout={layout} categories={categories} icons={icons} inventory={inventory} saving={saving} onBack={() => setLayout(null)} onChooseCategory={chooseCategory} onCreateCategory={createP5Category} onSave={saveP5Inventory} onDelete={deleteP5Inventory} />
}
