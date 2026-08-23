import { useSyncExternalStore } from 'react'

export type ThemeKey = 'ink' | 'skeuomorphic' | 'cartoon'

export type ThemeDefinition = {
  key: ThemeKey
  label: string
  description: string
  themeColor: string
}

export const THEME_STORAGE_KEY = 'fridgeboard-theme-v1'
export const DEFAULT_THEME: ThemeKey = 'ink'

export const THEME_REGISTRY: Readonly<Record<ThemeKey, ThemeDefinition>> = {
  ink: { key: 'ink', label: '水墨', description: '黑白高对比，清晰克制', themeColor: '#FFFFFF' },
  skeuomorphic: { key: 'skeuomorphic', label: '拟物', description: '真实材质，暖色立体层次', themeColor: '#EBE6DD' },
  cartoon: { key: 'cartoon', label: '卡通', description: '明快色彩，清晰粗轮廓', themeColor: '#EAF5F1' },
}

let activeTheme: ThemeKey = DEFAULT_THEME
const listeners = new Set<() => void>()

function isThemeKey(value: string | null): value is ThemeKey {
  return value === 'ink' || value === 'skeuomorphic' || value === 'cartoon'
}

function getBrowserStorage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

export function readTheme(storage = getBrowserStorage()): ThemeKey {
  try {
    const value = storage?.getItem(THEME_STORAGE_KEY) ?? null
    return isThemeKey(value) ? value : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

export function applyTheme(theme: ThemeKey, documentRef: Document = document): void {
  const definition = THEME_REGISTRY[theme]
  documentRef.documentElement.dataset.theme = theme
  documentRef.documentElement.style.colorScheme = 'light'
  const meta = documentRef.querySelector('meta[name="theme-color"]') ?? documentRef.head.appendChild(documentRef.createElement('meta'))
  meta.setAttribute('name', 'theme-color')
  meta.setAttribute('content', definition.themeColor)
}

export function initializeTheme(documentRef: Document = document): ThemeKey {
  activeTheme = readTheme()
  applyTheme(activeTheme, documentRef)
  return activeTheme
}

export function getTheme(): ThemeKey {
  return activeTheme
}

export function setTheme(theme: ThemeKey, storage = getBrowserStorage(), documentRef: Document = document): void {
  if (!isThemeKey(theme)) return
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Theme application must remain available when storage is disabled or full.
  }
  activeTheme = theme
  applyTheme(theme, documentRef)
  listeners.forEach(listener => listener())
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useTheme(): ThemeKey {
  return useSyncExternalStore(subscribeTheme, getTheme, getTheme)
}
