import { downloadAndInstallApk, getNativeAppInfo, type NativeAppInfo, openInstallSettings } from './nativeBridge'

export const PUBLIC_ANDROID_UPDATE_URL = 'https://app.flycn.fyi/api/apps/fridgeboard/releases/latest?platform=android&variant=universal'

export type PublicAndroidRelease = {
  app_slug: 'fridgeboard'
  platform: 'android'
  variant: 'universal'
  version: string
  build_number: string
  artifact_filename: string
  file_size: number
  sha256: string
  release_notes: string
  download_url: string | null
  expires_at: string | null
}

export type AndroidUpdateCheck = {
  local: NativeAppInfo
  remote: PublicAndroidRelease
  available: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value)
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'app.flycn.fyi'
  } catch {
    return false
  }
}

/** Validate the public Android update response before it reaches native code. */
export function parsePublicAndroidRelease(value: unknown): PublicAndroidRelease {
  if (!isRecord(value)
    || value.app_slug !== 'fridgeboard'
    || value.platform !== 'android'
    || value.variant !== 'universal'
    || typeof value.version !== 'string'
    || !/^\S+$/.test(value.version)
    || typeof value.build_number !== 'string'
    || !/^[1-9][0-9]*$/.test(value.build_number)
    || typeof value.artifact_filename !== 'string'
    || !value.artifact_filename.toLowerCase().endsWith('.apk')
    || typeof value.file_size !== 'number'
    || !Number.isSafeInteger(value.file_size)
    || value.file_size <= 0
    || !isSha256(value.sha256)
    || typeof value.release_notes !== 'string'
    || (value.download_url !== null && !isHttpsUrl(value.download_url))
    || (value.expires_at !== null && typeof value.expires_at !== 'string')
    || ((value.download_url === null) !== (value.expires_at === null))) {
    throw new Error('最新版信息格式无效。')
  }
  return value as unknown as PublicAndroidRelease
}

/** Compare the remote Android build number with the installed native version. */
export function isAndroidUpdateAvailable(localVersionCode: number, remoteBuildNumber: string): boolean {
  if (!Number.isSafeInteger(localVersionCode) || localVersionCode < 0 || !/^[0-9]+$/.test(remoteBuildNumber)) return false
  const remote = Number(remoteBuildNumber)
  return Number.isSafeInteger(remote) && remote > localVersionCode
}

/** Fetch and validate the latest public Android release metadata. */
export async function checkForAndroidUpdate(fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<AndroidUpdateCheck> {
  const local = await getNativeAppInfo()
  if (signal?.aborted) throw new DOMException('更新检查已取消。', 'AbortError')
  if (local.platform !== 'android') throw new Error('当前运行环境不是 Android APK。')
  const requestInit: RequestInit = { cache: 'no-store', credentials: 'omit' }
  if (signal) requestInit.signal = signal
  const updateUrl = new URL(PUBLIC_ANDROID_UPDATE_URL)
  updateUrl.searchParams.set('current_build_number', String(local.versionCode))
  const response = await fetcher(updateUrl, requestInit)
  if (!response.ok) throw new Error(`版本检查失败（${response.status}）。`)
  const remote = parsePublicAndroidRelease(await response.json())
  return { local, remote, available: isAndroidUpdateAvailable(local.versionCode, remote.build_number) }
}

/** Start downloading an already validated Android release through the native bridge. */
export async function installAndroidUpdate(release: PublicAndroidRelease): Promise<void> {
  if (!release.download_url) throw new Error('暂无可用的更新下载地址。')
  await downloadAndInstallApk({
    url: release.download_url,
    sha256: release.sha256,
    filename: release.artifact_filename,
    fileSize: release.file_size,
  })
}

export { openInstallSettings }
