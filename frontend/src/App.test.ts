import { describe, expect, it } from 'vitest'
import { getRecipeIngredientIcon } from './recipeAction'
import { getPwaInstallPromptMode } from './pwaInstallPrompt'
import { selectStartupRefrigerator } from './startupRefrigerator'
import { getDoorGridRows, getDoorSelectionRatio } from './fridgeDoorLayout'

const fridges = [{ id: 'fridge-1' }, { id: 'fridge-2' }]

describe('selectStartupRefrigerator', () => {
  it('优先选择仍在列表中的上次冰箱', () => {
    expect(selectStartupRefrigerator(fridges, 'fridge-2')).toEqual({ id: 'fridge-2' })
  })

  it('没有上次冰箱时选择列表中的第一台', () => {
    expect(selectStartupRefrigerator(fridges, null)).toEqual({ id: 'fridge-1' })
  })

  it('上次冰箱已不在列表中时回退到第一台', () => {
    expect(selectStartupRefrigerator(fridges, 'deleted-fridge')).toEqual({ id: 'fridge-1' })
  })
})

describe('getRecipeIngredientIcon', () => {
  it('只使用严格同名食材的图标', () => {
    const icons = [
      { key: 'tomato', label: '西红柿', asset_url: '/tomato.svg' },
      { key: 'egg', label: '鸡蛋', asset_url: '/egg.svg' },
    ]

    expect(getRecipeIngredientIcon('鸡蛋', icons)).toEqual(icons[1])
  })

  it('食材没有图库图标时不伪造图标', () => {
    expect(getRecipeIngredientIcon('未知食材', [])).toBeUndefined()
  })
})

describe('getPwaInstallPromptMode', () => {
  it('Android 尚未收到浏览器安装事件时仍显示菜单安装引导', () => {
    expect(getPwaInstallPromptMode({ isAppleMobile: false, hasInstallEvent: false })).toBe('android-guide')
  })

  it('浏览器提供安装事件时优先显示一键安装操作', () => {
    expect(getPwaInstallPromptMode({ isAppleMobile: false, hasInstallEvent: true })).toBe('install')
  })

  it('iOS 没有浏览器安装事件时保留 Safari 引导', () => {
    expect(getPwaInstallPromptMode({ isAppleMobile: true, hasInstallEvent: false })).toBe('apple-guide')
  })
})

describe('getDoorGridRows', () => {
  it('将四格门的最后一条分割线对齐最大冷藏区边界', () => {
    const zones = [
      { temperature_mode: 'frozen' as const, geometry: { x: 0, y: 0, width: 100, height: 40, layout_kind: 'vertical' as const } },
      { temperature_mode: 'cold' as const, geometry: { x: 0, y: 40, width: 100, height: 60, layout_kind: 'vertical' as const } },
    ]

    expect(getDoorGridRows(zones, 4)).toBe('13.333333333333334fr 13.333333333333334fr 13.333333333333334fr 60fr')
  })

  it('对没有冷藏区边界的对开门保持均分', () => {
    const zones = [{ temperature_mode: 'cold' as const, geometry: { x: 0, y: 0, width: 100, height: 100, layout_kind: 'vertical' as const } }]

    expect(getDoorGridRows(zones, 4)).toBe('repeat(4, minmax(0, 1fr))')
  })

  it('返回与最大冷藏区相对的门格区域高度', () => {
    const zones = [{ temperature_mode: 'cold' as const, geometry: { x: 0, y: 0, width: 100, height: 45, layout_kind: 'vertical' as const } }]

    expect(getDoorSelectionRatio(zones)).toBe(0.45)
  })
})
