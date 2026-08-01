const CACHE_NAME = 'fridgeboard-app-v2'
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate' && url.pathname.startsWith('/fridge')) return

  if (request.mode === 'navigate') {
    const refresh = caches.open(CACHE_NAME).then(cache => fetch(request).then(response => {
      if (response.ok) void cache.put(request, response.clone())
      return response
    }))
    event.waitUntil(refresh.catch(() => undefined))
    event.respondWith(caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(request) || await cache.match('/index.html')
      return cached || refresh.catch(() => cache.match('/index.html'))
    }))
    return
  }

  const refresh = caches.open(CACHE_NAME).then(cache => fetch(request).then(response => {
    if (response.ok) void cache.put(request, response.clone())
    return response
  }))
  event.waitUntil(refresh.catch(() => undefined))
  event.respondWith(caches.open(CACHE_NAME).then(async cache => {
    const cached = await cache.match(request)
    return cached || refresh.catch(() => cache.match(request))
  }))
})
