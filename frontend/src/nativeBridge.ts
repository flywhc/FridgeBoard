import { registerPlugin } from '@capacitor/core'

import { appRuntime } from './runtime'

type NativeSharePayload = { title?: string; text?: string; url?: string }

type NativeCapabilitiesPlugin = {
  share: (payload: NativeSharePayload) => Promise<void>
  getNetworkStatus: () => Promise<{ connected: boolean }>
  addListener: (eventName: 'networkChange' | 'backButton', listener: (event: { connected?: boolean }) => void) => Promise<{ remove: () => Promise<void> }>
}

const NativeCapabilities = registerPlugin<NativeCapabilitiesPlugin>('NativeCapabilities', {
  web: () => ({
    share: async () => undefined,
    getNetworkStatus: async () => ({ connected: navigator.onLine }),
    addListener: async () => ({ remove: async () => undefined }),
  }),
})

export type NetworkStatus = { connected: boolean }

/** 通过原生桥或浏览器 API 分享内容；不可用时复制文本并返回 false。 */
export async function shareContent(payload: NativeSharePayload): Promise<'shared' | 'copied' | 'unavailable'> {
  if (appRuntime.kind === 'capacitor') {
    await NativeCapabilities.share(payload)
    return 'shared'
  }
  if (typeof navigator.share === 'function') {
    await navigator.share(payload)
    return 'shared'
  }
  const copyValue = payload.url || payload.text
  if (!copyValue || !navigator.clipboard?.writeText) return 'unavailable'
  await navigator.clipboard.writeText(copyValue)
  return 'copied'
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
