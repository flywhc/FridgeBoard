import { downloadAndInstallApk, getNativeAppInfo, type NativeAppInfo, openInstallSettings } from './nativeBridge'

export const GITHUB_ANDROID_RELEASES_URL = 'https://api.github.com/repos/flywhc/FridgeBoard/releases/latest'
export const ANDROID_UPDATE_CHECK_COOLDOWN_MS = 6 * 60 * 60 * 1000

const LAST_ANDROID_UPDATE_CHECK_KEY = 'fridgeboard:android-update:last-check'

type UpdateCheckStorage = Pick<Storage, 'getItem' | 'setItem'>

export type PublicAndroidRelease = {
  app_slug: 'fridgeboard'
  platform: 'android'
  variant: 'universal'
  version: string
  release: string
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

function isHttpsUrl(value: unknown, expectedPath: string): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'github.com'
      && decodeURIComponent(url.pathname) === expectedPath
  } catch {
    return false
  }
}

function isSemver(value: unknown): value is string {
  return typeof value === 'string' && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value)
}

function getUpdateCheckStorage(): UpdateCheckStorage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** Return whether an automatic update request is outside the local cooldown window. */
export function shouldAutoCheckAndroidUpdate(
  now = Date.now(),
  storage: UpdateCheckStorage | null = getUpdateCheckStorage(),
): boolean {
  if (!storage) return true
  try {
    const lastCheck = Number(storage.getItem(LAST_ANDROID_UPDATE_CHECK_KEY))
    return !Number.isSafeInteger(lastCheck) || now >= lastCheck + ANDROID_UPDATE_CHECK_COOLDOWN_MS
  } catch {
    return true
  }
}

/** Persist the start time of an update check without making local storage a hard dependency. */
export function markAndroidUpdateCheck(now = Date.now(), storage: UpdateCheckStorage | null = getUpdateCheckStorage()): void {
  if (!storage) return
  try {
    storage.setItem(LAST_ANDROID_UPDATE_CHECK_KEY, String(now))
  } catch {
    // Private browsing and storage quota errors must not block update checks.
  }
}

/** Convert and validate the public GitHub Release metadata before native code sees it. */
export function parseGitHubAndroidRelease(value: unknown): PublicAndroidRelease {
  if (!isRecord(value) || typeof value.tag_name !== 'string' || !Array.isArray(value.assets)) {
    throw new Error('最新版信息格式无效。')
  }
  const tagMatch = /^v(.+)$/.exec(value.tag_name)
  const version = tagMatch?.[1]
  if (!isSemver(version)) throw new Error('最新版版本号无效。')
  const releaseMatch = typeof value.name === 'string' ? /\brelease ([0-9]{12})\b/.exec(value.name) : null
  const escapedVersion = version.replace(/[.+]/g, '\\$&')
  const filenamePattern = new RegExp(`^FridgeBoard-${escapedVersion}-android-([1-9][0-9]*)\\.apk$`)
  const asset = value.assets.find(item => {
    if (!isRecord(item) || typeof item.name !== 'string' || !filenamePattern.test(item.name)) return false
    return typeof item.size === 'number' && Number.isSafeInteger(item.size) && item.size > 0
      && typeof item.digest === 'string' && /^sha256:[0-9a-f]{64}$/i.test(item.digest)
      && isHttpsUrl(item.browser_download_url, `/flywhc/FridgeBoard/releases/download/${value.tag_name}/${item.name}`)
  })
  if (!isRecord(asset)) throw new Error('最新版 APK 不可用。')
  const buildMatch = filenamePattern.exec(asset.name as string)
  if (!buildMatch) throw new Error('最新版构建号无效。')
  const sha256 = (asset.digest as string).slice('sha256:'.length)
  if (!isSha256(sha256)) throw new Error('最新版 SHA-256 无效。')
  return {
    app_slug: 'fridgeboard',
    platform: 'android',
    variant: 'universal',
    version,
    release: releaseMatch?.[1] ?? '',
    build_number: buildMatch[1],
    artifact_filename: asset.name as string,
    file_size: asset.size as number,
    sha256,
    release_notes: typeof value.body === 'string' ? value.body : '',
    download_url: asset.browser_download_url as string,
    expires_at: null,
  }
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
  const requestInit: RequestInit = {
    cache: 'no-store',
    credentials: 'omit',
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  }
  if (signal) requestInit.signal = signal
  const response = await fetcher(GITHUB_ANDROID_RELEASES_URL, requestInit)
  if (response.status === 403 || response.status === 429) throw new Error('GitHub 更新检查暂时受限，请稍后重试。')
  if (!response.ok) throw new Error(`版本检查失败（${response.status}）。`)
  const remote = parseGitHubAndroidRelease(await response.json())
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
