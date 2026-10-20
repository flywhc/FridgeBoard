import { subscribeAppResume, subscribeNetworkStatus } from './nativeBridge'
import { resolveApiUrl } from './runtime'

export const IOS_NETWORK_STARTUP_MESSAGE = '暂时无法联网。请在系统联网询问中允许家常食橱使用网络；若已选择不允许，请前往“设置”中的家常食橱，开启无线数据（无线局域网与蜂窝网络）。若已允许，请检查当前网络连接。连接恢复后会自动继续，无需关闭 App。'

/**
 * iOS 首次联网需要请求触发系统确认；路径可用并不代表 App 已获准联网。
 * 只读探测收到任意 HTTP 响应即放行业务，避免把服务端错误误判为权限拒绝。
 */
export function startIosNetworkStartup({ onReady, onUnavailable }: {
  onReady: () => void
  onUnavailable: () => void
}): () => void {
  let active = true
  let ready = false
  let notified = false
  let pending: AbortController | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  const attempt = async () => {
    if (!active || ready || pending || document.visibilityState === 'hidden') return
    clearTimeout(retryTimer)
    const controller = new AbortController()
    pending = controller
    const startedAt = Date.now()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    try {
      // 不携带会话、令牌或用户数据；不执行认证刷新或任何写操作。
      const response = await fetch(resolveApiUrl('/api/auth/status'), {
        credentials: 'omit', cache: 'no-store', signal: controller.signal,
      })
      void response.body?.cancel().catch(() => undefined)
      if (!active) return
      ready = true
      cleanup()
      onReady()
    } catch (error) {
      if (!active) return
      if (!notified) {
        notified = true
        console.warn('iOS 启动联网探测未完成，等待连接恢复', {
          operation: 'ios_network_startup', method: 'GET', path: '/api/auth/status',
          endpoint: resolveApiUrl('/api/auth/status'), phase: 'connectivity_probe',
          elapsedMs: Date.now() - startedAt, timedOut: controller.signal.aborted,
        }, error)
        onUnavailable()
      }
      // 授权变化未必改变 NWPath；保留低频探测覆盖 Wi-Fi 下仅 App 权限改变的情况。
      retryTimer = setTimeout(() => { void attempt() }, 3000)
    } finally {
      clearTimeout(timeout)
      pending = undefined
    }
  }
  const unsubscribeNetwork = subscribeNetworkStatus(status => {
    if (status.connected) void attempt()
  })
  const unsubscribeResume = subscribeAppResume(() => { void attempt() })
  const onVisibility = () => { void attempt() }
  document.addEventListener('visibilitychange', onVisibility)
  function cleanup() {
    if (!active) return
    active = false
    clearTimeout(retryTimer)
    pending?.abort()
    unsubscribeNetwork()
    unsubscribeResume()
    document.removeEventListener('visibilitychange', onVisibility)
  }
  void attempt()
  return cleanup
}
