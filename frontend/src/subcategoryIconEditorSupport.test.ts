import { describe, expect, it } from 'vitest'
import { getThemeSlotState, type DraftVariant } from './subcategoryIconEditorSupport'

const ink: DraftVariant = { asset_url: '/ink.svg', media_type: 'image/svg+xml' }
const skeuomorphic: DraftVariant = { asset_url: '/skeuomorphic.png', media_type: 'image/png' }

describe('小类图标编辑器主题借用顺序', () => {
  it('fallback 和当前主题均缺失时优先借用水墨图标', () => {
    const slot = getThemeSlotState('cartoon', { ink, skeuomorphic }, 'cartoon')

    expect(slot).toEqual({ variant: ink, borrowedFrom: 'ink' })
  })

  it('存在 fallback 变体时仍优先借用 fallback', () => {
    const slot = getThemeSlotState('cartoon', { ink, skeuomorphic }, 'skeuomorphic')

    expect(slot).toEqual({ variant: skeuomorphic, borrowedFrom: 'skeuomorphic' })
  })
})
