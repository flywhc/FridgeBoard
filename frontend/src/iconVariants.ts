import type { Icon } from './appTypes'
import type { ThemeKey } from './theme'

export type ResolvedIconVariant = {
  assetUrl: string
  mediaType: 'image/svg+xml' | 'image/png'
  isFallback: boolean
}

/**
 * 解析图标在当前主题下的资源，并在服务端尚未提供变体时回退到逻辑图标主资源。
 *
 * 主资源是每个图标集稳定存在的 fallback，因此自定义图标和离线缓存不会出现破图。
 */
export function resolveIconVariant(icon: Icon, theme: ThemeKey): ResolvedIconVariant {
  const order: ThemeKey[] = [theme, icon.fallback_theme ?? 'ink', 'ink', 'skeuomorphic', 'cartoon']
  const seen = new Set<ThemeKey>()
  for (const candidate of order) {
    if (seen.has(candidate)) continue
    seen.add(candidate)
    const variant = icon.variants?.[candidate]
    if (variant) {
      return { assetUrl: variant.asset_url, mediaType: variant.media_type, isFallback: candidate !== theme }
    }
  }
  return { assetUrl: icon.asset_url, mediaType: icon.media_type ?? 'image/svg+xml', isFallback: theme !== 'ink' }
}
