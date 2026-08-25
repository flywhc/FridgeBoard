/** FridgeBoard 的所有者登录、P4 建冰箱/布局编辑和 P3 设备访问页。 */
import { CSSProperties, Fragment, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { IScannerControls } from '@zxing/browser'
import packageInfo from '../package.json'
import { APP_RELEASE } from './release'
import { selectStartupRefrigerator } from './startupRefrigerator'
import { getPwaInstallPromptMode } from './pwaInstallPrompt'
import { refreshPwaCache } from './pwaCache'
import { getFoodIconPositions } from './fridgeFoodLayout'
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
import { EmptyOwnerHome } from './pairingOnboarding'
import { FridgeDeviceBinding } from './FridgeDeviceBinding'
import { isStandalone, request } from './appApi'
import { clearPageCaches, inventorySearchCacheKey, readPageCache, removePageCache, refrigeratorListCacheKey, refrigeratorWorkspaceCacheKey, removeRefrigeratorPageCaches, shouldRefreshCachedPage, writePageCache, type CacheSnapshot } from './pageCache'
import { getDeviceListState, type Category, type Device, type DeviceListState, type DueNotification, type ExpirySettings, type Icon, type InventoryBatch, type Layout, type NotificationSettings, type Refrigerator, type Template } from './appTypes'
import { getCameraErrorMessage } from './camera'
import { AppHeader, CategoryIcon, ConfirmDialog, Dialog, HeaderTitle, InstallationGuide, P7Navigation, PageHeader, PageShell, type RefreshState } from './sharedUi'
import { clearPairingParametersFromAddressBar, isPairingQrUrlFromDifferentOrigin, PAIRING_QR_DIFFERENT_ORIGIN_MESSAGE, parsePairingQrUrl, readPairingIntent, savePairingIntent, type PairingIntent, type PairingQr } from './pairingFlow'
import { APP_DEEP_LINK_EVENT, takePendingPairing } from './deepLink'
import { appRuntime, isAndroidRuntime, resolveApiUrl } from './runtime'
import { clearRuntimeAssetCache } from './runtimeAssetCache'
import { addMobileDeviceToken, beginMobileLogin, isMobileAuthProcessing, logoutMobileSession, MOBILE_AUTH_COMPLETED_EVENT, MOBILE_AUTH_PROGRESS_EVENT, takeMobileAuthError } from './mobileAuth'
import { setActiveMobileDeviceRefrigerator } from './secureSession'
import { DISPLAY_BINDING_POLL_INTERVAL_MS, DISPLAY_BINDING_TIMEOUT_MS, getActiveDisplayDevice, getDisplayBindingSummary, isDisplayBindingComplete, type DisplayDeviceBindRequest, type DisplayPasscodeRequest, type DisplayPasscodeResult, type DisplayQrScanRequest } from './fridgeDeviceBinding.logic'
import { getFridgeStatusSummary } from './fridgeStatus'
import { getRefrigeratorCapabilities, getRefrigeratorWorkspacePath, toRefrigerator, type RefrigeratorSummaryResponse } from './refrigeratorAccess'
import { upsertInventoryBatch } from './inventoryListUtils'
import type { InventoryExpiryStatus } from './inventoryListFilters'
import { getFridgeSwipeTransitionClass, PAGE_TRANSITION_DURATION_MS, type FridgeSwipeTransitionPhase } from './pageTransition'
import { getCircularSwipeIndex, type HorizontalSwipeDirection } from './swipeGesture'
import { applyRefrigeratorOrder, getRefrigeratorDropPosition, reorderRefrigeratorIds, type RefrigeratorDropPosition } from './fridgeOrdering'
import { ThemePreferencesPage, ThemeSettingsPage } from './themeSettings'
import { setTheme, THEME_REGISTRY, useTheme, type ThemeKey } from './theme'
import { useHorizontalSwipeHandlers } from './horizontalSwipe'
import { checkForAndroidUpdate, installAndroidUpdate, markAndroidUpdateCheck, openInstallSettings, shouldAutoCheckAndroidUpdate, type AndroidUpdateCheck } from './appUpdate'
import { subscribeApkUpdate } from './nativeBridge'

const LAST_REFRIGERATOR_STORAGE_KEY = 'fb-last-refrigerator-id'
const PWA_INSTALL_DISMISSED_STORAGE_KEY = 'fb-pwa-install-dismissed'
const APP_NAME = '家常食橱'
const APP_VERSION = packageInfo.version

type WorkspaceCache = { refrigerator: Refrigerator; layout: Layout; categories: Category[]; icons: Icon[]; inventory: InventoryBatch[]; homeInventory: InventoryBatch[]; expiry: ExpirySettings; notificationSettings: NotificationSettings }
type FridgeListCache = { fridges: Refrigerator[]; summaries: Record<string, { template: string; foods: number }>; layouts: Record<string, Layout>; deletedCount: number }
type AuthenticationStatusResponse = { authenticated: boolean }
type DisplayBindingState = 'idle' | 'pending' | 'timeout'
type DisplayBindingStatus = { refrigeratorId: string; state: Exclude<DisplayBindingState, 'idle'>; deadline: number; previousDisplayDeviceId?: string }

function initialPageCache<T>(key: string): CacheSnapshot<T> | null {
  return readPageCache<T>(key)
}

async function fetchFridgeOverview(fridges: Refrigerator[]): Promise<Pick<FridgeListCache, 'summaries' | 'layouts' | 'deletedCount'>> {
  const [items, deleted] = await Promise.all([
    Promise.all(fridges.map(async fridge => {
      const workspacePath = (resource: 'layout' | 'inventory') => getRefrigeratorWorkspacePath(fridge, resource)
      const [layout, inventory] = await Promise.all([
        request<Layout>(workspacePath('layout')).catch(() => null),
        request<InventoryBatch[]>(`${workspacePath('inventory')}?include_zero=false`).catch(() => null),
      ])
      return {
        id: fridge.id,
        layout,
        summary: {
          template: layout ? (layout.template_key === 'mini' ? '迷你冰箱' : '已配置布局') : (fridge.setup_status === 'needs_layout' ? '待完成布局' : '已配置布局'),
          foods: inventory?.reduce((total, item) => total + item.quantity, 0) ?? 0,
        },
      }
    })),
    request<Refrigerator[]>('/api/owner/refrigerators/deleted').catch(() => []),
  ])
  return {
    summaries: Object.fromEntries(items.map(item => [item.id, item.summary])),
    layouts: items.reduce<Record<string, Layout>>((result, item) => {
      if (item.layout) result[item.id] = item.layout
      return result
    }, {}),
    deletedCount: deleted.length,
  }
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
  return <Dialog title={isAppleGuide ? '添加到主屏幕' : '先装到手机'} onClose={close} closeLabel="关闭安装提示" className="pwa-install-modal" dialogClassName="pwa-install-dialog">
      <p>{isAppleGuide ? '这是一个网页应用，为了安装它，请先在Safari中点击菜单“共享”或“分享”按钮，再选择“添加到主屏幕”。' : '安装后，在应用内再扫一次冰箱上的二维码即可连接。'}</p>
      {!isAppleGuide && <ol className="pwa-install-steps" aria-label="Android 安装步骤">
        <li><span aria-hidden="true">⋮</span><b>浏览器菜单</b></li>
        <li aria-hidden="true">›</li>
        <li><span aria-hidden="true">⇩</span><b>安装应用</b></li>
        <li aria-hidden="true">›</li>
        <li><span aria-hidden="true">✓</span><b>完成安装</b></li>
      </ol>}
      <label className="pwa-install-dismiss"><input type="checkbox" checked={dontRemind} onChange={event => setDontRemind(event.target.checked)} />不再提醒</label>
  </Dialog>
}

function AndroidInstallPrompt({ close, dontRemind, onDontRemindChange, onInstall }: { close: () => void; dontRemind: boolean; onDontRemindChange: (value: boolean) => void; onInstall?: () => void }) {
  return <Dialog title="安装家常食橱" onClose={close} closeLabel="关闭安装提示" className="pwa-install-modal" dialogClassName="pwa-install-dialog">
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
  </Dialog>
}

function AndroidShortcutIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 6.5h10a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 17 16.5H7A1.5 1.5 0 0 1 5.5 15V8A1.5 1.5 0 0 1 7 6.5Z" />
    <path d="M9.5 20h5M12 16.5V20" />
    <path d="M3.5 2.5v5M1.5 5.5l2 2 2-2" />
  </svg>
}

/** 在已安装 PWA 中调用浏览器原生二维码检测，成功后进入首次绑定领取页。 */
function PwaScanner({ onClose, targetRefrigeratorId, displayBindingPurpose, onScanResult }: { onClose: () => void; targetRefrigeratorId?: string; displayBindingPurpose?: 'bind_display_device' | 'replace_display_device'; onScanResult?: (parsed: PairingQr) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [message, setMessage] = useState('正在打开相机…')
  const pairingOrigin = appRuntime.apiOrigin ?? window.location.origin
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
            const scannedText = result.getText()
            if (isPairingQrUrlFromDifferentOrigin(scannedText, pairingOrigin)) {
              setMessage(PAIRING_QR_DIFFERENT_ORIGIN_MESSAGE)
              return
            }
            const parsed = parsePairingQrUrl(scannedText, pairingOrigin)
            if (!parsed) { setMessage('这不是家常食橱可识别的冰箱二维码。'); return }
            if (onScanResult) {
              controls?.stop()
              onScanResult(parsed)
              return
            }
            savePairingIntent(window.sessionStorage, { ...parsed, targetRefrigeratorId, displayBindingPurpose })
            controls?.stop()
            const parameter = parsed.kind === 'bootstrap' ? 'bootstrap' : 'token'
            window.location.assign(resolveApiUrl(`/pair?${parameter}=${encodeURIComponent(parsed.token)}`, appRuntime))
          } catch { setMessage('无法识别该二维码，请对准冰箱端页面后重试。') }
        })
        setMessage('将冰箱端上的二维码放入取景框。')
      } catch (error) {
        if (active) {
          setMessage(getCameraErrorMessage(error, {
            isSecureContext: window.isSecureContext,
            hasGetUserMedia: Boolean(navigator.mediaDevices?.getUserMedia),
          }))
        }
      }
    }
    void start()
    return () => { active = false; controls?.stop() }
  }, [displayBindingPurpose, onScanResult, pairingOrigin, targetRefrigeratorId])
  return <PageShell className="scanner-screen" header={<PageHeader title="扫描冰箱端二维码" onBack={onClose} />} bodyClassName="scanner-content"><div className="camera-frame"><video ref={videoRef} muted playsInline /><i /></div><p role="status">{message}</p></PageShell>
}

/** 当前冰箱首页：按物理位置展示库存，切换冰箱时只使用对应布局和批次。 */
function FoodIconCluster({ items, icons, layoutKind }: { items: InventoryBatch[]; icons: Icon[]; layoutKind: 'vertical' | 'single_row' }) {
  const clusterRef = useRef<HTMLSpanElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const element = clusterRef.current
    if (!element) return
    const updateSize = () => {
      const { width, height } = element.getBoundingClientRect()
      setSize(current => current.width === width && current.height === height ? current : { width, height })
    }
    updateSize()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateSize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const positions = getFoodIconPositions(items.map(item => item.id), { layoutKind, width: size.width || undefined, height: size.height || undefined })
  return <span className="p7-food-cluster" ref={clusterRef}>{items.map((item, index) => {
    const position = positions[index]
    return <span className={`p7-food ${item.expiry_status === 'expired' ? 'is-expired' : item.expiry_status === 'expiring' ? 'is-expiring' : ''}`} key={item.id} style={{ '--food-x': position.x, '--food-y': position.y } as CSSProperties} title={`${item.item_name} ×${item.quantity}`}><CategoryIcon iconKey={item.icon_key} icons={icons} />{item.quantity > 1 && <b>{item.quantity}</b>}</span>
  })}</span>
}

function getVisibleNotifications(notifications: DueNotification[], inventory: InventoryBatch[]): DueNotification[] {
  const visible = new Map(notifications.map(item => [item.kind, item]))
  const atRiskNames = inventory
    .filter(item => item.quantity > 0 && (item.expiry_status === 'expiring' || item.expiry_status === 'expired'))
    .map(item => item.item_name)
  if (atRiskNames.length) {
    const preview = atRiskNames.slice(0, 2).join('、')
    const suffix = atRiskNames.length > 2 ? `等 ${atRiskNames.length} 件` : `共 ${atRiskNames.length} 件`
    visible.set('food', { kind: 'food', title: '有物品需要留意', body: `${preview}临期或已过期，${suffix}。` })
  }
  return [...visible.values()]
}

export function FridgeHome({ refrigerator, layout, homeInventory, icons, notifications, refreshState, refreshError, installEvent, installed, onInstallEventConsumed, onScan, onInventory, onSlot, onFridgeList, onSwipeFridge, fridgeSwipeTransition, onRefresh, onRecipes, onShopping, onMe, onSearch }: { refrigerator: Refrigerator; layout: Layout; homeInventory: InventoryBatch[]; icons: Icon[]; notifications: DueNotification[]; refreshState: RefreshState; refreshError: string; installEvent: BeforeInstallPromptEvent | null; installed: boolean; onInstallEventConsumed: () => void; onScan: () => void; onInventory: () => void; onSlot: (slotId: string) => void; onFridgeList: () => void; onSwipeFridge?: (direction: HorizontalSwipeDirection) => void; fridgeSwipeTransition?: { direction: HorizontalSwipeDirection; phase: FridgeSwipeTransitionPhase } | null; onRefresh: () => void; onRecipes: () => void; onShopping: () => void; onMe: () => void; onSearch: (query: string) => void }) {
  const openShopping = onShopping ?? (() => undefined)
  const activeHomeInventory = homeInventory.filter(item => item.quantity > 0)
  const visibleNotifications = getVisibleNotifications(notifications, homeInventory)
  const [searchQuery, setSearchQuery] = useState('')
  const submitSearch = () => { if (searchQuery.trim()) onSearch(searchQuery.trim()) }
  const swipeHandlers = useHorizontalSwipeHandlers(direction => onSwipeFridge?.(direction))
  return <PageShell className="p7-shell p7-top-level" onRefresh={onRefresh} refreshState={refreshState} header={<AppHeader title={<HeaderTitle title={refrigerator.name} onTitleClick={onFridgeList} refreshState={refreshState} refreshError={refreshError} />} left={<button type="button" className="p7-icon-button" onClick={onInventory} aria-label="查看全部物品列表"><svg className="p7-list-icon" data-icon="lucide:layout-list" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></svg></button>} right={<button type="button" className="p7-icon-button p6-scan-button" onClick={onScan} aria-label="扫码添加物品"><svg data-icon="lucide:scan-line" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" /><path d="M7 12h10" /></svg></button>} />} bodyClassName="p7-home-content" footer={<P7Navigation active="home" onHome={() => undefined} onRecipes={onRecipes} onShopping={openShopping} onMe={onMe} notificationCount={visibleNotifications.length} />}>
    <PwaInstallPrompt installEvent={installEvent} installed={installed} onInstallEventConsumed={onInstallEventConsumed} />
    <div className="p7-status"><form className="p7-inventory-search" onSubmit={event => { event.preventDefault(); submitSearch() }}><svg className="p7-search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg><input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="搜索所有冰箱" aria-label="搜索所有冰箱的物品" /></form></div>
    <FridgePreviewFrame variant="home" className={fridgeSwipeTransition ? getFridgeSwipeTransitionClass(fridgeSwipeTransition.direction, fridgeSwipeTransition.phase) : ''} layout={layout} onSelectSlot={onSlot} swipeHandlers={swipeHandlers} renderSlot={(slot, { layoutKind }) => {
      const slotItems = activeHomeInventory.filter(item => item.storage_slot_id === slot.id)
      return <FoodIconCluster items={slotItems} icons={icons} layoutKind={layoutKind} />
    }} />
  </PageShell>
}

/** 手机端“我的”一级页；只承载账号和本机偏好，不混入单台冰箱配置。 */
function MeHome({ theme, notificationCount, onNotifications, onAbout, onPreferences, onHome, onRecipes, onShopping, onSwitchAccount }: { theme: ThemeKey; notificationCount: number; onNotifications: () => void; onAbout: () => void; onPreferences: () => void; onHome: () => void; onRecipes: () => void; onShopping: () => void; onSwitchAccount?: () => void }) {
  const [confirmingSwitch, setConfirmingSwitch] = useState(false)
  const openShopping = onShopping
  return <>
    <PageShell className="p7-shell p7-top-level" header={<AppHeader title="我的" />} bodyClassName="p7-scroll p7-settings" footer={<P7Navigation active="me" onHome={onHome} onRecipes={onRecipes} onShopping={openShopping} onMe={() => undefined} notificationCount={notificationCount} />}>
      <section className="p7-me-identity"><b>当前登录账号</b><small>所有者</small></section>
      <section>
        <button type="button" className="p7-link-row" onClick={onNotifications}><span><b>通知</b><small>{notificationCount > 0 ? `有 ${notificationCount} 条消息待查看` : '查看食品和设备提示消息'}</small></span>{notificationCount > 0 && <b className="p7-link-badge" aria-label={`${notificationCount} 条通知`}>{notificationCount}</b>}<b aria-hidden="true">›</b></button>
        <button type="button" className="p7-link-row" onClick={onPreferences}><span><b>应用偏好</b><small>主题：{THEME_REGISTRY[theme].label}</small></span><b aria-hidden="true">›</b></button>
        <button type="button" className="p7-link-row" onClick={onAbout}><span><b>关于家常食橱</b><small>版本与帮助</small></span><b aria-hidden="true">›</b></button>
        {onSwitchAccount && <button type="button" className="p7-link-row" onClick={() => setConfirmingSwitch(true)}><span><b>切换登录账号</b><small>退出当前账号并重新输入用户名和密码</small></span><b aria-hidden="true">›</b></button>}
      </section>
    </PageShell>
    {confirmingSwitch && <ConfirmDialog title="确认切换登录账号" message="当前账号会在这台手机上退出，之后需要重新登录。确定继续吗？" confirmLabel="继续切换账号" onConfirm={() => { setConfirmingSwitch(false); onSwitchAccount?.() }} onCancel={() => setConfirmingSwitch(false)} />}
  </>
}

export function NotificationsPage({ refrigerator, notifications, onBack }: { refrigerator: Refrigerator; notifications: DueNotification[]; onBack: () => void }) {
  return <PageShell className="p7-shell" header={<PageHeader title="通知" onBack={onBack} />} bodyClassName="p7-scroll p7-notifications">
    <RefrigeratorContext name={refrigerator.name} />
    {notifications.length ? <section className="p7-notification-list" aria-label="通知列表">{notifications.map(item => <article className="p7-notification-item" key={`${item.kind}-${item.title}`}><span className="p7-notification-icon" aria-hidden="true">!</span><div><small>{item.kind === 'device_health' ? '设备提醒' : '食品提醒'}</small><h2>{item.title}</h2><p>{item.body}</p></div></article>)}</section> : <p className="p7-notification-empty">目前没有新的通知</p>}
  </PageShell>
}

function RefrigeratorContext({ name }: { name: string }) {
  return <p className="p7-context"><svg className="p7-context-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6.5 3.5h11A2.5 2.5 0 0 1 20 6v13.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a2.5 2.5 0 0 1 2.5-2.5Z" /><path d="M4 9.5h16M8 6v1M8 12v4" /></svg>{name}</p>
}

/** 关于与帮助页：展示版本，并提供清理应用壳和前端页面缓存的恢复入口。 */
function AboutHelp({ onBack }: { onBack: () => void }) {
  const isAndroid = isAndroidRuntime()
  const [refreshing, setRefreshing] = useState(false)
  const [message, setMessage] = useState('')
  const [updateState, setUpdateState] = useState<'idle' | 'checking' | 'available' | 'current' | 'downloading' | 'install-permission' | 'error'>('idle')
  const [updateCheck, setUpdateCheck] = useState<AndroidUpdateCheck | null>(null)
  const [updateMessage, setUpdateMessage] = useState('')
  const updateAbortRef = useRef<AbortController | null>(null)
  const checkUpdate = useCallback(async (force = false) => {
    if (!isAndroid) return
    if (!force && !shouldAutoCheckAndroidUpdate()) return
    updateAbortRef.current?.abort()
    const controller = new AbortController()
    updateAbortRef.current = controller
    markAndroidUpdateCheck()
    setUpdateState('checking')
    setUpdateMessage('正在检查最新版…')
    try {
      const result = await checkForAndroidUpdate(fetch, controller.signal)
      if (controller.signal.aborted) return
      setUpdateCheck(result)
      setUpdateState(result.available ? 'available' : 'current')
      setUpdateMessage(result.available ? `发现新版本 v${result.remote.version}` : '当前已是最新版。')
    } catch (error) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return
      setUpdateState('error')
      setUpdateMessage(error instanceof Error ? error.message : '检查更新失败，请确认网络连接后重试。')
    } finally {
      if (updateAbortRef.current === controller) updateAbortRef.current = null
    }
  }, [isAndroid])

  useEffect(() => {
    if (!isAndroid) return
    const checkTimer = window.setTimeout(() => void checkUpdate(), 0)
    const unsubscribe = subscribeApkUpdate(event => {
      if (event.state === 'installing') {
        setUpdateState('downloading')
        setUpdateMessage('下载完成，正在打开系统安装器…')
      } else {
        setUpdateState('error')
        setUpdateMessage(event.message || '下载或校验失败，请重试。')
      }
    })
    return () => {
      window.clearTimeout(checkTimer)
      updateAbortRef.current?.abort()
      unsubscribe()
    }
  }, [checkUpdate, isAndroid])

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
  const installUpdate = async () => {
    if (!updateCheck?.available) return
    setUpdateState('downloading')
    setUpdateMessage('正在下载最新版 APK…')
    try {
      await installAndroidUpdate(updateCheck.remote)
    } catch (error) {
      const nativeError = error as { code?: string; message?: string }
      if (nativeError.code === 'UNKNOWN_SOURCES_DISABLED') {
        setUpdateState('install-permission')
        setUpdateMessage('请先允许家常食橱安装未知来源应用。')
        return
      }
      setUpdateState('error')
      setUpdateMessage(nativeError.message || '下载或安装失败，请确认网络连接后重试。')
    }
  }
  const configureInstallPermission = async () => {
    try {
      await openInstallSettings()
    } catch {
      setUpdateState('error')
      setUpdateMessage('无法打开系统安装权限设置，请在系统设置中允许本应用安装未知应用。')
    }
  }
  return <PageShell className="p7-shell p7-about-shell" header={<PageHeader title="关于与帮助" onBack={onBack} />} bodyClassName="p7-scroll p7-about">
    <section className="p7-about-identity"><img src="/icon-192-ice3.png" alt="" /><h2>{APP_NAME}</h2><p>家庭冰箱库存与食谱管理</p></section>
    <section className="p7-about-version"><span>应用版本</span><b>v{APP_VERSION} · release {APP_RELEASE}</b></section>
    {isAndroid ? <section className="p7-about-update" aria-label="Android 应用更新"><p>检查签名 APK 的最新版，下载完成后由 Android 系统确认安装。</p><p className="p7-about-update-status" role="status">{updateMessage}</p>{updateState === 'available' && updateCheck && <><p className="p7-about-update-notes">v{updateCheck.remote.version} · Build {updateCheck.remote.build_number}{updateCheck.remote.release_notes ? ` · ${updateCheck.remote.release_notes}` : ''}</p><button type="button" onClick={() => void installUpdate()}>下载并安装更新</button></>}{updateState === 'install-permission' && <button type="button" onClick={() => void configureInstallPermission()}>打开安装权限设置</button>}<button className="p7-about-secondary" type="button" onClick={() => void checkUpdate(true)} disabled={updateState === 'checking' || updateState === 'downloading'}>{updateState === 'checking' ? '检查中…' : '检查更新'}</button></section> : <section className="p7-about-help"><p>刷新会更新到最新版应用，并清理本应用的前端页面缓存。登录状态、冰箱数据和本机设置不会被删除。</p><button type="button" onClick={() => void refresh()} disabled={refreshing}>{refreshing ? '刷新中…' : '刷新应用'}</button>{message && <p className="p7-about-error" role="alert">{message}</p>}</section>}
  </PageShell>
}

/** P7.1 冰箱切换页，包含长按拖动排序和服务端顺序持久化后的列表展示。 */
export function FridgeSwitcher({ fridges, currentId, displayBindingStatus, onSelect, onContinueSetup, onSettings, onScan, onBack, onCreate, onDeleted, onReorder = () => undefined, onRefresh }: { fridges: Refrigerator[]; currentId: string; displayBindingStatus: DisplayBindingStatus | null; onSelect: (fridge: Refrigerator) => void; onContinueSetup: (fridge: Refrigerator) => void; onSettings: (fridge: Refrigerator) => void; onScan: () => void; onBack?: () => void; onCreate: () => void; onDeleted: () => void; onReorder?: (draggedId: string, targetId: string, position: RefrigeratorDropPosition) => void; onRecipes?: () => void; onMe?: () => void; onRefresh: () => Promise<void> }) {
  const cached = useMemo(() => readPageCache<FridgeListCache>(refrigeratorListCacheKey()), [])
  const [summaries, setSummaries] = useState<Record<string, { template: string; foods: number }>>(cached?.data.summaries ?? {})
  const [layouts, setLayouts] = useState<Record<string, Layout>>(cached?.data.layouts ?? {})
  const [deletedCount, setDeletedCount] = useState(cached?.data.deletedCount ?? 0)
  const [refreshState, setRefreshState] = useState<RefreshState>(cached?.isStale ? 'loading' : 'idle')
  const [refreshError, setRefreshError] = useState('')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropPosition, setDropPosition] = useState<{ targetId: string; position: RefrigeratorDropPosition } | null>(null)
  const cardRefs = useRef(new Map<string, HTMLElement>())
  const draggingIdRef = useRef<string | null>(null)
  const dragPointerIdRef = useRef<number | null>(null)
  const suppressClickRef = useRef(false)
  const finishDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const activeId = draggingIdRef.current
    if (activeId === null || dragPointerIdRef.current !== event.pointerId) return
    event.preventDefault()
    if (dropPosition) onReorder(activeId, dropPosition.targetId, dropPosition.position)
    suppressClickRef.current = true
    draggingIdRef.current = null
    dragPointerIdRef.current = null
    setDraggingId(null)
    setDropPosition(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>, fridgeId: string) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const card = event.currentTarget.closest<HTMLElement>('.p71-fridge-card')
    if (!card) return
    card.setPointerCapture(event.pointerId)
    draggingIdRef.current = fridgeId
    dragPointerIdRef.current = event.pointerId
    suppressClickRef.current = true
    setDraggingId(fridgeId)
    setDropPosition(null)
  }
  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (dragPointerIdRef.current !== event.pointerId) return
    const activeId = draggingIdRef.current
    if (activeId === null) return
    event.preventDefault()
    const targets = fridges.flatMap(fridge => {
      const element = cardRefs.current.get(fridge.id)
      if (!element) return []
      const rect = element.getBoundingClientRect()
      return [{ id: fridge.id, top: rect.top, bottom: rect.bottom }]
    })
    setDropPosition(getRefrigeratorDropPosition(event.clientY, targets, activeId))
  }
  const activateFridge = (fridge: Refrigerator, primaryAction: string | null) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    if (primaryAction === '继续设置') onContinueSetup(fridge)
    else onSelect(fridge)
  }
  const loadSummaries = useCallback(async (force = false) => {
    const overviewComplete = Boolean(cached && fridges.every(fridge => cached.data.summaries?.[fridge.id] && (fridge.setup_status === 'needs_layout' || cached.data.layouts?.[fridge.id])))
    if (!force && cached && !cached.isStale && overviewComplete) return
    setRefreshState('loading'); setRefreshError('')
    try {
      const overview = await fetchFridgeOverview(fridges)
      setSummaries(overview.summaries); setLayouts(overview.layouts); setDeletedCount(overview.deletedCount); setRefreshState('idle')
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
  const headerRight = <button className="p7-icon-button" type="button" onClick={onScan} aria-label="扫描冰箱二维码"><svg className="p71-scan-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2M18 14h2M14 18h6M14 20v-2" /></svg></button>
  const header = onBack
    ? <PageHeader title={<HeaderTitle title="我的冰箱" refreshState={refreshState} refreshError={refreshError} />} onBack={onBack} right={headerRight} />
    : <AppHeader title={<HeaderTitle title="我的冰箱" refreshState={refreshState} refreshError={refreshError} />} right={headerRight} />
  return <PageShell className="p7-shell p71-shell" onRefresh={refresh} refreshState={refreshState} header={header} bodyClassName="p7-scroll p71-list">
    <p className="p71-kicker">选择要管理的冰箱</p>
    {fridges.length === 0 && <p className="p71-empty">还没有冰箱。可以扫描冰箱二维码，或新建一台冰箱。</p>}
    {fridges.map(fridge => {
      const summary = getFridgeStatusSummary(fridge)
      const bindingState = displayBindingStatus?.refrigeratorId === fridge.id ? displayBindingStatus.state : 'idle'
      const bindingBadge = bindingState === 'pending' ? '绑定中' : summary.badge
      const bindingDetail = bindingState === 'pending'
        ? '正在绑定冰箱端'
        : bindingState === 'timeout'
          ? '绑定超时 · 请重试'
          : summary.detail
      return <Fragment key={fridge.id}>
        {dropPosition?.targetId === fridge.id && dropPosition.position === 'before' && <div className="p71-drop-indicator" aria-hidden="true" />}
        <article ref={element => { if (element) cardRefs.current.set(fridge.id, element); else cardRefs.current.delete(fridge.id) }} className={'p71-fridge-card ' + (fridge.id === currentId ? 'is-current ' : '') + (draggingId === fridge.id ? 'is-dragging' : '')} role="button" tabIndex={0} aria-label={(summary.primaryAction === '继续设置' ? '继续设置' : '打开') + fridge.name} aria-grabbed={draggingId === fridge.id} onPointerMove={handlePointerMove} onPointerUp={finishDrag} onPointerCancel={event => { suppressClickRef.current = false; finishDrag(event) }} onClick={() => activateFridge(fridge, summary.primaryAction)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activateFridge(fridge, summary.primaryAction) } }}>
        <div className="p71-leading-drag-source" data-pull-refresh-ignore="true" onPointerDown={event => handlePointerDown(event, fridge.id)}>
          <button className="p71-drag-handle" type="button" title="拖动排序" aria-label={'拖动排序' + fridge.name} onClick={event => { event.stopPropagation(); suppressClickRef.current = false }}><svg className="p71-drag-grip" viewBox="0 0 20 32" aria-hidden="true"><circle cx="6" cy="6" r="2" /><circle cx="14" cy="6" r="2" /><circle cx="6" cy="16" r="2" /><circle cx="14" cy="16" r="2" /><circle cx="6" cy="26" r="2" /><circle cx="14" cy="26" r="2" /></svg></button>
          <div className="p71-layout-drag-source" aria-hidden="true" onClick={event => { event.stopPropagation(); suppressClickRef.current = false }}>
            {layouts[fridge.id] ? <FridgePreviewFrame variant="thumbnail" layout={layouts[fridge.id]} /> : <i className="large-fridge" />}
          </div>
        </div>
        <span><b>{fridge.name}</b>{bindingBadge && <em className="p7-hatched">{bindingBadge}</em>}<small>{fridge.id === currentId ? '当前冰箱 · ' : ''}{bindingDetail} · {summaries[fridge.id]?.template ?? '正在读取布局'} · {summaries[fridge.id]?.foods ?? 0} 件物品</small></span>
        <button className="p71-card-action" type="button" onClick={event => { event.stopPropagation(); onSettings(fridge) }} aria-label={'设置' + fridge.name}>
          <svg className="p71-settings-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 0 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1.01-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 0-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
        </button>
        </article>
        {dropPosition?.targetId === fridge.id && dropPosition.position === 'after' && <div className="p71-drop-indicator" aria-hidden="true" />}
      </Fragment>
    })}
    <button className="p71-new-fridge" type="button" onClick={onCreate}>＋ 新建冰箱</button>
    {deletedCount > 0 && <button className="p71-deleted-link" type="button" onClick={onDeleted}>最近删除 {deletedCount} <span>›</span></button>}
  </PageShell>
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

export function FridgeSettings({ refrigerator, layout, deviceListState, displayBindingState = 'idle', onBack, onNameAndLayout, onDeviceBinding, onRetryDevices, onExpiry, onRemove, onDelete }: { refrigerator: Refrigerator; layout: Layout; deviceListState: DeviceListState; displayBindingState?: DisplayBindingState; onBack: () => void; onNameAndLayout: () => void; onDeviceBinding: () => void; onRetryDevices: () => void; onExpiry: () => void; onRemove: (id: string) => void; onDelete: () => Promise<string | null> }) {
  const [confirming, setConfirming] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')
  const devices = deviceListState.status === 'ready-data' ? deviceListState.devices : []
  const activeDevices = devices.filter(device => !device.revoked_at)
  const displayDevice = getActiveDisplayDevice(activeDevices)
  const displaySummary = displayBindingState === 'pending'
    ? { bound: false, title: '正在绑定', detail: '已识别二维码，等待冰箱端确认。', badge: '绑定中' }
    : displayBindingState === 'timeout'
      ? { bound: false, title: '绑定超时', detail: '未检测到冰箱端完成绑定，请确认冰箱在线后重试。', badge: '未连接' }
      : getDisplayBindingSummary(refrigerator, displayDevice)
  const phoneDevices = activeDevices.filter(device => device.kind !== 'kindle')
  const phoneAccessContent = deviceListState.status === 'loading'
    ? <p role="status" aria-live="polite">正在读取手机访问设备…</p>
    : deviceListState.status === 'error-retry'
      ? <div role="alert"><p>无法读取手机访问设备：{deviceListState.message}</p><button type="button" className="p7-outline" onClick={onRetryDevices}>重试</button></div>
      : phoneDevices.length
        ? phoneDevices.map(device => <article key={device.id}><i className="phone-icon" /><span><b>{device.is_current ? '本机' : device.label}</b><small>手机访问</small></span>{!device.is_current && <button onClick={() => onRemove(device.id)} aria-label={`移除 ${device.label}`}>移除</button>}</article>)
        : <p>还没有手机获得这台冰箱的访问权限。</p>
  if (confirming) return <PageShell className="p7-shell p71-shell" header={<PageHeader title="删除冰箱" onBack={() => setConfirming(false)} />} bodyClassName="p7-scroll p71-delete" footer={<footer className="bottom-action-bar p71-danger-bar"><button disabled={confirmation !== refrigerator.name} onClick={() => void onDelete().then(error => setMessage(error ?? ''))}>删除冰箱</button></footer>}><aside className="p71-alert"><b>这会立即断开所有设备</b><p>所有手机和冰箱端设备都会被撤销访问；冰箱将在 30 天内保留以便恢复。</p></aside><section><i className="large-fridge" /><div><b>{refrigerator.name}</b><small>{layout.zones.reduce((sum, zone) => sum + zone.slots.length, 0)} 个存放位置 · {devices.filter(device => !device.revoked_at).length} 台设备</small></div></section><label>输入“{refrigerator.name}”确认删除<input autoFocus value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>{message && <p className="claim-error" role="alert">{message}</p>}</PageShell>
  return <PageShell className="p7-shell p71-shell" header={<PageHeader title="冰箱设置" onBack={onBack} />} bodyClassName="p7-scroll p71-settings">
      <section className="p71-fridge-identity"><i className="large-fridge" /><b>{refrigerator.name}</b><small>{layout.template_key === 'mini' ? '迷你冰箱' : '已配置冰箱布局'}</small></section>
      <button className="p71-name-layout-link" onClick={onNameAndLayout}><span><b>名称与布局</b><small>修改冰箱名称，查看或编辑现有布局</small></span><b aria-hidden="true">›</b></button>
      <section className="p71-display-device"><h2>冰箱端设备</h2><article role={displayBindingState === 'pending' ? 'status' : undefined} aria-live={displayBindingState === 'pending' ? 'polite' : undefined}><i className="large-fridge" /><span><b>{displaySummary.title}</b><small>{displaySummary.detail}</small></span><b aria-label={displaySummary.badge}>{displaySummary.badge}</b></article><button type="button" className="p7-outline" disabled={displayBindingState === 'pending'} onClick={onDeviceBinding}>{displayBindingState === 'pending' ? '正在绑定…' : displaySummary.bound ? '更换冰箱端设备' : displayBindingState === 'timeout' ? '重新绑定冰箱端设备' : '绑定冰箱端设备'}</button></section>
      <section className="p71-access"><h2>手机访问</h2>{phoneAccessContent}</section>
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
  return <PageShell className="p7-shell" header={<PageHeader title="通知与权限" onBack={onBack} />} bodyClassName="p7-scroll p7-settings"><RefrigeratorContext name={refrigerator.name} /><section><div className="p7-setting-row"><span><b>每日临期提醒</b><small>每天最多一次</small></span><button className={`p7-switch ${draft.daily_reminder_enabled ? 'is-on' : ''}`} onClick={() => setDraft(value => ({ ...value, daily_reminder_enabled: !value.daily_reminder_enabled }))} aria-pressed={draft.daily_reminder_enabled}><i /></button></div><label className="p7-time">提醒时间<input type="text" inputMode="numeric" autoComplete="off" maxLength={5} placeholder="HH:MM" value={draft.reminder_time} disabled={!draft.daily_reminder_enabled} onChange={event => setDraft(value => ({ ...value, reminder_time: event.target.value }))} /></label><button className="p7-outline p10-notification-permission" onClick={() => void enableSystemNotification()}>启用系统通知</button><small className="p10-hint">未完成真机 Web Push 验证前，应用关闭或系统休眠时仅保证下次打开后的应用内提醒。</small></section><section><div className="p7-setting-row"><span><b>显示设备未更新提醒</b><small>若今天未完成同步，将与食品提醒一起出现</small></span><button className={`p7-switch ${draft.device_health_enabled ? 'is-on' : ''}`} onClick={() => setDraft(value => ({ ...value, device_health_enabled: !value.device_health_enabled }))} aria-pressed={draft.device_health_enabled}><i /></button></div></section>{notice && <p className="p7-saved" role="status">{notice}</p>}<button className="p7-primary" disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '保存设置'}</button></PageShell>
}

function ExpirySettingsPage({ refrigerator, expiry, onSaveExpiry, onBack }: { refrigerator: Refrigerator; expiry: ExpirySettings; onSaveExpiry: (value: ExpirySettings) => Promise<string | null>; onBack: () => void }) {
  const [draft, setDraft] = useState(expiry)
  const [saved, setSaved] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const save = async () => { setSaving(true); setSaved(''); setError(''); const failure = await onSaveExpiry(draft); if (failure) setError(failure); else setSaved('设置已保存。'); setSaving(false) }
  return <PageShell className="p7-shell" header={<PageHeader title="临期规则" onBack={onBack} />} bodyClassName="p7-scroll p7-settings"><RefrigeratorContext name={refrigerator.name} /><section><p>进入最后 <b>{draft.ratio_percent}%</b> 有效期时提醒；至少提前 {draft.minimum_days} 天，最多提前 {draft.maximum_days} 天。</p><label>提醒阈值<input type="range" min="1" max="100" value={draft.ratio_percent} onChange={event => setDraft({ ...draft, ratio_percent: Number(event.target.value) })} /><output>{draft.ratio_percent}%</output></label><div className="p7-step-row"><span>最少提前</span><button onClick={() => setDraft({ ...draft, minimum_days: Math.max(1, draft.minimum_days - 1) })}>−</button><b>{draft.minimum_days} 天</b><button onClick={() => setDraft({ ...draft, minimum_days: Math.min(draft.maximum_days, draft.minimum_days + 1) })}>＋</button></div><div className="p7-step-row"><span>最多提前</span><button onClick={() => setDraft({ ...draft, maximum_days: Math.max(draft.minimum_days, draft.maximum_days - 1) })}>−</button><b>{draft.maximum_days} 天</b><button onClick={() => setDraft({ ...draft, maximum_days: Math.min(14, draft.maximum_days + 1) })}>＋</button></div></section><p className="p7-help">未填写 BBD 的食物不会收到临期或过期提醒。</p>{saved && <p className="p7-saved" role="status">{saved}</p>}{error && <p className="claim-error" role="alert">{error}</p>}<button className="p7-primary" disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '保存设置'}</button></PageShell>
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
  const theme = useTheme()
  const initialFridgeCache = initialPageCache<FridgeListCache>(refrigeratorListCacheKey())
  const initialFridges = applyRefrigeratorOrder(initialFridgeCache?.data.fridges ?? [])
  const initialSavedId = window.localStorage.getItem(LAST_REFRIGERATOR_STORAGE_KEY)
  const initialRefrigerator = selectStartupRefrigerator(initialFridges, initialSavedId)
  const initialWorkspaceCache = initialRefrigerator ? initialPageCache<WorkspaceCache>(refrigeratorWorkspaceCacheKey(initialRefrigerator.id)) : null
  const initialInventory = initialWorkspaceCache?.data.inventory ?? []
  const initialHomeInventory = initialWorkspaceCache?.data.homeInventory ?? initialInventory.filter(item => item.quantity > 0)
  const [message, setMessage] = useState(() => takeMobileAuthError() ?? '')
  const forceMobileLoginRef = useRef(false)
  const [mobileLoginPending, setMobileLoginPending] = useState(() => isMobileAuthProcessing())
  const [ownerState, setOwnerState] = useState<'loading' | 'signed-in' | 'signed-out'>('loading')
  const [fridges, setFridges] = useState<Refrigerator[]>(initialFridges)
  const fridgesRef = useRef<Refrigerator[]>(initialFridges)
  const [templates, setTemplates] = useState<Template[]>([])
  const [name, setName] = useState('家里冰箱')
  const [templateKey, setTemplateKey] = useState('top_freezer_single')
  const [layout, setLayout] = useState<Layout | null>(initialWorkspaceCache?.data.layout ?? null)
  const [setupStep, setSetupStep] = useState<'none' | 'setup' | 'editor'>('none')
  const [draftLayout, setDraftLayout] = useState<Layout | null>(null)
  const [activeZoneKey, setActiveZoneKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [deviceListState, setDeviceListState] = useState<DeviceListState>({ status: 'loading', devices: [] })
  const [deviceFridgeId, setDeviceFridgeId] = useState('')
  const [categories, setCategories] = useState<Category[]>(initialWorkspaceCache?.data.categories ?? [])
  const [inventory, setInventory] = useState<InventoryBatch[]>(initialInventory)
  const [homeInventory, setHomeInventory] = useState<InventoryBatch[]>(initialHomeInventory)
  const inventoryRef = useRef<InventoryBatch[]>(initialInventory)
  const homeInventoryRef = useRef<InventoryBatch[]>(initialHomeInventory)
  const [inventoryExpiryStatus, setInventoryExpiryStatus] = useState<InventoryExpiryStatus | undefined>()
  const [inventorySlotId, setInventorySlotId] = useState<string | undefined>()
  const [inventoryMode, setInventoryMode] = useState<'add' | 'list' | 'edit' | 'recognition'>('add')
  const [inventoryReturnView, setInventoryReturnView] = useState<'home' | 'search'>('home')
  const [inventoryItemId, setInventoryItemId] = useState<string | undefined>()
  const [searchQuery, setSearchQuery] = useState('')
  const [recipeRefreshAt, setRecipeRefreshAt] = useState(0)
  const [inventorySearchRefreshNonce, setInventorySearchRefreshNonce] = useState(0)
  const [moveItems, setMoveItems] = useState<InventoryBatch[]>([])
  const [moveIcons, setMoveIcons] = useState<Icon[]>([])
  const [moveReturnView, setMoveReturnView] = useState<'inventory' | 'search'>('inventory')
  const [icons, setIcons] = useState<Icon[]>(initialWorkspaceCache?.data.icons ?? [])
  const [incomingPairing, setIncomingPairing] = useState<PairingQr | null>(() => takePendingPairing())
  const pairToken = new URLSearchParams(window.location.search).get('token') ?? (incomingPairing?.kind === 'grant_pwa_access' ? incomingPairing.token : null)
  const bootstrapToken = new URLSearchParams(window.location.search).get('bootstrap') ?? (incomingPairing?.kind === 'bootstrap' ? incomingPairing.token : null)
  const pairingIntentResume = new URLSearchParams(window.location.search).get('pairing_intent') === 'resume'
  const [resumedPairingIntent] = useState<PairingIntent | null>(() => readPairingIntent(window.sessionStorage))
  const [scanning, setScanning] = useState(false)
  const [displayScanPending, setDisplayScanPending] = useState(false)
  const [scannerTarget, setScannerTarget] = useState<{ refrigeratorId?: string; purpose?: 'bind_display_device' | 'replace_display_device' }>({})
  const pendingScanResolver = useRef<((parsed: PairingQr | null) => void) | null>(null)
  const [p7View, setP7View] = useState<'home' | 'switcher' | 'deleted' | 'settings' | 'device-binding' | 'name-layout' | 'layout-editor' | 'notification-inbox' | 'notifications' | 'expiry' | 'inventory' | 'search' | 'recipes' | 'shopping' | 'me' | 'preferences' | 'theme-settings' | 'about'>(initialFridges.length ? 'home' : 'switcher')
  const [fridgeSwipeTransition, setFridgeSwipeTransition] = useState<{ direction: HorizontalSwipeDirection; phase: FridgeSwipeTransitionPhase } | null>(null)
  const [settingsReturn, setSettingsReturn] = useState<'home' | 'switcher'>('home')
  const [expiry, setExpiry] = useState<ExpirySettings>(initialWorkspaceCache?.data.expiry ?? { ratio_percent: 20, minimum_days: 1, maximum_days: 14 })
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(initialWorkspaceCache?.data.notificationSettings ?? { daily_reminder_enabled: true, reminder_time: '20:00', device_health_enabled: true })
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [dueNotifications, setDueNotifications] = useState<DueNotification[]>([])
  const visibleNotifications = getVisibleNotifications(dueNotifications, homeInventory)
  const [refreshState, setRefreshState] = useState<RefreshState>(initialWorkspaceCache?.isStale ? 'loading' : 'idle')
  const [refreshError, setRefreshError] = useState('')
  const [displayBindingStatus, setDisplayBindingStatus] = useState<DisplayBindingStatus | null>(null)
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [pwaInstalled, setPwaInstalled] = useState(() => isStandalone())
  const workspaceRefreshInFlight = useRef<Map<string, Promise<void>>>(new Map())
  const ownerLoadGeneration = useRef(0)
  const settingsRequestId = useRef(0)
  const deviceFridgeIdRef = useRef('')
  const activeWorkspaceIdRef = useRef(initialRefrigerator?.id ?? '')
  const fridgeSwipeInFlight = useRef(false)
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

  useEffect(() => {
    clearPairingParametersFromAddressBar(window.location, window.history)
  }, [])

  useEffect(() => {
    const handleDeepLink = () => {
      const pairing = takePendingPairing()
      if (pairing) setIncomingPairing(pairing)
    }
    window.addEventListener(APP_DEEP_LINK_EVENT, handleDeepLink)
    handleDeepLink()
    return () => window.removeEventListener(APP_DEEP_LINK_EVENT, handleDeepLink)
  }, [])

  const applyWorkspaceCache = (cached: WorkspaceCache) => {
    const cachedHomeInventory = cached.homeInventory ?? cached.inventory.filter(item => item.quantity > 0)
    setLayout(cached.layout); setCategories(cached.categories); setIcons(cached.icons); setInventory(cached.inventory); setHomeInventory(cachedHomeInventory); setExpiry(cached.expiry); setNotificationSettings(cached.notificationSettings)
    inventoryRef.current = cached.inventory
    homeInventoryRef.current = cachedHomeInventory
  }
  const updateWorkspaceCache = (patch: Partial<WorkspaceCache>) => {
    if (!layout) return
    const cached = readPageCache<WorkspaceCache>(refrigeratorWorkspaceCacheKey(layout.refrigerator_id))
    if (cached) writePageCache(refrigeratorWorkspaceCacheKey(layout.refrigerator_id), { ...cached.data, ...patch })
  }
  const refreshWorkspace = useCallback(async (fridge: Refrigerator): Promise<void> => {
    const inFlight = workspaceRefreshInFlight.current.get(fridge.id)
    if (inFlight) return inFlight
    const refresh = (async () => {
      if (activeWorkspaceIdRef.current === fridge.id) { setRefreshState('loading'); setRefreshError('') }
      try {
        const workspacePath = (resource: 'layout' | 'categories' | 'icons' | 'inventory') => getRefrigeratorWorkspacePath(fridge, resource)
        const isOwner = fridge.access_role === 'owner'
        const [savedLayout, savedCategories, savedIcons, savedInventory, savedHomeInventory, savedExpiry, savedNotificationSettings] = await Promise.all([
          request<Layout>(workspacePath('layout')),
          request<Category[]>(workspacePath('categories')),
          request<Icon[]>(workspacePath('icons')),
          request<InventoryBatch[]>(`${workspacePath('inventory')}?include_zero=true`),
          request<InventoryBatch[]>(`${workspacePath('inventory')}?include_zero=false`),
          isOwner ? request<ExpirySettings>(`/api/owner/refrigerators/${fridge.id}/expiry-settings`) : Promise.resolve<ExpirySettings>({ ratio_percent: 20, minimum_days: 1, maximum_days: 14 }),
          isOwner ? request<NotificationSettings>(`/api/owner/refrigerators/${fridge.id}/notification-settings`) : Promise.resolve<NotificationSettings>({ daily_reminder_enabled: true, reminder_time: '20:00', device_health_enabled: true }),
        ])
        const cached: WorkspaceCache = { refrigerator: fridge, layout: savedLayout, categories: savedCategories, icons: savedIcons, inventory: savedInventory, homeInventory: savedHomeInventory, expiry: savedExpiry, notificationSettings: savedNotificationSettings }
        writePageCache(refrigeratorWorkspaceCacheKey(fridge.id), cached)
        writePageCache(inventorySearchCacheKey(fridge.id), { inventory: savedInventory, icons: savedIcons })
        if (activeWorkspaceIdRef.current === fridge.id) applyWorkspaceCache(cached)
        if (activeWorkspaceIdRef.current === fridge.id) setRefreshState('idle')
      } catch (error) {
        if (activeWorkspaceIdRef.current === fridge.id) { setRefreshState('error'); setRefreshError((error as Error).message) }
        throw error
      } finally {
        workspaceRefreshInFlight.current.delete(fridge.id)
      }
    })()
    workspaceRefreshInFlight.current.set(fridge.id, refresh)
    return refresh
  }, [])
  const refreshFridgeList = useCallback(async (): Promise<void> => {
    const summaries = await request<RefrigeratorSummaryResponse[]>('/api/refrigerators')
    const loaded = applyRefrigeratorOrder(summaries.map(toRefrigerator))
    const overview = await fetchFridgeOverview(loaded)
    fridgesRef.current = loaded
    setFridges(loaded)
    const selectedId = layout?.refrigerator_id
    if (selectedId && !loaded.some(fridge => fridge.id === selectedId)) { removeRefrigeratorPageCaches(selectedId); setLayout(null); setP7View('switcher') }
    writePageCache(refrigeratorListCacheKey(), { fridges: loaded, ...overview })
  }, [layout?.refrigerator_id])
  const loadOwner = useCallback(async () => {
    const generation = ++ownerLoadGeneration.current
    const isCurrent = () => ownerLoadGeneration.current === generation
    try {
      // 首次启动必须在认证状态未知时闭合到未登录页，不能把旧服务端的 404 当作已登录。
      const authentication = await request<AuthenticationStatusResponse>('/api/auth/status').catch(error => {
        if ((error as Error & { status?: number }).status === 401) return { authenticated: false }
        throw error
      })
      if (!isCurrent()) return
      if (!authentication.authenticated) {
        clearPageCaches(); clearRuntimeAssetCache(); fridgesRef.current = []; setFridges([]); setLayout(null); setOwnerState('signed-out')
        return
      }
      const summaries = await request<RefrigeratorSummaryResponse[]>('/api/refrigerators')
      if (!isCurrent()) return
      const loaded = applyRefrigeratorOrder(summaries.map(toRefrigerator))
      fridgesRef.current = loaded
      setFridges(loaded)
      const previousListCache = readPageCache<FridgeListCache>(refrigeratorListCacheKey())
      writePageCache(refrigeratorListCacheKey(), {
        fridges: loaded,
        summaries: previousListCache?.data.summaries ?? {},
        layouts: previousListCache?.data.layouts ?? {},
        deletedCount: previousListCache?.data.deletedCount ?? 0,
      }, previousListCache?.savedAt)
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
      if (shouldRefreshCachedPage(cachedWorkspace, 'startup')) void refreshWorkspace(startupFridge).catch(() => undefined)
    } catch (error) {
      if (!isCurrent()) return
      const status = (error as Error & { status?: number }).status
      if (status === 401) {
        const hadDailyAccess = fridgesRef.current.some(fridge => fridge.access_role === 'daily_access')
        clearPageCaches(); clearRuntimeAssetCache(); fridgesRef.current = []; setFridges([]); setLayout(null); setOwnerState('signed-out')
        if (hadDailyAccess) setMessage('当前冰箱访问已撤销，请重新扫描冰箱二维码。')
      }
      else { setOwnerState('signed-in'); setRefreshState('error'); setRefreshError((error as Error).message) }
    }
  }, [refreshWorkspace])
  const reorderFridges = (draggedId: string, targetId: string, position: RefrigeratorDropPosition) => {
    const current = fridgesRef.current
    const ids = reorderRefrigeratorIds(current.map(fridge => fridge.id), draggedId, targetId, position)
    if (ids.every((id, index) => id === current[index]?.id)) return
    const byId = new Map(current.map(fridge => [fridge.id, fridge]))
    const next = ids.flatMap(id => {
      const fridge = byId.get(id)
      return fridge ? [fridge] : []
    })
    fridgesRef.current = next
    setFridges(next)
    const cached = readPageCache<FridgeListCache>(refrigeratorListCacheKey())
    if (cached) writePageCache(refrigeratorListCacheKey(), { ...cached.data, fridges: next })
    void request<void>('/api/owner/refrigerator-order', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refrigerator_ids: ids }) }).catch(async error => {
      setMessage(`冰箱顺序保存失败：${(error as Error).message}`)
      await refreshFridgeList().catch(() => undefined)
    })
  }
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void request<Template[]>('/api/refrigerator-templates').then(setTemplates).catch(error => setMessage(error.message))
      void loadOwner()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadOwner])
  useEffect(() => {
    const refreshAfterMobileLogin = () => {
      setMobileLoginPending(true)
      setOwnerState('loading')
      void loadOwner().finally(() => setMobileLoginPending(false))
    }
    window.addEventListener(MOBILE_AUTH_COMPLETED_EVENT, refreshAfterMobileLogin)
    return () => window.removeEventListener(MOBILE_AUTH_COMPLETED_EVENT, refreshAfterMobileLogin)
  }, [loadOwner])
  useEffect(() => {
    const updateMobileLoginProgress = (event: Event) => {
      const result = (event as CustomEvent<'processing' | 'completed' | 'failed'>).detail
      if (result === 'processing') setMobileLoginPending(true)
      if (result === 'failed') setMessage(takeMobileAuthError() ?? '登录暂时未完成，请检查网络后重新登录。')
    }
    window.addEventListener(MOBILE_AUTH_PROGRESS_EVENT, updateMobileLoginProgress)
    return () => window.removeEventListener(MOBILE_AUTH_PROGRESS_EVENT, updateMobileLoginProgress)
  }, [])
  useEffect(() => {
    if (!activeRefrigeratorId) return
    let active = true
    const collect = async () => {
      try {
        const due = await request<DueNotification[]>(`/api/owner/refrigerators/${activeRefrigeratorId}/notifications/due`, { method: 'POST' })
        if (!active) return
        setDueNotifications(due)
        if (!due.length) return
        if ('Notification' in window && Notification.permission === 'granted') due.forEach(item => new Notification(item.title, { body: item.body }))
      } catch { /* 下次打开或切换冰箱时再次尝试；离线时不打断当前操作。 */ }
    }
    void collect()
    return () => { active = false }
  }, [activeRefrigeratorId])
  useEffect(() => {
    if (!displayBindingStatus || displayBindingStatus.state !== 'pending') return
    let active = true
    let timer: number | undefined
    const { refrigeratorId, deadline, previousDisplayDeviceId } = displayBindingStatus
    const poll = async () => {
      if (!active) return
      try {
        const [summaries, devices] = await Promise.all([
          request<RefrigeratorSummaryResponse[]>('/api/refrigerators'),
          request<Device[]>(`/api/owner/refrigerators/${refrigeratorId}/devices`),
        ])
        if (!active) return
        const summary = summaries.find(item => item.id === refrigeratorId)
        const bound = isDisplayBindingComplete(summary, devices, previousDisplayDeviceId)
        if (bound && Date.now() <= deadline) {
          const current = fridgesRef.current.find(fridge => fridge.id === refrigeratorId)
          const refreshed = summary ? toRefrigerator(summary) : current
          if (refreshed) {
            const nextFridge = { ...refreshed, display_device_status: 'bound' as const }
            const nextFridges = fridgesRef.current.map(fridge => fridge.id === refrigeratorId ? nextFridge : fridge)
            fridgesRef.current = nextFridges
            setFridges(nextFridges)
            const cachedList = readPageCache<FridgeListCache>(refrigeratorListCacheKey())
            if (cachedList) writePageCache(refrigeratorListCacheKey(), { ...cachedList.data, fridges: nextFridges })
            const cachedWorkspace = readPageCache<WorkspaceCache>(refrigeratorWorkspaceCacheKey(refrigeratorId))
            if (cachedWorkspace) writePageCache(refrigeratorWorkspaceCacheKey(refrigeratorId), { ...cachedWorkspace.data, refrigerator: nextFridge })
          }
          if (deviceFridgeIdRef.current === refrigeratorId) setDeviceListState(getDeviceListState(devices))
          setDisplayBindingStatus(null)
          setMessage('冰箱端已绑定。')
          return
        }
      } catch {
        // 绑定轮询期间的单次网络失败不结束流程，直到达到截止时间。
      }
      if (!active) return
      if (Date.now() >= deadline) {
        setDisplayBindingStatus({ refrigeratorId, state: 'timeout', deadline })
        setMessage('绑定超时，请确认冰箱端在线后重试。')
        return
      }
      timer = window.setTimeout(() => { void poll() }, DISPLAY_BINDING_POLL_INTERVAL_MS)
    }
    void poll()
    return () => {
      active = false
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [displayBindingStatus])
  const selectedTemplate = templates.find(template => template.key === templateKey)
  const beginRefrigeratorCreation = (clearCurrentLayout: boolean) => {
    if (!fridges.some(fridge => fridge.access_role === 'owner')) {
      setMessage('只有冰箱所有者可以新建冰箱。')
      return
    }
    if (clearCurrentLayout) setLayout(null)
    setName(suggestRefrigeratorName(fridges))
    setTemplateKey('top_freezer_single')
    setDraftLayout(null)
    setActiveZoneKey('')
    setCreating(true)
    setSetupStep('setup')
  }

  const loadInventoryWorkspace = useCallback(async (fridge: Refrigerator, force = false): Promise<void> => {
    if (appRuntime.kind === 'capacitor' && fridge.access_role === 'daily_access') {
      await setActiveMobileDeviceRefrigerator(fridge.id)
    }
    activeWorkspaceIdRef.current = fridge.id
    const cached = readPageCache<WorkspaceCache>(refrigeratorWorkspaceCacheKey(fridge.id))
    if (cached) {
      writePageCache(inventorySearchCacheKey(fridge.id), { inventory: cached.data.inventory, icons: cached.data.icons })
      applyWorkspaceCache(cached.data)
      if (!shouldRefreshCachedPage(cached, force ? 'manual' : 'navigation')) return
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
  const renameStorageSlot = async (storageSlotId: string, name: string): Promise<string | null> => {
    if (!layout) return '请先选择冰箱。'
    const refrigerator = fridges.find(fridge => fridge.id === layout.refrigerator_id)
    if (!refrigerator) return '冰箱不存在或已无法访问。'
    try {
      const saved = await request<Layout>(`${getRefrigeratorWorkspacePath(refrigerator, 'layout')}/slots/${encodeURIComponent(storageSlotId)}/name`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
      setLayout(saved); updateWorkspaceCache({ layout: saved }); return null
    } catch (error) { return (error as Error).message }
  }
  const currentFridgeForAction = () => fridges.find(fridge => fridge.id === layout?.refrigerator_id) as Refrigerator
  const openLayout = useCallback(async (fridge: Refrigerator) => {
    try {
      await loadInventoryWorkspace(fridge)
      window.localStorage.setItem(LAST_REFRIGERATOR_STORAGE_KEY, fridge.id)
      setP7View('home'); setMessage('')
      return true
    } catch (error) { setMessage((error as Error).message) }
    return false
  }, [loadInventoryWorkspace])
  const swipeHomeFridge = useCallback((direction: HorizontalSwipeDirection) => {
    if (fridgeSwipeInFlight.current) return
    const availableFridges = fridgesRef.current.filter(fridge => fridge.setup_status === 'ready')
    const currentIndex = availableFridges.findIndex(fridge => fridge.id === layout?.refrigerator_id)
    const nextIndex = getCircularSwipeIndex(availableFridges.length, currentIndex, direction)
    if (nextIndex === null) return
    const nextFridge = availableFridges[nextIndex]
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { void openLayout(nextFridge); return }
    fridgeSwipeInFlight.current = true
    setFridgeSwipeTransition({ direction, phase: 'exit' })
    const transitionStartedAt = Date.now()
    void openLayout(nextFridge).then(success => {
      const remaining = Math.max(0, PAGE_TRANSITION_DURATION_MS - (Date.now() - transitionStartedAt))
      window.setTimeout(() => {
        if (!success) { fridgeSwipeInFlight.current = false; setFridgeSwipeTransition(null); return }
        setFridgeSwipeTransition({ direction, phase: 'enter' })
        window.setTimeout(() => { fridgeSwipeInFlight.current = false; setFridgeSwipeTransition(null) }, PAGE_TRANSITION_DURATION_MS)
      }, remaining)
    })
  }, [layout?.refrigerator_id, openLayout])
  const openSearchResult = async ({ refrigerator, item }: InventorySearchResult) => {
    try {
      await loadInventoryWorkspace(refrigerator)
      setInventorySlotId(undefined)
      setInventoryItemId(item.id)
      setInventoryMode('edit')
      setInventoryReturnView('search')
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
  const startOwnerLogin = () => {
    if (import.meta.env.DEV) { void request('/api/auth/development-login', { method: 'POST' }).then(loadOwner).catch(error => setMessage(error.message)); return }
    if (appRuntime.kind === 'capacitor') {
      setMobileLoginPending(true)
      const forceLogin = forceMobileLoginRef.current
      forceMobileLoginRef.current = false
      void beginMobileLogin({ forceLogin }).catch(error => {
        setMobileLoginPending(false)
        setMessage((error as Error).message)
      })
      return
    }
    window.location.assign(resolveApiUrl('/api/auth/login', appRuntime))
  }
  const switchOwnerAccount = async () => {
    forceMobileLoginRef.current = true
    try {
      if (appRuntime.kind === 'capacitor') await logoutMobileSession()
    } catch {
      setMessage('服务器退出未完成，但本机登录已清除，请重新登录。')
    }
    clearPageCaches(); clearRuntimeAssetCache()
    fridgesRef.current = []
    setFridges([])
    setLayout(null)
    setOwnerState('signed-out')
    setP7View('switcher')
  }
  const closeScanner = () => {
    pendingScanResolver.current?.(null)
    pendingScanResolver.current = null
    setDisplayScanPending(false)
    setScanning(false)
  }
  const scanDisplayQr = (scanRequest: DisplayQrScanRequest): Promise<PairingQr | null> => new Promise(resolve => {
    pendingScanResolver.current = resolve
    setDisplayScanPending(true)
    setScannerTarget({ refrigeratorId: scanRequest.refrigeratorId, purpose: scanRequest.purpose })
    setScanning(true)
  })
  const bindDisplayByQr = async (bindRequest: DisplayDeviceBindRequest): Promise<Refrigerator> => {
    const refreshed = await request<Refrigerator & { device_token?: string }>('/api/first-boot-pairings/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pairing_token: bindRequest.token,
        standalone: true,
        refrigerator_id: bindRequest.refrigeratorId,
        purpose: bindRequest.purpose,
        label: '厨房 Kindle',
        client: appRuntime.kind === 'capacitor' ? 'mobile' : 'pwa',
      }),
    })
    if (refreshed.device_token) await addMobileDeviceToken(refreshed.id, refreshed.device_token)
    const nextFridges = fridgesRef.current.map(fridge => fridge.id === refreshed.id ? refreshed : fridge)
    fridgesRef.current = nextFridges
    setFridges(nextFridges)
    updateWorkspaceCache({ refrigerator: refreshed })
    return refreshed
  }
  const createDisplayPasscode = async (passcodeRequest: DisplayPasscodeRequest): Promise<DisplayPasscodeResult> => {
    const result = await request<{ passcode: string; expires_in_seconds: number }>('/api/owner/kindle-passcodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refrigerator_id: passcodeRequest.refrigeratorId, purpose: passcodeRequest.purpose }),
    })
    return { passcode: result.passcode, expiresInSeconds: result.expires_in_seconds }
  }
  const handleDisplayScanResult = useCallback((parsed: PairingQr) => {
    pendingScanResolver.current?.(parsed)
    pendingScanResolver.current = null
    setDisplayScanPending(false)
    setScanning(false)
  }, [])
  const continueSetup = async (fridge: Refrigerator) => {
    if (!getRefrigeratorCapabilities(fridge).canContinueSetup) {
      setMessage('只有冰箱所有者可以继续设置布局。')
      return
    }
    try {
      const savedLayout = await request<Layout>(`/api/owner/refrigerators/${fridge.id}/layout`)
      const template = templates.find(item => item.key === savedLayout.template_key)
      if (!template) { setMessage('布局模板仍在加载，请稍后重试。'); return }
      const nextDraft = completeLayoutZones(savedLayout, template)
      setLayout(null); setName(fridge.name); setTemplateKey(savedLayout.template_key); setDraftLayout(nextDraft); setCreating(false); setSetupStep('editor')
    } catch (error) { setMessage((error as Error).message) }
  }
  const showDevices = async (fridge: Refrigerator, requestId = settingsRequestId.current) => {
    if (!getRefrigeratorCapabilities(fridge).canManageDevices) {
      setMessage('日常访问不能管理设备。')
      return
    }
    setDeviceFridgeId(fridge.id)
    deviceFridgeIdRef.current = fridge.id
    setDeviceListState({ status: 'loading', devices: [] })
    try {
      const nextDevices = await request<Device[]>(`/api/owner/refrigerators/${fridge.id}/devices`)
      if (requestId !== settingsRequestId.current) return
      setDeviceListState(getDeviceListState(nextDevices))
      setMessage(`正在管理：${fridge.name}`)
    } catch (error) {
      if (requestId !== settingsRequestId.current) return
      const message = (error as Error).message
      setDeviceListState({ status: 'error-retry', devices: [], message })
    }
  }
  const openSettings = async (fridge: Refrigerator, returnView: 'home' | 'switcher' = 'switcher') => {
    if (!getRefrigeratorCapabilities(fridge).canOpenSettings) {
      setMessage('这台冰箱仅开放日常工作区。')
      return
    }
    const requestId = settingsRequestId.current + 1
    settingsRequestId.current = requestId
    setSettingsReturn(returnView)
    setSettingsLoading(true)
    try {
      await Promise.all([loadInventoryWorkspace(fridge), showDevices(fridge, requestId)])
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
      setFridges(current => { const next = current.map(item => item.id === renamed.id ? renamed : item); fridgesRef.current = next; return next }); updateWorkspaceCache({ refrigerator: renamed }); return null
    } catch (error) { return (error as Error).message }
  }
  const deleteCurrentRefrigerator = async (): Promise<string | null> => {
    if (!layout) return '请先选择冰箱。'
    try {
      const refrigerator = currentFridgeForAction()
      await request<void>(`/api/owner/refrigerators/${refrigerator.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmation_name: refrigerator.name }) })
      removeRefrigeratorPageCaches(refrigerator.id); removePageCache(inventorySearchCacheKey(refrigerator.id)); setLayout(null); setP7View('switcher'); setMessage('已移到最近删除，可在 30 天内恢复。'); await loadOwner(); return null
    } catch (error) { return (error as Error).message }
  }
  const restoreRefrigerator = async (refrigerator: Refrigerator): Promise<boolean> => {
    try {
      const restored = await request<Refrigerator>(`/api/owner/refrigerators/${refrigerator.id}/restore`, { method: 'POST' })
      setFridges(current => { const next = [...current, restored]; fridgesRef.current = next; return next }); setMessage(`已恢复「${restored.name}」，请重新配对设备。`); return true
    } catch (error) { setMessage((error as Error).message); return false }
  }
  const removeDevice = async (deviceId: string) => {
    try {
      await request<void>(`/api/owner/refrigerators/${deviceFridgeId}/devices/${deviceId}`, { method: 'DELETE' })
      setDeviceListState(current => {
        const currentDevices = current.status === 'ready-data' ? current.devices : []
        const nextDevices = currentDevices.filter(device => device.id !== deviceId)
        return getDeviceListState(nextDevices)
      })
      setMessage('设备已移除。')
    } catch (error) { setMessage((error as Error).message) }
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
      setInventory(refreshed); setHomeInventory(refreshedHome); inventoryRef.current = refreshed; homeInventoryRef.current = refreshedHome; updateWorkspaceCache({ inventory: refreshed, homeInventory: refreshedHome }); removePageCache(inventorySearchCacheKey(layout.refrigerator_id))
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
  const saveP5Inventory = async (draft: { id?: string; subcategoryId: string; slotId: string; itemName: string; quantity: number; bestBefore: string; bestBeforeChanged?: boolean; description: string; productionDate: string; price: string; barcode: string; mergeSameName?: boolean }) => {
    if (!layout) return false
    const refrigerator = currentFridgeForAction()
    if (!getRefrigeratorCapabilities(refrigerator).canWriteInventory) return false
    setSaving(true)
    try {
      const inventoryPath = getRefrigeratorWorkspacePath(refrigerator, 'inventory')
      const batch = await request<InventoryBatch>(`${inventoryPath}${draft.id ? `/${draft.id}` : ''}`, {
        method: draft.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subcategory_id: draft.subcategoryId, storage_slot_id: draft.slotId, item_name: draft.itemName, quantity: draft.quantity, best_before: draft.bestBefore || null, best_before_changed: Boolean(draft.bestBeforeChanged), product_description: draft.description || null, production_date: draft.productionDate || null, price: draft.price || null, barcode: draft.barcode || null, merge_same_name: Boolean(draft.mergeSameName) }),
      })
      const nextInventory = upsertInventoryBatch(inventoryRef.current, batch)
      const nextHomeInventory = nextInventory.filter(item => item.quantity > 0)
      inventoryRef.current = nextInventory
      homeInventoryRef.current = nextHomeInventory
      setInventory(nextInventory); setHomeInventory(nextHomeInventory); updateWorkspaceCache({ inventory: nextInventory, homeInventory: nextHomeInventory })
      removePageCache(inventorySearchCacheKey(refrigerator.id))
      setRecipeRefreshAt(Date.now())
      return true
    } catch (error) { setMessage((error as Error).message); return false } finally { setSaving(false) }
  }
  const createP5Category = async (parentId: string, categoryName: string, iconKey: string) => {
    if (!layout) return undefined
    if (currentFridgeForAction().access_role !== 'owner') return undefined
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
    if (!getRefrigeratorCapabilities(currentFridgeForAction()).canDelete) { setMessage('日常访问不能删除库存。'); return false }
    try { await request<void>(`/api/owner/refrigerators/${layout.refrigerator_id}/inventory/${batchId}`, { method: 'DELETE' }); const nextInventory = inventoryRef.current.filter(item => item.id !== batchId); const nextHomeInventory = homeInventoryRef.current.filter(item => item.id !== batchId); inventoryRef.current = nextInventory; homeInventoryRef.current = nextHomeInventory; setInventory(nextInventory); setHomeInventory(nextHomeInventory); updateWorkspaceCache({ inventory: nextInventory, homeInventory: nextHomeInventory }); removePageCache(inventorySearchCacheKey(layout.refrigerator_id)); setRecipeRefreshAt(Date.now()); return true } catch (error) { setMessage((error as Error).message); return false }
  }
  const deleteP5InventorySelected = async (items: InventoryBatch[]) => {
    if (!items.length) return false
    try {
      await request<void>('/api/owner/inventory/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_ids: items.map(item => item.id) }),
      })
      const deletedIds = new Set(items.map(item => item.id))
      const nextInventory = inventoryRef.current.filter(item => !deletedIds.has(item.id))
      const nextHomeInventory = homeInventoryRef.current.filter(item => !deletedIds.has(item.id))
      inventoryRef.current = nextInventory
      homeInventoryRef.current = nextHomeInventory
      setInventory(nextInventory)
      setHomeInventory(nextHomeInventory)
      updateWorkspaceCache({ inventory: nextInventory, homeInventory: nextHomeInventory })
      fridges.forEach(fridge => removePageCache(inventorySearchCacheKey(fridge.id)))
      setRecipeRefreshAt(Date.now())
      return true
    } catch (error) {
      setMessage((error as Error).message)
      return false
    }
  }
  const classifyP5InventorySelected = async (items: InventoryBatch[], subcategoryId: string) => {
    if (!items.length || !layout) return false
    const refrigerator = currentFridgeForAction()
    if (refrigerator.access_role !== 'owner') {
      setMessage('日常访问不能修改库存分类。')
      return false
    }
    try {
      await request<InventoryBatch[]>(`/api/owner/refrigerators/${layout.refrigerator_id}/inventory/category`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_ids: items.map(item => item.id), subcategory_id: subcategoryId }),
      })
      await loadInventoryWorkspace(refrigerator, true)
      removePageCache(inventorySearchCacheKey(refrigerator.id))
      setRecipeRefreshAt(Date.now())
      return true
    } catch (error) {
      setMessage((error as Error).message)
      return false
    }
  }

  const beginInventoryMove = (items: InventoryBatch[], selectedIcons: Icon[], returnView: 'inventory' | 'search') => {
    if (currentFridgeForAction().access_role !== 'owner') {
      setMessage('日常访问不能跨冰箱移动库存。')
      return
    }
    setMoveItems(items)
    setMoveIcons(selectedIcons)
    setMoveReturnView(returnView)
  }
  const completeInventoryMove = async () => {
    const activeFridge = currentFridgeForAction()
    fridges.forEach(fridge => removePageCache(inventorySearchCacheKey(fridge.id)))
    if (moveReturnView === 'inventory') await loadInventoryWorkspace(activeFridge, true)
    else setInventorySearchRefreshNonce(value => value + 1)
    setMoveItems([])
  }

  if (scanning) return <PwaScanner onClose={closeScanner} onScanResult={displayScanPending ? handleDisplayScanResult : undefined} targetRefrigeratorId={scannerTarget.refrigeratorId} displayBindingPurpose={scannerTarget.purpose} />
  if (bootstrapToken || pairToken || (pairingIntentResume && resumedPairingIntent)) return <BootstrapPairing token={bootstrapToken ?? pairToken ?? resumedPairingIntent!.token} kind={bootstrapToken || resumedPairingIntent?.kind === 'bootstrap' ? 'bootstrap' : 'grant_pwa_access'} onScan={() => setScanning(true)} targetRefrigeratorId={resumedPairingIntent?.targetRefrigeratorId} displayBindingPurpose={resumedPairingIntent?.displayBindingPurpose} onContinueSetup={fridge => { setIncomingPairing(null); window.history.replaceState(null, '', '/'); void continueSetup(fridge) }} onOpenHome={fridge => { setIncomingPairing(null); window.history.replaceState(null, '', '/'); void openLayout(fridge) }} />
  if (pairToken && !isStandalone()) return <InstallationGuide />
  if (ownerState === 'loading' && initialFridges.length && !layout) return <PageShell className="p7-shell" header={<AppHeader title={<HeaderTitle title={initialRefrigerator?.name ?? '首页'} refreshState="loading" />} />} bodyClassName="owner-start-content"><p>正在读取首页数据…</p></PageShell>
  if (ownerState === 'loading' && !layout) return <PageShell className="owner-start" header={<AppHeader />} bodyClassName="owner-start-content"><p>正在准备…</p></PageShell>
  if (ownerState === 'signed-out') return <EmptyOwnerHome onScan={() => { setScannerTarget({}); setScanning(true) }} onLogin={startOwnerLogin} loginPending={mobileLoginPending} message={message} />
  if (p7View === 'me') return <MeHome theme={theme} notificationCount={visibleNotifications.length} onNotifications={() => { if (layout) setP7View('notification-inbox'); else setMessage('请先选择一台冰箱。') }} onAbout={() => setP7View('about')} onPreferences={() => setP7View('preferences')} onHome={() => setP7View(layout ? 'home' : 'switcher')} onRecipes={() => setP7View(layout ? 'recipes' : 'switcher')} onShopping={() => setP7View(layout ? 'shopping' : 'switcher')} onSwitchAccount={appRuntime.kind === 'capacitor' ? () => void switchOwnerAccount() : undefined} />
  if (p7View === 'preferences') return <ThemePreferencesPage theme={theme} onBack={() => setP7View('me')} onOpenThemeSettings={() => setP7View('theme-settings')} onNotificationSettings={() => { if (layout) setP7View('notifications'); else setMessage('请先选择一台冰箱。') }} />
  if (p7View === 'theme-settings') return <ThemeSettingsPage theme={theme} onBack={() => setP7View('preferences')} onSelect={selectedTheme => { setTheme(selectedTheme); setP7View('preferences') }} />
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
  if (!layout) return <FridgeSwitcher fridges={fridges} currentId="" displayBindingStatus={displayBindingStatus} onSelect={fridge => void openLayout(fridge)} onContinueSetup={continueSetup} onSettings={fridge => void openSettings(fridge, 'switcher')} onScan={() => { setScannerTarget({}); setScanning(true) }} onCreate={() => beginRefrigeratorCreation(false)} onDeleted={() => setP7View('deleted')} onRecipes={() => setMessage('请先选择一台冰箱。')} onMe={() => setP7View('me')} onReorder={reorderFridges} onRefresh={refreshFridgeList} />
  const currentFridge = fridges.find(fridge => fridge.id === layout.refrigerator_id)
  if (!currentFridge) return null
  if (p7View === 'switcher') return <FridgeSwitcher fridges={fridges} currentId={currentFridge.id} displayBindingStatus={displayBindingStatus} onSelect={fridge => void openLayout(fridge)} onContinueSetup={continueSetup} onSettings={fridge => void openSettings(fridge, 'switcher')} onScan={() => { setScannerTarget({}); setScanning(true) }} onBack={() => setP7View('home')} onCreate={() => beginRefrigeratorCreation(true)} onDeleted={() => setP7View('deleted')} onRecipes={() => setP7View('recipes')} onMe={() => setP7View('me')} onReorder={reorderFridges} onRefresh={refreshFridgeList} />
  if (p7View === 'deleted') return <RecentlyDeleted onBack={() => setP7View('switcher')} onRestore={restoreRefrigerator} />
  if (p7View === 'settings') return <FridgeSettings refrigerator={currentFridge} layout={layout} deviceListState={deviceListState} displayBindingState={displayBindingStatus?.refrigeratorId === currentFridge.id ? displayBindingStatus.state : 'idle'} onBack={() => setP7View(settingsReturn)} onNameAndLayout={() => setP7View('name-layout')} onDeviceBinding={() => setP7View('device-binding')} onRetryDevices={() => void showDevices(currentFridge)} onExpiry={() => setP7View('expiry')} onRemove={id => void removeDevice(id)} onDelete={deleteCurrentRefrigerator} />
  if (p7View === 'device-binding') return <FridgeDeviceBinding refrigerator={currentFridge} onBack={() => setP7View('settings')} onScanQr={scanDisplayQr} onBindByQr={async bindRequest => { await bindDisplayByQr(bindRequest) }} onCreatePasscode={createDisplayPasscode} onBindingSuccess={() => {
    const refreshed = fridgesRef.current.find(fridge => fridge.id === currentFridge.id) ?? currentFridge
    const previousDisplayDeviceId = deviceListState.status === 'ready-data'
      ? getActiveDisplayDevice(deviceListState.devices)?.id
      : undefined
    setDisplayBindingStatus({ refrigeratorId: currentFridge.id, state: 'pending', deadline: Date.now() + DISPLAY_BINDING_TIMEOUT_MS, previousDisplayDeviceId })
    void openSettings(refreshed, settingsReturn)
  }} />
  if (p7View === 'name-layout') return <NameAndLayout refrigerator={currentFridge} layout={layout} templates={templates} onBack={() => setP7View('settings')} onRename={renameCurrentRefrigerator} onLayout={() => setP7View('layout-editor')} />
  if (p7View === 'layout-editor') return <ExistingLayoutEditor layout={layout} template={templates.find(template => template.key === layout.template_key)} saving={saving} onBack={() => setP7View('name-layout')} onSave={nextLayout => void saveExistingLayout(nextLayout)} />
  if (p7View === 'notification-inbox') return <NotificationsPage refrigerator={currentFridge} notifications={visibleNotifications} onBack={() => setP7View('me')} />
  if (p7View === 'notifications') return <NotificationSettings refrigerator={currentFridge} settings={notificationSettings} onSave={saveNotificationSettings} onBack={() => setP7View('me')} />
  if (p7View === 'expiry') return <ExpirySettingsPage refrigerator={currentFridge} expiry={expiry} onSaveExpiry={saveExpirySettings} onBack={() => setP7View('settings')} />
  if (p7View === 'inventory') return <><InventoryFlow layout={layout} categories={categories} icons={icons} inventory={inventory} refrigerator={currentFridge} saving={saving} initialSlotId={inventorySlotId} initialItemId={inventoryItemId} initialView={inventoryMode} initialExpiryStatus={inventoryExpiryStatus} onBack={() => { setInventorySlotId(undefined); setInventoryItemId(undefined); setInventoryExpiryStatus(undefined); setInventoryMode('add'); setP7View(inventoryReturnView) }} onSelectFridge={fridge => void openLayout(fridge)} onRenameSlot={renameStorageSlot} onCreateCategory={createP5Category} onCatalogChanged={async () => { await loadInventoryWorkspace(currentFridge) }} onSave={saveP5Inventory} onDelete={deleteP5Inventory} onMoveSelected={items => beginInventoryMove(items, icons, 'inventory')} onDeleteSelected={deleteP5InventorySelected} onClassifySelected={classifyP5InventorySelected} />{moveItems.length > 0 && <InventoryMoveFlow items={moveItems} icons={moveIcons} refrigerators={fridges} currentRefrigeratorId={currentFridge.id} onClose={() => setMoveItems([])} onComplete={completeInventoryMove} />}</>
  if (p7View === 'search') return <><InventorySearch key={inventorySearchRefreshNonce} query={searchQuery} fridges={fridges} onBack={() => setP7View('home')} onSelectFridge={fridge => void openLayout(fridge)} onOpenItem={result => void openSearchResult(result)} onMoveSelected={(items, selectedIcons) => beginInventoryMove(items, selectedIcons, 'search')} onDeleteSelected={deleteP5InventorySelected} />{moveItems.length > 0 && <InventoryMoveFlow items={moveItems} icons={moveIcons} refrigerators={fridges} currentRefrigeratorId={currentFridge.id} onClose={() => setMoveItems([])} onComplete={completeInventoryMove} />}</>
  if (p7View === 'recipes' || p7View === 'shopping') return <RecipeWorkspace refrigerator={currentFridge} categories={categories} icons={icons} inventory={inventory} refreshAt={recipeRefreshAt} initialView={p7View === 'shopping' ? 'restock' : 'week'} onBack={() => setP7View('home')} onMe={() => setP7View('me')} onInventoryChanged={async () => { await loadInventoryWorkspace(currentFridge, true); removePageCache(inventorySearchCacheKey(currentFridge.id)) }} />
  return <FridgeHome refrigerator={currentFridge} layout={layout} homeInventory={homeInventory} icons={icons} notifications={dueNotifications} refreshState={refreshState} refreshError={refreshError} installEvent={installEvent} installed={pwaInstalled} onInstallEventConsumed={() => setInstallEvent(null)} onScan={() => { setInventoryReturnView('home'); setInventorySlotId(undefined); setInventoryItemId(undefined); setInventoryExpiryStatus(undefined); setInventoryMode('recognition'); setP7View('inventory') }} onInventory={() => { setInventoryReturnView('home'); setInventorySlotId(undefined); setInventoryItemId(undefined); setInventoryExpiryStatus(undefined); setInventoryMode('list'); setP7View('inventory') }} onSlot={slotId => { setInventoryReturnView('home'); setInventorySlotId(slotId); setInventoryItemId(undefined); setInventoryExpiryStatus(undefined); setInventoryMode('list'); setP7View('inventory') }} onFridgeList={() => setP7View('switcher')} onSwipeFridge={swipeHomeFridge} fridgeSwipeTransition={fridgeSwipeTransition} onRefresh={() => loadInventoryWorkspace(currentFridge, true)} onRecipes={() => setP7View('recipes')} onShopping={() => setP7View('shopping')} onMe={() => setP7View('me')} onSearch={query => { setSearchQuery(query); setP7View('search') }} />
}
