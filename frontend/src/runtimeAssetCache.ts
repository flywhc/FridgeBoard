import { resolveRuntimeUrl } from './runtime'

type RuntimeAssetCacheEntry = {
  generation: number
  promise: Promise<string>
  objectUrl?: string
}

const entries = new Map<string, RuntimeAssetCacheEntry>()
let generation = 0
const PERSISTENT_CACHE_NAME = 'fridgeboard-icons-v1'

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
export function getCachedRuntimeAssetUrl(key: string, load: () => Promise<Blob>): Promise<string> {
  const cached = entries.get(key)
  if (cached) return cached.promise

  const entry: RuntimeAssetCacheEntry = { generation, promise: Promise.resolve('') }
  entry.promise = readPersistentAsset(key).then(async cachedBlob => {
    const blob = cachedBlob ?? await load()
    if (!cachedBlob) await writePersistentAsset(key, blob)
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

/** 清理认证上下文变化前缓存的 Blob URL，避免旧用户或旧设备资源残留。 */
export function clearRuntimeAssetCache(): void {
  generation += 1
  entries.forEach(entry => {
    if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl)
  })
  entries.clear()
  if (hasCacheStorage()) void caches.delete(PERSISTENT_CACHE_NAME)
}
