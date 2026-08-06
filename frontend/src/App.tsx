/** FridgeBoard 的所有者登录、P4 建冰箱/布局编辑和 P3 设备访问页。 */
import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import type { IScannerControls } from '@zxing/browser'
import packageInfo from '../package.json'
import { APP_RELEASE } from './release'
import { selectStartupRefrigerator } from './startupRefrigerator'
import { getPwaInstallPromptMode } from './pwaInstallPrompt'
import { refreshPwaCache } from './pwaCache'
import { getFoodIconPosition } from './fridgeFoodLayout'
import { formatLayoutSlotOption, LAYOUT_SLOT_OPTIONS } from './layoutSlotOptions'
import { completeLayoutZones } from './layoutDraft'
import { suggestRefrigeratorName } from './refrigeratorName'
import { FridgePreviewFrame } from './FridgeLayout'
import { RecipeWorkspace } from './RecipeWorkspace'
import { InventoryFlow } from './InventoryFlow'
import { InventorySearch } from './InventorySearch'
import { InventoryMoveFlow } from './InventoryMoveFlow'
import type { InventorySearchResult } from './inventorySearchUtils'
import { BootstrapPairing } from './BootstrapPairing'
import { addLocalCalendarDays, getLocalMonday } from './recipeCalendar'
import { isStandalone, request } from './appApi'
import { clearPageCaches, readPageCache, recipeCacheKey, refrigeratorListCacheKey, refrigeratorWorkspaceCacheKey, removeRefrigeratorPageCaches, writePageCache, type CacheSnapshot } from './pageCache'
import type { Category, Device, DueNotification, ExpirySettings, Icon, InventoryBatch, Layout, NotificationSettings, RecipeDay, Refrigerator, RestockEntry, Template } from './appTypes'
import { AppHeader, CategoryIcon, HeaderTitle, InstallationGuide, P7Navigation, PageHeader, PageShell, PairingSuccess, type RefreshState } from './sharedUi'

const LAST_REFRIGERATOR_STORAGE_KEY = 'fb-last-refrigerator-id'
const PWA_INSTALL_DISMISSED_STORAGE_KEY = 'fb-pwa-install-dismissed'
const APP_NAME = '家常食橱'
const APP_VERSION = packageInfo.version

type WorkspaceCache = { refrigerator: Refrigerator; layout: Layout; categories: Category[]; icons: Icon[]; inventory: InventoryBatch[]; homeInventory: InventoryBatch[]; expiry: ExpirySettings; notificationSettings: NotificationSettings }
type FridgeListCache = { fridges: Refrigerator[]; summaries: Record<string, { template: string; foods: number }>; deletedCount: number }

function initialPageCache<T>(key: string): CacheSnapshot<T> | null {
  return readPageCache<T>(key)
}

async function fetchFridgeOverview(fridges: Refrigerator[]): Promise<Pick<FridgeListCache, 'summaries' | 'deletedCount'>> {
  const [items, deleted] = await Promise.all([
    Promise.all(fridges.map(async fridge => {
      const [layout, inventory] = await Promise.all([request<Layout>(`/api/owner/refrigerators/${fridge.id}/layout`), request<InventoryBatch[]>(`/api/owner/refrigerators/${fridge.id}/inventory?include_zero=false`)])
      return [fridge.id, { template: layout.template_key === 'mini' ? '迷你冰箱' : '已配置布局', foods: inventory.reduce((total, item) => total + item.quantity, 0) }] as const
    })),
    request<Refrigerator[]>('/api/owner/refrigerators/deleted'),
  ])
  return { summaries: Object.fromEntries(items), deletedCount: deleted.length }
}

function isAppleMobile() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function PwaInstallPrompt({ installEvent, installed, onInstallEventConsumed }: { installEvent: BeforeInstallPromptEvent | null; installed: boolean; onInstallEventConsumed: () => void }) {
  const [open, setOpen] = useState(() => window.localStorage.getItem(PWA_INSTALL_DISMISSED_STORAGE_KEY) !== 'true')
  const [dontRemind, setDontRemind] = useState(false)
  const mode = getPwaInstallPromptMode({
    isAppleMobile: isAppleMobile(),
    hasInstallEvent: installEvent !== null,
  })
  if (installed || !open) return null
  const close = () => {
    if (dontRemind) window.localStorage.setItem(PWA_INSTALL_DISMISSED_STORAGE_KEY, 'true')
    setOpen(false)
  }
  if (mode === 'install') {
    const install = async () => {
      if (!installEvent) return
      await installEvent.prompt()
      await installEvent.userChoice
      onInstallEventConsumed()
      close()
    }
    return <AndroidInstallPrompt close={close} dontRemind={dontRemind} onDontRemindChange={setDontRemind} onInstall={() => void install()} />
  }
  const isAppleGuide = mode === 'apple-guide'
  if (!isAppleGuide) return <AndroidInstallPrompt close={close} dontRemind={dontRemind} onDontRemindChange={setDontRemind} />
  return <div className="pwa-install-modal" role="dialog" aria-modal="true" aria-labelledby="pwa-install-title">
    <div className="pwa-install-dialog">
      <button className="pwa-install-close" type="button" onClick={close} aria-label="关闭安装提示">×</button>
      <h2 id="pwa-install-title">{isAppleGuide ? '添加到主屏幕' : '先装到手机'}</h2>
      <p>{isAppleGuide ? '这是一个网页应用，为了安装它，请先在Safari中点击菜单“共享”或“分享”按钮，再选择“添加到主屏幕”。' : '安装后，在应用内再扫一次冰箱上的二维码即可连接。'}</p>
      {!isAppleGuide && <ol className="pwa-install-steps" aria-label="Android 安装步骤">
        <li><span aria-hidden="true">⋮</span><b>浏览器菜单</b></li>
        <li aria-hidden="true">›</li>
        <li><span aria-hidden="true">⇩</span><b>安装应用</b></li>
        <li aria-hidden="true">›</li>
        <li><span aria-hidden="true">✓</span><b>完成安装</b></li>
      </ol>}
      <label className="pwa-install-dismiss"><input type="checkbox" checked={dontRemind} onChange={event => setDontRemind(event.target.checked)} />不再提醒</label>
    </div>
  </div>
}

function AndroidInstallPrompt({ close, dontRemind, onDontRemindChange, onInstall }: { close: () => void; dontRemind: boolean; onDontRemindChange: (value: boolean) => void; onInstall?: () => void }) {
  return <div className="pwa-install-modal" role="dialog" aria-modal="true" aria-labelledby="pwa-install-title">
    <div className="pwa-install-dialog">
      <button className="pwa-install-close" type="button" onClick={close} aria-label="关闭安装提示">×</button>
      <h2 id="pwa-install-title">安装家常食橱</h2>
      <p>安装后，在应用内再扫一次冰箱上的二维码即可连接。</p>
      <ol className="pwa-install-steps" aria-label="Android 安装步骤">
        <li><span aria-hidden="true">⋮</span><b>浏览器菜单</b></li>
        <li aria-hidden="true">›</li>
        <li><span aria-hidden="true"><AndroidShortcutIcon /></span><b>安装并创建快捷方式</b></li>
        <li aria-hidden="true">›</li>
        <li><span aria-hidden="true">✓</span><b>完成安装</b></li>
      </ol>
      <label className="pwa-install-dismiss"><input type="checkbox" checked={dontRemind} onChange={event => onDontRemindChange(event.target.checked)} />不再提醒</label>
      {onInstall && <button className="pwa-install-action" type="button" onClick={onInstall}>安装应用</button>}
    </div>
  </div>
}

function AndroidShortcutIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 6.5h10a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 17 16.5H7A1.5 1.5 0 0 1 5.5 15V8A1.5 1.5 0 0 1 7 6.5Z" />
    <path d="M9.5 20h5M12 16.5V20" />
    <path d="M3.5 2.5v5M1.5 5.5l2 2 2-2" />
  </svg>
}

/** 将短效配对 URL 留在设备本地，转换为可由相机读取的二维码图像。 */
function PairingCode({ value, className = '' }: { value: string; className?: string }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    void QRCode.toDataURL(value, { errorCorrectionLevel: 'M', margin: 2, width: 640, color: { dark: '#000000', light: '#FFFFFF' } }).then(setSrc)
  }, [value])
  return src ? <img className={className} src={src} alt="用于连接手机的二维码" /> : <div className={`${className} qr-loading`} aria-label="正在生成二维码" />
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
  return <PageShell className="scanner-screen" header={<PageHeader title="扫描冰箱端二维码" onBack={onClose} />} bodyClassName="scanner-content"><div className="camera-frame"><video ref={videoRef} muted playsInline /><i /></div><p role="status">{message}</p></PageShell>
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
  return <main className="fridge-pairing"><header className="eink-pair-header"><button onClick={() => window.location.assign('/fridge')} aria-label="返回">←</button><div><h1>连接手机</h1><p>扫描二维码，在手机上管理物品</p></div><button onClick={create} aria-label="重新生成二维码">↻</button></header><div className="eink-pair-content">{pairing ? <PairingCode value={pairing.pairing_url} className="fridge-qr" /> : <div className="fridge-qr qr-loading" />}<p className="fridge-timer">◷ 本次连接有效 {minutes}:{seconds}</p><p>安装 PWA 后请再扫一次</p>{error && <p role="alert">{error}</p>}</div><footer>⌂ 10分钟后回到首页</footer></main>
}

export type EinkWorkspace = { refrigerator: Refrigerator; layout: Layout; inventory: InventoryBatch[]; icons: Icon[] }

/** 冰箱端启动门：优先读取已配对设备，未配对时才进入首次开机二维码。 */
function EinkDisplayGate() {
  const [workspace, setWorkspace] = useState<EinkWorkspace | null>(null)
  const [gateState, setGateState] = useState<'loading' | 'first-boot' | 'ready' | 'error'>('loading')
  const [retryNonce, setRetryNonce] = useState(0)
  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const refrigerator = await request<Refrigerator>('/api/devices/current')
        const [layout, inventory, icons] = await Promise.all([
          request<Layout>('/api/devices/current/layout'), request<InventoryBatch[]>('/api/devices/current/inventory'), request<Icon[]>('/api/devices/current/icons'),
        ])
        if (active) { setWorkspace({ refrigerator, layout, inventory, icons }); setGateState('ready') }
      } catch (error) {
        if (!active) return
        setGateState((error as Error & { status?: number }).status === 401 ? 'first-boot' : 'error')
      }
    }
    void load()
    return () => { active = false }
  }, [retryNonce])
  if (gateState === 'loading') return <main className="eink-loading" aria-live="polite">正在唤醒家常食橱…</main>
  if (gateState === 'first-boot') return <FridgeFirstBoot />
  if (gateState === 'error') return <main className="eink-loading" role="alert"><p>暂时无法读取冰箱状态。</p><button type="button" onClick={() => { setGateState('loading'); setRetryNonce(value => value + 1) }}>重试</button></main>
  return workspace ? <EinkDisplay initial={workspace} /> : null
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
      const updated = await request<InventoryBatch>(`/api/devices/current/inventory/${batch.id}/quantity`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delta }),
      })
      setWorkspace(current => ({ ...current, inventory: updated.quantity > 0 ? current.inventory.map(item => item.id === updated.id ? updated : item) : current.inventory.filter(item => item.id !== batch.id) }))
      setUndo({ batch, delta: -delta, removed: updated.quantity === 0 })
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
        body: JSON.stringify({ batch_id: undo.batch.id, quantity: undo.batch.quantity }),
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
  const syncLabel = syncState === 'offline' ? `离线 · 上次 ${lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '未成功同步'}` : syncState === 'syncing' ? '正在同步…' : `${total} 件物品 · ${lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '刚刚刷新'}`
  return <main className="eink-shell"><header className="eink-home-header"><div><h1>家常食橱</h1><p>{refrigerator.name} · {syncLabel}</p></div><div className="eink-actions">{expiring > 0 && <span className="eink-hatched" aria-label={`${expiring} 件临期物品`}>◢ {expiring}</span>}{expired > 0 && <span className="eink-expired" aria-label={`${expired} 件过期物品`}>! {expired}</span>}<button onClick={onPair} aria-label="连接手机">▦</button><button onClick={onRefresh} disabled={syncState === 'syncing'} aria-label="手动刷新">↻</button></div></header><section className="eink-fridge" aria-label={`${refrigerator.name} 的分区`}>
    {layout.zones.map(zone => <div className="eink-zone" key={zone.key} style={{ '--slots': zone.slots.length } as CSSProperties}>{zone.slots.map(slot => {
      const groups = Object.values(inventory.filter(item => item.storage_slot_id === slot.id).reduce<Record<string, InventoryBatch[]>>((result, item) => { (result[item.subcategory_id] ??= []).push(item); return result }, {})).slice(0, 5)
      return <button className="eink-slot" key={slot.id} onClick={() => onSlot(slot.id)} aria-label="查看此分区物品">{groups.map(group => <span className={`eink-food ${group.some(item => item.expiry_status === 'expired') ? 'is-expired' : group.some(item => item.expiry_status === 'expiring') ? 'is-expiring' : ''}`} key={group[0].subcategory_id}><CategoryIcon iconKey={group[0].icon_key} icons={icons} /><b>{group.reduce((sum, item) => sum + item.quantity, 0) > 1 ? group.reduce((sum, item) => sum + item.quantity, 0) : ''}</b></span>)}</button>
    })}</div>)}</section><footer className="eink-legend"><span>◢ 临期</span><span>! 过期</span><span>点击隔层查看</span></footer></main>
}

function EinkShelfDetail({ workspace, slotId, onBack, onRefresh, syncState, busyBatchId, onAdjust, undo, onUndo }: { workspace: EinkWorkspace; slotId: string; onBack: () => void; onRefresh: () => void; syncState: 'ready' | 'syncing' | 'offline'; busyBatchId: string; onAdjust: (batch: InventoryBatch, delta: number) => Promise<boolean>; undo: { batch: InventoryBatch; delta: number; removed: boolean } | null; onUndo: () => Promise<void> }) {
  const slot = workspace.layout.zones.flatMap(zone => zone.slots).find(item => item.id === slotId)
  const riskRank = (status: string | null) => status === 'expired' ? 0 : status === 'expiring' ? 1 : 2
  const items = workspace.inventory.filter(item => item.storage_slot_id === slotId).sort((left, right) => riskRank(left.expiry_status) - riskRank(right.expiry_status) || (left.best_before ?? '9999').localeCompare(right.best_before ?? '9999'))
  return <main className="eink-shell eink-detail"><header className="eink-detail-header"><button onClick={onBack} aria-label="返回冰箱首页">←</button><div><h1>这个隔层</h1><p>{items.length} 种物品 · {items.reduce((sum, item) => sum + item.quantity, 0)} 件</p></div><button onClick={onRefresh} disabled={syncState === 'syncing'} aria-label="手动刷新">↻</button></header><section className="eink-list">{slot && items.length ? items.map(item => <article className="eink-item" key={item.id}><div className="eink-item-title"><span className="eink-food"><CategoryIcon iconKey={item.icon_key} icons={workspace.icons} /></span><strong>{item.item_name}</strong><em className={item.expiry_status === 'expired' ? 'is-expired' : item.expiry_status === 'expiring' ? 'is-expiring' : ''}>{item.expiry_status === 'expired' ? '已过期' : item.expiry_status === 'expiring' ? '临期' : item.best_before ? item.best_before.slice(5).replace('-', '/') : '未设日期'}</em></div><div className="eink-item-actions">{item.quantity === 1 ? <button disabled={busyBatchId === item.id} onClick={() => void onAdjust(item, -1)}>拿走</button> : <><button disabled={busyBatchId === item.id} onClick={() => void onAdjust(item, -1)} aria-label={`减少 ${item.item_name}`}>−</button><b>剩 {item.quantity} 个</b><button disabled={busyBatchId === item.id} onClick={() => void onAdjust(item, 1)} aria-label={`增加 ${item.item_name}`}>＋</button><button disabled={busyBatchId === item.id} onClick={() => void onAdjust(item, -item.quantity)}>全部拿走</button></>}</div></article>) : <p className="eink-empty">这个隔层还没有物品。</p>}</section><footer className="eink-detail-footer">{undo ? <button onClick={() => void onUndo()}>已更新 · 撤销</button> : <span>⌂ 10分钟后回到首页</span>}</footer></main>
}

/** 当前冰箱首页：按物理位置展示库存，切换冰箱时只使用对应布局和批次。 */
function FridgeHome({ refrigerator, layout, homeInventory, icons, notice, notifications, refreshState, refreshError, installEvent, installed, onInstallEventConsumed, onAdd, onInventory, onSlot, onManage, onSwitch, onRefresh, onRecipes, onMe, onSearch }: { refrigerator: Refrigerator; layout: Layout; homeInventory: InventoryBatch[]; icons: Icon[]; notice: string; notifications: DueNotification[]; refreshState: RefreshState; refreshError: string; installEvent: BeforeInstallPromptEvent | null; installed: boolean; onInstallEventConsumed: () => void; onAdd: () => void; onInventory: () => void; onSlot: (slotId: string) => void; onManage: () => void; onSwitch: () => void; onRefresh: () => void; onRecipes: () => void; onMe: () => void; onSearch: (query: string) => void }) {
  const expiring = homeInventory.filter(item => item.expiry_status === 'expiring').length
  const [isNoticeOpen, setIsNoticeOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const submitSearch = () => { if (searchQuery.trim()) onSearch(searchQuery.trim()) }
  return <PageShell className="p7-shell p7-top-level" onRefresh={onRefresh} refreshState={refreshState} header={<AppHeader title={<HeaderTitle title={refrigerator.name} refreshState={refreshState} refreshError={refreshError} />} left={<button className="p7-icon-button" onClick={onManage} aria-label="管理冰箱">☰</button>} right={<button className="p7-icon-button" onClick={onSwitch} aria-label="切换冰箱">⌄</button>} />} bodyClassName="p7-home-content" footer={<P7Navigation active="home" onHome={() => undefined} onRecipes={onRecipes} onFridge={onSwitch} onMe={onMe} />}>
    <PwaInstallPrompt installEvent={installEvent} installed={installed} onInstallEventConsumed={onInstallEventConsumed} />
    <div className="p7-status"><button className="p7-inventory-summary" type="button" onClick={onInventory} aria-label={`查看全部 ${homeInventory.length} 件物品`}><svg className="p7-inventory-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 10.5c0-2.4 1.7-4 4-4 1 0 1.9.4 2.5 1 .6-.6 1.5-1 2.5-1 2.3 0 4 1.6 4 4 0 4.1-2.3 8-6.5 8s-6.5-3.9-6.5-8Z" /><path d="M12 7.5c-.1-1.8.8-3-1.3-4.5M13.2 4.5c1.2-.1 2.4-.7 3.1-1.7" /></svg>{homeInventory.length} 件物品 <span aria-hidden="true">›</span></button><form className="p7-inventory-search" onSubmit={event => { event.preventDefault(); submitSearch() }}><svg className="p7-search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg><input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="搜索所有冰箱" aria-label="搜索所有冰箱的物品" /></form>{expiring > 0 && <span className="p7-hatched">◢ {expiring}</span>}{notifications.length > 0 && <button className="p7-danger" type="button" onClick={() => setIsNoticeOpen(true)} aria-label={`查看 ${notifications.length} 条通知`}>! {notifications.length}</button>}<span className="p7-status-actions">{notice && !notifications.length && <button className="p7-icon-button p7-status-notice" onClick={() => setIsNoticeOpen(true)} aria-label="查看首页提示" aria-haspopup="dialog">!</button>}</span></div>
    {(notice || notifications.length > 0) && isNoticeOpen && <div className="p7-notice-modal" role="dialog" aria-modal="true" aria-labelledby="p7-notice-title"><section className="p7-notice-dialog"><button className="p7-notice-close" type="button" onClick={() => setIsNoticeOpen(false)} aria-label="关闭首页提示">×</button><h2 id="p7-notice-title">首页提示</h2>{notifications.length > 0 ? notifications.map(item => <p key={`${item.kind}-${item.title}`}>{item.title}：{item.body}</p>) : <p>{notice}</p>}<button className="p7-outline" type="button" onClick={() => setIsNoticeOpen(false)}>知道了</button></section></div>}
    <section className="p7-fridge-preview" aria-label={`${refrigerator.name} 的冰箱布局`}><FridgePreviewFrame variant="home" layout={layout} onSelectSlot={onSlot} renderSlot={(slot, { layoutKind }) => {
      const slotItems = homeInventory.filter(item => item.storage_slot_id === slot.id)
      return <>{slotItems.map((item, index) => { const position = getFoodIconPosition(index, slotItems.length, { layoutKind }); return <span className={`p7-food ${item.expiry_status === 'expired' ? 'is-expired' : item.expiry_status === 'expiring' ? 'is-expiring' : ''}`} key={item.id} style={{ '--food-x': position.x, '--food-y': position.y } as CSSProperties} title={`${item.item_name} ×${item.quantity}`}><CategoryIcon iconKey={item.icon_key} icons={icons} /><b>{item.quantity > 1 ? item.quantity : ''}</b></span> })}</>
    }} /></section>
    <button className="p7-primary" onClick={onAdd}>＋ 添加物品</button>
  </PageShell>
}

/** 手机端“我的”一级页；只承载账号和本机偏好，不混入单台冰箱配置。 */
function MeHome({ onNotifications, onAbout, onHome, onRecipes, onFridge }: { onNotifications: () => void; onAbout: () => void; onHome: () => void; onRecipes: () => void; onFridge: () => void }) {
  return <PageShell className="p7-shell p7-top-level" header={<AppHeader title="我的" />} bodyClassName="p7-scroll p7-settings" footer={<P7Navigation active="me" onHome={onHome} onRecipes={onRecipes} onFridge={onFridge} onMe={() => undefined} />}>
      <section className="p7-me-identity"><b>flycn 所有者</b><small>当前登录账号</small></section>
      <section>
        <button className="p7-link-row" onClick={onNotifications}><span><b>通知与权限</b><small>本机提醒时间和系统通知权限</small></span><b aria-hidden="true">›</b></button>
        <button className="p7-link-row"><span><b>应用偏好</b><small>显示和交互偏好</small></span><b aria-hidden="true">›</b></button>
        <button className="p7-link-row" onClick={onAbout}><span><b>关于家常食橱</b><small>版本与帮助</small></span><b aria-hidden="true">›</b></button>
      </section>
  </PageShell>
}

/** 关于与帮助页：展示版本，并提供仅清理应用壳缓存的恢复入口。 */
function AboutHelp({ onBack }: { onBack: () => void }) {
  const [refreshing, setRefreshing] = useState(false)
  const [message, setMessage] = useState('')
  const refresh = async () => {
    setRefreshing(true)
    setMessage('')
    try {
      await refreshPwaCache()
    } catch {
      setRefreshing(false)
      setMessage('刷新失败，请确认网络连接后重试。')
    }
  }
  return <PageShell className="p7-shell p7-about-shell" header={<PageHeader title="关于与帮助" onBack={onBack} />} bodyClassName="p7-scroll p7-about">
    <section className="p7-about-identity"><img src="/icon-192.png" alt="" /><h2>{APP_NAME}</h2><p>家庭冰箱库存与食谱管理</p></section>
    <section className="p7-about-version"><span>应用版本</span><b>v{APP_VERSION} · release {APP_RELEASE}</b></section>
    <section className="p7-about-help"><p>刷新会更新 Service Worker，并清理本应用的前端页面缓存。登录状态、冰箱数据和本机设置不会被删除。</p><button type="button" onClick={() => void refresh()} disabled={refreshing}>{refreshing ? '刷新中…' : '刷新应用'}</button>{message && <p className="p7-about-error" role="alert">{message}</p>}</section>
  </PageShell>
}

/** P9 手机端食谱、文本导入、单日编辑和动态补货闭环。 */
function FridgeSwitcher({ fridges, currentId, onSelect, onSettings, onBack, onCreate, onDeleted, onRecipes, onMe, onRefresh }: { fridges: Refrigerator[]; currentId: string; onSelect: (fridge: Refrigerator) => void; onSettings: (fridge: Refrigerator) => void; onBack: () => void; onCreate: () => void; onDeleted: () => void; onRecipes: () => void; onMe: () => void; onRefresh: () => Promise<void> }) {
  const cached = useMemo(() => readPageCache<FridgeListCache>(refrigeratorListCacheKey()), [])
  const [summaries, setSummaries] = useState<Record<string, { template: string; foods: number }>>(cached?.data.summaries ?? {})
  const [deletedCount, setDeletedCount] = useState(cached?.data.deletedCount ?? 0)
  const [refreshState, setRefreshState] = useState<RefreshState>(cached?.isStale ? 'loading' : 'idle')
  const [refreshError, setRefreshError] = useState('')
  const loadSummaries = useCallback(async (force = false) => {
    const summariesComplete = Boolean(cached && fridges.every(fridge => cached.data.summaries?.[fridge.id]))
    if (!force && cached && !cached.isStale && summariesComplete) return
    setRefreshState('loading'); setRefreshError('')
    try {
      const overview = await fetchFridgeOverview(fridges)
      setSummaries(overview.summaries); setDeletedCount(overview.deletedCount); setRefreshState('idle')
      writePageCache(refrigeratorListCacheKey(), { fridges, ...overview })
    } catch (error) { setRefreshState('error'); setRefreshError((error as Error).message) }
  }, [cached, fridges])
  useEffect(() => {
    const timer = window.setTimeout(() => { void loadSummaries() }, 0)
    return () => window.clearTimeout(timer)
  }, [fridges, loadSummaries])
  const refresh = async () => {
    try { await onRefresh(); await loadSummaries(true) }
    catch (error) { setRefreshState('error'); setRefreshError((error as Error).message) }
  }
  return <PageShell className="p7-shell p71-shell" onRefresh={refresh} refreshState={refreshState} header={<AppHeader title={<HeaderTitle title="我的冰箱" refreshState={refreshState} refreshError={refreshError} />} right={<button className="p7-icon-button" onClick={onCreate} aria-label="新建冰箱">＋</button>} />} bodyClassName="p7-scroll p71-list" footer={<P7Navigation active="fridge" onHome={onBack} onRecipes={onRecipes} onFridge={() => undefined} onMe={onMe} />}><p className="p71-kicker">选择要管理的冰箱</p>{fridges.map(fridge => <article className={`p71-fridge-card ${fridge.id === currentId ? 'is-current' : ''}`} key={fridge.id} role="button" tabIndex={0} aria-label={`打开${fridge.name}`} onClick={() => onSelect(fridge)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(fridge) } }}><i className="large-fridge" aria-hidden="true" /><span><b>{fridge.name}</b><small>{fridge.id === currentId ? '当前冰箱 · ' : ''}{summaries[fridge.id]?.template ?? '正在读取布局'} · {summaries[fridge.id]?.foods ?? 0} 件物品</small></span><button className="p71-card-action" onClick={event => { event.stopPropagation(); onSettings(fridge) }} aria-label={`设置${fridge.name}`}><svg className="p71-settings-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1.01-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 0-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg></button></article>)}<button className="p71-new-fridge" onClick={onCreate}>＋ 新建冰箱</button>{deletedCount > 0 && <button className="p71-deleted-link" onClick={onDeleted}>最近删除 {deletedCount} <span>›</span></button>}</PageShell>
}

function RecentlyDeleted({ onBack, onRestore }: { onBack: () => void; onRestore: (fridge: Refrigerator) => Promise<boolean> }) {
  const [deleted, setDeleted] = useState<Refrigerator[]>([])
  useEffect(() => { void request<Refrigerator[]>('/api/owner/refrigerators/deleted').then(setDeleted).catch(() => setDeleted([])) }, [])
  return <PageShell className="p7-shell p71-shell" header={<PageHeader title="最近删除" onBack={onBack} />} bodyClassName="p7-scroll p71-list"><p className="p71-intro">删除的冰箱会保留 30 天，之后将永久清除。</p>{deleted.length ? deleted.map(fridge => <article className="p71-deleted-card" key={fridge.id}><i className="large-fridge" aria-hidden="true" /><span><b>{fridge.name}</b><small>恢复后需重新配对所有设备</small></span><button onClick={() => void onRestore(fridge).then(restored => { if (restored) setDeleted(current => current.filter(item => item.id !== fridge.id)) })}>恢复</button></article>) : <p className="p71-empty">最近没有删除的冰箱。</p>}<aside className="p71-note"><b>恢复后</b><p>布局和物品会保留，旧手机和冰箱端设备不会自动恢复访问。</p></aside></PageShell>
}

/** 设置数据尚未准备完成时的页面反馈，避免慢请求期间用户误以为点击无效。 */
export function FridgeSettingsLoading({ onBack }: { onBack: () => void }) {
  return <PageShell className="p7-shell p71-shell" header={<PageHeader title="冰箱设置" onBack={onBack} />} bodyClassName="p71-settings-loading"><div className="p71-loading-state" role="status" aria-live="polite"><span className="p71-loading-spinner" aria-hidden="true" /><p>正在读取冰箱设置…</p></div></PageShell>
}

function FridgeSettings({ refrigerator, layout, devices, onBack, onNameAndLayout, onExpiry, onRemove, onDelete }: { refrigerator: Refrigerator; layout: Layout; devices: Device[]; onBack: () => void; onNameAndLayout: () => void; onExpiry: () => void; onRemove: (id: string) => void; onDelete: () => Promise<string | null> }) {
  const [confirming, setConfirming] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')
  if (confirming) return <PageShell className="p7-shell p71-shell" header={<PageHeader title="删除冰箱" onBack={() => setConfirming(false)} />} bodyClassName="p7-scroll p71-delete" footer={<footer className="bottom-action-bar p71-danger-bar"><button disabled={confirmation !== refrigerator.name} onClick={() => void onDelete().then(error => setMessage(error ?? ''))}>删除冰箱</button></footer>}><aside className="p71-alert"><b>这会立即断开所有设备</b><p>所有手机和冰箱端设备都会被撤销访问；冰箱将在 30 天内保留以便恢复。</p></aside><section><i className="large-fridge" /><div><b>{refrigerator.name}</b><small>{layout.zones.reduce((sum, zone) => sum + zone.slots.length, 0)} 个存放位置 · {devices.filter(device => !device.revoked_at).length} 台设备</small></div></section><label>输入“{refrigerator.name}”确认删除<input autoFocus value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>{message && <p className="claim-error" role="alert">{message}</p>}</PageShell>
  return <PageShell className="p7-shell p71-shell" header={<PageHeader title="冰箱设置" onBack={onBack} />} bodyClassName="p7-scroll p71-settings">
      <section className="p71-fridge-identity"><i className="large-fridge" /><b>{refrigerator.name}</b><small>{layout.template_key === 'mini' ? '迷你冰箱' : '已配置冰箱布局'}</small></section>
      <button className="p71-name-layout-link" onClick={onNameAndLayout}><span><b>名称与布局</b><small>修改冰箱名称，查看或编辑现有布局</small></span><b aria-hidden="true">›</b></button>
      <section className="p71-access"><h2>可访问的设备</h2>{devices.filter(device => !device.revoked_at).length ? devices.filter(device => !device.revoked_at).map(device => <article key={device.id}><i className="phone-icon" /><span><b>{device.is_current ? '本机' : device.label}</b><small>{device.kind === 'kindle' ? '冰箱端设备' : '手机访问'}</small></span>{!device.is_current && <button onClick={() => onRemove(device.id)} aria-label={`移除 ${device.label}`}>移除</button>}</article>) : <p>还没有设备访问这台冰箱。</p>}</section>
      <section><button className="p7-link-row" onClick={onExpiry}><span><b>临期规则</b><small>设置这台冰箱的临期提醒范围</small></span><b aria-hidden="true">›</b></button></section>
      <section className="p71-danger"><h2>危险操作</h2><button onClick={() => setConfirming(true)}>删除冰箱</button><p>删除后可在 30 天内从“最近删除”恢复。</p></section>
  </PageShell>
}

/** 将名称维护和已有布局预览收敛为同一入口，避免设置页重复实现布局外观。 */
function NameAndLayout({ refrigerator, layout, templates, onBack, onRename, onLayout }: { refrigerator: Refrigerator; layout: Layout; templates: Template[]; onBack: () => void; onRename: (name: string) => Promise<string | null>; onLayout: () => void }) {
  const [name, setName] = useState(refrigerator.name)
  const [message, setMessage] = useState('')
  const [savingName, setSavingName] = useState(false)
  const continueToLayout = async () => {
    setSavingName(true); setMessage('')
    const error = await onRename(name)
    setSavingName(false)
    if (error) { setMessage(error); return }
    onLayout()
  }
  return <PageShell className="p4-flow p71-name-layout" header={<PageHeader title="名称与布局" onBack={onBack} right={<span className="flow-step">1 / 2</span>} />} bodyClassName="p4-content setup-content" footer={<footer className="bottom-action-bar"><button disabled={!name.trim() || savingName} onClick={() => void continueToLayout()}>{savingName ? '保存中…' : '使用这个布局'}</button></footer>}><label className="fridge-name-field"><span>冰箱名称</span><input autoFocus value={name} maxLength={120} onChange={event => setName(event.target.value)} /></label>
      <div className="setup-preview-group"><FridgePreviewFrame variant="setup" className="setup-preview" layout={layout} /><p className="layout-caption">{templateCaption(layout.template_key)}</p></div>
      <section className="template-section"><div className="template-heading"><h2>选择外形</h2><p className="quiet-note">已有冰箱不能更换外形。</p></div><div className="template-grid">{templates.map(template => <TemplateSilhouette key={template.key} template={template} selected={template.key === layout.template_key} onSelect={() => undefined} disabled={template.key !== layout.template_key} />)}</div></section>{message && <p className="claim-error" role="alert">{message}</p>}
  </PageShell>
}

/** 新建和编辑已有冰箱共用的第二步布局方案主体。 */
function LayoutPlanEditor({ layout, template, activeZoneKey, onSelectZone, onChangeSlots, onChangeTemperature }: { layout: Layout; template: Template | undefined; activeZoneKey: string; onSelectZone: (key: string) => void; onChangeSlots: (key: string, count: number) => void; onChangeTemperature: (key: string, temperature: 'cold' | 'frozen') => void }) {
  const selected = layout.zones.find(zone => zone.key === activeZoneKey)
  const templateZone = template?.zones.find(zone => zone.key === activeZoneKey)
  if (!selected) return null
  const isRow = templateZone?.layout_kind === 'single_row'
  return <><FridgePreviewFrame variant="editor" layout={layout} activeZoneKey={activeZoneKey} onSelect={onSelectZone} /><div className="zone-tabs" role="tablist">{layout.zones.map(zone => <button key={zone.key} type="button" role="tab" aria-selected={zone.key === activeZoneKey} className={zone.key === activeZoneKey ? 'is-active' : ''} onClick={() => onSelectZone(zone.key)}>{zone.label.replace('区', '')}</button>)}</div><section className="partition-panel"><div className="partition-heading"><h2>分格</h2><span>{selected.label}</span></div><div className="partition-options">{LAYOUT_SLOT_OPTIONS.map(count => <button key={count} type="button" className={`${count === selected.slots.length ? 'is-selected' : ''} ${count === 0 ? 'is-unavailable' : ''}`} onClick={() => onChangeSlots(selected.key, count)} aria-label={formatLayoutSlotOption(count)}><span className={`partition-glyph ${isRow ? 'is-row' : ''} ${count === 0 ? 'is-unavailable' : ''}`} style={count === 0 ? undefined : isRow ? { gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` } : { gridTemplateRows: `repeat(${count}, minmax(0, 1fr))` }}>{Array.from({ length: count }, (_, index) => <i key={index} />)}</span><b>{count === 0 ? '不可用' : count}</b></button>)}</div>{templateZone?.adjustable_temperature && <div className="temperature-choice"><span>温度</span><button type="button" className={selected.temperature_mode === 'cold' ? 'is-selected' : ''} onClick={() => onChangeTemperature(selected.key, 'cold')}>冷藏</button><button type="button" className={selected.temperature_mode === 'frozen' ? 'is-selected' : ''} onClick={() => onChangeTemperature(selected.key, 'frozen')}>冷冻</button></div>}</section></>
}

function ExistingLayoutEditor({ layout, template, saving, onBack, onSave }: { layout: Layout; template: Template | undefined; saving: boolean; onBack: () => void; onSave: (layout: Layout) => void }) {
  const [draft, setDraft] = useState(() => completeLayoutZones(layout, template))
  const [activeZoneKey, setActiveZoneKey] = useState(() => completeLayoutZones(layout, template).zones[0]?.key ?? '')
  const changeSlots = (key: string, count: number) => setDraft(current => ({ ...current, zones: current.zones.map(zone => zone.key === key ? { ...zone, slots: Array.from({ length: count }, (_, index) => ({ id: zone.slots[index]?.id ?? `draft-${zone.key}-${index}`, key: `${zone.key}-${index + 1}` })) } : zone) }))
  const changeTemperature = (key: string, temperature: 'cold' | 'frozen') => setDraft(current => ({ ...current, zones: current.zones.map(zone => zone.key === key ? { ...zone, temperature_mode: temperature } : zone) }))
  return <PageShell className="p4-flow" header={<PageHeader title="布局方案" onBack={onBack} right={<span className="flow-step">2 / 2</span>} />} bodyClassName="p4-content editor-content" footer={<footer className="bottom-action-bar"><p>保存后，缩减分格中的物品会自动归入该区域最后一个保留分格。</p><button disabled={saving} onClick={() => onSave(draft)}>{saving ? '保存中…' : '保存布局'}</button></footer>}><LayoutPlanEditor layout={draft} template={template} activeZoneKey={activeZoneKey} onSelectZone={setActiveZoneKey} onChangeSlots={changeSlots} onChangeTemperature={changeTemperature} /></PageShell>
}

/** P10 设置页；全局提醒轮询在已登录应用壳中运行。 */
function NotificationSettings({ refrigerator, settings, onSave, onBack }: { refrigerator: Refrigerator; settings: NotificationSettings; onSave: (value: NotificationSettings) => Promise<string | null>; onBack: () => void }) {
  const [draft, setDraft] = useState(settings)
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const save = async () => { setSaving(true); setNotice(''); const error = await onSave(draft); setNotice(error || '提醒设置已保存。'); setSaving(false) }
  const enableSystemNotification = async () => {
    if (!('Notification' in window)) { setNotice('当前浏览器不支持系统通知；提醒会在打开家常食橱时显示。'); return }
    const permission = await Notification.requestPermission()
    setNotice(permission === 'granted' ? '已允许系统通知；打开应用时会同步显示提醒。' : '未授予系统通知权限；提醒仍会在应用内显示。')
  }
  return <PageShell className="p7-shell" header={<PageHeader title="通知与权限" onBack={onBack} />} bodyClassName="p7-scroll p7-settings"><p className="p7-context">▯ {refrigerator.name}</p><section><div className="p7-setting-row"><span><b>每日临期提醒</b><small>每天最多一次</small></span><button className={`p7-switch ${draft.daily_reminder_enabled ? 'is-on' : ''}`} onClick={() => setDraft(value => ({ ...value, daily_reminder_enabled: !value.daily_reminder_enabled }))} aria-pressed={draft.daily_reminder_enabled}><i /></button></div><label className="p7-time">提醒时间<input type="time" value={draft.reminder_time} disabled={!draft.daily_reminder_enabled} onChange={event => setDraft(value => ({ ...value, reminder_time: event.target.value }))} /></label><button className="p7-outline p10-notification-permission" onClick={() => void enableSystemNotification()}>启用系统通知</button><small className="p10-hint">未完成真机 Web Push 验证前，应用关闭或系统休眠时仅保证下次打开后的应用内提醒。</small></section><section><div className="p7-setting-row"><span><b>显示设备未更新提醒</b><small>若今天未完成同步，将与食品提醒一起出现</small></span><button className={`p7-switch ${draft.device_health_enabled ? 'is-on' : ''}`} onClick={() => setDraft(value => ({ ...value, device_health_enabled: !value.device_health_enabled }))} aria-pressed={draft.device_health_enabled}><i /></button></div></section>{notice && <p className="p7-saved" role="status">{notice}</p>}<button className="p7-primary" disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '保存设置'}</button></PageShell>
}

function ExpirySettingsPage({ refrigerator, expiry, onSaveExpiry, onBack }: { refrigerator: Refrigerator; expiry: ExpirySettings; onSaveExpiry: (value: ExpirySettings) => Promise<string | null>; onBack: () => void }) {
  const [draft, setDraft] = useState(expiry)
  const [saved, setSaved] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const save = async () => { setSaving(true); setSaved(''); setError(''); const failure = await onSaveExpiry(draft); if (failure) setError(failure); else setSaved('设置已保存。'); setSaving(false) }
  return <PageShell className="p7-shell" header={<PageHeader title="临期规则" onBack={onBack} />} bodyClassName="p7-scroll p7-settings"><p className="p7-context">▯ {refrigerator.name}</p><section><p>进入最后 <b>{draft.ratio_percent}%</b> 有效期时提醒；至少提前 {draft.minimum_days} 天，最多提前 {draft.maximum_days} 天。</p><label>提醒阈值<input type="range" min="1" max="100" value={draft.ratio_percent} onChange={event => setDraft({ ...draft, ratio_percent: Number(event.target.value) })} /><output>{draft.ratio_percent}%</output></label><div className="p7-step-row"><span>最少提前</span><button onClick={() => setDraft({ ...draft, minimum_days: Math.max(1, draft.minimum_days - 1) })}>−</button><b>{draft.minimum_days} 天</b><button onClick={() => setDraft({ ...draft, minimum_days: Math.min(draft.maximum_days, draft.minimum_days + 1) })}>＋</button></div><div className="p7-step-row"><span>最多提前</span><button onClick={() => setDraft({ ...draft, maximum_days: Math.max(draft.minimum_days, draft.maximum_days - 1) })}>−</button><b>{draft.maximum_days} 天</b><button onClick={() => setDraft({ ...draft, maximum_days: Math.min(14, draft.maximum_days + 1) })}>＋</button></div></section><p className="p7-help">未填写 BBD 的食物不会收到临期或过期提醒。</p>{saved && <p className="p7-saved" role="status">{saved}</p>}{error && <p className="claim-error" role="alert">{error}</p>}<button className="p7-primary" disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '保存设置'}</button></PageShell>
}

function TemplateSilhouette({ template, selected, onSelect, disabled = false }: { template: Template; selected: boolean; onSelect: () => void; disabled?: boolean }) {
  return <button type="button" aria-label={template.name} className={`template-choice ${selected ? 'is-selected' : ''}`} onClick={onSelect} aria-pressed={selected} disabled={disabled}>
    <FridgePreviewFrame variant="thumbnail" className="template-preview" layout={makeDraftLayout(template)} />
    <span className="template-name">{template.name}</span>
    {selected && <b>✓</b>}
  </button>
}

/** P5 物品录入流程：将草稿中的五个页面映射为可完成的库存操作。 */
function templateCaption(templateKey: string): string {
  return ({
    top_freezer_single: '上冷冻 · 下冷藏', bottom_freezer_single: '上冷藏 · 下冷冻',
    side_by_side: '左冷冻 · 右冷藏', french_door: '上部双冷藏 · 下冷冻',
    mini: '上冷冻 · 下冷藏', three_door: '上冷藏 · 中间可调 · 下冷冻',
    dual_middle: '上冷藏 · 中间分区 · 下冷冻',
  } as Record<string, string>)[templateKey] ?? ''
}

function makeDraftLayout(template: Template): Layout {
  return { refrigerator_id: 'draft', template_key: template.key, revision: 1, zones: template.zones.map(zone => {
    const count = zone.key === 'door' ? 5 : zone.is_door ? 0 : template.key === 'dual_middle' && zone.key === 'middle' ? 2 : template.key === 'mini' ? (zone.key === 'freezer' ? 1 : 2) : zone.layout_kind === 'single_row' ? 1 : 3
    const geometry = { ...zone.geometry, layout_kind: zone.layout_kind }
    return { key: zone.key, label: zone.label, temperature_mode: zone.temperature_mode, geometry, is_door: zone.is_door, slots: Array.from({ length: count }, (_, index) => ({ id: `draft-${zone.key}-${index}`, key: `${zone.key}-${index + 1}` })) }
  }) }
}

export function App() {
  const initialFridgeCache = initialPageCache<FridgeListCache>(refrigeratorListCacheKey())
  const initialFridges = initialFridgeCache?.data.fridges ?? []
  const initialSavedId = window.localStorage.getItem(LAST_REFRIGERATOR_STORAGE_KEY)
  const initialRefrigerator = selectStartupRefrigerator(initialFridges, initialSavedId)
  const initialWorkspaceCache = initialRefrigerator ? initialPageCache<WorkspaceCache>(refrigeratorWorkspaceCacheKey(initialRefrigerator.id)) : null
  const initialInventory = initialWorkspaceCache?.data.inventory ?? []
  const initialHomeInventory = initialWorkspaceCache?.data.homeInventory ?? initialInventory.filter(item => item.quantity > 0)
  const [message, setMessage] = useState('')
  const [ownerState, setOwnerState] = useState<'loading' | 'signed-in' | 'signed-out'>('loading')
  const [fridges, setFridges] = useState<Refrigerator[]>(initialFridges)
  const [templates, setTemplates] = useState<Template[]>([])
  const [name, setName] = useState('家里冰箱')
  const [templateKey, setTemplateKey] = useState('top_freezer_single')
  const [layout, setLayout] = useState<Layout | null>(initialWorkspaceCache?.data.layout ?? null)
  const [setupStep, setSetupStep] = useState<'none' | 'setup' | 'editor'>('none')
  const [draftLayout, setDraftLayout] = useState<Layout | null>(null)
  const [activeZoneKey, setActiveZoneKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [devices, setDevices] = useState<Device[]>([])
  const [deviceFridgeId, setDeviceFridgeId] = useState('')
  const [categories, setCategories] = useState<Category[]>(initialWorkspaceCache?.data.categories ?? [])
  const [inventory, setInventory] = useState<InventoryBatch[]>(initialInventory)
  const [homeInventory, setHomeInventory] = useState<InventoryBatch[]>(initialHomeInventory)
  const [inventorySlotId, setInventorySlotId] = useState<string | undefined>()
  const [inventoryMode, setInventoryMode] = useState<'add' | 'list' | 'edit'>('add')
  const [inventoryItemId, setInventoryItemId] = useState<string | undefined>()
  const [searchQuery, setSearchQuery] = useState('')
  const [recipeRefreshNonce, setRecipeRefreshNonce] = useState(0)
  const [inventorySearchRefreshNonce, setInventorySearchRefreshNonce] = useState(0)
  const [moveItems, setMoveItems] = useState<InventoryBatch[]>([])
  const [moveIcons, setMoveIcons] = useState<Icon[]>([])
  const [moveReturnView, setMoveReturnView] = useState<'inventory' | 'search'>('inventory')
  const [icons, setIcons] = useState<Icon[]>(initialWorkspaceCache?.data.icons ?? [])
  const pairToken = new URLSearchParams(window.location.search).get('token')
  const bootstrapToken = new URLSearchParams(window.location.search).get('bootstrap')
  const [pairedRefrigerator, setPairedRefrigerator] = useState<Refrigerator | null>(null)
  const [scanning, setScanning] = useState(false)
  const [p7View, setP7View] = useState<'home' | 'switcher' | 'deleted' | 'settings' | 'name-layout' | 'layout-editor' | 'notifications' | 'expiry' | 'inventory' | 'search' | 'recipes' | 'me' | 'about'>(initialFridges.length ? 'home' : 'switcher')
  const [settingsReturn, setSettingsReturn] = useState<'home' | 'switcher'>('home')
  const [expiry, setExpiry] = useState<ExpirySettings>(initialWorkspaceCache?.data.expiry ?? { ratio_percent: 20, minimum_days: 1, maximum_days: 14 })
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(initialWorkspaceCache?.data.notificationSettings ?? { daily_reminder_enabled: true, reminder_time: '20:00', device_health_enabled: true })
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [dueNotifications, setDueNotifications] = useState<DueNotification[]>([])
  const [refreshState, setRefreshState] = useState<RefreshState>(initialWorkspaceCache?.isStale ? 'loading' : 'idle')
  const [refreshError, setRefreshError] = useState('')
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [pwaInstalled, setPwaInstalled] = useState(() => isStandalone())
  const workspaceRefreshInFlight = useRef<Promise<void> | null>(null)
  const settingsRequestId = useRef(0)
  const activeWorkspaceIdRef = useRef(initialRefrigerator?.id ?? '')
  const activeRefrigeratorId = layout?.refrigerator_id

  useEffect(() => {
    if (pwaInstalled) return
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
    }
    const onAppInstalled = () => {
      setPwaInstalled(true)
      setInstallEvent(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [pwaInstalled])

  const applyWorkspaceCache = (cached: WorkspaceCache) => {
    setLayout(cached.layout); setCategories(cached.categories); setIcons(cached.icons); setInventory(cached.inventory); setHomeInventory(cached.homeInventory ?? cached.inventory.filter(item => item.quantity > 0)); setExpiry(cached.expiry); setNotificationSettings(cached.notificationSettings)
  }
  const updateWorkspaceCache = (patch: Partial<WorkspaceCache>) => {
    if (!layout) return
    const cached = readPageCache<WorkspaceCache>(refrigeratorWorkspaceCacheKey(layout.refrigerator_id))
    if (cached) writePageCache(refrigeratorWorkspaceCacheKey(layout.refrigerator_id), { ...cached.data, ...patch })
  }
  const refreshWorkspace = useCallback(async (fridge: Refrigerator): Promise<void> => {
    if (workspaceRefreshInFlight.current) return workspaceRefreshInFlight.current
    const refresh = (async () => {
      if (activeWorkspaceIdRef.current === fridge.id) { setRefreshState('loading'); setRefreshError('') }
      try {
        const [savedLayout, savedCategories, savedIcons, savedInventory, savedHomeInventory, savedExpiry, savedNotificationSettings] = await Promise.all([
          request<Layout>(`/api/owner/refrigerators/${fridge.id}/layout`),
          request<Category[]>(`/api/owner/refrigerators/${fridge.id}/categories`),
          request<Icon[]>(`/api/owner/refrigerators/${fridge.id}/icons`),
          request<InventoryBatch[]>(`/api/owner/refrigerators/${fridge.id}/inventory?include_zero=true`),
          request<InventoryBatch[]>(`/api/owner/refrigerators/${fridge.id}/inventory?include_zero=false`),
          request<ExpirySettings>(`/api/owner/refrigerators/${fridge.id}/expiry-settings`),
          request<NotificationSettings>(`/api/owner/refrigerators/${fridge.id}/notification-settings`),
        ])
        const cached: WorkspaceCache = { refrigerator: fridge, layout: savedLayout, categories: savedCategories, icons: savedIcons, inventory: savedInventory, homeInventory: savedHomeInventory, expiry: savedExpiry, notificationSettings: savedNotificationSettings }
        writePageCache(refrigeratorWorkspaceCacheKey(fridge.id), cached)
        if (activeWorkspaceIdRef.current === fridge.id) applyWorkspaceCache(cached)
        if (activeWorkspaceIdRef.current === fridge.id) setRefreshState('idle')
      } catch (error) {
        if (activeWorkspaceIdRef.current === fridge.id) { setRefreshState('error'); setRefreshError((error as Error).message) }
        throw error
      } finally {
        workspaceRefreshInFlight.current = null
      }
    })()
    workspaceRefreshInFlight.current = refresh
    return refresh
  }, [])
  const prewarmRecipes = useCallback(async (fridge: Refrigerator): Promise<void> => {
    const currentMonday = getLocalMonday(new Date())
    const weekOffset = window.localStorage.getItem(`fb-last-recipe-week:${fridge.id}`) === '7' ? 7 : 0
    const weekStart = addLocalCalendarDays(currentMonday, weekOffset)
    try {
      const [days, restock] = await Promise.all([
        request<RecipeDay[]>(`/api/owner/refrigerators/${fridge.id}/recipes?week_start=${weekStart}`),
        request<RestockEntry[]>(`/api/owner/refrigerators/${fridge.id}/restock?week_start=${weekStart}`),
      ])
      writePageCache(recipeCacheKey(fridge.id, weekStart), { days, restock })
    } catch {
      // 食谱预热失败不覆盖首页状态；进入食谱页后由食谱页面显示对应错误。
    }
  }, [])
  const prewarmFridgeOverview = useCallback(async (loaded: Refrigerator[]): Promise<void> => {
    try {
      const overview = await fetchFridgeOverview(loaded)
      writePageCache(refrigeratorListCacheKey(), { fridges: loaded, ...overview })
    } catch {
      // 冰箱页进入时会再次尝试；首页不因非当前页面的预热失败而中断。
    }
  }, [])
  const refreshFridgeList = useCallback(async (): Promise<void> => {
    const loaded = await request<Refrigerator[]>('/api/owner/refrigerators')
    const overview = await fetchFridgeOverview(loaded)
    setFridges(loaded)
    const selectedId = layout?.refrigerator_id
    if (selectedId && !loaded.some(fridge => fridge.id === selectedId)) { removeRefrigeratorPageCaches(selectedId); setLayout(null); setP7View('switcher') }
    writePageCache(refrigeratorListCacheKey(), { fridges: loaded, ...overview })
  }, [layout?.refrigerator_id])
  const loadOwner = useCallback(async () => {
    try {
      const loaded = await request<Refrigerator[]>('/api/owner/refrigerators')
      setFridges(loaded)
      const previousListCache = readPageCache<FridgeListCache>(refrigeratorListCacheKey())
      writePageCache(refrigeratorListCacheKey(), { fridges: loaded, summaries: previousListCache?.data.summaries ?? {}, deletedCount: previousListCache?.data.deletedCount ?? 0 })
      setOwnerState('signed-in')
      const savedId = window.localStorage.getItem(LAST_REFRIGERATOR_STORAGE_KEY)
      const startupFridge = selectStartupRefrigerator(loaded, savedId)
      if (!startupFridge) {
        setLayout(null); setP7View('switcher'); return
      }
      if (savedId && startupFridge.id !== savedId) window.localStorage.removeItem(LAST_REFRIGERATOR_STORAGE_KEY)
      const cachedWorkspace = readPageCache<WorkspaceCache>(refrigeratorWorkspaceCacheKey(startupFridge.id))
      activeWorkspaceIdRef.current = startupFridge.id
      if (cachedWorkspace) applyWorkspaceCache(cachedWorkspace.data)
      else setLayout(null)
      window.localStorage.setItem(LAST_REFRIGERATOR_STORAGE_KEY, startupFridge.id)
      setP7View('home')
      void refreshWorkspace(startupFridge).catch(() => undefined)
      void prewarmRecipes(startupFridge)
      void prewarmFridgeOverview(loaded)
    } catch (error) {
      const status = (error as Error & { status?: number }).status
      if (status === 401) { clearPageCaches(); setFridges([]); setLayout(null); setOwnerState('signed-out') }
      else { setOwnerState('signed-in'); setRefreshState('error'); setRefreshError((error as Error).message) }
    }
  }, [prewarmFridgeOverview, prewarmRecipes, refreshWorkspace])
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void request<Template[]>('/api/refrigerator-templates').then(setTemplates).catch(error => setMessage(error.message))
      void loadOwner()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadOwner])
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
        setDueNotifications(due)
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
  const beginRefrigeratorCreation = (clearCurrentLayout: boolean) => {
    if (clearCurrentLayout) setLayout(null)
    setName(suggestRefrigeratorName(fridges))
    setTemplateKey('top_freezer_single')
    setDraftLayout(null)
    setActiveZoneKey('')
    setCreating(true)
    setSetupStep('setup')
  }

  const loadInventoryWorkspace = useCallback(async (fridge: Refrigerator, force = false): Promise<void> => {
    activeWorkspaceIdRef.current = fridge.id
    const cached = readPageCache<WorkspaceCache>(refrigeratorWorkspaceCacheKey(fridge.id))
    if (cached) {
      applyWorkspaceCache(cached.data)
      if (!force && !cached.isStale) return
      if (!force) { void refreshWorkspace(fridge).catch(() => undefined); return }
    }
    await refreshWorkspace(fridge)
  }, [refreshWorkspace])

  const createRefrigerator = async () => {
    if (!draftLayout) return
    setSaving(true)
    try {
      const fridge = await request<Refrigerator>('/api/owner/refrigerators', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, template_key: templateKey, layout: draftLayout.zones.map(zone => ({ zone_key: zone.key, temperature_mode: zone.temperature_mode, slot_count: zone.slots.length })) }) })
      await loadInventoryWorkspace(fridge)
      window.localStorage.setItem(LAST_REFRIGERATOR_STORAGE_KEY, fridge.id)
      setCreating(false); setSetupStep('none'); setDraftLayout(null); setMessage(`已创建「${fridge.name}」，现在可以直接添加物品。`); await loadOwner()
    } catch (error) { setMessage((error as Error).message) } finally { setSaving(false) }
  }
  const saveExistingLayout = async (candidate: Layout) => {
    setSaving(true)
    try {
      const saved = await request<Layout>(`/api/owner/refrigerators/${candidate.refrigerator_id}/layout`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expected_revision: candidate.revision, zones: candidate.zones.map(zone => ({ zone_key: zone.key, temperature_mode: zone.temperature_mode, slot_count: zone.slots.length })) }) })
      setLayout(saved); updateWorkspaceCache({ layout: saved }); setP7View('settings'); setMessage('布局已保存。')
    } catch (error) { setMessage((error as Error).message); await loadInventoryWorkspace(currentFridgeForAction()) } finally { setSaving(false) }
  }
  const currentFridgeForAction = () => fridges.find(fridge => fridge.id === layout?.refrigerator_id) as Refrigerator
  const openLayout = useCallback(async (fridge: Refrigerator) => {
    try {
      await loadInventoryWorkspace(fridge)
      window.localStorage.setItem(LAST_REFRIGERATOR_STORAGE_KEY, fridge.id)
      setP7View('home'); setMessage('')
    } catch (error) { setMessage((error as Error).message) }
  }, [loadInventoryWorkspace])
  const openSearchResult = async ({ refrigerator, item }: InventorySearchResult) => {
    try {
      await loadInventoryWorkspace(refrigerator)
      setInventorySlotId(undefined)
      setInventoryItemId(item.id)
      setInventoryMode('edit')
      setP7View('inventory')
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
  const showDevices = async (fridge: Refrigerator) => {
    try { setDevices(await request<Device[]>(`/api/owner/refrigerators/${fridge.id}/devices`)); setDeviceFridgeId(fridge.id); setMessage(`正在管理：${fridge.name}`) } catch (error) { setMessage((error as Error).message) }
  }
  const openSettings = async (fridge: Refrigerator, returnView: 'home' | 'switcher' = 'switcher') => {
    const requestId = settingsRequestId.current + 1
    settingsRequestId.current = requestId
    setSettingsReturn(returnView)
    setSettingsLoading(true)
    try {
      await Promise.all([loadInventoryWorkspace(fridge), showDevices(fridge)])
      if (requestId !== settingsRequestId.current) return
      setP7View('settings')
    } catch (error) {
      if (requestId === settingsRequestId.current) setMessage((error as Error).message)
    } finally {
      if (requestId === settingsRequestId.current) setSettingsLoading(false)
    }
  }
  const renameCurrentRefrigerator = async (nextName: string): Promise<string | null> => {
    if (!layout) return '请先选择冰箱。'
    if (nextName.trim() === currentFridgeForAction().name) return null
    try {
      const renamed = await request<Refrigerator>(`/api/owner/refrigerators/${layout.refrigerator_id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nextName }) })
      setFridges(current => current.map(item => item.id === renamed.id ? renamed : item)); updateWorkspaceCache({ refrigerator: renamed }); return null
    } catch (error) { return (error as Error).message }
  }
  const deleteCurrentRefrigerator = async (): Promise<string | null> => {
    if (!layout) return '请先选择冰箱。'
    try {
      const refrigerator = currentFridgeForAction()
      await request<void>(`/api/owner/refrigerators/${refrigerator.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmation_name: refrigerator.name }) })
      removeRefrigeratorPageCaches(refrigerator.id); setLayout(null); setP7View('switcher'); setMessage('已移到最近删除，可在 30 天内恢复。'); await loadOwner(); return null
    } catch (error) { return (error as Error).message }
  }
  const restoreRefrigerator = async (refrigerator: Refrigerator): Promise<boolean> => {
    try {
      const restored = await request<Refrigerator>(`/api/owner/refrigerators/${refrigerator.id}/restore`, { method: 'POST' })
      setFridges(current => [...current, restored]); setMessage(`已恢复「${restored.name}」，请重新配对设备。`); return true
    } catch (error) { setMessage((error as Error).message); return false }
  }
  const removeDevice = async (deviceId: string) => {
    try { await request<void>(`/api/owner/refrigerators/${deviceFridgeId}/devices/${deviceId}`, { method: 'DELETE' }); setDevices(current => current.filter(device => device.id !== deviceId)); setMessage('设备已移除。') } catch (error) { setMessage((error as Error).message) }
  }
  const saveExpirySettings = async (value: ExpirySettings): Promise<string | null> => {
    if (!layout) return '请先选择冰箱。'
    try {
      const saved = await request<ExpirySettings>(`/api/owner/refrigerators/${layout.refrigerator_id}/expiry-settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) })
      setExpiry(saved); updateWorkspaceCache({ expiry: saved })
      const [refreshed, refreshedHome] = await Promise.all([
        request<InventoryBatch[]>(`/api/owner/refrigerators/${layout.refrigerator_id}/inventory?include_zero=true`),
        request<InventoryBatch[]>(`/api/owner/refrigerators/${layout.refrigerator_id}/inventory?include_zero=false`),
      ])
      setInventory(refreshed); setHomeInventory(refreshedHome); updateWorkspaceCache({ inventory: refreshed, homeInventory: refreshedHome })
      return null
    } catch (error) { return (error as Error).message }
  }
  const saveNotificationSettings = async (value: NotificationSettings): Promise<string | null> => {
    if (!layout) return '请先选择冰箱。'
    try {
      const saved = await request<NotificationSettings>(`/api/owner/refrigerators/${layout.refrigerator_id}/notification-settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) })
      setNotificationSettings(saved); updateWorkspaceCache({ notificationSettings: saved })
      return null
    } catch (error) { return (error as Error).message }
  }
  const saveP5Inventory = async (draft: { id?: string; subcategoryId: string; slotId: string; itemName: string; quantity: number; bestBefore: string; bestBeforeChanged?: boolean; description: string; productionDate: string; barcode: string }) => {
    if (!layout) return false
    setSaving(true)
    try {
      const batch = await request<InventoryBatch>(`/api/owner/refrigerators/${layout.refrigerator_id}/inventory${draft.id ? `/${draft.id}` : ''}`, {
        method: draft.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subcategory_id: draft.subcategoryId, storage_slot_id: draft.slotId, item_name: draft.itemName, quantity: draft.quantity, best_before: draft.bestBefore || null, best_before_changed: Boolean(draft.bestBeforeChanged), product_description: draft.description || null, production_date: draft.productionDate || null, barcode: draft.barcode || null }),
      })
      const nextInventory = [...inventory.filter(item => item.id !== batch.id), batch]
      const nextHomeInventory = nextInventory.filter(item => item.quantity > 0)
      setInventory(nextInventory); setHomeInventory(nextHomeInventory); updateWorkspaceCache({ inventory: nextInventory, homeInventory: nextHomeInventory })
      setRecipeRefreshNonce(value => value + 1)
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
      const nextCategories = [...categories, created]
      setCategories(nextCategories); updateWorkspaceCache({ categories: nextCategories })
      return created
    } catch (error) { setMessage((error as Error).message); return undefined } finally { setSaving(false) }
  }
  const deleteP5Inventory = async (batchId: string) => {
    if (!layout) return false
    try { await request<void>(`/api/owner/refrigerators/${layout.refrigerator_id}/inventory/${batchId}`, { method: 'DELETE' }); const nextInventory = inventory.filter(item => item.id !== batchId); const nextHomeInventory = homeInventory.filter(item => item.id !== batchId); setInventory(nextInventory); setHomeInventory(nextHomeInventory); updateWorkspaceCache({ inventory: nextInventory, homeInventory: nextHomeInventory }); setRecipeRefreshNonce(value => value + 1); return true } catch (error) { setMessage((error as Error).message); return false }
  }

  const beginInventoryMove = (items: InventoryBatch[], selectedIcons: Icon[], returnView: 'inventory' | 'search') => {
    setMoveItems(items)
    setMoveIcons(selectedIcons)
    setMoveReturnView(returnView)
  }
  const completeInventoryMove = async () => {
    const activeFridge = currentFridgeForAction()
    if (moveReturnView === 'inventory') await loadInventoryWorkspace(activeFridge, true)
    else setInventorySearchRefreshNonce(value => value + 1)
    setMoveItems([])
  }

  const currentPath = window.location.pathname
  if (currentPath === '/fridge/pair') return <FridgePairingCode />
  if (currentPath.startsWith('/fridge')) return <EinkDisplayGate />
  if (scanning) return <PwaScanner onClose={() => setScanning(false)} />
  if (bootstrapToken) return <BootstrapPairing token={bootstrapToken} onScan={() => setScanning(true)} />
  if (pairToken && !isStandalone()) return <InstallationGuide />
  if (pairedRefrigerator) return <PairingSuccess refrigerator={pairedRefrigerator} />
  if (ownerState === 'loading' && initialFridges.length && !layout) return <PageShell className="p7-shell" header={<AppHeader title={<HeaderTitle title={initialRefrigerator?.name ?? '首页'} refreshState="loading" />} />} bodyClassName="owner-start-content"><p>正在读取首页数据…</p></PageShell>
  if (ownerState === 'loading' && !layout) return <PageShell className="owner-start" header={<AppHeader />} bodyClassName="owner-start-content"><p>正在准备…</p></PageShell>
  if (ownerState === 'signed-out') return <PageShell className="owner-start" header={<AppHeader />} bodyClassName="owner-start-content"><h1>管理你的冰箱</h1><p>登录后可创建冰箱、编辑库存和管理设备。</p><button onClick={startOwnerLogin}>登录 flycn</button>{message && <p className="notice" role="status">{message}</p>}</PageShell>
  if (p7View === 'me') return <MeHome onNotifications={() => { if (layout) setP7View('notifications'); else setMessage('请先选择一台冰箱。') }} onAbout={() => setP7View('about')} onHome={() => setP7View(layout ? 'home' : 'switcher')} onRecipes={() => setP7View(layout ? 'recipes' : 'switcher')} onFridge={() => setP7View('switcher')} />
  if (p7View === 'about') return <AboutHelp onBack={() => setP7View('me')} />
  if (!layout && fridges.length && p7View === 'home') return <PageShell className="p7-shell" header={<AppHeader title={<HeaderTitle title={selectStartupRefrigerator(fridges, window.localStorage.getItem(LAST_REFRIGERATOR_STORAGE_KEY))?.name ?? fridges[0].name} refreshState="loading" />} />} bodyClassName="owner-start-content"><p>正在读取首页数据…</p></PageShell>
  if (!layout && (creating || setupStep !== 'none' || (!fridges.length && p7View !== 'switcher' && p7View !== 'deleted'))) {
    const step = setupStep === 'none' ? 'setup' : setupStep
    const currentDraft = draftLayout ?? (selectedTemplate ? makeDraftLayout(selectedTemplate) : null)
    const leaveSetup = () => { setSetupStep('none'); setCreating(false); setDraftLayout(null); setActiveZoneKey('') }
    if (step === 'setup') return <PageShell className="p4-flow" header={<PageHeader title="名称与布局" onBack={fridges.length ? leaveSetup : undefined} right={<span className="flow-step">1 / 2</span>} />} bodyClassName="p4-content setup-content" footer={<footer className="bottom-action-bar"><button disabled={!selectedTemplate || !name.trim()} onClick={() => { if (!selectedTemplate) return; const next = draftLayout ?? makeDraftLayout(selectedTemplate); setDraftLayout(next); setActiveZoneKey(next.zones[0]?.key ?? ''); setSetupStep('editor') }}>使用这个布局</button></footer>}><label className="fridge-name-field"><span>冰箱名称</span><input value={name} onChange={event => setName(event.target.value)} required maxLength={120} /></label>
        {currentDraft && <div className="setup-preview-group"><FridgePreviewFrame variant="setup" className="setup-preview" layout={currentDraft} /><p className="layout-caption">{templateCaption(currentDraft.template_key)}</p></div>}
        <section className="template-section"><h2>选择外形</h2><div className="template-grid">{templates.map(template => <TemplateSilhouette key={template.key} template={template} selected={template.key === templateKey} onSelect={() => { setTemplateKey(template.key); setDraftLayout(makeDraftLayout(template)); setActiveZoneKey(template.zones[0]?.key ?? '') }} />)}</div></section>
      </PageShell>
    if (!currentDraft) return null
    return <PageShell className="p4-flow" header={<PageHeader title="布局方案" onBack={() => setSetupStep('setup')} right={<span className="flow-step">2 / 2</span>} />} bodyClassName="p4-content editor-content" footer={<footer className="bottom-action-bar"><p>创建后仍可在手机端调整布局</p><button disabled={saving} onClick={() => void createRefrigerator()}>{saving ? '创建中…' : '创建冰箱'}</button></footer>}><LayoutPlanEditor layout={currentDraft} template={selectedTemplate} activeZoneKey={activeZoneKey} onSelectZone={setActiveZoneKey} onChangeSlots={changeSlots} onChangeTemperature={changeTemperature} /></PageShell>
  }
  if (!layout && p7View === 'deleted') return <RecentlyDeleted onBack={() => setP7View('switcher')} onRestore={restoreRefrigerator} />
  if (settingsLoading) return <FridgeSettingsLoading onBack={() => { settingsRequestId.current += 1; setSettingsLoading(false); setP7View(settingsReturn) }} />
  if (!layout) return <FridgeSwitcher fridges={fridges} currentId="" onSelect={fridge => void openLayout(fridge)} onSettings={fridge => void openSettings(fridge, 'switcher')} onBack={() => setP7View('switcher')} onCreate={() => beginRefrigeratorCreation(false)} onDeleted={() => setP7View('deleted')} onRecipes={() => setMessage('请先选择一台冰箱。')} onMe={() => setP7View('me')} onRefresh={refreshFridgeList} />
  const currentFridge = fridges.find(fridge => fridge.id === layout.refrigerator_id)
  if (!currentFridge) return null
  if (p7View === 'switcher') return <FridgeSwitcher fridges={fridges} currentId={currentFridge.id} onSelect={fridge => void openLayout(fridge)} onSettings={fridge => void openSettings(fridge, 'switcher')} onBack={() => setP7View('home')} onCreate={() => beginRefrigeratorCreation(true)} onDeleted={() => setP7View('deleted')} onRecipes={() => setP7View('recipes')} onMe={() => setP7View('me')} onRefresh={refreshFridgeList} />
  if (p7View === 'deleted') return <RecentlyDeleted onBack={() => setP7View('switcher')} onRestore={restoreRefrigerator} />
  if (p7View === 'settings') return <FridgeSettings refrigerator={currentFridge} layout={layout} devices={devices} onBack={() => setP7View(settingsReturn)} onNameAndLayout={() => setP7View('name-layout')} onExpiry={() => setP7View('expiry')} onRemove={id => void removeDevice(id)} onDelete={deleteCurrentRefrigerator} />
  if (p7View === 'name-layout') return <NameAndLayout refrigerator={currentFridge} layout={layout} templates={templates} onBack={() => setP7View('settings')} onRename={renameCurrentRefrigerator} onLayout={() => setP7View('layout-editor')} />
  if (p7View === 'layout-editor') return <ExistingLayoutEditor layout={layout} template={templates.find(template => template.key === layout.template_key)} saving={saving} onBack={() => setP7View('name-layout')} onSave={nextLayout => void saveExistingLayout(nextLayout)} />
  if (p7View === 'notifications') return <NotificationSettings refrigerator={currentFridge} settings={notificationSettings} onSave={saveNotificationSettings} onBack={() => setP7View('me')} />
  if (p7View === 'expiry') return <ExpirySettingsPage refrigerator={currentFridge} expiry={expiry} onSaveExpiry={saveExpirySettings} onBack={() => setP7View('settings')} />
  if (p7View === 'inventory') return <><InventoryFlow layout={layout} categories={categories} icons={icons} inventory={inventory} refrigerator={currentFridge} saving={saving} initialSlotId={inventorySlotId} initialItemId={inventoryItemId} initialView={inventoryMode} onBack={() => { setInventorySlotId(undefined); setInventoryItemId(undefined); setInventoryMode('add'); setP7View('home') }} onSelectFridge={fridge => void openLayout(fridge)} onCreateCategory={createP5Category} onCatalogChanged={async () => { await loadInventoryWorkspace(currentFridge) }} onSave={saveP5Inventory} onDelete={deleteP5Inventory} onMoveSelected={items => beginInventoryMove(items, icons, 'inventory')} />{moveItems.length > 0 && <InventoryMoveFlow items={moveItems} icons={moveIcons} refrigerators={fridges} currentRefrigeratorId={currentFridge.id} onClose={() => setMoveItems([])} onComplete={completeInventoryMove} />}</>
  if (p7View === 'search') return <><InventorySearch key={inventorySearchRefreshNonce} query={searchQuery} fridges={fridges} onBack={() => setP7View('home')} onSelectFridge={fridge => void openLayout(fridge)} onOpenItem={result => void openSearchResult(result)} onMoveSelected={(items, selectedIcons) => beginInventoryMove(items, selectedIcons, 'search')} />{moveItems.length > 0 && <InventoryMoveFlow items={moveItems} icons={moveIcons} refrigerators={fridges} currentRefrigeratorId={currentFridge.id} onClose={() => setMoveItems([])} onComplete={completeInventoryMove} />}</>
  if (p7View === 'recipes') return <RecipeWorkspace refrigerator={currentFridge} icons={icons} inventory={inventory} refreshNonce={recipeRefreshNonce} onBack={() => setP7View('home')} onFridge={() => setP7View('switcher')} onMe={() => setP7View('me')} onInventoryChanged={() => loadInventoryWorkspace(currentFridge, true)} />
  return <FridgeHome refrigerator={currentFridge} layout={layout} homeInventory={homeInventory} icons={icons} notice={message} notifications={dueNotifications} refreshState={refreshState} refreshError={refreshError} installEvent={installEvent} installed={pwaInstalled} onInstallEventConsumed={() => setInstallEvent(null)} onAdd={() => { setInventorySlotId(undefined); setInventoryItemId(undefined); setInventoryMode('add'); setP7View('inventory') }} onInventory={() => { setInventorySlotId(undefined); setInventoryItemId(undefined); setInventoryMode('list'); setP7View('inventory') }} onSlot={slotId => { setInventorySlotId(slotId); setInventoryItemId(undefined); setInventoryMode('list'); setP7View('inventory') }} onManage={() => { setSettingsReturn('home'); setP7View('settings') }} onSwitch={() => setP7View('switcher')} onRefresh={() => loadInventoryWorkspace(currentFridge, true)} onRecipes={() => setP7View('recipes')} onMe={() => setP7View('me')} onSearch={query => { setSearchQuery(query); setP7View('search') }} />
}
