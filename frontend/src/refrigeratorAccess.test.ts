import { describe, expect, it } from 'vitest'
import {
  getRefrigeratorAccessState,
  getRefrigeratorCapabilities,
  getRefrigeratorWorkspacePath,
  mergeRefrigerators,
  toRefrigerator,
  type RefrigeratorSummaryResponse,
} from './refrigeratorAccess'

const summary = (overrides: Partial<RefrigeratorSummaryResponse> = {}): RefrigeratorSummaryResponse => ({
  id: 'fridge-1',
  name: '厨房冰箱',
  revision: 3,
  template_key: 'mini',
  template_name: '迷你冰箱',
  inventory_quantity: 6,
  setup_status: 'ready',
  display_device_status: 'bound',
  access_role: 'owner',
  ...overrides,
})

describe('refrigerator access', () => {
  it('converts a summary to the existing Refrigerator shape', () => {
    expect(toRefrigerator(summary())).toEqual({
      id: 'fridge-1',
      name: '厨房冰箱',
      revision: 3,
      setup_status: 'ready',
      display_device_status: 'bound',
      access_role: 'owner',
    })
  })

  it('merges owner and daily_access lists and deduplicates by refrigerator id', () => {
    const owner = summary({ id: 'owner-fridge', name: '我的冰箱' })
    const sharedAsDaily = summary({ id: 'shared-fridge', name: '朋友冰箱', access_role: 'daily_access' })
    const sharedAsOwner = summary({ id: 'shared-fridge', name: '朋友冰箱', access_role: 'owner' })

    expect(mergeRefrigerators([sharedAsDaily, owner], [sharedAsOwner])).toEqual([
      { ...toRefrigerator(owner) },
      { ...toRefrigerator(sharedAsOwner) },
    ])
  })

  it('keeps a daily_access refrigerator as revoked when it disappears after refresh', () => {
    const previous = [summary({ access_role: 'daily_access' })]
    expect(getRefrigeratorAccessState('fridge-1', previous, [])).toBe('revoked')
    expect(getRefrigeratorAccessState('fridge-1', previous, [summary()])).toBe('active')
  })

  it('reports an unknown refrigerator as missing', () => {
    expect(getRefrigeratorAccessState('missing', [], [])).toBe('missing')
    expect(getRefrigeratorAccessState('fridge-1', [summary()], [])).toBe('missing')
  })

  it('exposes owner and daily_access capability matrices', () => {
    expect(getRefrigeratorCapabilities({ access_role: 'owner', setup_status: 'needs_layout' })).toEqual({
      canOpen: true,
      canUseDailyWorkspace: true,
      canWriteInventory: true,
      canEditRecipes: true,
      canContinueSetup: true,
      canOpenSettings: true,
      canEditLayout: true,
      canManageDevices: true,
      canManageSettings: true,
      canBindDisplayDevice: true,
      canDelete: true,
      canRestore: true,
    })
    expect(getRefrigeratorCapabilities({ access_role: 'daily_access', setup_status: 'ready' })).toEqual({
      canOpen: true,
      canUseDailyWorkspace: true,
      canWriteInventory: true,
      canEditRecipes: false,
      canContinueSetup: false,
      canOpenSettings: false,
      canEditLayout: false,
      canManageDevices: false,
      canManageSettings: false,
      canBindDisplayDevice: false,
      canDelete: false,
      canRestore: false,
    })
  })

  it('selects owner and daily workspace paths with an explicit refrigerator id', () => {
    expect(getRefrigeratorWorkspacePath({ id: '厨房/冰箱', access_role: 'owner' }, 'inventory')).toBe('/api/owner/refrigerators/%E5%8E%A8%E6%88%BF%2F%E5%86%B0%E7%AE%B1/inventory')
    expect(getRefrigeratorWorkspacePath({ id: 'shared', access_role: 'daily_access' }, 'recipes')).toBe('/api/daily/refrigerators/shared/recipes')
  })
})
