import { getNativeAppInfo, openExternalUrl, type NativeAppInfo } from './nativeBridge'
import { resolveApiUrl } from './runtime'

export const IOS_INSTALL_URL = 'https://app.flycn.fyi/apps/fridgeboard'
export const IOS_RELEASE_METADATA_PATH = '/api/mobile/ios/releases/latest'
const LAST_CHECK_KEY = 'fridgeboard:ios-update:last-check'
const COOLDOWN_MS = 6 * 60 * 60 * 1000

export type IosRelease = {
  version: string
  build_number: number
  release: string
  release_notes: string
  artifact_filename: string
  file_size: number
  sha256: string
  install_url: string
}
export type IosUpdateCheck = { local: NativeAppInfo; remote: IosRelease | null; available: boolean }
type CheckStorage = Pick<Storage, 'getItem' | 'setItem'>

function getStorage(): CheckStorage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** 自动检查最多每六小时一次；手动检查及安装前复查不受限制。 */
export function shouldAutoCheckIosUpdate(now = Date.now(), storage = getStorage()): boolean {
  try {
    const last = Number(storage?.getItem(LAST_CHECK_KEY))
    return !last || !Number.isSafeInteger(last) || now < last || now - last >= COOLDOWN_MS
  } catch {
    return true
  }
}

/** 本地存储不可用时仍允许版本检查。 */
export function markIosUpdateCheck(now = Date.now(), storage = getStorage()): void {
  try {
    storage?.setItem(LAST_CHECK_KEY, String(now))
  } catch {
    return
  }
}

/** 严格校验安装域名、版本、摘要及构建号，避免将上游数据直接交给系统。 */
export function parseIosRelease(value: unknown): IosRelease {
  if (!value || typeof value !== 'object') throw new Error('iOS 版本信息无效，请稍后重试。')
  const data = value as Record<string, unknown>
  if (typeof data.version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(data.version)
    || !Number.isSafeInteger(data.build_number) || Number(data.build_number) <= 0 || Number(data.build_number) > 2100000000
    || typeof data.release !== 'string' || !/^\d{12}$/.test(data.release)
    || typeof data.release_notes !== 'string'
    || data.artifact_filename !== `FridgeBoard-${data.version}-ios.ipa`
    || !Number.isSafeInteger(data.file_size) || Number(data.file_size) <= 0
    || typeof data.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(data.sha256)
    || data.install_url !== IOS_INSTALL_URL) {
    throw new Error('iOS 版本信息无效，请稍后重试。')
  }
  return data as IosRelease
}

/** 产品版本优先，同版本比较构建号；较旧版本即使构建号较高也不得降级。 */
export function isIosUpdateAvailable(local: NativeAppInfo, remote: IosRelease): boolean {
  const pattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
  if (local.platform !== 'ios' || !pattern.test(local.versionName) || !pattern.test(remote.version)
    || !Number.isSafeInteger(local.versionCode) || local.versionCode < 0) {
    throw new Error('无法读取当前 iOS 版本，请重新打开应用后重试。')
  }
  const installed = local.versionName.split('.').map(Number)
  const available = remote.version.split('.').map(Number)
  for (const index of [0, 1, 2]) {
    if (available[index] !== installed[index]) return available[index] > installed[index]
  }
  return remote.build_number > local.versionCode
}

/** 同域检查支持取消和超时，204 表示尚无已登记的 Ad Hoc 更新。 */
export async function checkForIosUpdate(fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<IosUpdateCheck> {
  const local = await getNativeAppInfo()
  if (local.platform !== 'ios') throw new Error('当前运行环境不是 iOS App。')
  const controller = new AbortController()
  const cancel = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', cancel, { once: true })
  if (signal?.aborted) cancel()
  const timeout = setTimeout(() => controller.abort(new Error('检查更新超时，请确认网络后重试。')), 15000)
  try {
    controller.signal.throwIfAborted()
    const response = await fetcher(resolveApiUrl(IOS_RELEASE_METADATA_PATH), {
      cache: 'no-store', credentials: 'omit', signal: controller.signal,
    })
    controller.signal.throwIfAborted()
    if (response.status === 204) return { local, remote: null, available: false }
    if (!response.ok) throw new Error(`iOS 版本检查失败（${response.status}），请稍后重试。`)
    const remote = parseIosRelease(await response.json())
    return { local, remote, available: isIosUpdateAvailable(local, remote) }
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', cancel)
  }
}

/** 点击后复查可用版本，再交给 Safari 的现有门户安装流程，不误报安装完成。 */
export async function installIosUpdate(fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<IosUpdateCheck> {
  const result = await checkForIosUpdate(fetcher, signal)
  if (signal?.aborted) signal.throwIfAborted()
  if (result.available && result.remote) await openExternalUrl(result.remote.install_url)
  return result
}
