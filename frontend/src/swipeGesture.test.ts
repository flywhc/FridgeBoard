import { describe, expect, it } from 'vitest'
import { getCircularSwipeIndex, getHorizontalSwipeDirection } from './swipeGesture'

describe('水平横扫判定', () => {
  it('用位移和方向意图识别左右横扫，不要求特定速度', () => {
    expect(getHorizontalSwipeDirection(250, 300, 170, 320)).toBe('next')
    expect(getHorizontalSwipeDirection(120, 300, 200, 320)).toBe('previous')
  })

  it('忽略距离不足和纵向意图', () => {
    expect(getHorizontalSwipeDirection(120, 300, 170, 305)).toBeNull()
    expect(getHorizontalSwipeDirection(120, 300, 190, 380)).toBeNull()
  })
})

describe('冰箱首尾循环', () => {
  it('左扫到下一台，末尾继续左扫回到第一台', () => {
    expect(getCircularSwipeIndex(3, 0, 'next')).toBe(1)
    expect(getCircularSwipeIndex(3, 2, 'next')).toBe(0)
  })

  it('右扫到上一台，首项继续右扫回到末尾', () => {
    expect(getCircularSwipeIndex(3, 2, 'previous')).toBe(1)
    expect(getCircularSwipeIndex(3, 0, 'previous')).toBe(2)
  })

  it('没有或只有一台冰箱时不产生新索引', () => {
    expect(getCircularSwipeIndex(0, 0, 'next')).toBeNull()
    expect(getCircularSwipeIndex(1, 0, 'previous')).toBeNull()
  })
})
