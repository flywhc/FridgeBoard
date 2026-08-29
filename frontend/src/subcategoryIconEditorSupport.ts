import type { Category, Icon, IconCandidate } from './appTypes'
import { fetchRuntimeAsset } from './appApi'
import { getCachedRuntimeAssetUrl } from './runtimeAssetCache'
import type { ThemeKey } from './theme'

export type DraftVariant = {
  asset_url: string
  media_type: string
  source?: string | null
  source_id?: string | null
  source_url?: string | null
  attribution?: string | null
  license?: string | null
}

export type IconDraft = {
  id?: string
  category_id: string | null
  parent_id: string
  name: string
  fallback_theme: ThemeKey
  version: number
  variants: Partial<Record<ThemeKey, DraftVariant>>
}

export type SearchResult = {
  id: string
  label: string
  preview_url?: string | null
  source_url?: string | null
  license?: string | null
  author?: string | null
}

export const MAX_ICON_BYTES = 10 * 1024 * 1024
const LOCAL_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

export async function preloadOnlineResultAssets(results: SearchResult[], signal: AbortSignal): Promise<void> {
  const previews = results
    .slice(0, 12)
    .map(result => result.preview_url)
    .filter((url): url is string => Boolean(url))
  await Promise.allSettled(
    previews.map(url => getCachedRuntimeAssetUrl(url, () => fetchRuntimeAsset(url, signal))),
  )
}

export function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '操作失败，请重试。'
}

export function readIconCandidate(value: unknown): IconCandidate | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<IconCandidate>
  if (typeof candidate.id !== 'string' || typeof candidate.asset_url !== 'string') return null
  if (candidate.media_type !== 'image/svg+xml' && candidate.media_type !== 'image/png') return null
  return { id: candidate.id, asset_url: candidate.asset_url, media_type: candidate.media_type }
}

export function fileFromDataUrl(data: string, mediaType: string, name: string): File {
  const comma = data.indexOf(',')
  if (comma < 0) throw new Error('原生图片数据无效')
  const bytes = Uint8Array.from(atob(data.slice(comma + 1)), character => character.charCodeAt(0))
  if (bytes.byteLength > MAX_ICON_BYTES) throw new Error('图片超过 10MB 限制')
  if (!LOCAL_MIME_TYPES.has(mediaType)) throw new Error('HEIC/HEIF 需要系统转换后再导入')
  return new File([bytes], name, { type: mediaType })
}

export function getThemeSlotState(theme: ThemeKey, variants: Partial<Record<ThemeKey, DraftVariant>>, fallbackTheme: ThemeKey): { variant?: DraftVariant; borrowedFrom?: ThemeKey } {
  const variant = variants[theme]
  if (variant) return { variant }
  const themes: ThemeKey[] = ['ink', 'skeuomorphic', 'cartoon']
  const borrowFrom = [fallbackTheme, ...themes].find(key => key !== theme && variants[key])
  return borrowFrom ? { variant: variants[borrowFrom], borrowedFrom: borrowFrom } : {}
}

export function createInitialDraft(initialCategory: Category | null | undefined, initialName: string, parentId: string, fallbackTheme: ThemeKey, icons: Icon[]): IconDraft {
  const icon = initialCategory?.icon_key ? icons.find(candidate => candidate.key === initialCategory.icon_key) : undefined
  const variants = icon?.variants ? Object.fromEntries(Object.entries(icon.variants).map(([key, variant]) => [key, { ...variant }])) as Partial<Record<ThemeKey, DraftVariant>> : {}
  if (icon && Object.keys(variants).length === 0) {
    variants[fallbackTheme] = { asset_url: icon.asset_url, media_type: icon.media_type ?? 'image/svg+xml', source: 'library', source_id: icon.key }
  }
  return {
    category_id: initialCategory?.id ?? null,
    parent_id: initialCategory?.parent_id ?? parentId,
    name: initialCategory?.name ?? (initialName || '待命名小类'),
    fallback_theme: initialCategory?.fallback_theme ?? fallbackTheme,
    version: initialCategory?.revision ?? 1,
    variants,
  }
}
