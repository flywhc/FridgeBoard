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

  it('水墨主题优先使用内置主 SVG，不被拟物变体抢占', () => {
    const icon = {
      key: 'egg',
      label: '鸡蛋',
      asset_url: '/icons/egg.svg',
      media_type: 'image/svg+xml' as const,
      variants: {
        skeuomorphic: { asset_url: '/icons/skeuomorphic/egg.png', media_type: 'image/png' as const },
      },
    }
    expect(resolveIconVariant(icon, 'ink')).toEqual({
      assetUrl: '/icons/egg.svg',
      mediaType: 'image/svg+xml',
      isFallback: false,
    })
  })

  it('其他主题缺少变体时也先回退到内置水墨主 SVG', () => {
    const icon = {
      key: 'egg',
      label: '鸡蛋',
      asset_url: '/icons/egg.svg',
      media_type: 'image/svg+xml' as const,
      variants: {
        skeuomorphic: { asset_url: '/icons/skeuomorphic/egg.png', media_type: 'image/png' as const },
      },
    }
    expect(resolveIconVariant(icon, 'cartoon')).toEqual({
      assetUrl: '/icons/egg.svg',
      mediaType: 'image/svg+xml',
      isFallback: true,
    })
  })
})
