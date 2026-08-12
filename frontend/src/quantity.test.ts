import { describe, expect, it } from 'vitest'
import { formatQuantity, parseQuantity, stepQuantity } from './quantity'

describe('数量步进输入', () => {
  it('允许非负两位小数并按 1 步进', () => {
    expect(parseQuantity('0.5')).toBe(0.5)
    expect(stepQuantity('0.5', 1, 0.01)).toBe('1.5')
    expect(stepQuantity('1.5', 1, 0.01)).toBe('2.5')
    expect(stepQuantity('0.5', -1, 0.01)).toBe('0.01')
  })

  it('拒绝超过两位小数和负数，并消除浮点尾数', () => {
    expect(parseQuantity('1.234')).toBeNull()
    expect(parseQuantity('-0.5')).toBeNull()
    expect(formatQuantity(0.1 + 0.2)).toBe('0.3')
  })
})
