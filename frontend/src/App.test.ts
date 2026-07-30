import { describe, expect, it } from 'vitest'
import { getRecipeIngredientIcon } from './recipeAction'
import { getPwaInstallPromptMode } from './pwaInstallPrompt'
import { selectStartupRefrigerator } from './startupRefrigerator'
import { getDoorColdRegion, getDoorGridRows, getDoorTemperatureBoundary } from './fridgeDoorLayout'
import { filterInventory, formatInventoryScopeTitle } from './inventoryListFilters'
import { getFoodIconPosition } from './fridgeFoodLayout'

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
  it('将门内全部分格均分在冷藏门区域内', () => {
    const zones = [
      { temperature_mode: 'frozen' as const, geometry: { x: 0, y: 0, width: 100, height: 40, layout_kind: 'vertical' as const } },
      { temperature_mode: 'cold' as const, geometry: { x: 0, y: 40, width: 100, height: 60, layout_kind: 'vertical' as const } },
    ]

    expect(getDoorGridRows(zones, 4)).toBe('repeat(4, minmax(0, 1fr))')
  })

  it('对开门的整高冷藏区域也保持均分', () => {
    const zones = [{ temperature_mode: 'cold' as const, geometry: { x: 0, y: 0, width: 100, height: 100, layout_kind: 'vertical' as const } }]

    expect(getDoorGridRows(zones, 4)).toBe('repeat(4, minmax(0, 1fr))')
  })

  it('返回最大冷藏室在门上的上下位置和高度', () => {
    const zones = [{ temperature_mode: 'cold' as const, geometry: { x: 0, y: 40, width: 100, height: 60, layout_kind: 'vertical' as const } }]

    expect(getDoorColdRegion(zones)).toEqual({ y: 40, height: 60 })
  })

  it('为冷藏区与冷冻区返回结构分隔线位置', () => {
    const zones = [{ temperature_mode: 'cold' as const, geometry: { x: 0, y: 0, width: 100, height: 45, layout_kind: 'vertical' as const } }]

    expect(getDoorTemperatureBoundary(zones)).toBe(45)
  })
})

describe('filterInventory', () => {
  const inventory = [
    { id: 'milk', food_name: '鲜牛奶', subcategory_name: '牛奶', category_name: '奶类', product_description: '蒙牛 250ml × 6', storage_slot_id: 'cold-1', best_before: '2026-07-22' },
    { id: 'egg', food_name: '鸡蛋', subcategory_name: '鸡蛋', category_name: '蛋类', product_description: null, storage_slot_id: 'door-1', best_before: null },
  ] as Parameters<typeof filterInventory>[0]

  it('按名称、品牌规格备注等字段做包含匹配', () => {
    expect(filterInventory(inventory, '250ML')).toHaveLength(1)
    expect(filterInventory(inventory, '牛')).toEqual([inventory[0]])
  })

  it('可以限制为指定分格，并在空关键词时返回该格全部食材', () => {
    expect(filterInventory(inventory, '', 'door-1')).toEqual([inventory[1]])
  })
})

describe('formatInventoryScopeTitle', () => {
  it('将分格内部 key 转为用户可读的区域序号', () => {
    expect(formatInventoryScopeTitle('冷藏室', 'refrigerator-1')).toBe('冷藏室-1')
    expect(formatInventoryScopeTitle('冰箱门', 'door-4')).toBe('冰箱门-4')
  })
})

describe('getFoodIconPosition', () => {
  it('将一个食材放在分格正中', () => {
    expect(getFoodIconPosition(0, 1)).toEqual({ x: 0.5, verticalOffset: 0 })
  })

  it('将两个食材放在水平三等分点', () => {
    expect([getFoodIconPosition(0, 2), getFoodIconPosition(1, 2)]).toEqual([
      { x: 1 / 3, verticalOffset: 0 },
      { x: 2 / 3, verticalOffset: 0 },
    ])
  })

  it('三个及以上食材交错上下错开并保持三分之一图标高度重叠', () => {
    expect([getFoodIconPosition(0, 3), getFoodIconPosition(1, 3), getFoodIconPosition(2, 3)]).toEqual([
      { x: 1 / 4, verticalOffset: 6 },
      { x: 1 / 2, verticalOffset: -6 },
      { x: 3 / 4, verticalOffset: 6 },
    ])
  })
})
