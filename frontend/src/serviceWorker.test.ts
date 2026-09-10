import { describe, expect, it, vi } from 'vitest'
// @ts-expect-error The frontend build intentionally omits Node types; this test executes the public worker.
import { readFileSync } from 'node:fs'

type WorkerEvent = { waitUntil: (promise: Promise<unknown>) => void }
type FetchEvent = WorkerEvent & { request: Request; respondWith: (promise: Promise<Response>) => void }

const workerSource = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')

function createWorker(options: { online?: boolean } = {}) {
  const handlers = new Map<string, (event: WorkerEvent & Partial<FetchEvent>) => void>()
  const entries = new Map<string, Response>()
  const cache = {
    addAll: vi.fn(async (paths: string[]) => {
      for (const path of paths) {
        const response = await fetcher(path)
        if (!response.ok) throw new Error(`missing ${path}`)
        entries.set(path, response.clone())
      }
    }),
    match: vi.fn(async (key: RequestInfo | URL) => entries.get(typeof key === 'string' ? key : new URL(key.toString()).pathname)?.clone()),
    put: vi.fn(async (key: RequestInfo | URL, response: Response) => {
      entries.set(typeof key === 'string' ? key : new URL(key.toString()).pathname, response.clone())
    }),
  }
  const html = '<script type="module" src="/assets/index-new.js"></script><link rel="stylesheet" href="/assets/index-new.css">'
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    if (options.online === false) throw new TypeError('offline')
    const url = new URL(typeof input === 'string' ? input : input.toString(), 'https://fridge.example')
    if (url.pathname === '/' || url.pathname === '/index.html') return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } })
    return new Response(`asset:${url.pathname}`, { status: 200, headers: { 'Content-Type': 'text/javascript' } })
  })
  const navigate = vi.fn(async () => null)
  const self = {
    location: {
      href: 'https://fridge.example/sw.js?release=260911010203',
      origin: 'https://fridge.example',
    },
    addEventListener: (type: string, handler: (event: WorkerEvent & Partial<FetchEvent>) => void) => handlers.set(type, handler),
    skipWaiting: vi.fn(),
    clients: {
      claim: vi.fn(async () => undefined),
      matchAll: vi.fn(async () => [{ url: 'https://fridge.example/', navigate }]),
    },
  }
  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => ['fridgeboard-app-old', 'fridgeboard-icons-v1']),
    delete: vi.fn(async () => true),
  }
  new Function('self', 'caches', 'fetch', 'Response', 'URL', workerSource)(self, caches, fetcher, Response, URL)
  return { cache, caches, entries, fetcher, handlers, navigate, self }
}

async function runWaitUntil(handler: (event: WorkerEvent) => void): Promise<void> {
  let completion = Promise.resolve<unknown>(undefined)
  handler({ waitUntil: promise => { completion = promise } })
  await completion
}

describe('PWA Service Worker', () => {
  it('安装时缓存当前 HTML 及其入口 JS/CSS', async () => {
    const worker = createWorker()

    await runWaitUntil(worker.handlers.get('install')!)

    expect(worker.entries.has('/index.html')).toBe(true)
    expect(worker.cache.addAll).toHaveBeenCalledWith(expect.arrayContaining([
      '/assets/index-new.js',
      '/assets/index-new.css',
    ]))
  })

  it('导航联网时返回新版 HTML，断网时回退缓存入口', async () => {
    const navigationRequest = {
      method: 'GET',
      mode: 'navigate',
      url: 'https://fridge.example/',
      toString: () => 'https://fridge.example/',
    } as unknown as Request
    const online = createWorker()
    let onlineResponse = Promise.resolve(Response.error())
    online.handlers.get('fetch')!({
      request: navigationRequest,
      respondWith: promise => { onlineResponse = promise },
      waitUntil: () => undefined,
    })
    expect(await (await onlineResponse).text()).toContain('/assets/index-new.js')
    expect(online.entries.has('/index.html')).toBe(true)

    const offline = createWorker({ online: false })
    offline.entries.set('/index.html', new Response('cached shell'))
    let offlineResponse = Promise.resolve(Response.error())
    offline.handlers.get('fetch')!({
      request: navigationRequest,
      respondWith: promise => { offlineResponse = promise },
      waitUntil: () => undefined,
    })
    expect(await (await offlineResponse).text()).toBe('cached shell')
  })

  it('激活时清理旧壳并重新导航已打开窗口', async () => {
    const worker = createWorker()

    await runWaitUntil(worker.handlers.get('activate')!)

    expect(worker.caches.delete).toHaveBeenCalledWith('fridgeboard-app-old')
    expect(worker.caches.delete).not.toHaveBeenCalledWith('fridgeboard-icons-v1')
    expect(worker.self.clients.claim).toHaveBeenCalledOnce()
    expect(worker.navigate).toHaveBeenCalledWith('https://fridge.example/')
  })
})
