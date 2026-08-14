import { registerPlugin } from '@capacitor/core'

import { appRuntime } from './runtime'
import { parsePairingQrUrl, type PairingQr } from './pairingFlow'

export const APP_DEEP_LINK_EVENT = 'fridgeboard:deep-link'

type DeepLinkPlugin = {
  getInitialUrl: () => Promise<{ url: string | null }>
  addListener: (eventName: 'urlOpen', listener: (event: { url: string }) => void) => Promise<{ remove: () => Promise<void> }>
}

type DeepLinkListenerHandle = Awaited<ReturnType<DeepLinkPlugin['addListener']>>

export type MobileAuthCallback = {
  code?: string
  error?: string
  errorDescription?: string
  state: string
}

export type AppDeepLink =
  | { kind: 'pairing'; pairing: PairingQr }
  | { kind: 'mobile-auth'; callback: MobileAuthCallback }

const DeepLink = registerPlugin<DeepLinkPlugin>('DeepLink', {
  web: () => ({
    getInitialUrl: async () => ({ url: null }),
    addListener: async () => ({ remove: async () => undefined }),
  }),
})

let pendingDeepLink: AppDeepLink | null = null
let initialized = false
let initializationPromise: Promise<void> | null = null

/** 只解析公开 HTTPS 域名上的配对和移动登录回调，拒绝任意外部 URL。 */
export function parseAppDeepLink(value: string, expectedOrigin: string): AppDeepLink | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.origin !== expectedOrigin) return null
  if (url.pathname === '/pair') {
    const pairing = parsePairingQrUrl(value, expectedOrigin)
    if (!pairing || [...url.searchParams.keys()].some(key => key !== pairingParameter(pairing))) return null
    return { kind: 'pairing', pairing }
  }
  if (url.pathname !== '/mobile/auth/callback') return null
  return parseMobileAuthCallback(url)
}

/** 注册原生 URL 事件，并在冷启动时读取尚未进入 WebView 的首个链接。 */
export async function initializeDeepLinks(): Promise<void> {
  if (initialized || appRuntime.kind !== 'capacitor') return
  if (initializationPromise) return initializationPromise
  initializationPromise = (async () => {
    let listener: DeepLinkListenerHandle | null = null
    try {
      listener = await DeepLink.addListener('urlOpen', event => stageDeepLink(event.url))
      const initial = await DeepLink.getInitialUrl()
      if (initial.url) stageDeepLink(initial.url)
      initialized = true
    } catch (error) {
      await listener?.remove().catch(() => undefined)
      throw error
    } finally {
      initializationPromise = null
    }
  })()
  return initializationPromise
}

/** 取出 App 内存中的配对链接，令 token 不进入 Web Storage。 */
export function takePendingPairing(): PairingQr | null {
  if (pendingDeepLink?.kind !== 'pairing') return null
  const pairing = pendingDeepLink.pairing
  pendingDeepLink = null
  return pairing
}

/** 取出 App 内存中的移动登录回调，令 code/state 不依赖 WebView 地址栏。 */
export function takePendingMobileAuthCallback(): MobileAuthCallback | null {
  if (pendingDeepLink?.kind !== 'mobile-auth') return null
  const callback = pendingDeepLink.callback
  pendingDeepLink = null
  return callback
}

function stageDeepLink(value: string): void {
  const parsed = parseAppDeepLink(value, appRuntime.apiOrigin ?? window.location.origin)
  if (!parsed) return
  pendingDeepLink = parsed
  window.dispatchEvent(new CustomEvent(APP_DEEP_LINK_EVENT))
}

function pairingParameter(pairing: PairingQr): 'bootstrap' | 'token' {
  return pairing.kind === 'bootstrap' ? 'bootstrap' : 'token'
}

function parseMobileAuthCallback(url: URL): AppDeepLink | null {
  const allowedParameters = new Set(['code', 'error', 'error_description', 'state'])
  for (const key of url.searchParams.keys()) {
    if (!allowedParameters.has(key) || url.searchParams.getAll(key).length !== 1) return null
  }
  const state = url.searchParams.get('state')
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  if (!state || (!code && !error) || (code && error)) return null
  return {
    kind: 'mobile-auth',
    callback: {
      code: code ?? undefined,
      error: error ?? undefined,
      errorDescription: url.searchParams.get('error_description') ?? undefined,
      state,
    },
  }
}
