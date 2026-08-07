import { useEffect, useMemo, useRef, useState } from 'react'
import { request } from './appApi'

export type KindleFlowMode = 'entry' | 'pairing'
export type KindlePageState = 'unconfigured' | 'configured' | 'revoked'
export type KindleRefrigerator = {
  id: string
  name: string
  setup_status: 'needs_layout' | 'ready'
}

export type KindleSession = {
  pairing_token: string
  pairing_url: string
  expires_in_seconds: number
}

export type KindleFlowState =
  | { screen: 'loading'; mode: KindleFlowMode }
  | { screen: 'creating-first-boot'; mode: 'entry' }
  | { screen: 'creating-pairing'; mode: 'pairing' }
  | { screen: 'first-boot'; mode: 'entry'; session: KindleSession; expiresAt: number; networkError?: boolean }
  | { screen: 'waiting-layout'; mode: 'entry'; refrigerator: KindleRefrigerator; networkError?: boolean }
  | { screen: 'pairing'; mode: 'pairing'; session: KindleSession; expiresAt: number; networkError?: boolean }
  | { screen: 'bound'; mode: 'entry'; refrigerator: KindleRefrigerator }
  | { screen: 'pairing-complete'; mode: 'pairing' }
  | { screen: 'configured'; mode: 'entry' }
  | { screen: 'revoked'; mode: KindleFlowMode }
  | { screen: 'expired'; mode: KindleFlowMode }
  | { screen: 'network-error'; mode: KindleFlowMode; phase: KindleRequestPhase }

export type KindleRequestPhase =
  | 'page-state'
  | 'create-first-boot'
  | 'create-pairing'
  | 'poll-first-boot'
  | 'poll-layout'
  | 'poll-pairing'

export type KindleDeviceApi = {
  getPageState: () => Promise<{ state: KindlePageState }>
  createFirstBootSession: () => Promise<KindleSession>
  getFirstBootStatus: () => Promise<{
    state: 'pending' | 'bound'
    refrigerator?: KindleRefrigerator | null
  }>
  getCurrentRefrigerator: () => Promise<KindleRefrigerator>
  createPairingSession: () => Promise<KindleSession>
  getPairingStatus: () => Promise<{
    state: 'pending' | 'used' | 'expired' | 'missing'
    expires_in_seconds?: number | null
  }>
}

export type KindleDeviceFlowProps = {
  mode?: KindleFlowMode
  api?: KindleDeviceApi
  pollIntervalMs?: number
  navigate?: (path: string) => void
  devicePath?: string
}

/**
 * 将 Kindle 页面状态转换为入口动作，避免把撤销设备误当成首次启动。
 */
export function getKindlePageStateAction(
  mode: KindleFlowMode,
  state: KindlePageState,
): 'create-first-boot' | 'create-pairing' | 'redirect-device' | 'revoked' {
  if (mode === 'pairing') return state === 'configured' ? 'create-pairing' : 'revoked'
  if (state === 'unconfigured') return 'create-first-boot'
  if (state === 'configured') return 'redirect-device'
  return 'revoked'
}

/**
 * 将首次开机轮询结果分成等待布局与绑定完成，保留后端显式 setup_status。
 */
export function getFirstBootStatusAction(
  status: 'pending' | 'bound',
  refrigerator?: KindleRefrigerator | null,
): 'pending' | 'waiting-layout' | 'bound' {
  if (status === 'pending') return 'pending'
  return refrigerator?.setup_status === 'ready' ? 'bound' : 'waiting-layout'
}

/** 将已配置设备的手机配对会话状态转换成页面动作。 */
export function getPairingStatusAction(
  state: 'pending' | 'used' | 'expired' | 'missing',
): 'pending' | 'complete' | 'expired' {
  if (state === 'pending') return 'pending'
  if (state === 'used') return 'complete'
  return 'expired'
}

/** 将 HTTP 错误映射为可恢复的撤销、二维码到期或网络错误。 */
export function getKindleRequestErrorAction(
  phase: KindleRequestPhase,
  status?: number,
): 'revoked' | 'expired' | 'network-error' {
  if (status === 401 || status === 403) return 'revoked'
  if ((phase === 'poll-first-boot' || phase === 'poll-pairing') && (status === 400 || status === 404)) return 'expired'
  return 'network-error'
}

/** 返回 Kindle 端 QR 图片地址；令牌仍只作为短效二维码请求参数使用。 */
export function getKindleQrImagePath(mode: KindleFlowMode, token: string): string {
  const endpoint = mode === 'entry'
    ? '/api/kindle/first-boot-sessions/qr'
    : '/api/kindle/pairing-sessions/qr'
  return `${endpoint}?token=${encodeURIComponent(token)}`
}

function getDefaultApi(): KindleDeviceApi {
  return {
    getPageState: () => request<{ state: KindlePageState }>('/api/kindle/page-state'),
    createFirstBootSession: () => request<KindleSession>('/api/kindle/first-boot-sessions', { method: 'POST' }),
    getFirstBootStatus: () => request<{ state: 'pending' | 'bound'; refrigerator?: KindleRefrigerator | null }>('/api/kindle/first-boot-sessions/current'),
    getCurrentRefrigerator: () => request<KindleRefrigerator>('/api/devices/current'),
    createPairingSession: () => request<KindleSession>('/api/kindle/pairing-sessions', { method: 'POST' }),
    getPairingStatus: () => request<{ state: 'pending' | 'used' | 'expired' | 'missing'; expires_in_seconds?: number | null }>('/api/kindle/pairing-sessions/current'),
  }
}

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  const status = (error as { status?: unknown }).status
  return typeof status === 'number' ? status : undefined
}

function getExpiresAt(session: KindleSession, now: () => number): number {
  return now() + Math.max(0, session.expires_in_seconds) * 1000
}

function getRemainingSeconds(expiresAt: number, now: () => number): number {
  return Math.max(0, Math.ceil((expiresAt - now()) / 1000))
}

function useRemainingSeconds(expiresAt: number | null, now: () => number): number {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (expiresAt === null) return undefined
    const timer = window.setInterval(() => setTick(value => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [expiresAt])
  return expiresAt === null ? 0 : getRemainingSeconds(expiresAt, now)
}

function formatRemaining(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

function getStateCopy(state: KindleFlowState, remaining: number): { title: string; status: string; hint: string } {
  if (state.screen === 'first-boot') {
    return {
      title: '绑定手机端',
      status: state.networkError ? '网络暂时不可用，二维码仍然有效。' : '请用手机相机扫描二维码。',
      hint: `二维码将在 ${formatRemaining(remaining)} 后更新。`,
    }
  }
  if (state.screen === 'waiting-layout') {
    return { title: state.refrigerator.name, status: '设备已连接', hint: '请在手机端完成冰箱布局，保存后本页面会自动打开冰箱首页。' }
  }
  if (state.screen === 'pairing') {
    return {
      title: '添加手机',
      status: state.networkError ? '网络暂时不可用，二维码仍然有效。' : `本次连接有效 ${formatRemaining(remaining)}`,
      hint: '在手机端打开“家常食橱”，点击“扫描冰箱二维码”。未安装时，可先用系统相机扫描并按提示安装。',
    }
  }
  if (state.screen === 'bound') return { title: state.refrigerator.name, status: '绑定完成', hint: '正在打开冰箱首页……' }
  if (state.screen === 'pairing-complete') return { title: '添加手机', status: '手机已连接', hint: '扫码只添加手机访问，不会更改冰箱所有者。' }
  if (state.screen === 'revoked') return { title: '设备访问已移除', status: '此冰箱端访问已移除。', hint: '请在手机端重新绑定后，再回到此页面。' }
  if (state.screen === 'expired') return { title: '二维码已失效', status: '二维码已失效或已被使用。', hint: '请重新生成二维码后再扫描。' }
  if (state.screen === 'network-error') return { title: '暂时无法连接', status: '无法确认设备状态。', hint: '请检查网络连接后重试。' }
  if (state.screen === 'configured') return { title: '家常食橱', status: '正在打开冰箱首页……', hint: '' }
  return { title: '家常食橱', status: '正在准备二维码……', hint: '' }
}

/**
 * Kindle 端首次绑定与“添加手机”流程。
 *
 * 组件通过 API 依赖注入保持可独立接入；实际 DP75SDI 页面继续使用
 * `frontend/public/fridge-qr.html` 的 ES5 实现，二者共享同一套状态分流语义。
 */
export function KindleDeviceFlow({
  mode = 'entry',
  pollIntervalMs = 4000,
  devicePath = '/fridge/device',
  api,
  navigate,
}: KindleDeviceFlowProps) {
  const resolvedApi = useMemo(() => api ?? getDefaultApi(), [api])
  const navigateTo = useMemo(() => navigate ?? ((path: string) => window.location.replace(path)), [navigate])
  const now = useMemo(() => () => Date.now(), [])
  const [state, setState] = useState<KindleFlowState>({ screen: 'loading', mode })
  const activeRef = useRef(true)

  useEffect(() => () => { activeRef.current = false }, [])

  useEffect(() => {
    activeRef.current = true
    const load = async () => {
      try {
        const pageState = await resolvedApi.getPageState()
        if (!activeRef.current) return
        const action = getKindlePageStateAction(mode, pageState.state)
        if (action === 'redirect-device') {
          setState({ screen: 'configured', mode: 'entry' })
          return
        }
        if (action === 'revoked') {
          setState({ screen: 'revoked', mode })
          return
        }
        if (action === 'create-pairing') setState({ screen: 'creating-pairing', mode: 'pairing' })
        else setState({ screen: 'creating-first-boot', mode: 'entry' })
      } catch {
        if (activeRef.current) setState({ screen: 'network-error', mode, phase: 'page-state' })
      }
    }
    void load()
    return () => { activeRef.current = false }
  }, [mode, resolvedApi])

  useEffect(() => {
    if (state.screen !== 'configured' || state.mode !== 'entry') return undefined
    const timer = window.setTimeout(() => navigateTo(devicePath), 400)
    return () => window.clearTimeout(timer)
  }, [devicePath, navigateTo, state])

  useEffect(() => {
    if (state.screen !== 'creating-first-boot' && state.screen !== 'creating-pairing') return undefined
    const phase: KindleRequestPhase = state.screen === 'creating-first-boot' ? 'create-first-boot' : 'create-pairing'
    const create = async () => {
      try {
        const session = phase === 'create-first-boot'
          ? await resolvedApi.createFirstBootSession()
          : await resolvedApi.createPairingSession()
        if (!activeRef.current) return
        const expiresAt = getExpiresAt(session, now)
        setState(phase === 'create-first-boot'
          ? { screen: 'first-boot', mode: 'entry', session, expiresAt }
          : { screen: 'pairing', mode: 'pairing', session, expiresAt })
      } catch (error) {
        if (!activeRef.current) return
        const action = getKindleRequestErrorAction(phase, getErrorStatus(error))
        setState(action === 'revoked' ? { screen: 'revoked', mode } : { screen: 'network-error', mode, phase })
      }
    }
    void create()
    return undefined
  }, [mode, now, resolvedApi, state.screen])

  useEffect(() => {
    const isPollable = state.screen === 'first-boot' || state.screen === 'waiting-layout' || state.screen === 'pairing'
    if (!isPollable) return undefined
    const phase: KindleRequestPhase = state.screen === 'first-boot'
      ? 'poll-first-boot'
      : state.screen === 'waiting-layout' ? 'poll-layout' : 'poll-pairing'
    const poll = async () => {
      try {
        if (phase === 'poll-first-boot') {
          const result = await resolvedApi.getFirstBootStatus()
          if (!activeRef.current) return
          const action = getFirstBootStatusAction(result.state, result.refrigerator)
          if (action === 'waiting-layout' && result.refrigerator) {
            setState({ screen: 'waiting-layout', mode: 'entry', refrigerator: result.refrigerator })
          } else if (action === 'bound' && result.refrigerator) {
            setState({ screen: 'bound', mode: 'entry', refrigerator: result.refrigerator })
          }
          return
        }
        if (phase === 'poll-layout') {
          const refrigerator = await resolvedApi.getCurrentRefrigerator()
          if (!activeRef.current) return
          if (refrigerator.setup_status === 'ready') setState({ screen: 'bound', mode: 'entry', refrigerator })
          return
        }
        const result = await resolvedApi.getPairingStatus()
        if (!activeRef.current) return
        const action = getPairingStatusAction(result.state)
        if (action === 'complete') setState({ screen: 'pairing-complete', mode: 'pairing' })
        if (action === 'expired') setState({ screen: 'expired', mode: 'pairing' })
      } catch (error) {
        if (!activeRef.current) return
        const action = getKindleRequestErrorAction(phase, getErrorStatus(error))
        if (action === 'revoked') setState({ screen: 'revoked', mode })
        else if (action === 'expired') setState({ screen: 'expired', mode })
        else if (state.screen === 'first-boot') setState({ ...state, networkError: true })
        else if (state.screen === 'waiting-layout') setState({ ...state, networkError: true })
        else if (state.screen === 'pairing') setState({ ...state, networkError: true })
      }
    }
    const timer = window.setTimeout(() => { void poll() }, pollIntervalMs)
    return () => window.clearTimeout(timer)
  }, [mode, pollIntervalMs, resolvedApi, state])

  useEffect(() => {
    if (state.screen !== 'first-boot' && state.screen !== 'pairing') return undefined
    const expiresAt = state.expiresAt
    const timer = window.setTimeout(() => setState({ screen: 'expired', mode: state.mode }), Math.max(0, expiresAt - now()))
    return () => window.clearTimeout(timer)
  }, [now, state])

  useEffect(() => {
    if (state.screen !== 'bound') return undefined
    const timer = window.setTimeout(() => navigateTo(devicePath), 1200)
    return () => window.clearTimeout(timer)
  }, [devicePath, navigateTo, state])

  const expiresAt = state.screen === 'first-boot' || state.screen === 'pairing' ? state.expiresAt : null
  const remaining = useRemainingSeconds(expiresAt, now)
  const copy = getStateCopy(state, remaining)
  const retry = () => {
    if (state.screen === 'network-error') {
      if (state.mode === 'entry') setState({ screen: 'creating-first-boot', mode: 'entry' })
      else setState({ screen: 'creating-pairing', mode: 'pairing' })
      return
    }
    if (state.screen === 'expired' || state.screen === 'revoked' || state.screen === 'pairing-complete') {
      setState({ screen: 'loading', mode })
    }
  }

  if (state.screen === 'configured') return <main className="eink-loading" aria-live="polite"><p>{copy.status}</p></main>
  if (state.screen === 'waiting-layout' || state.screen === 'bound') {
    return <main className="fridge-first-boot"><header className="eink-header"><h1>{copy.title}</h1></header><div className="first-boot-content"><p role="status">{copy.status}</p><p>{copy.hint}</p></div><footer>{state.screen === 'bound' ? copy.hint : '无需再次扫码'}</footer></main>
  }
  if (state.screen === 'first-boot' || state.screen === 'pairing') {
    const imagePath = getKindleQrImagePath(state.mode, state.session.pairing_token)
    return <main className={state.mode === 'pairing' ? 'fridge-pairing' : 'fridge-first-boot'}><header className={state.mode === 'pairing' ? 'eink-pair-header' : 'eink-header'}><h1>{copy.title}</h1></header><div className={state.mode === 'pairing' ? 'eink-pair-content' : 'first-boot-content'}><img className="fridge-qr" src={`${imagePath}&t=${state.expiresAt}`} alt="用于连接手机的二维码" /><p role="status">{copy.status}</p><p>{copy.hint}</p></div><footer>{state.mode === 'pairing' ? '扫码只添加手机访问，不会更改冰箱所有者' : '首次使用：用手机相机扫描，或打开 fridge.flycn.fyi 安装“家常食橱”。'}</footer></main>
  }
  if (state.screen === 'revoked' || state.screen === 'expired' || state.screen === 'network-error' || state.screen === 'pairing-complete') {
    return <main className="fridge-first-boot" role={state.screen === 'network-error' ? 'alert' : undefined}><header className="eink-header"><h1>{copy.title}</h1></header><div className="first-boot-content"><p role="status">{copy.status}</p><p>{copy.hint}</p><button type="button" onClick={retry}>{state.screen === 'revoked' ? '返回后重新绑定' : state.screen === 'pairing-complete' ? '返回冰箱首页' : state.screen === 'expired' ? '重新生成二维码' : '重试'}</button></div></main>
  }
  return <main className="eink-loading" aria-live="polite"><p>{copy.status}</p></main>
}
