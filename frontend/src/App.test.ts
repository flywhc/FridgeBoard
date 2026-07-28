import { describe, expect, it } from 'vitest'
import { getRecipeActionIcon } from './recipeAction'
import { selectStartupRefrigerator } from './startupRefrigerator'

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

describe('getRecipeActionIcon', () => {
  it('使用食谱第一个食材对应的图标作为完成入口', () => {
    const icons = [
      { key: 'tomato', label: '西红柿', asset_url: '/tomato.svg' },
      { key: 'egg', label: '鸡蛋', asset_url: '/egg.svg' },
    ]

    expect(getRecipeActionIcon([{ subcategory_name: '鸡蛋', quantity: 4 }], icons)).toEqual(icons[1])
  })

  it('食材没有图库图标时不伪造图标', () => {
    expect(getRecipeActionIcon([{ subcategory_name: '未知食材', quantity: 1 }], [])).toBeUndefined()
  })
})
