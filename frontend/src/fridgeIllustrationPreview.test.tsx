import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Layout, LayoutZone } from './appTypes'
import { FridgePreviewFrame } from './FridgeLayout'
import { FridgeIllustrationPreview } from './fridgeIllustrationPreview'
import { setTheme } from './theme'

function zone(key: string, temperatureMode: 'cold' | 'frozen', options: { door?: boolean; slots?: number; geometry?: LayoutZone['geometry'] } = {}): LayoutZone {
  return {
    key,
    label: key,
    temperature_mode: temperatureMode,
    geometry: options.geometry ?? { x: 0, y: 0, width: 100, height: 50, layout_kind: 'vertical' },
    is_door: options.door ?? false,
    slots: Array.from({ length: options.slots ?? 2 }, (_, index) => ({ id: `${key}-${index + 1}`, key: `${key}-${index + 1}` })),
  }
}

function layout(): Layout {
  const vertical = (y: number, height: number): LayoutZone['geometry'] => ({ x: 0, y, width: 100, height, layout_kind: 'vertical' })
  return {
    refrigerator_id: 'fridge-1',
    template_key: 'top_freezer_single',
    revision: 1,
    zones: [
      zone('freezer', 'frozen', { geometry: vertical(0, 40) }),
      zone('refrigerator', 'cold', { slots: 3, geometry: vertical(40, 60) }),
      zone('door_freezer', 'frozen', { door: true, slots: 1, geometry: vertical(0, 40) }),
      zone('door', 'cold', { door: true, slots: 4, geometry: vertical(40, 60) }),
    ],
  }
}

describe('单门拟物门架边沿渲染契约', () => {
  it('白色最上层门架保留上下沿，玻璃门架只保留下沿', () => {
    const markup = renderToStaticMarkup(createElement(FridgeIllustrationPreview, { layout: layout(), variant: 'location' }))

    expect(markup.match(/fridge-illustration-rack-edge--top/g)).toHaveLength(1)
    expect(markup.match(/fridge-illustration-rack-edge--bottom/g)).toHaveLength(5)
    expect(markup).not.toContain('fridge-illustration-rack-edge--left')
    expect(markup).not.toContain('fridge-illustration-rack-edge--right')
  })

  it('白色柜体隔板不使用会在两端形成暗线的全边缘投影', () => {
    const markup = renderToStaticMarkup(createElement(FridgeIllustrationPreview, { layout: layout(), variant: 'location' }))

    expect(markup).toContain('fridge-illustration-shelf fridge-illustration-shelf--white')
    expect(markup).not.toMatch(/fridge-illustration-shelf fridge-illustration-shelf--white" filter=/)
    expect(markup).toMatch(/fridge-illustration-shelf fridge-illustration-shelf--glass" filter="url\(#shelf-shadow\)"/)
  })

  it('侧门玻璃和白色隔板只在底边绘制定向投影', () => {
    const markup = renderToStaticMarkup(createElement(FridgeIllustrationPreview, { layout: layout(), variant: 'location' }))

    expect(markup.match(/fridge-illustration-rack-shadow/g)).toHaveLength(5)
    expect(markup).not.toMatch(/fridge-illustration-rack" filter=/)
  })

  it('宽体直接使用双腔母版，不再切片、镜像或后叠加中框', () => {
    const wide: Layout = {
      refrigerator_id: 'wide-fridge', template_key: 'side_by_side', revision: 1,
      zones: [
        zone('left-cabinet', 'cold', { geometry: { x: 0, y: 0, width: 50, height: 100, layout_kind: 'vertical' } }),
        zone('right-cabinet', 'frozen', { geometry: { x: 50, y: 0, width: 50, height: 100, layout_kind: 'vertical' } }),
        zone('left-door', 'cold', { door: true, geometry: { x: 0, y: 0, width: 50, height: 100, layout_kind: 'vertical' } }),
        zone('door', 'cold', { door: true, geometry: { x: 50, y: 0, width: 50, height: 100, layout_kind: 'vertical' } }),
      ],
    }
    const markup = renderToStaticMarkup(createElement(FridgeIllustrationPreview, { layout: wide, variant: 'home' }))

    expect(markup).toContain('empty-fridge-soft3d-wide-double-door-v1.webp')
    expect(markup.match(/<image/g)).toHaveLength(1)
    expect(markup).not.toContain('fridge-illustration-sliced-shell')
    expect(markup).not.toContain('fridge-illustration-center-divider')
    expect(markup).not.toContain('scale(-1 1)')
  })
})

describe('拟物主题正式预览场景', () => {
  it('启用首页、创建、编辑和位置选择大预览，缩略图保留 DOM', () => {
    const meta = { setAttribute: () => undefined }
    const documentRef = {
      documentElement: { dataset: {}, style: {} },
      head: { appendChild: () => meta },
      querySelector: () => meta,
    } as unknown as Document

    setTheme('skeuomorphic', undefined, documentRef)
    try {
      for (const variant of ['home', 'setup', 'editor', 'location'] as const) {
        const markup = renderToStaticMarkup(createElement(FridgePreviewFrame, {
          layout: layout(),
          variant,
          activeZoneKey: variant === 'editor' ? 'door' : undefined,
          activeSlotId: variant === 'location' ? 'door-1' : undefined,
          onSelect: () => undefined,
          onSelectSlot: () => undefined,
        }))
        expect(markup).toContain('data-fridge-renderer="illustration"')
        expect(markup).toContain('fridge-illustration-preview')
      }

      const thumbnail = renderToStaticMarkup(createElement(FridgePreviewFrame, { layout: layout(), variant: 'thumbnail' }))
      expect(thumbnail).toContain('data-fridge-renderer="dom"')
      expect(thumbnail).toContain('open-fridge top_freezer_single')

      const otherTemplate = { ...layout(), template_key: 'mini' }
      const illustration = renderToStaticMarkup(createElement(FridgePreviewFrame, { layout: otherTemplate, variant: 'home' }))
      expect(illustration).toContain('data-fridge-renderer="illustration"')
      expect(illustration).toContain('data-illustration-template="mini"')
    } finally {
      setTheme('ink', undefined, documentRef)
    }
  })
})
