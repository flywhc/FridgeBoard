import { describe, expect, it } from 'vitest'
import { resolveIconVariant } from './iconVariants'

describe('主题图标变体解析', () => {
  it('优先使用当前主题的内置变体', () => {
    const icon = {
      key: 'egg',
      label: '鸡蛋',
      asset_url: '/icons/egg.svg',
      media_type: 'image/svg+xml' as const,
      variants: {
        skeuomorphic: { asset_url: '/icons/skeuomorphic/egg.png', media_type: 'image/png' as const },
      },
    }
    expect(resolveIconVariant(icon, 'skeuomorphic')).toEqual({
      assetUrl: '/icons/skeuomorphic/egg.png',
      mediaType: 'image/png',
      isFallback: false,
    })
  })

  it('目标主题缺少变体时回退到逻辑图标主资源', () => {
    const icon = { key: 'dishwasher', label: '洗碗', asset_url: '/icons/dishwasher.svg' }
    expect(resolveIconVariant(icon, 'skeuomorphic')).toEqual({
      assetUrl: '/icons/dishwasher.svg',
      mediaType: 'image/svg+xml',
      isFallback: true,
    })
  })
})
