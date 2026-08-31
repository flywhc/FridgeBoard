import { describe, expect, it } from 'vitest'
import { getRecipeWeekOffsetForSwipe } from './recipeWeekSwipe'

describe('周食谱平扫周次映射', () => {
  it('向右平扫切到下周，向左平扫切到本周', () => {
    expect(getRecipeWeekOffsetForSwipe('previous')).toBe(7)
    expect(getRecipeWeekOffsetForSwipe('next')).toBe(0)
  })
})
