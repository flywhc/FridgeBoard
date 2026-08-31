import { describe, expect, it } from 'vitest'
import { toggleRecipeWeekOffset } from './recipeWeekSwipe'

describe('周食谱平扫周次映射', () => {
  it('无论横扫方向如何，都在本周和下周之间切换', () => {
    expect(toggleRecipeWeekOffset(0)).toBe(7)
    expect(toggleRecipeWeekOffset(7)).toBe(0)
  })
})
