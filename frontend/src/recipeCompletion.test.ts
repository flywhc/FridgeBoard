import { describe, expect, it } from 'vitest'
import { RecipeCompletionRequestGate } from './recipeCompletion'

describe('食谱完成请求闸门', () => {
  it('在当前请求结束前拒绝重复提交，释放后允许下一次操作', () => {
    const gate = new RecipeCompletionRequestGate()

    expect(gate.acquire('recipe-1')).toBe(true)
    expect(gate.acquire('recipe-1')).toBe(false)
    expect(gate.acquire('recipe-2')).toBe(false)
    gate.release('recipe-2')
    expect(gate.acquire('recipe-2')).toBe(false)
    gate.release('recipe-1')
    expect(gate.acquire('recipe-2')).toBe(true)
  })
})
