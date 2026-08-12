import { Capacitor } from '@capacitor/core'

export type AppRuntimeKind = 'pwa' | 'capacitor'

export type AppRuntimeConfig = {
  kind: AppRuntimeKind
  apiOrigin: string | null
}

const CAPACITOR_API_ORIGIN = import.meta.env.VITE_CAPACITOR_API_ORIGIN || 'https://fridge.flycn.fyi'

export const appRuntime: AppRuntimeConfig = Capacitor.isNativePlatform()
  ? { kind: 'capacitor', apiOrigin: CAPACITOR_API_ORIGIN }
  : { kind: 'pwa', apiOrigin: null }

/** 将业务请求路径映射到当前运行时的 API 地址。 */
export function resolveApiUrl(path: string, runtime: AppRuntimeConfig = appRuntime): string {
  if (runtime.kind === 'pwa' || /^https?:\/\//i.test(path)) return path
  return new URL(path, runtime.apiOrigin ?? CAPACITOR_API_ORIGIN).toString()
}

/** 原生壳不把跨源 HttpOnly Cookie 当作认证凭证；P13.3 接入 Bearer 会话后由调用方提供请求头。 */
export function getRequestCredentials(runtime: AppRuntimeConfig = appRuntime): RequestCredentials {
  return runtime.kind === 'capacitor' ? 'omit' : 'same-origin'
}

/** 原生壳使用包内静态资源，不注册 PWA Service Worker。 */
export function shouldRegisterServiceWorker(runtime: AppRuntimeConfig = appRuntime): boolean {
  return runtime.kind === 'pwa'
}
