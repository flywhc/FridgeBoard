import type { Refrigerator } from './appTypes'

/** `/api/refrigerators` 返回的手机端冰箱摘要。 */
export type RefrigeratorSummaryResponse = {
  id: string
  name: string
  revision: number
  template_key: string
  template_name: string
  inventory_quantity: number
  setup_status: Refrigerator['setup_status']
  display_device_status: Refrigerator['display_device_status']
  access_role: Refrigerator['access_role']
}

export type RefrigeratorAccessItem = Refrigerator | RefrigeratorSummaryResponse

export type RefrigeratorCapabilities = {
  canOpen: boolean
  canUseDailyWorkspace: boolean
  canWriteInventory: boolean
  canEditRecipes: boolean
  canContinueSetup: boolean
  canOpenSettings: boolean
  canEditLayout: boolean
  canManageDevices: boolean
  canManageSettings: boolean
  canBindDisplayDevice: boolean
  canDelete: boolean
  canRestore: boolean
}

export type RefrigeratorAccessState = 'active' | 'revoked' | 'missing'

export type RefrigeratorWorkspaceResource =
  | 'layout'
  | 'categories'
  | 'inventory'
  | 'icons'
  | 'recipes'
  | 'restock'
  | 'custom-shopping-items'
  | 'category-match'

/** 将统一摘要降级为现有页面继续使用的 Refrigerator 形状。 */
export function toRefrigerator(summary: RefrigeratorSummaryResponse): Refrigerator {
  return {
    id: summary.id,
    name: summary.name,
    revision: summary.revision,
    setup_status: summary.setup_status,
    display_device_status: summary.display_device_status,
    access_role: summary.access_role,
  }
}

/** 合并不同来源的冰箱列表；同一冰箱优先保留 owner 角色。 */
export function mergeRefrigerators(
  ...lists: ReadonlyArray<ReadonlyArray<RefrigeratorAccessItem>>
): Refrigerator[] {
  const byId = new Map<string, Refrigerator>()
  for (const list of lists) {
    for (const item of list) {
      const refrigerator = isSummary(item) ? toRefrigerator(item) : item
      const existing = byId.get(refrigerator.id)
      if (!existing || (refrigerator.access_role === 'owner' && existing.access_role !== 'owner')) {
        byId.set(refrigerator.id, refrigerator)
      }
    }
  }
  return [...byId.values()].sort(compareRefrigerators)
}

/** 返回页面层使用的 owner/daily_access 能力矩阵。 */
export function getRefrigeratorCapabilities(
  refrigerator: Pick<Refrigerator, 'access_role' | 'setup_status'>,
): RefrigeratorCapabilities {
  const isOwner = refrigerator.access_role === 'owner'
  return {
    canOpen: true,
    canUseDailyWorkspace: true,
    canWriteInventory: true,
    canEditRecipes: isOwner,
    canContinueSetup: isOwner && refrigerator.setup_status === 'needs_layout',
    canOpenSettings: isOwner,
    canEditLayout: isOwner,
    canManageDevices: isOwner,
    canManageSettings: isOwner,
    canBindDisplayDevice: isOwner,
    canDelete: isOwner,
    canRestore: isOwner,
  }
}

/** 选择当前角色对应的日常工作区 API 路径。 */
export function getRefrigeratorWorkspacePath(
  refrigerator: Pick<Refrigerator, 'id' | 'access_role'>,
  resource: RefrigeratorWorkspaceResource,
): string {
  if (refrigerator.access_role === 'daily_access') {
    return `/api/daily/refrigerators/${encodeURIComponent(refrigerator.id)}/${resource}`
  }
  return `/api/owner/refrigerators/${encodeURIComponent(refrigerator.id)}/${resource}`
}

/**
 * 解释刷新前后列表的访问结果。
 *
 * `/api/refrigerators` 会过滤撤销凭证和已删除冰箱，因此服务端不会在列表中返回一个
 * 明确的 revoked 状态。若旧条目是 daily_access 且刷新后消失，可安全提示访问已撤销；
 * 其他消失条目只能报告为 missing，避免把删除或权限变化误报成撤销。
 */
export function getRefrigeratorAccessState(
  refrigeratorId: string,
  previous: ReadonlyArray<RefrigeratorAccessItem>,
  current: ReadonlyArray<RefrigeratorAccessItem>,
): RefrigeratorAccessState {
  if (findRefrigerator(current, refrigeratorId)) return 'active'
  const previousRefrigerator = findRefrigerator(previous, refrigeratorId)
  return previousRefrigerator?.access_role === 'daily_access' ? 'revoked' : 'missing'
}

function isSummary(item: RefrigeratorAccessItem): item is RefrigeratorSummaryResponse {
  return 'template_key' in item
}

function findRefrigerator(
  list: ReadonlyArray<RefrigeratorAccessItem>,
  refrigeratorId: string,
): Refrigerator | RefrigeratorSummaryResponse | undefined {
  const item = list.find(candidate => candidate.id === refrigeratorId)
  if (!item) return undefined
  return isSummary(item) ? toRefrigerator(item) : item
}

function compareRefrigerators(left: Refrigerator, right: Refrigerator): number {
  return left.name < right.name ? -1 : left.name > right.name ? 1 : left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}
