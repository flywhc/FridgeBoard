import { Capacitor, registerPlugin } from '@capacitor/core'
import { MOBILE_AUTH_REDIRECT_URI } from './runtime'
import { clearRuntimeAssetCache } from './runtimeAssetCache'

export type MobileSession = {
  accessToken: string
  refreshToken: string
}

type SecureStoragePlugin = {
  get(options: { key: string }): Promise<{ value: string | null }>
  set(options: { key: string; value: string }): Promise<void>
  remove(options: { key: string }): Promise<void>
}

const SESSION_KEY = 'fridgeboard.mobile.session'
const DEVICE_TOKENS_KEY = 'fridgeboard.mobile.device-tokens'
const ACTIVE_DEVICE_KEY = 'fridgeboard.mobile.active-device'
let webMemoryValue: string | null = null

export type MobileDeviceToken = { refrigeratorId: string; token: string }

const SecureStorage = registerPlugin<SecureStoragePlugin>('SecureSession', {
  web: () => ({
    get: async ({ key }: { key: string }) => ({ value: key === SESSION_KEY ? webMemoryValue : null }),
    set: async ({ key, value }: { key: string; value: string }) => { if (key === SESSION_KEY) webMemoryValue = value },
    remove: async ({ key }: { key: string }) => { if (key === SESSION_KEY) webMemoryValue = null },
  }),
})

/** 读取仅由 Android Keystore/iOS Keychain 保护的 App 会话。 */
export async function readMobileSession(): Promise<MobileSession | null> {
  if (!Capacitor.isNativePlatform()) return null
  const stored = await SecureStorage.get({ key: SESSION_KEY })
  if (!stored.value) return null
  try {
    const parsed = JSON.parse(stored.value) as Partial<MobileSession>
    if (typeof parsed.accessToken !== 'string' || typeof parsed.refreshToken !== 'string') return null
    return parsed as MobileSession
  } catch {
    await clearMobileSession()
    return null
  }
}

/** 将新的 App 会话交给原生安全存储，禁止调用方写入 Web Storage。 */
export async function writeMobileSession(session: MobileSession): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await SecureStorage.set({ key: SESSION_KEY, value: JSON.stringify(session) })
  }
}

/** 清理退出、撤销或刷新失败后的 App 会话。 */
export async function clearMobileSession(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await SecureStorage.remove({ key: SESSION_KEY })
    } finally {
      clearRuntimeAssetCache()
    }
  }
}

/** 在原生安全存储中追加一个已配对冰箱的短期设备凭证。 */
export async function addMobileDeviceToken(refrigeratorId: string, token: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  const stored = await SecureStorage.get({ key: DEVICE_TOKENS_KEY })
  let deviceTokens: MobileDeviceToken[] = []
  if (stored.value) {
    try {
      const parsed = JSON.parse(stored.value) as Array<MobileDeviceToken | string>
      deviceTokens = parsed.flatMap(item => (
        typeof item === 'string' ? [{ refrigeratorId: '', token: item }] : [item]
      ))
    } catch { deviceTokens = [] }
  }
  const nextTokens = deviceTokens.filter(item => item.refrigeratorId !== refrigeratorId)
  nextTokens.push({ refrigeratorId, token })
  await SecureStorage.set({
    key: DEVICE_TOKENS_KEY,
    value: JSON.stringify(nextTokens),
  })
  await setActiveMobileDeviceRefrigerator(refrigeratorId)
}

/** 设置当前日常工作区使用的设备凭证所属冰箱。 */
export async function setActiveMobileDeviceRefrigerator(refrigeratorId: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const active = (await SecureStorage.get({ key: ACTIVE_DEVICE_KEY })).value
    if (active && active !== refrigeratorId) clearRuntimeAssetCache()
    await SecureStorage.set({ key: ACTIVE_DEVICE_KEY, value: refrigeratorId })
  }
}

/** 读取指定冰箱的日常设备 Bearer，不与 Owner App 会话混用。 */
export async function readMobileDeviceToken(refrigeratorId?: string): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null
  const stored = await SecureStorage.get({ key: DEVICE_TOKENS_KEY })
  if (!stored.value) return null
  const active = refrigeratorId ?? (await SecureStorage.get({ key: ACTIVE_DEVICE_KEY })).value ?? undefined
  try {
    const parsed = JSON.parse(stored.value) as Array<MobileDeviceToken | string>
    const tokens = parsed.flatMap(item => (
      typeof item === 'string' ? [{ refrigeratorId: '', token: item }] : [item]
    ))
    return (tokens.find(item => item.refrigeratorId === active) ?? tokens[0])?.token ?? null
  } catch { return null }
}

/** 清理当前或指定冰箱的设备凭证，保留 Owner App 会话。 */
export async function clearMobileDeviceToken(refrigeratorId?: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  clearRuntimeAssetCache()
  const active = refrigeratorId ?? (await SecureStorage.get({ key: ACTIVE_DEVICE_KEY })).value ?? undefined
  if (!active) {
    await SecureStorage.remove({ key: DEVICE_TOKENS_KEY })
    return
  }
  const stored = await SecureStorage.get({ key: DEVICE_TOKENS_KEY })
  if (!stored.value) return
  try {
    const parsed = JSON.parse(stored.value) as MobileDeviceToken[]
    const remaining = parsed.filter(item => item.refrigeratorId !== active)
    await SecureStorage.set({
      key: DEVICE_TOKENS_KEY,
      value: JSON.stringify(remaining),
    })
    if (remaining[0]?.refrigeratorId) {
      await setActiveMobileDeviceRefrigerator(remaining[0].refrigeratorId)
    } else {
      await SecureStorage.remove({ key: ACTIVE_DEVICE_KEY })
    }
  } catch {
    await SecureStorage.remove({ key: DEVICE_TOKENS_KEY })
    await SecureStorage.remove({ key: ACTIVE_DEVICE_KEY })
  }
}

/** 生成不进入 URL 的 PKCE verifier/state，并将短期登录事务存入安全存储。 */
export async function createMobileAuthTransaction(): Promise<{
  state: string
  verifier: string
  redirectUri: string
}> {
  const bytes = new Uint8Array(48)
  crypto.getRandomValues(bytes)
  const encode = (value: Uint8Array) => btoa(String.fromCharCode(...value))
    .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
  const verifier = encode(bytes)
  const stateBytes = new Uint8Array(32)
  crypto.getRandomValues(stateBytes)
  const state = encode(stateBytes)
  const redirectUri = MOBILE_AUTH_REDIRECT_URI
  await SecureStorage.set({
    key: 'fridgeboard.mobile.auth-transaction',
    value: JSON.stringify({ state, verifier, redirectUri, createdAt: Date.now() }),
  })
  return { state, verifier, redirectUri }
}

export async function readMobileAuthTransaction(): Promise<{
  state: string
  verifier: string
  redirectUri: string
} | null> {
  const result = await SecureStorage.get({ key: 'fridgeboard.mobile.auth-transaction' })
  if (!result.value) return null
  try {
    const parsed = JSON.parse(result.value) as { state?: string; verifier?: string; redirectUri?: string; createdAt?: number }
    if (!parsed.state || !parsed.verifier || !parsed.redirectUri || !parsed.createdAt || Date.now() - parsed.createdAt > 5 * 60_000) return null
    return parsed as { state: string; verifier: string; redirectUri: string }
  } finally {
    await SecureStorage.remove({ key: 'fridgeboard.mobile.auth-transaction' })
  }
}
