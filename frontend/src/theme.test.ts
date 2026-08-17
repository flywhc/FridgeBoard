import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, DEFAULT_THEME, getTheme, initializeTheme, readTheme, setTheme, subscribeTheme, THEME_STORAGE_KEY } from './theme'

type FakeStorage = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void }

function makeDocument() {
  const attributes = new Map<string, string>()
  const meta = { setAttribute: (name: string, value: string) => attributes.set(name, value) }
  return {
    documentElement: { dataset: {} as DOMStringMap, style: { colorScheme: '' } },
    querySelector: vi.fn(() => meta),
    head: { appendChild: vi.fn(() => meta) },
    metaAttributes: attributes,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('主题偏好', () => {
  it('没有保存值或保存值损坏时回退水墨屏', () => {
    const storage: FakeStorage = { getItem: () => 'unknown', setItem: vi.fn() }
    expect(readTheme(storage)).toBe(DEFAULT_THEME)
    expect(readTheme({ getItem: () => null, setItem: vi.fn() })).toBe(DEFAULT_THEME)
  })

  it('只接受三种版本化主题值', () => {
    const storage: FakeStorage = { getItem: key => key === THEME_STORAGE_KEY ? 'cartoon' : null, setItem: vi.fn() }
    expect(readTheme(storage)).toBe('cartoon')
    expect(readTheme({ getItem: () => 'dark', setItem: vi.fn() })).toBe(DEFAULT_THEME)
  })

  it('首帧应用 html 属性和运行时 theme-color', () => {
    const documentRef = makeDocument()
    applyTheme('skeuomorphic', documentRef as unknown as Document)
    expect(documentRef.documentElement.dataset.theme).toBe('skeuomorphic')
    expect(documentRef.documentElement.style.colorScheme).toBe('light')
    expect(documentRef.metaAttributes.get('content')).toBe('#F4F7F6')
  })

  it('切换时同步保存、通知订阅者并更新当前值', () => {
    const documentRef = makeDocument()
    const storage: FakeStorage = { getItem: vi.fn(), setItem: vi.fn() }
    const listener = vi.fn()
    const unsubscribe = subscribeTheme(listener)
    setTheme('cartoon', storage, documentRef as unknown as Document)
    unsubscribe()
    expect(storage.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'cartoon')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(getTheme()).toBe('cartoon')
  })

  it('localStorage 不可用时仍然可以应用主题', () => {
    const documentRef = makeDocument()
    const storage: FakeStorage = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    vi.stubGlobal('window', { localStorage: storage })
    expect(initializeTheme(documentRef as unknown as Document)).toBe(DEFAULT_THEME)
    expect(documentRef.documentElement.dataset.theme).toBe(DEFAULT_THEME)
  })
})
