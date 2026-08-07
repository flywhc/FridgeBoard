/** 冰箱工作区的前端能力矩阵；服务端鉴权仍是最终安全边界。 */

export type RefrigeratorAccessRole = 'owner' | 'daily_access'

export type AccessCapability =
  | 'view_home'
  | 'view_inventory'
  | 'edit_inventory'
  | 'move_inventory'
  | 'view_recipes'
  | 'edit_recipes'
  | 'complete_recipes'
  | 'view_settings'
  | 'edit_name'
  | 'edit_layout'
  | 'manage_expiry'
  | 'view_access_devices'
  | 'manage_access_devices'
  | 'view_display_device'
  | 'manage_display_device'
  | 'delete_refrigerator'
  | 'restore_refrigerator'

export type AccessPage = 'home' | 'inventory' | 'recipes' | 'settings'

export type PageAccess = {
  home: { view: boolean }
  inventory: { view: boolean; edit: boolean; move: boolean }
  recipes: { view: boolean; edit: boolean; complete: boolean }
  settings: {
    view: boolean
    editName: boolean
    editLayout: boolean
    manageExpiry: boolean
    viewAccessDevices: boolean
    manageAccessDevices: boolean
    viewDisplayDevice: boolean
    manageDisplayDevice: boolean
    delete: boolean
  }
}

export type AccessPermissions = {
  role: RefrigeratorAccessRole | null
  capabilities: Readonly<Record<AccessCapability, boolean>>
  pages: PageAccess
}

const ALL_CAPABILITIES: readonly AccessCapability[] = [
  'view_home',
  'view_inventory',
  'edit_inventory',
  'move_inventory',
  'view_recipes',
  'edit_recipes',
  'complete_recipes',
  'view_settings',
  'edit_name',
  'edit_layout',
  'manage_expiry',
  'view_access_devices',
  'manage_access_devices',
  'view_display_device',
  'manage_display_device',
  'delete_refrigerator',
  'restore_refrigerator',
]

const OWNER_CAPABILITIES: ReadonlySet<AccessCapability> = new Set(ALL_CAPABILITIES)

const DAILY_ACCESS_CAPABILITIES: ReadonlySet<AccessCapability> = new Set([
  'view_home',
  'view_inventory',
  'edit_inventory',
  'view_recipes',
  'complete_recipes',
])

function isRefrigeratorAccessRole(value: unknown): value is RefrigeratorAccessRole {
  return value === 'owner' || value === 'daily_access'
}

function createCapabilityMap(allowed: ReadonlySet<AccessCapability>): Readonly<Record<AccessCapability, boolean>> {
  return Object.fromEntries(ALL_CAPABILITIES.map(capability => [capability, allowed.has(capability)])) as Record<AccessCapability, boolean>
}

function createPageAccess(capabilities: Readonly<Record<AccessCapability, boolean>>): PageAccess {
  return {
    home: { view: capabilities.view_home },
    inventory: {
      view: capabilities.view_inventory,
      edit: capabilities.edit_inventory,
      move: capabilities.move_inventory,
    },
    recipes: {
      view: capabilities.view_recipes,
      edit: capabilities.edit_recipes,
      complete: capabilities.complete_recipes,
    },
    settings: {
      view: capabilities.view_settings,
      editName: capabilities.edit_name,
      editLayout: capabilities.edit_layout,
      manageExpiry: capabilities.manage_expiry,
      viewAccessDevices: capabilities.view_access_devices,
      manageAccessDevices: capabilities.manage_access_devices,
      viewDisplayDevice: capabilities.view_display_device,
      manageDisplayDevice: capabilities.manage_display_device,
      delete: capabilities.delete_refrigerator,
    },
  }
}

/**
 * 返回指定冰箱访问角色的完整页面权限。
 *
 * 未知或缺失角色按最小权限处理；缺少 role 的旧组件可在宿主完成字段接入前继续自行决定兼容行为。
 */
export function getAccessPermissions(role: unknown): AccessPermissions {
  const normalizedRole = isRefrigeratorAccessRole(role) ? role : null
  const allowed = normalizedRole === 'owner'
    ? OWNER_CAPABILITIES
    : normalizedRole === 'daily_access'
      ? DAILY_ACCESS_CAPABILITIES
      : new Set<AccessCapability>()
  const capabilities = createCapabilityMap(allowed)
  return { role: normalizedRole, capabilities, pages: createPageAccess(capabilities) }
}

/** 判断角色是否拥有某项冰箱能力；未知角色永远拒绝。 */
export function canUseCapability(role: unknown, capability: AccessCapability): boolean {
  return getAccessPermissions(role).capabilities[capability]
}

/** 判断角色是否可以进入某个顶级工作区页面。 */
export function canViewPage(role: unknown, page: AccessPage): boolean {
  return getAccessPermissions(role).pages[page].view
}
