import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SubcategoryIconEditor } from './SubcategoryIconEditor'
import { canConfirmIconDraft, getOnlineProvider, hasIconDraftChanges, ICON_SOURCE_TABS, isCurrentIconCandidate, isSupportedIconFile, shouldApplyKeywordResponse, shouldApplySearchResponse } from './subcategoryIconEditorLogic'

const variant = { asset_url: '/draft/ink', media_type: 'image/svg+xml', source: 'library', source_id: 'egg' }

describe('小类图标编辑器规则', () => {
  it('固定四个来源并按主题限制在线 provider', () => {
    expect(ICON_SOURCE_TABS).toEqual(['library', 'local', 'online', 'ai'])
    expect(getOnlineProvider('ink')).toBe('iconify')
    expect(getOnlineProvider('skeuomorphic')).toBe('thiings')
    expect(getOnlineProvider('cartoon')).toBe('thiings')
  })

  it('只接受契约中的图片 MIME 和 10MB 边界', () => {
    expect(isSupportedIconFile({ type: 'image/png', size: 10 * 1024 * 1024 })).toBe(true)
    expect(isSupportedIconFile({ type: 'image/svg+xml', size: 10 })).toBe(false)
    expect(isSupportedIconFile({ type: 'image/heic', size: 10 })).toBe(false)
    expect(isSupportedIconFile({ type: 'image/png', size: 10 * 1024 * 1024 + 1 })).toBe(false)
  })

  it('新建需要名称和至少一个变体，编辑比较名称、fallback 与变体', () => {
    const draft = { variants: { ink: variant } }
    expect(canConfirmIconDraft(null, '牛奶', false)).toBe(false)
    expect(canConfirmIconDraft(draft, ' ', false)).toBe(false)
    expect(canConfirmIconDraft(draft, '牛奶', true)).toBe(false)
    expect(canConfirmIconDraft(draft, '牛奶', false)).toBe(true)
    const initial = { name: '牛奶', fallback_theme: 'ink' as const, variants: { ink: variant } }
    expect(hasIconDraftChanges(initial, initial)).toBe(false)
    expect(hasIconDraftChanges(initial, { ...initial, name: '奶品' })).toBe(true)
    expect(hasIconDraftChanges(initial, { ...initial, fallback_theme: 'cartoon' })).toBe(true)
  })

  it('丢弃过期搜索响应和错误主题的 AI 候选', () => {
    expect(shouldApplySearchResponse(2, 2, 'ink', 'ink', 'iconify', 'iconify')).toBe(true)
    expect(shouldApplySearchResponse(1, 2, 'ink', 'ink', 'iconify', 'iconify')).toBe(false)
    expect(shouldApplySearchResponse(2, 2, 'ink', 'skeuomorphic', 'iconify', 'thiings')).toBe(false)
    expect(shouldApplyKeywordResponse(2, 2, '牛奶', '牛奶', '', '')).toBe(true)
    expect(shouldApplyKeywordResponse(1, 2, '牛奶', '牛奶', '', '')).toBe(false)
    expect(shouldApplyKeywordResponse(2, 2, '牛奶', '鸡蛋', '', '')).toBe(false)
    expect(shouldApplyKeywordResponse(2, 2, '牛奶', '牛奶', '', 'milk')).toBe(false)
    expect(isCurrentIconCandidate('gen-1', 'ink', 'c1', 'gen-1', 'ink', ['c1', 'c2'])).toBe(true)
    expect(isCurrentIconCandidate('gen-1', 'ink', 'c1', 'gen-1', 'cartoon', ['c1', 'c2'])).toBe(false)
    expect(isCurrentIconCandidate('gen-1', 'ink', 'old', 'gen-1', 'ink', ['c1', 'c2'])).toBe(false)
  })

  it('组件实际渲染四来源、三主题和编辑标题', () => {
    const markup = renderToStaticMarkup(createElement(SubcategoryIconEditor, {
      refrigeratorId: 'fridge-1',
      parentId: 'group-1',
      parentName: '点心奶品',
      initialName: '牛奶',
      initialCategory: { id: 'custom-1', parent_id: 'group-1', name: '牛奶', icon_key: 'milk', is_custom: true, revision: 2, fallback_theme: 'skeuomorphic' },
      initialFallbackTheme: 'skeuomorphic',
      icons: [{ key: 'milk', label: '牛奶', asset_url: '/icons/milk.svg' }],
      theme: 'ink',
      onCatalogChanged: async () => undefined,
      onComplete: () => undefined,
      onCancel: () => undefined,
    }))
    expect(markup).toContain('编辑小类')
    expect(markup).toContain('所属大类：点心奶品')
    expect(markup).not.toContain('所属大类：group-1')
    expect(markup).toContain('aria-label="图标来源"')
    expect(markup).toContain('>图库</button>')
    expect(markup).toContain('>本地</button>')
    expect(markup).toContain('>在线</button>')
    expect(markup).toContain('>AI</button>')
    expect(markup).toContain('p5-segmented-tabs p5-theme-tabs')
    expect(markup).toContain('p5-segmented-tabs p5-icon-source-tabs')
    expect(markup).toContain('p5-source-status')
    expect(markup).toContain('从图库选择已有图标')
    expect(markup).toContain('p5-icon-status-preview is-placeholder')
    expect(markup).not.toContain('占位')
    expect(markup).not.toContain('当前主题暂无专用图标')
    expect(markup).toContain('p5-fallback-select')
    expect(markup).toContain('p9-option-picker-input')
    expect(markup).toContain('三主题汇总')
  })

  it('父级名称缺失时不向界面泄露内部 ID', () => {
    const markup = renderToStaticMarkup(createElement(SubcategoryIconEditor, {
      refrigeratorId: 'fridge-1',
      parentId: 'group-1',
      initialName: '牛奶',
      icons: [],
      theme: 'ink',
      onCatalogChanged: async () => undefined,
      onComplete: () => undefined,
      onCancel: () => undefined,
    }))
    expect(markup).toContain('所属大类：未找到大类')
    expect(markup).not.toContain('所属大类：group-1')
  })
})
