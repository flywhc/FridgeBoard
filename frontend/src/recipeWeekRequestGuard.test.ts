import { describe, expect, it } from 'vitest'
import { RecipeWeekRequestGuard } from './recipeWeekRequestGuard'

describe('食谱周请求守卫', () => {
  it('切换周次后拒绝旧请求提交共享状态', () => {
    const guard = new RecipeWeekRequestGuard()
    const currentWeek = guard.begin('fridge-1', '2026-08-24')
    const nextWeek = guard.begin('fridge-1', '2026-08-31')

    expect(guard.isCurrent(currentWeek, 'fridge-1', '2026-08-24')).toBe(false)
    expect(guard.isCurrent(nextWeek, 'fridge-1', '2026-08-31')).toBe(true)
  })

  it('切换冰箱后拒绝旧冰箱请求提交共享状态', () => {
    const guard = new RecipeWeekRequestGuard()
    const oldFridge = guard.begin('fridge-1', '2026-08-24')
    const newFridge = guard.begin('fridge-2', '2026-08-24')

    expect(guard.isCurrent(oldFridge, 'fridge-1', '2026-08-24')).toBe(false)
    expect(guard.isCurrent(newFridge, 'fridge-2', '2026-08-24')).toBe(true)
  })
})
