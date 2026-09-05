import { beforeEach, describe, expect, it, vi } from 'vitest'

const nativePlugin = vi.hoisted(() => ({
  advanceAccountGeneration: vi.fn(),
  clearAll: vi.fn(),
  clearForFridge: vi.fn(),
  publishFridges: vi.fn(),
  publishWeek: vi.fn(),
  refreshWidgets: vi.fn(),
}))
const isNative = vi.hoisted(() => vi.fn(() => true))
const getPlatform = vi.hoisted(() => vi.fn(() => 'android'))

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform, isNativePlatform: isNative },
  registerPlugin: () => nativePlugin,
}))

import type { RecipeDay, Refrigerator } from './appTypes'
import { clearAll, clearForFridge, publishFridges, publishWeek, refreshWidgets, advanceAccountGeneration } from './recipeWidgetBridge'

const fridge: Refrigerator = {
  id: 'fridge-1', name: '厨房冰箱', revision: 1, setup_status: 'ready', display_device_status: 'unbound', access_role: 'owner',
}

function day(weekday: number, completed: boolean, id = `entry-${weekday}`): RecipeDay {
  return {
    weekday,
    label: `周${weekday}`,
    entries: [{
      id,
      weekday,
      dish_name: '番茄炒蛋',
      method: '煎熟',
      note: '少油',
      completed,
      ingredients: [{ subcategory_name: '鸡蛋', quantity: 4, subcategory_id: 'egg' }],
      missing: completed ? [] : [{ subcategory_name: '鸡蛋', quantity: 2, subcategory_id: 'egg' }],
    }],
  }
}

describe('recipeWidgetBridge', () => {
  beforeEach(() => {
    isNative.mockReturnValue(true)
    getPlatform.mockReturnValue('android')
    for (const method of Object.values(nativePlugin)) method.mockReset().mockResolvedValue(undefined)
  })

  it('publishes only bounded fridge summaries', async () => {
    await publishFridges([fridge])

    expect(nativePlugin.publishFridges).toHaveBeenCalledWith({ fridges: [{ id: 'fridge-1', name: '厨房冰箱', accessRole: 'owner' }] })
  })

  it('filters empty days, orders entries by completion, and marks missing quantities', async () => {
    await publishWeek(fridge, '2026-09-07', { days: [
      { weekday: 3, label: '周四', entries: [] },
      day(4, true),
      day(1, false),
    ], restock: [] })

    expect(nativePlugin.publishWeek).toHaveBeenCalledWith(expect.objectContaining({
      refrigerator: { id: 'fridge-1', name: '厨房冰箱', accessRole: 'owner' },
      weekStart: '2026-09-07',
      capturedAt: expect.any(Number),
      entries: [
        expect.objectContaining({ id: 'entry-1', weekday: 1, completed: false, missingCount: 1, ingredientsDisplay: '鸡蛋 × 4-缺2' }),
        expect.objectContaining({ id: 'entry-4', weekday: 4, completed: true, missingCount: 0, ingredientsDisplay: '鸡蛋 × 4' }),
      ],
    }))
    const snapshot = nativePlugin.publishWeek.mock.calls[0][0].entries[0]
    expect(snapshot).not.toHaveProperty('method')
    expect(snapshot).not.toHaveProperty('note')
    expect(nativePlugin.publishWeek.mock.calls[0][0].capturedAt).toEqual(expect.any(Number))
  })

  it('rejects malformed Android payloads before crossing the bridge', async () => {
    await expect(publishWeek(fridge, 'not-a-date', [])).rejects.toThrow('weekStart')
    await expect(publishFridges([{ id: '', name: '坏数据', access_role: 'owner' }])).rejects.toThrow('refrigerator.id')
    expect(nativePlugin.publishWeek).not.toHaveBeenCalled()
    expect(nativePlugin.publishFridges).not.toHaveBeenCalled()
  })

  it('forwards refresh, clear, and account generation operations', async () => {
    await refreshWidgets()
    await refreshWidgets('fridge-1')
    await clearForFridge('fridge-1')
    await clearAll()
    await advanceAccountGeneration()

    expect(nativePlugin.refreshWidgets).toHaveBeenNthCalledWith(1, {})
    expect(nativePlugin.refreshWidgets).toHaveBeenNthCalledWith(2, { refrigeratorId: 'fridge-1' })
    expect(nativePlugin.clearForFridge).toHaveBeenCalledWith({ refrigeratorId: 'fridge-1' })
    expect(nativePlugin.clearAll).toHaveBeenCalledOnce()
    expect(nativePlugin.advanceAccountGeneration).toHaveBeenCalledOnce()
  })

  it('is a no-op outside Android', async () => {
    getPlatform.mockReturnValue('ios')
    await publishFridges([fridge])
    await publishWeek(fridge, '2026-09-07', [day(1, false)])
    await refreshWidgets('fridge-1')
    await clearForFridge('fridge-1')
    await clearAll()
    await advanceAccountGeneration()

    for (const method of Object.values(nativePlugin)) expect(method).not.toHaveBeenCalled()
  })

  it('accepts entries without ingredients and keeps same-day incomplete entries first', async () => {
    const sameDay: RecipeDay = {
      weekday: 2,
      label: '周三',
      entries: [
        { ...day(2, true, 'done').entries[0], ingredients: [], missing: [] },
        { ...day(2, false, 'pending').entries[0], ingredients: [], missing: [] },
      ],
    }
    await publishWeek(fridge, '2026-09-07', [sameDay])

    expect(nativePlugin.publishWeek.mock.calls[0][0].entries.map((entry: { id: string; ingredientsDisplay: string }) => [entry.id, entry.ingredientsDisplay])).toEqual([
      ['pending', ''],
      ['done', ''],
    ])
  })
})
