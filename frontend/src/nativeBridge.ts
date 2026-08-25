import { Capacitor, registerPlugin } from '@capacitor/core'

import { appRuntime } from './runtime'

export type NativeSharePayload = { title?: string; text?: string; url?: string }
export type NativeAppInfo = { platform: 'android' | 'ios' | 'web'; versionName: string; versionCode: number }
export type ApkUpdateEvent = { state: 'download-failed' | 'installing'; message?: string; code?: string }
export type NativeSystemBarOptions = { color: string; style: 'LIGHT' | 'DARK' }

type NativeCapabilitiesPlugin = {
  share: (payload: NativeSharePayload) => Promise<void>
  openExternalUrl: (options: { url: string }) => Promise<void>
  getAppInfo: () => Promise<NativeAppInfo>
  downloadAndInstallApk: (options: { url: string; sha256: string; filename: string; fileSize: number }) => Promise<void>
  openInstallSettings: () => Promise<void>
  getNetworkStatus: () => Promise<{ connected: boolean }>
  setSystemBars: (options: NativeSystemBarOptions) => Promise<void>
  addListener: (eventName: 'networkChange' | 'backButton' | 'apkUpdate', listener: (event: { connected?: boolean } & ApkUpdateEvent) => void) => Promise<{ remove: () => Promise<void> }>
}

const NativeCapabilities = registerPlugin<NativeCapabilitiesPlugin>('NativeCapabilities', {
  web: () => ({
    share: async () => undefined,
    openExternalUrl: async ({ url }: { url: string }) => { window.open(url, '_blank', 'noopener,noreferrer') },
    getAppInfo: async () => ({ platform: 'web', versionName: 'dev', versionCode: 0 }),
    downloadAndInstallApk: async () => undefined,
    openInstallSettings: async () => undefined,
    getNetworkStatus: async () => ({ connected: navigator.onLine }),
    setSystemBars: async () => undefined,
    addListener: async () => ({ remove: async () => undefined }),
  }),
})

export type NetworkStatus = { connected: boolean }
export type ShareResult = 'shared' | 'cancelled' | 'copied' | 'unavailable'

/** Synchronize Android system-area colors with the active application theme. */
export async function setNativeSystemBars(options: NativeSystemBarOptions): Promise<void> {
  if (appRuntime.kind !== 'capacitor' || Capacitor.getPlatform?.() !== 'android') return
  await NativeCapabilities.setSystemBars(options).catch(() => undefined)
}

function isShareCancelled(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; name?: unknown }
  return candidate.code === 'SHARE_CANCELLED' || candidate.name === 'AbortError'
}

/** Read the native package version used for Android upgrade comparison. */
export async function getNativeAppInfo(): Promise<NativeAppInfo> {
  return NativeCapabilities.getAppInfo()
}

/** Start a native APK download and system installation flow. */
export async function downloadAndInstallApk(options: { url: string; sha256: string; filename: string; fileSize: number }): Promise<void> {
  await NativeCapabilities.downloadAndInstallApk(options)
}

/** Open the Android system page used to allow this app to install APK files. */
export async function openInstallSettings(): Promise<void> {
  await NativeCapabilities.openInstallSettings()
}

/** Subscribe to native APK download/install failures and installer launch events. */
export function subscribeApkUpdate(listener: (event: ApkUpdateEvent) => void): () => void {
  if (appRuntime.kind !== 'capacitor') return () => undefined
  let active = true
  let remove: (() => Promise<void>) | undefined
  void NativeCapabilities.addListener('apkUpdate', event => {
    if (active && (event.state === 'download-failed' || event.state === 'installing')) {
      listener({ state: event.state, message: event.message, code: event.code })
    }
  }).then(handle => {
    if (!active) return handle.remove()
    remove = handle.remove
    return undefined
  }).catch(() => undefined)
  return () => {
    active = false
    const cleanup = remove
    remove = undefined
    void cleanup?.()
  }
}

function getCopyValue(payload: NativeSharePayload): string {
  return [payload.text, payload.url].filter((value): value is string => Boolean(value)).join('\n')
}

async function copyShareContent(payload: NativeSharePayload): Promise<'copied' | 'unavailable'> {
  const copyValue = getCopyValue(payload)
  if (!copyValue || !navigator.clipboard?.writeText) return 'unavailable'
  await navigator.clipboard.writeText(copyValue)
  return 'copied'
}

/** 通过原生桥或浏览器 API 分享内容；分享能力失败时复制完整内容。 */
export async function shareContent(payload: NativeSharePayload): Promise<ShareResult> {
  if (appRuntime.kind === 'capacitor') {
    try {
      await NativeCapabilities.share(payload)
      return 'shared'
    } catch (error) {
      if (isShareCancelled(error)) return 'cancelled'
      return copyShareContent(payload)
    }
  }
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share(payload)
      return 'shared'
    } catch (error) {
      if (isShareCancelled(error)) return 'cancelled'
      return copyShareContent(payload)
    }
  }
  return copyShareContent(payload)
}

/** 在原生壳中把登录地址交给明确的系统浏览器，避免 HTTPS App Link 弹出应用选择器。 */
export async function openExternalUrl(url: string): Promise<void> {
  if (appRuntime.kind === 'capacitor') {
    await NativeCapabilities.openExternalUrl({ url })
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

/** 读取当前网络状态；原生壳和浏览器均只用于提示，不改变业务离线语义。 */
export async function getNetworkStatus(): Promise<NetworkStatus> {
  return NativeCapabilities.getNetworkStatus()
}

/** 监听网络变化，调用方负责在组件卸载时移除监听。 */
export function subscribeNetworkStatus(listener: (status: NetworkStatus) => void): () => void {
  if (appRuntime.kind !== 'capacitor') {
    const update = () => listener({ connected: navigator.onLine })
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }
  let active = true
  let remove: (() => Promise<void>) | undefined
  void NativeCapabilities.addListener('networkChange', event => {
    if (active && typeof event.connected === 'boolean') listener({ connected: event.connected })
  }).then(handle => {
    if (!active) return handle.remove()
    remove = handle.remove
    return undefined
  }).catch(() => undefined)
  return () => {
    active = false
    const cleanup = remove
    remove = undefined
    void cleanup?.()
  }
}

/** 订阅原生系统返回；只有页面注册处理器时才消费事件。 */
export function subscribeNativeBack(listener: () => void): () => void {
  if (appRuntime.kind !== 'capacitor') return () => undefined
  let active = true
  let remove: (() => Promise<void>) | undefined
  void NativeCapabilities.addListener('backButton', () => {
    if (active) listener()
  }).then(handle => {
    if (!active) return handle.remove()
    remove = handle.remove
    return undefined
  }).catch(() => undefined)
  return () => {
    active = false
    const cleanup = remove
    remove = undefined
    void cleanup?.()
  }
}
