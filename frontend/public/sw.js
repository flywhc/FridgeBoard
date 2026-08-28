const RELEASE = new URL(self.location.href).searchParams.get('release') || 'legacy'
const CACHE_NAME = `fridgeboard-app-${RELEASE}`
const APP_SHELL = ['/index.html', '/manifest.webmanifest', '/favicon-16-ice3.png', '/favicon-32-ice3.png', '/apple-touch-icon-ice3.png', '/icon-192-ice3.png', '/icon-512-ice3.png', '/splash-1024-ice4.png', '/app-boot-ice4.png']
const ICON_ASSET_PATH = /^\/api\/icon-library\/[^/]+(?:\.svg)?$/

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('fridgeboard-app-') && key !== CACHE_NAME).map(key => caches.delete(key)))),
  )
  self.clients.claim()
})

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) await cache.put(request, response.clone())
  return response
}

async function refreshNavigationCache(request, cache, previousResponse) {
  try {
    const response = await fetch(request, { cache: 'no-store' })
    if (response.ok) {
      const previousText = previousResponse ? await previousResponse.clone().text() : null
      const nextText = await response.clone().text()
      await cache.put('/index.html', response.clone())
      if (previousText !== null && previousText !== nextText) {
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        clients.forEach(client => client.postMessage({ type: 'APP_SHELL_UPDATED' }))
      }
    }
    return response
  } catch {
    return null
  }
}

async function cacheFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match('/index.html')
  if (cached) {
    void refreshNavigationCache(request, cache, cached)
    return cached
  }
  return await refreshNavigationCache(request, cache, null) || Response.error()
}

self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  if (request.mode === 'navigate' && url.pathname.startsWith('/fridge')) return

  const isIconAsset = ICON_ASSET_PATH.test(url.pathname)
  if (url.pathname.startsWith('/api/') && !isIconAsset) return

  if (request.mode === 'navigate') {
    event.respondWith(cacheFirstNavigation(request))
    return
  }

  if (isIconAsset) {
    event.respondWith(cacheFirst(request))
    return
  }

  event.respondWith(cacheFirst(request))
})
