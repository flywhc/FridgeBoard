import { Capacitor } from '@capacitor/core'

export type AppRuntimeKind = 'pwa' | 'capacitor'

export type AppRuntimeConfig = {
  kind: AppRuntimeKind
  apiOrigin: string | null
}

const CAPACITOR_API_ORIGIN = import.meta.env.VITE_CAPACITOR_API_ORIGIN || 'https://fridge.flycn.fyi'
export const MOBILE_AUTH_REDIRECT_URI = 'fridgeboard://mobile/auth/callback'

function validateCapacitorApiOrigin(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'https:') throw new Error('VITE_CAPACITOR_API_ORIGIN 必须使用 HTTPS')
  return url.origin
}

export const appRuntime: AppRuntimeConfig = Capacitor.isNativePlatform()
  ? { kind: 'capacitor', apiOrigin: validateCapacitorApiOrigin(CAPACITOR_API_ORIGIN) }
  : { kind: 'pwa', apiOrigin: null }

/** 将业务请求路径映射到当前运行时的 API 地址。 */
export function resolveApiUrl(path: string, runtime: AppRuntimeConfig = appRuntime): string {
  if (runtime.kind === 'pwa' || /^https?:\/\//i.test(path)) return path
  return new URL(path, runtime.apiOrigin ?? CAPACITOR_API_ORIGIN).toString()
}

/** 将服务端返回的相对静态资源地址映射到当前运行时。 */
export function resolveRuntimeUrl(path: string, runtime: AppRuntimeConfig = appRuntime): string {
  if (/^https?:\/\//i.test(path)) return path
  return runtime.kind === 'pwa' ? path : new URL(path, runtime.apiOrigin ?? CAPACITOR_API_ORIGIN).toString()
}

/** 判断是否应让 WebView 直接加载第三方图片，避免为公开资源触发带认证头的 CORS 预检。 */
export function isExternalRuntimeAsset(path: string, runtime: AppRuntimeConfig = appRuntime): boolean {
  if (runtime.kind !== 'capacitor') return false
  try {
    const url = new URL(path)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== runtime.apiOrigin
  } catch {
    return false
  }
}

/** 原生壳不把跨源 HttpOnly Cookie 当作认证凭证；P13.3 接入 Bearer 会话后由调用方提供请求头。 */
export function getRequestCredentials(runtime: AppRuntimeConfig = appRuntime): RequestCredentials {
  return runtime.kind === 'capacitor' ? 'omit' : 'same-origin'
}

/** 原生壳使用包内静态资源，不注册 PWA Service Worker。 */
export function shouldRegisterServiceWorker(runtime: AppRuntimeConfig = appRuntime): boolean {
  return runtime.kind === 'pwa'
}

/** Return whether the current native runtime is the Android APK. */
export function isAndroidRuntime(): boolean {
  return appRuntime.kind === 'capacitor' && Capacitor.getPlatform() === 'android'
}
