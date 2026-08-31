import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Refrigerator } from './appTypes'

vi.mock('./appApi', async importOriginal => {
  const actual = await importOriginal<typeof import('./appApi')>()
  return { ...actual, request: vi.fn() }
})

import { request } from './appApi'
import { fetchFridgeOverview } from './fridgeOverview'

const mockedRequest = vi.mocked(request)
const fridge: Refrigerator = {
  id: 'fridge-1',
  name: '主冰箱',
  revision: 1,
  setup_status: 'ready',
  display_device_status: 'unbound',
  access_role: 'owner',
}

describe('fetchFridgeOverview', () => {
  beforeEach(() => mockedRequest.mockReset())

  it('严格模式透传任一概览请求失败，避免写入不完整的完整 release', async () => {
    const failure = new Error('布局请求失败')
    mockedRequest.mockImplementation(async path => {
      if (typeof path !== 'string') return []
      if (path.endsWith('/layout')) throw failure
      if (path.includes('/inventory?')) return []
      if (path.endsWith('/deleted')) return []
      return []
    })

    await expect(fetchFridgeOverview([fridge], undefined, true)).rejects.toBe(failure)
    expect(mockedRequest).toHaveBeenCalled()
  })

  it('普通模式保留列表展示所需的降级结果', async () => {
    mockedRequest.mockImplementation(async path => {
      if (typeof path !== 'string') return []
      if (path.endsWith('/layout')) throw new Error('布局请求失败')
      if (path.includes('/inventory?')) throw new Error('库存请求失败')
      if (path.endsWith('/deleted')) throw new Error('已删除列表请求失败')
      return []
    })

    await expect(fetchFridgeOverview([fridge])).resolves.toEqual({
      summaries: { 'fridge-1': { template: '已配置布局', foods: 0 } },
      layouts: {},
      deletedCount: 0,
    })
    expect(mockedRequest).toHaveBeenCalled()
  })
})
