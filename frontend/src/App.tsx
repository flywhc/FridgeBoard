/** FridgeBoard 的所有者登录、P4 建冰箱/布局编辑和 P3 设备访问页。 */
import { CSSProperties, FormEvent, ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import type { IScannerControls } from '@zxing/browser'

type Refrigerator = { id: string; name: string }
type Device = { id: string; kind: string; label: string; created_at: string; last_seen_at: string | null; revoked_at: string | null; is_current: boolean }
type ZoneGeometry = { x: number; y: number; width: number; height: number; layout_kind: 'vertical' | 'single_row' }
type ZoneTemplate = { key: string; label: string; temperature_mode: 'cold' | 'frozen'; geometry: ZoneGeometry; layout_kind: 'vertical' | 'single_row'; adjustable_temperature: boolean; is_door: boolean }
type Template = { key: string; name: string; zones: ZoneTemplate[] }
type LayoutZone = { key: string; label: string; temperature_mode: 'cold' | 'frozen'; geometry: ZoneGeometry; slots: { id: string; key: string }[]; is_door: boolean }
type Layout = { refrigerator_id: string; template_key: string; zones: LayoutZone[] }
type Category = { id: string; parent_id: string | null; name: string; icon_key: string | null; is_custom: boolean }
type InventoryBatch = { id: string; category_id: string; category_name: string; subcategory_id: string; subcategory_name: string; icon_key: string | null; storage_slot_id: string; food_name: string; quantity: number; production_date: string | null; best_before: string | null; product_description: string | null; barcode: string | null; expiry_status: string | null }
type Icon = { key: string; label: string; asset_url: string }
type ExpirySettings = { ratio_percent: number; minimum_days: number; maximum_days: number }
type NotificationSettings = { daily_reminder_enabled: boolean; reminder_time: string; device_health_enabled: boolean }
type DueNotification = { kind: 'food' | 'device_health'; title: string; body: string }
type RecognitionField = { value: string; confidence: number }
type RecognitionResult = { fields: Record<string, RecognitionField> }
type BarcodeSuggestion = { food_name: string; category_id: string; subcategory_id: string; product_description: string | null; barcode: string }
type RecipeIngredient = { subcategory_name: string; quantity: number }
type RecipeEntry = { id: string; weekday: number; dish_name: string; completed: boolean; ingredients: RecipeIngredient[]; missing: RecipeIngredient[] }
type RecipeDay = { weekday: number; label: string; entries: RecipeEntry[] }
type RestockEntry = { weekday: number; label: string; dish_name: string; missing: RecipeIngredient[] }

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
  const [remaining, setRemaining] = useState(0)
  const [retryNonce, setRetryNonce] = useState(0)
  useEffect(() => {
    let active = true
    const retryTimer = window.setTimeout(() => {
      void request<{ pairing_url: string; expires_in_seconds: number }>('/api/kindle/first-boot-sessions', { method: 'POST' })
        .then(result => {
          if (!active) return
          setPairingUrl(result.pairing_url); setRemaining(result.expires_in_seconds); setState('pending')
        })
        .catch(() => {
          if (!active) return
          setState('error')
          window.setTimeout(() => { if (active) setRetryNonce(value => value + 1) }, 3000)
        })
    }, 0)
    return () => { active = false; window.clearTimeout(retryTimer) }
  }, [retryNonce])
  useEffect(() => {
    if (state !== 'pending') return
    if (!remaining) {
      const refreshTimer = window.setTimeout(() => {
        setPairingUrl(''); setState('loading'); setRetryNonce(value => value + 1)
      }, 0)
      return () => window.clearTimeout(refreshTimer)
    }
    const timer = window.setTimeout(() => setRemaining(value => Math.max(0, value - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [remaining, state])
  useEffect(() => {
    if (state !== 'pending') return
    const timer = window.setInterval(() => {
      void request<{ state: 'pending' | 'bound' }>('/api/kindle/first-boot-sessions/current')
        .then(result => { if (result.state === 'bound') setState('bound') })
        .catch(() => { setPairingUrl(''); setRemaining(0); setState('loading'); setRetryNonce(value => value + 1) })
    }, 4000)
    return () => window.clearInterval(timer)
  }, [state])
  if (state === 'bound') return <main className="fridge-first-boot"><header className="eink-header"><h1>家常食橱</h1></header><p>已连接。请在手机中管理冰箱。</p></main>
  return <main className="fridge-first-boot"><header className="eink-header"><h1>家常食橱</h1></header><div className="first-boot-content">{pairingUrl ? <PairingCode value={pairingUrl} className="fridge-qr" /> : <div className="fridge-qr qr-loading" />}<p>{state === 'error' ? '连接暂时失败，正在重新生成二维码…' : '用手机相机扫码，安装应用'}</p></div></main>
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

type EinkWorkspace = { refrigerator: Refrigerator; layout: Layout; inventory: InventoryBatch[]; icons: Icon[] }

/** 冰箱端启动门：优先读取已配对设备，未配对时才进入首次开机二维码。 */
function EinkDisplayGate() {
  const [workspace, setWorkspace] = useState<EinkWorkspace | null>(null)
  const [resolved, setResolved] = useState(false)
  useEffect(() => {
    let active = true
    void Promise.all([
      request<Refrigerator>('/api/devices/current'), request<Layout>('/api/devices/current/layout'),
      request<InventoryBatch[]>('/api/devices/current/inventory'), request<Icon[]>('/api/icon-library'),
    ]).then(([refrigerator, layout, inventory, icons]) => {
      if (active) setWorkspace({ refrigerator, layout, inventory, icons })
    }).catch(() => undefined).finally(() => { if (active) setResolved(true) })
    return () => { active = false }
  }, [])
  if (!resolved) return <main className="eink-loading" aria-live="polite">正在唤醒家常食橱…</main>
  return workspace ? <EinkDisplay initial={workspace} /> : <FridgeFirstBoot />
}

/** 低频同步、离线重试与十分钟自动返回均收口在冰箱端工作区。 */
function EinkDisplay({ initial }: { initial: EinkWorkspace }) {
  const [workspace, setWorkspace] = useState(initial)
  const [view, setView] = useState<{ kind: 'home' } | { kind: 'detail'; slotId: string } | { kind: 'pairing' }>({ kind: 'home' })
  const [syncState, setSyncState] = useState<'ready' | 'syncing' | 'offline'>('ready')
  const [lastSyncedAt, setLastSyncedAt] = useState(() => localStorage.getItem('fb-eink-last-sync') ?? '')
  const [busyBatchId, setBusyBatchId] = useState('')
  const [undo, setUndo] = useState<{ batch: InventoryBatch; delta: number; removed: boolean } | null>(null)
  const syncInFlight = useRef(false)

  const sync = async (): Promise<boolean> => {
    if (syncInFlight.current) return false
    syncInFlight.current = true
    setSyncState('syncing')
    try {
      const [layout, inventory] = await Promise.all([
        request<Layout>('/api/devices/current/layout'), request<InventoryBatch[]>('/api/devices/current/inventory'),
      ])
      const timestamp = new Date().toISOString()
      await request<void>('/api/devices/current/sync-status', { method: 'POST' })
      localStorage.setItem('fb-eink-last-sync', timestamp)
      setWorkspace(current => ({ ...current, layout, inventory }))
      setLastSyncedAt(timestamp); setSyncState('ready')
      return true
    } catch {
      setSyncState('offline')
      return false
    } finally { syncInFlight.current = false }
  }
  useEffect(() => {
    const today = new Date().toDateString()
    const initialSync = !lastSyncedAt || new Date(lastSyncedAt).toDateString() !== today
      ? window.setTimeout(() => { void sync() }, 0)
      : undefined
    const onWake = () => { if (document.visibilityState === 'visible') void sync() }
    document.addEventListener('visibilitychange', onWake)
    const retry = window.setInterval(() => { if (syncState === 'offline') void sync() }, 30 * 60 * 1000)
    return () => { if (initialSync) window.clearTimeout(initialSync); document.removeEventListener('visibilitychange', onWake); window.clearInterval(retry) }
  }, [lastSyncedAt, syncState])
  useEffect(() => {
    if (view.kind === 'home' || syncState === 'syncing') return
    const timer = window.setTimeout(() => setView({ kind: 'home' }), 10 * 60 * 1000)
    return () => window.clearTimeout(timer)
  }, [view, syncState, undo])
  const adjust = async (batch: InventoryBatch, delta: number): Promise<boolean> => {
    setBusyBatchId(batch.id)
    try {
      const updated = await request<InventoryBatch | null>(`/api/devices/current/inventory/${batch.id}/quantity`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delta }),
      })
      setWorkspace(current => ({ ...current, inventory: updated ? current.inventory.map(item => item.id === updated.id ? updated : item) : current.inventory.filter(item => item.id !== batch.id) }))
      setUndo({ batch, delta: -delta, removed: updated === null })
      return true
    } catch {
      setSyncState('offline')
      return false
    } finally { setBusyBatchId('') }
  }
  const undoLast = async (): Promise<void> => {
    if (!undo) return
    if (!undo.removed) {
      if (await adjust(undo.batch, undo.delta)) setUndo(null)
      return
    }
    setBusyBatchId(undo.batch.id)
    try {
      const restored = await request<InventoryBatch>('/api/devices/current/inventory/restore', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_id: undo.batch.category_id, subcategory_id: undo.batch.subcategory_id, storage_slot_id: undo.batch.storage_slot_id, food_name: undo.batch.food_name, quantity: undo.batch.quantity, best_before: undo.batch.best_before, production_date: undo.batch.production_date, product_description: undo.batch.product_description, barcode: undo.batch.barcode }),
      })
      setWorkspace(current => ({ ...current, inventory: [...current.inventory.filter(item => item.id !== restored.id), restored] }))
      setUndo(null)
    } catch { setSyncState('offline') } finally { setBusyBatchId('') }
  }
  if (view.kind === 'pairing') return <FridgePairingCode />
  if (view.kind === 'detail') return <EinkShelfDetail workspace={workspace} slotId={view.slotId} onBack={() => setView({ kind: 'home' })} onRefresh={() => void sync()} syncState={syncState} busyBatchId={busyBatchId} onAdjust={adjust} undo={undo} onUndo={undoLast} />
  return <EinkHome workspace={workspace} onSlot={slotId => setView({ kind: 'detail', slotId })} onRefresh={() => void sync()} onPair={() => setView({ kind: 'pairing' })} syncState={syncState} lastSyncedAt={lastSyncedAt} />
}

function EinkHome({ workspace, onSlot, onRefresh, onPair, syncState, lastSyncedAt }: { workspace: EinkWorkspace; onSlot: (slotId: string) => void; onRefresh: () => void; onPair: () => void; syncState: 'ready' | 'syncing' | 'offline'; lastSyncedAt: string }) {
  const { refrigerator, layout, inventory, icons } = workspace
  const total = inventory.reduce((sum, item) => sum + item.quantity, 0)
  const expired = inventory.filter(item => item.expiry_status === 'expired').length
  const expiring = inventory.filter(item => item.expiry_status === 'expiring').length
  const syncLabel = syncState === 'offline' ? `离线 · 上次 ${lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '未成功同步'}` : syncState === 'syncing' ? '正在同步…' : `${total} 件食材 · ${lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '刚刚刷新'}`
  return <main className="eink-shell"><header className="eink-home-header"><div><h1>家常食橱</h1><p>{refrigerator.name} · {syncLabel}</p></div><div className="eink-actions">{expiring > 0 && <span className="eink-hatched" aria-label={`${expiring} 件临期食材`}>◢ {expiring}</span>}{expired > 0 && <span className="eink-expired" aria-label={`${expired} 件过期食材`}>! {expired}</span>}<button onClick={onPair} aria-label="连接手机">▦</button><button onClick={onRefresh} disabled={syncState === 'syncing'} aria-label="手动刷新">↻</button></div></header><section className="eink-fridge" aria-label={`${refrigerator.name} 的分区`}>
    {layout.zones.map(zone => <div className="eink-zone" key={zone.key} style={{ '--slots': zone.slots.length } as CSSProperties}>{zone.slots.map(slot => {
      const groups = Object.values(inventory.filter(item => item.storage_slot_id === slot.id).reduce<Record<string, InventoryBatch[]>>((result, item) => { (result[item.subcategory_id] ??= []).push(item); return result }, {})).slice(0, 5)
      return <button className="eink-slot" key={slot.id} onClick={() => onSlot(slot.id)} aria-label="查看此分区食材">{groups.map(group => <span className={`eink-food ${group.some(item => item.expiry_status === 'expired') ? 'is-expired' : group.some(item => item.expiry_status === 'expiring') ? 'is-expiring' : ''}`} key={group[0].subcategory_id}><CategoryIcon iconKey={group[0].icon_key} icons={icons} /><b>{group.reduce((sum, item) => sum + item.quantity, 0) > 1 ? group.reduce((sum, item) => sum + item.quantity, 0) : ''}</b></span>)}</button>
    })}</div>)}</section><footer className="eink-legend"><span>◢ 临期</span><span>! 过期</span><span>点击隔层查看</span></footer></main>
}

function EinkShelfDetail({ workspace, slotId, onBack, onRefresh, syncState, busyBatchId, onAdjust, undo, onUndo }: { workspace: EinkWorkspace; slotId: string; onBack: () => void; onRefresh: () => void; syncState: 'ready' | 'syncing' | 'offline'; busyBatchId: string; onAdjust: (batch: InventoryBatch, delta: number) => Promise<boolean>; undo: { batch: InventoryBatch; delta: number; removed: boolean } | null; onUndo: () => Promise<void> }) {
  const slot = workspace.layout.zones.flatMap(zone => zone.slots).find(item => item.id === slotId)
  const riskRank = (status: string | null) => status === 'expired' ? 0 : status === 'expiring' ? 1 : 2
  const items = workspace.inventory.filter(item => item.storage_slot_id === slotId).sort((left, right) => riskRank(left.expiry_status) - riskRank(right.expiry_status) || (left.best_before ?? '9999').localeCompare(right.best_before ?? '9999'))
  return <main className="eink-shell eink-detail"><header className="eink-detail-header"><button onClick={onBack} aria-label="返回冰箱首页">←</button><div><h1>这个隔层</h1><p>{items.length} 种食材 · {items.reduce((sum, item) => sum + item.quantity, 0)} 件</p></div><button onClick={onRefresh} disabled={syncState === 'syncing'} aria-label="手动刷新">↻</button></header><section className="eink-list">{slot && items.length ? items.map(item => <article className="eink-item" key={item.id}><div className="eink-item-title"><span className="eink-food"><CategoryIcon iconKey={item.icon_key} icons={workspace.icons} /></span><strong>{item.food_name}</strong><em className={item.expiry_status === 'expired' ? 'is-expired' : item.expiry_status === 'expiring' ? 'is-expiring' : ''}>{item.expiry_status === 'expired' ? '已过期' : item.expiry_status === 'expiring' ? '临期' : item.best_before ? item.best_before.slice(5).replace('-', '/') : '未设日期'}</em></div><div className="eink-item-actions">{item.quantity === 1 ? <button disabled={busyBatchId === item.id} onClick={() => void onAdjust(item, -1)}>拿走</button> : <><button disabled={busyBatchId === item.id} onClick={() => void onAdjust(item, -1)} aria-label={`减少 ${item.food_name}`}>−</button><b>剩 {item.quantity} 个</b><button disabled={busyBatchId === item.id} onClick={() => void onAdjust(item, 1)} aria-label={`增加 ${item.food_name}`}>＋</button><button disabled={busyBatchId === item.id} onClick={() => void onAdjust(item, -item.quantity)}>全部拿走</button></>}</div></article>) : <p className="eink-empty">这个隔层还没有食材。</p>}</section><footer className="eink-detail-footer">{undo ? <button onClick={() => void onUndo()}>已更新 · 撤销</button> : <span>⌂ 10分钟后回到首页</span>}</footer></main>
}

function DeviceManager({ refrigerator, devices, passcode, onBack, onCreatePasscode, onRemove, onRename }: { refrigerator: Refrigerator; devices: Device[]; passcode: string; onBack: () => void; onCreatePasscode: () => void; onRemove: (id: string) => void; onRename: (id: string, label: string) => Promise<boolean> }) {
  const phones = devices.filter(device => device.kind === 'pwa' && !device.revoked_at)
  const displayDevice = devices.find(device => device.kind === 'kindle' && !device.revoked_at)
  const [editingId, setEditingId] = useState('')
  const [label, setLabel] = useState('')
  const [error, setError] = useState('')
  const startRename = (device: Device) => { setEditingId(device.id); setLabel(device.label); setError('') }
  const submitRename = async () => {
    if (!label.trim()) { setError('请输入设备名称。'); return }
    if (await onRename(editingId, label.trim())) { setEditingId(''); return }
    setError('重命名失败，请稍后重试。')
  }
  return <main className="device-manager"><PageHeader title={refrigerator.name} onBack={onBack} right={<span aria-hidden="true">▱</span>} /><section className="fridge-heading"><i className="large-fridge" /><h2>{refrigerator.name}</h2></section><section><h3>可访问的手机</h3>{phones.length ? phones.map(device => <div className="device-row" key={device.id}><i className="phone-icon" /><span>{editingId === device.id ? <><input aria-label="设备名称" value={label} maxLength={120} onChange={event => setLabel(event.target.value)} /><button className="rename-save" onClick={() => void submitRename()}>保存</button></> : <><strong>{device.is_current ? '本机' : device.label}</strong><small>添加于：{new Date(device.created_at).toLocaleDateString('zh-CN')} · {device.is_current ? '当前正在使用' : `最后访问：${device.last_seen_at ? new Date(device.last_seen_at).toLocaleDateString('zh-CN') : '尚未同步'}`}</small></>}</span>{editingId === device.id ? <button className="remove-circle" onClick={() => setEditingId('')} aria-label="取消重命名">×</button> : <><button className="rename-device" onClick={() => startRename(device)} aria-label={`重命名 ${device.label}`}>✎</button>{!device.is_current && <button className="remove-circle" onClick={() => onRemove(device.id)} aria-label={`移除 ${device.label}`}>×</button>}</>}</div>) : <p className="muted">还没有手机访问这台冰箱。</p>}{error && <p className="claim-error" role="alert">{error}</p>}<p className="muted">移除后，该手机会从冰箱列表中消失；再次扫码可重新加入。</p></section><section className="fridge-device"><h3>冰箱端</h3>{displayDevice ? <div className="fridge-card"><i className="display-icon" /><span><strong>{displayDevice.label}</strong><small>已绑定；请在冰箱端选择“连接手机”以显示配对二维码。</small></span></div> : <p className="muted">尚未连接冰箱端设备。</p>}<button className="secondary-action" onClick={onCreatePasscode}>生成兼容绑定码</button>{passcode && <output className="passcode">{passcode}</output>}<p className="muted">兼容旧设备时，可改用六位绑定码。</p></section></main>
}

/** 当前冰箱首页：按物理位置展示库存，切换冰箱时只使用对应布局和批次。 */
function FridgeHome({ refrigerator, layout, inventory, icons, notice, onAdd, onManage, onSwitch, onExpiry, onNotifications, onRefresh, onRecipes }: { refrigerator: Refrigerator; layout: Layout; inventory: InventoryBatch[]; icons: Icon[]; notice: string; onAdd: () => void; onManage: () => void; onSwitch: () => void; onExpiry: () => void; onNotifications: () => void; onRefresh: () => void; onRecipes: () => void }) {
  const expired = inventory.filter(item => item.expiry_status === 'expired').length
  const expiring = inventory.filter(item => item.expiry_status === 'expiring').length
  return <main className="p7-shell"><AppHeader left={<button className="p7-icon-button" onClick={onManage} aria-label="管理冰箱">☰</button>} right={<button className="p7-icon-button" onClick={onSwitch} aria-label="切换冰箱">⌄</button>} />
    <div className="p7-title-row"><h1>{refrigerator.name}</h1><button className="p7-icon-button" onClick={onExpiry} aria-label="临期规则">⚙</button></div>
    <div className="p7-status"><span>▨ {inventory.length} 件食材</span>{expiring > 0 && <span className="p7-hatched">◢ {expiring}</span>}{expired > 0 && <span className="p7-danger">! {expired}</span>}<button onClick={onRefresh} aria-label="刷新库存">↻</button></div>
    {notice && <p className="p10-reminder-banner" role="status">{notice}</p>}
    <section className="p7-fridge" aria-label={`${refrigerator.name} 的冰箱布局`}>{layout.zones.map(zone => <div className="p7-zone" style={{ '--slots': zone.slots.length } as CSSProperties} key={zone.key}>{zone.slots.map(slot => <div className="p7-slot" key={slot.id}>{inventory.filter(item => item.storage_slot_id === slot.id).slice(0, 4).map(item => <span className={`p7-food ${item.expiry_status === 'expired' ? 'is-expired' : item.expiry_status === 'expiring' ? 'is-expiring' : ''}`} key={item.id} title={`${item.food_name} ×${item.quantity}`}><CategoryIcon iconKey={item.icon_key} icons={icons} /><b>{item.quantity > 1 ? item.quantity : ''}</b></span>)}</div>)}</div>)}</section>
    <button className="p7-primary" onClick={onAdd}>＋ 添加食材</button><P7Navigation active="home" onHome={() => undefined} onRecipes={onRecipes} onFridge={onManage} onMe={onNotifications} />
  </main>
}

function P7Navigation({ active, onHome, onRecipes, onFridge, onMe }: { active: 'home' | 'recipes' | 'fridge' | 'me'; onHome: () => void; onRecipes?: () => void; onFridge: () => void; onMe: () => void }) {
  return <nav className="p7-nav" aria-label="主导航"><button className={active === 'home' ? 'is-active' : ''} onClick={onHome}>⌂<small>首页</small></button><button className={active === 'recipes' ? 'is-active' : ''} onClick={onRecipes} disabled={!onRecipes}>♨<small>食谱</small></button><button className={active === 'fridge' ? 'is-active' : ''} onClick={onFridge}>▯<small>冰箱</small></button><button className={active === 'me' ? 'is-active' : ''} onClick={onMe}>◯<small>我</small></button></nav>
}

/** P9 手机端食谱、文本导入、单日编辑和动态补货闭环。 */
function RecipeWorkspace({ refrigerator, onBack }: { refrigerator: Refrigerator; onBack: () => void }) {
  const [weekOffset, setWeekOffset] = useState(0)
  const monday = (() => { const value = new Date(); value.setDate(value.getDate() - ((value.getDay() + 6) % 7) + weekOffset); return value.toISOString().slice(0, 10) })()
  const [days, setDays] = useState<RecipeDay[]>([])
  const [restock, setRestock] = useState<RestockEntry[]>([])
  const [text, setText] = useState('')
  const [view, setView] = useState<'week' | 'import' | 'restock' | 'edit'>('week')
  const [editing, setEditing] = useState<RecipeEntry | null>(null)
  const [message, setMessage] = useState('')
  const load = useCallback(async () => {
    try {
      const [week, shortages] = await Promise.all([
        request<RecipeDay[]>(`/api/owner/refrigerators/${refrigerator.id}/recipes?week_start=${monday}`),
        request<RestockEntry[]>(`/api/owner/refrigerators/${refrigerator.id}/restock?week_start=${monday}`),
      ])
      setDays(week); setRestock(shortages)
    } catch (error) { setMessage((error as Error).message) }
  }, [monday, refrigerator.id])
  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])
  const complete = async (entry: RecipeEntry) => {
    try { await request(`/api/owner/refrigerators/${refrigerator.id}/recipes/${entry.id}/${entry.completed ? 'undo' : 'complete'}`, { method: 'POST' }); await load() } catch (error) { setMessage((error as Error).message) }
  }
  const importText = async () => {
    try { await request(`/api/owner/refrigerators/${refrigerator.id}/recipes/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ week_start: monday, text }) }); setText(''); setView('week'); await load() } catch (error) { setMessage((error as Error).message) }
  }
  const saveEntry = async () => {
    if (!editing) return
    try {
      await request(`/api/owner/refrigerators/${refrigerator.id}/recipes/${editing.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekday: editing.weekday, dish_name: editing.dish_name, ingredients: editing.ingredients }),
      })
      setEditing(null); setView('week'); await load()
    } catch (error) { setMessage((error as Error).message) }
  }
  if (view === 'import') return <main className="p7-shell p9-shell"><PageHeader title="粘贴食谱导入" onBack={() => setView('week')} /><div className="p7-scroll p9-import"><p>每行一道菜。支持：周二：鸡蛋炒河粉（鸡蛋×4、火腿、河粉）</p><textarea value={text} onChange={event => setText(event.target.value)} placeholder="周一：小炒肉（猪肉、叶菜）" /><p>导入后可逐项编辑；食材必须完全匹配已有小类。</p>{message && <p className="claim-error" role="alert">{message}</p>}</div><footer className="bottom-action-bar"><button disabled={!text.trim()} onClick={() => void importText()}>解析并导入</button></footer></main>
  if (view === 'restock') return <main className="p7-shell p9-shell"><PageHeader title="动态补货清单" onBack={() => setView('week')} right={<button className="save-text" onClick={() => void navigator.clipboard?.writeText(restock.flatMap(item => item.missing.map(missing => `${item.label} ${item.dish_name}：${missing.subcategory_name}×${missing.quantity}`)).join('\n'))}>复制</button>} /><div className="p7-scroll p9-list">{restock.length ? restock.map(item => <section key={`${item.weekday}-${item.dish_name}`}><h2>{item.label} · {item.dish_name}</h2>{item.missing.map(missing => <p key={missing.subcategory_name}>缺少 <b>{missing.subcategory_name} × {missing.quantity}</b></p>)}</section>) : <p className="p9-empty">本周和下周食材都足够。</p>}</div></main>
  if (view === 'edit' && editing) return <main className="p7-shell p9-shell"><PageHeader title="编辑食谱" onBack={() => { setEditing(null); setView('week') }} /><div className="p7-scroll p9-edit"><label>星期<select value={editing.weekday} onChange={event => setEditing({ ...editing, weekday: Number(event.target.value) })}>{['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((label, weekday) => <option key={label} value={weekday}>{label}</option>)}</select></label><label>菜名<input value={editing.dish_name} onChange={event => setEditing({ ...editing, dish_name: event.target.value })} maxLength={160} /></label><h2>食材</h2>{editing.ingredients.map((ingredient, index) => <div className="p9-ingredient" key={index}><input aria-label={`食材 ${index + 1}`} value={ingredient.subcategory_name} onChange={event => setEditing({ ...editing, ingredients: editing.ingredients.map((value, position) => position === index ? { ...value, subcategory_name: event.target.value } : value) })} /><input aria-label={`数量 ${index + 1}`} type="number" min="1" value={ingredient.quantity} onChange={event => setEditing({ ...editing, ingredients: editing.ingredients.map((value, position) => position === index ? { ...value, quantity: Math.max(1, Number(event.target.value)) } : value) })} /><button onClick={() => setEditing({ ...editing, ingredients: editing.ingredients.filter((_, position) => position !== index) })} aria-label="移除食材">×</button></div>)}<button className="p9-add-ingredient" onClick={() => setEditing({ ...editing, ingredients: [...editing.ingredients, { subcategory_name: '', quantity: 1 }] })}>＋ 添加食材</button><p>名称只会与现有小类完全匹配；未匹配项会保留在补货清单，直到手动改正。</p>{message && <p className="claim-error" role="alert">{message}</p>}</div><footer className="bottom-action-bar"><button disabled={!editing.dish_name.trim() || editing.ingredients.some(item => !item.subcategory_name.trim())} onClick={() => void saveEntry()}>保存</button></footer></main>
  return <main className="p7-shell p9-shell"><AppHeader left={<button className="p7-icon-button" onClick={onBack} aria-label="返回首页">‹</button>} right={<button className="p7-icon-button" onClick={() => setView('restock')} aria-label="查看补货清单">☷</button>} /><div className="p7-scroll p9-list"><div className="p9-heading"><h1>{weekOffset ? '下周食谱' : '本周食谱'}</h1><button onClick={() => setView('import')}>＋ 粘贴导入</button></div><div className="p9-week-tabs"><button className={!weekOffset ? 'is-active' : ''} onClick={() => setWeekOffset(0)}>本周</button><button className={weekOffset ? 'is-active' : ''} onClick={() => setWeekOffset(7)}>下周</button></div>{days.map(day => <section key={day.weekday}><h2>{day.label}</h2>{day.entries.length ? day.entries.map(entry => <article className={entry.completed ? 'is-complete' : ''} key={entry.id}><div><b>{entry.dish_name}</b><small>{entry.ingredients.map(item => `${item.subcategory_name}×${item.quantity}`).join('、') || '未添加食材'}</small>{entry.missing.length > 0 && <em>缺少：{entry.missing.map(item => `${item.subcategory_name}×${item.quantity}`).join('、')}</em>}</div><span className="p9-entry-actions">{!entry.completed && <button onClick={() => { setEditing({ ...entry, ingredients: entry.ingredients.map(item => ({ ...item })) }); setView('edit') }}>编辑</button>}<button onClick={() => void complete(entry)}>{entry.completed ? '撤销' : '完成'}</button></span></article>) : <p className="p9-empty">还没有安排</p>}</section>)}</div><P7Navigation active="recipes" onHome={onBack} onRecipes={() => undefined} onFridge={onBack} onMe={onBack} /></main>
}

function FridgeSwitcher({ fridges, currentId, onSelect, onBack, onCreate }: { fridges: Refrigerator[]; currentId: string; onSelect: (fridge: Refrigerator) => void; onBack: () => void; onCreate: () => void }) {
  return <main className="p7-shell"><PageHeader title="我的冰箱" onBack={onBack} /><div className="p7-scroll"><p className="p7-kicker">选择要管理的冰箱</p>{fridges.map(fridge => <button className="p7-fridge-row" key={fridge.id} onClick={() => onSelect(fridge)}><i className="large-fridge" /><span><b>{fridge.name}</b><small>{fridge.id === currentId ? '当前冰箱' : '点击切换'}</small></span>{fridge.id === currentId && <strong>✓</strong>}</button>)}<button className="p7-outline" onClick={onCreate}>＋ 新建冰箱</button></div><P7Navigation active="fridge" onHome={onBack} onFridge={() => undefined} onMe={() => undefined} /></main>
}

/** P10 设置页；全局提醒轮询在已登录应用壳中运行。 */
function NotificationSettings({ refrigerator, settings, onSave, onBack, onExpiry }: { refrigerator: Refrigerator; settings: NotificationSettings; onSave: (value: NotificationSettings) => Promise<string | null>; onBack: () => void; onExpiry: () => void }) {
  const [draft, setDraft] = useState(settings)
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const save = async () => { setSaving(true); setNotice(''); const error = await onSave(draft); setNotice(error || '提醒设置已保存。'); setSaving(false) }
  const enableSystemNotification = async () => {
    if (!('Notification' in window)) { setNotice('当前浏览器不支持系统通知；提醒会在打开家常食橱时显示。'); return }
    const permission = await Notification.requestPermission()
    setNotice(permission === 'granted' ? '已允许系统通知；打开应用时会同步显示提醒。' : '未授予系统通知权限；提醒仍会在应用内显示。')
  }
  return <main className="p7-shell"><PageHeader title="提醒" onBack={onBack} /><div className="p7-scroll p7-settings"><p className="p7-context">▯ {refrigerator.name}</p><section><div className="p7-setting-row"><span><b>每日临期提醒</b><small>每天最多一次</small></span><button className={`p7-switch ${draft.daily_reminder_enabled ? 'is-on' : ''}`} onClick={() => setDraft(value => ({ ...value, daily_reminder_enabled: !value.daily_reminder_enabled }))} aria-pressed={draft.daily_reminder_enabled}><i /></button></div><label className="p7-time">提醒时间<input type="time" value={draft.reminder_time} disabled={!draft.daily_reminder_enabled} onChange={event => setDraft(value => ({ ...value, reminder_time: event.target.value }))} /></label><button className="p7-outline p10-notification-permission" onClick={() => void enableSystemNotification()}>启用系统通知</button><small className="p10-hint">未完成真机 Web Push 验证前，应用关闭或系统休眠时仅保证下次打开后的应用内提醒。</small></section><section><button className="p7-link-row" onClick={onExpiry}><span><b>临期规则</b><small>设置提醒比例和提前天数</small></span><b aria-hidden="true">›</b></button></section><section><div className="p7-setting-row"><span><b>显示设备未更新提醒</b><small>若今天未完成同步，将与食品提醒一起出现</small></span><button className={`p7-switch ${draft.device_health_enabled ? 'is-on' : ''}`} onClick={() => setDraft(value => ({ ...value, device_health_enabled: !value.device_health_enabled }))} aria-pressed={draft.device_health_enabled}><i /></button></div></section>{notice && <p className="p7-saved" role="status">{notice}</p>}<button className="p7-primary" disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '保存设置'}</button></div><P7Navigation active="me" onHome={onBack} onFridge={onBack} onMe={() => undefined} /></main>
}

function ExpirySettingsPage({ refrigerator, expiry, onSaveExpiry, onBack }: { refrigerator: Refrigerator; expiry: ExpirySettings; onSaveExpiry: (value: ExpirySettings) => Promise<string | null>; onBack: () => void }) {
  const [draft, setDraft] = useState(expiry)
  const [saved, setSaved] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const save = async () => { setSaving(true); setSaved(''); setError(''); const failure = await onSaveExpiry(draft); if (failure) setError(failure); else setSaved('设置已保存。'); setSaving(false) }
  return <main className="p7-shell"><PageHeader title="临期规则" onBack={onBack} /><div className="p7-scroll p7-settings"><p className="p7-context">▯ {refrigerator.name}</p><section><p>进入最后 <b>{draft.ratio_percent}%</b> 有效期时提醒；至少提前 {draft.minimum_days} 天，最多提前 {draft.maximum_days} 天。</p><label>提醒阈值<input type="range" min="1" max="100" value={draft.ratio_percent} onChange={event => setDraft({ ...draft, ratio_percent: Number(event.target.value) })} /><output>{draft.ratio_percent}%</output></label><div className="p7-step-row"><span>最少提前</span><button onClick={() => setDraft({ ...draft, minimum_days: Math.max(1, draft.minimum_days - 1) })}>−</button><b>{draft.minimum_days} 天</b><button onClick={() => setDraft({ ...draft, minimum_days: Math.min(draft.maximum_days, draft.minimum_days + 1) })}>＋</button></div><div className="p7-step-row"><span>最多提前</span><button onClick={() => setDraft({ ...draft, maximum_days: Math.max(draft.minimum_days, draft.maximum_days - 1) })}>−</button><b>{draft.maximum_days} 天</b><button onClick={() => setDraft({ ...draft, maximum_days: Math.min(14, draft.maximum_days + 1) })}>＋</button></div></section><p className="p7-help">未填写 BBD 的食物不会收到临期或过期提醒。</p>{saved && <p className="p7-saved" role="status">{saved}</p>}{error && <p className="claim-error" role="alert">{error}</p>}<button className="p7-primary" disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '保存设置'}</button></div><P7Navigation active="me" onHome={onBack} onFridge={onBack} onMe={() => undefined} /></main>
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
  const [p7View, setP7View] = useState<'home' | 'switcher' | 'notifications' | 'expiry' | 'inventory' | 'recipes'>('home')
  const [expiry, setExpiry] = useState<ExpirySettings>({ ratio_percent: 20, minimum_days: 1, maximum_days: 14 })
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({ daily_reminder_enabled: true, reminder_time: '20:00', device_health_enabled: true })
  const activeRefrigeratorId = layout?.refrigerator_id

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
  useEffect(() => {
    if (!activeRefrigeratorId) return
    let active = true
    const collect = async () => {
      try {
        const due = await request<DueNotification[]>(`/api/owner/refrigerators/${activeRefrigeratorId}/notifications/due`, { method: 'POST' })
        if (!active || !due.length) return
        const reminder = due.map(item => `${item.title}：${item.body}`).join(' ')
        setMessage(reminder)
        if ('Notification' in window && Notification.permission === 'granted') due.forEach(item => new Notification(item.title, { body: item.body }))
      } catch { /* 下次前台轮询会再次尝试；离线时不打断当前操作。 */ }
    }
    void collect()
    const timer = window.setInterval(() => { void collect() }, 60_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [activeRefrigeratorId])
  const selectedTemplate = templates.find(template => template.key === templateKey)

  const loadInventoryWorkspace = async (fridge: Refrigerator) => {
    const [savedLayout, savedCategories, savedInventory, savedExpiry, savedNotificationSettings] = await Promise.all([
      request<Layout>(`/api/owner/refrigerators/${fridge.id}/layout`),
      request<Category[]>(`/api/owner/refrigerators/${fridge.id}/categories`),
      request<InventoryBatch[]>(`/api/owner/refrigerators/${fridge.id}/inventory`),
      request<ExpirySettings>(`/api/owner/refrigerators/${fridge.id}/expiry-settings`),
      request<NotificationSettings>(`/api/owner/refrigerators/${fridge.id}/notification-settings`),
    ])
    setLayout(savedLayout); setCategories(savedCategories); setInventory(savedInventory); setExpiry(savedExpiry); setNotificationSettings(savedNotificationSettings)
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
      setP7View('home'); setMessage(`正在查看「${fridge.name}」。`)
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
  const renameDevice = async (deviceId: string, label: string): Promise<boolean> => {
    try {
      const renamed = await request<Device>(`/api/owner/refrigerators/${deviceFridgeId}/devices/${deviceId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label }) })
      setDevices(current => current.map(device => device.id === renamed.id ? renamed : device))
      return true
    } catch (error) { setMessage((error as Error).message); return false }
  }
  const saveExpirySettings = async (value: ExpirySettings): Promise<string | null> => {
    if (!layout) return '请先选择冰箱。'
    try {
      const saved = await request<ExpirySettings>(`/api/owner/refrigerators/${layout.refrigerator_id}/expiry-settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) })
      setExpiry(saved)
      const refreshed = await request<InventoryBatch[]>(`/api/owner/refrigerators/${layout.refrigerator_id}/inventory`)
      setInventory(refreshed)
      return null
    } catch (error) { return (error as Error).message }
  }
  const saveNotificationSettings = async (value: NotificationSettings): Promise<string | null> => {
    if (!layout) return '请先选择冰箱。'
    try {
      const saved = await request<NotificationSettings>(`/api/owner/refrigerators/${layout.refrigerator_id}/notification-settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) })
      setNotificationSettings(saved)
      return null
    } catch (error) { return (error as Error).message }
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
  if (currentPath.startsWith('/fridge')) return <EinkDisplayGate />
  if (scanning) return <PwaScanner onClose={() => setScanning(false)} />
  if (bootstrapToken) return <BootstrapPairing token={bootstrapToken} onScan={() => setScanning(true)} />
  if (pairToken && !isStandalone()) return <InstallationGuide />
  if (pairedRefrigerator) return <PairingSuccess refrigerator={pairedRefrigerator} />
  if (managedRefrigerator) return <DeviceManager refrigerator={managedRefrigerator} devices={devices} passcode={passcode} onBack={() => { setDeviceFridgeId(''); setDevices([]); setPasscode('') }} onCreatePasscode={() => void createPasscode(managedRefrigerator.id)} onRemove={id => void removeDevice(id)} onRename={renameDevice} />
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
  const currentFridge = fridges.find(fridge => fridge.id === layout.refrigerator_id)
  if (!currentFridge) return null
  if (p7View === 'switcher') return <FridgeSwitcher fridges={fridges} currentId={currentFridge.id} onSelect={fridge => void openLayout(fridge)} onBack={() => setP7View('home')} onCreate={() => { setLayout(null); setCreating(true); setSetupStep('setup') }} />
  if (p7View === 'notifications') return <NotificationSettings refrigerator={currentFridge} settings={notificationSettings} onSave={saveNotificationSettings} onBack={() => setP7View('home')} onExpiry={() => setP7View('expiry')} />
  if (p7View === 'expiry') return <ExpirySettingsPage refrigerator={currentFridge} expiry={expiry} onSaveExpiry={saveExpirySettings} onBack={() => setP7View('home')} />
  if (p7View === 'inventory') return <InventoryFlow layout={layout} categories={categories} icons={icons} inventory={inventory} saving={saving} onBack={() => setP7View('home')} onChooseCategory={chooseCategory} onCreateCategory={createP5Category} onSave={saveP5Inventory} onDelete={deleteP5Inventory} />
  if (p7View === 'recipes') return <RecipeWorkspace refrigerator={currentFridge} onBack={() => setP7View('home')} />
  return <FridgeHome refrigerator={currentFridge} layout={layout} inventory={inventory} icons={icons} notice={message} onAdd={() => setP7View('inventory')} onManage={() => void showDevices(currentFridge)} onSwitch={() => setP7View('switcher')} onExpiry={() => setP7View('expiry')} onNotifications={() => setP7View('notifications')} onRefresh={() => void openLayout(currentFridge)} onRecipes={() => setP7View('recipes')} />
}
