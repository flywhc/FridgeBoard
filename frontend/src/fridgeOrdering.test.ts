import { describe, expect, it } from 'vitest'
import { applyRefrigeratorOrder, getRefrigeratorDropPosition, reorderRefrigeratorIds } from './fridgeOrdering'

describe('冰箱本机排序', () => {
  it('按保存顺序排列并把新增冰箱追加到末尾', () => {
    const fridges = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(applyRefrigeratorOrder(fridges, ['c', 'missing', 'a'])).toEqual([{ id: 'c' }, { id: 'a' }, { id: 'b' }])
  })

  it('按目标条目前后插入并处理拖动条目位于目标前方的索引变化', () => {
    expect(reorderRefrigeratorIds(['a', 'b', 'c'], 'a', 'c', 'after')).toEqual(['b', 'c', 'a'])
    expect(reorderRefrigeratorIds(['a', 'b', 'c'], 'c', 'a', 'before')).toEqual(['c', 'a', 'b'])
    expect(reorderRefrigeratorIds(['a', 'b', 'c'], 'b', 'b', 'after')).toEqual(['a', 'b', 'c'])
  })

  it('只在其他条目的半区内产生前插或后插标识', () => {
    const targets = [{ id: 'a', top: 100, bottom: 200 }, { id: 'b', top: 220, bottom: 320 }]
    expect(getRefrigeratorDropPosition(149, targets, 'b')).toEqual({ targetId: 'a', position: 'before' })
    expect(getRefrigeratorDropPosition(150, targets, 'b')).toEqual({ targetId: 'a', position: 'after' })
    expect(getRefrigeratorDropPosition(210, targets, 'b')).toBeNull()
    expect(getRefrigeratorDropPosition(250, targets, 'a')).toEqual({ targetId: 'b', position: 'before' })
    expect(getRefrigeratorDropPosition(250, targets, 'b')).toBeNull()
  })
})
