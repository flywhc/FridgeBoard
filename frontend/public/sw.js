const CACHE_NAME = 'fridgeboard-app-v10'
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

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME)
  try {
    const response = await fetch(request, { cache: 'no-store' })
    if (response.ok) await cache.put('/index.html', response.clone())
    return response
  } catch {
    return await cache.match('/index.html') || Response.error()
  }
}

self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  if (request.mode === 'navigate' && url.pathname.startsWith('/fridge')) return

  const isIconAsset = ICON_ASSET_PATH.test(url.pathname)
  if (url.pathname.startsWith('/api/') && !isIconAsset) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request))
    return
  }

  if (isIconAsset) {
    event.respondWith(cacheFirst(request))
    return
  }

  event.respondWith(cacheFirst(request))
})
