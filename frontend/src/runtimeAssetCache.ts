import { resolveRuntimeUrl } from './runtime'

type RuntimeAssetCacheEntry = {
  generation: number
  promise: Promise<string>
  objectUrl?: string
}

const entries = new Map<string, RuntimeAssetCacheEntry>()
let generation = 0
const PERSISTENT_CACHE_NAME = 'fridgeboard-icons-v1'

function isPersistentIconAsset(key: string): boolean {
  try {
    const path = new URL(key, 'https://fridgeboard.invalid').pathname
    return [
      /^\/api\/icon-library\/[^/]+(?:\.svg)?$/,
      /^\/api\/owner\/refrigerators\/[^/]+\/icons\/[^/]+$/,
      /^\/api\/daily\/refrigerators\/[^/]+\/icons\/[^/]+$/,
      /^\/api\/devices\/current\/icons\/[^/]+$/,
    ].some(pattern => pattern.test(path))
  } catch {
    return false
  }
}

function hasCacheStorage(): boolean {
  return 'caches' in globalThis
}

async function readPersistentAsset(key: string): Promise<Blob | null> {
  if (!hasCacheStorage()) return null
  try {
    const cache = await caches.open(PERSISTENT_CACHE_NAME)
    const response = await cache.match(resolveRuntimeUrl(key))
    return response?.ok ? response.blob() : null
  } catch {
    return null
  }
}

async function writePersistentAsset(key: string, blob: Blob): Promise<void> {
  if (!hasCacheStorage()) return
  try {
    const cache = await caches.open(PERSISTENT_CACHE_NAME)
    await cache.put(
      resolveRuntimeUrl(key),
      new Response(blob, { headers: blob.type ? { 'content-type': blob.type } : undefined }),
    )
  } catch {
    // 持久化缓存不可用时仍保留当前进程内缓存，不能阻断图标显示。
  }
}

/** 复用同一资源的 Blob URL，并合并尚未完成的并发请求。 */
export function getCachedRuntimeAssetUrl(
  key: string,
  load: () => Promise<Blob>,
  options: { persistent?: boolean } = {},
): Promise<string> {
  const cached = entries.get(key)
  if (cached) return cached.promise
  const persistent = options.persistent ?? isPersistentIconAsset(key)

  const entry: RuntimeAssetCacheEntry = { generation, promise: Promise.resolve('') }
  entry.promise = (persistent ? readPersistentAsset(key) : Promise.resolve(null)).then(async cachedBlob => {
    const blob = cachedBlob ?? await load()
    if (persistent && !cachedBlob) await writePersistentAsset(key, blob)
    return blob
  }).then(blob => {
    const objectUrl = URL.createObjectURL(blob)
    if (entry.generation !== generation || entries.get(key) !== entry) {
      URL.revokeObjectURL(objectUrl)
      throw new Error('图片资源缓存已失效')
    }
    entry.objectUrl = objectUrl
    return objectUrl
  }).catch(error => {
    if (entries.get(key) === entry) entries.delete(key)
    throw error
  })
  entries.set(key, entry)
  return entry.promise
}

/** 返回已经恢复到当前进程的 Blob URL，首屏渲染不会再等待异步 effect。 */
export function getRuntimeAssetUrl(key: string): string | null {
  return entries.get(key)?.objectUrl ?? null
}

/** 仅从 CacheStorage 恢复资源，不在启动阶段发起网络请求。 */
export async function preloadPersistentRuntimeAssets(keys: Iterable<string>): Promise<void> {
  await Promise.all([...new Set(keys)].map(key => getCachedRuntimeAssetUrl(
    key,
    () => Promise.reject(new Error('持久化图片缓存不存在')),
    { persistent: true },
  ).then(() => undefined).catch(() => undefined)))
}

/** 清理认证上下文变化前的内存 Blob URL，保留已按版本隔离的持久化图标缓存。 */
export function clearRuntimeAssetCache(): void {
  generation += 1
  entries.forEach(entry => {
    if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl)
  })
  entries.clear()
}

/** 清理用户主动要求刷新的全部图标持久化缓存。 */
export async function clearPersistentRuntimeAssetCache(): Promise<void> {
  if (!hasCacheStorage()) return
  try {
    await caches.delete(PERSISTENT_CACHE_NAME)
  } catch {
    // 缓存存储不可用时不阻断页面刷新。
  }
}
