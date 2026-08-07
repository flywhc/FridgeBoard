import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FridgeDeviceBinding } from './FridgeDeviceBinding'
import { canUseCapability, canViewPage, getAccessPermissions } from './accessPermissions'

describe('冰箱访问权限矩阵', () => {
  it('所有者拥有工作区和设置管理能力', () => {
    const permissions = getAccessPermissions('owner')

    expect(permissions.role).toBe('owner')
    expect(permissions.pages.home.view).toBe(true)
    expect(permissions.pages.inventory).toEqual({ view: true, edit: true, move: true })
    expect(permissions.pages.recipes).toEqual({ view: true, edit: true, complete: true })
    expect(permissions.pages.settings).toEqual({
      view: true,
      editName: true,
      editLayout: true,
      manageExpiry: true,
      viewAccessDevices: true,
      manageAccessDevices: true,
      viewDisplayDevice: true,
      manageDisplayDevice: true,
      delete: true,
    })
    expect(canUseCapability('owner', 'restore_refrigerator')).toBe(true)
  })

  it('日常访问者只能使用日常工作区', () => {
    const permissions = getAccessPermissions('daily_access')

    expect(permissions.pages.home.view).toBe(true)
    expect(permissions.pages.inventory).toEqual({ view: true, edit: true, move: false })
    expect(permissions.pages.recipes).toEqual({ view: true, edit: false, complete: true })
    expect(permissions.pages.settings).toEqual({
      view: false,
      editName: false,
      editLayout: false,
      manageExpiry: false,
      viewAccessDevices: false,
      manageAccessDevices: false,
      viewDisplayDevice: false,
      manageDisplayDevice: false,
      delete: false,
    })
    expect(canViewPage('daily_access', 'settings')).toBe(false)
  })

  it('未知或缺失角色按最小权限拒绝', () => {
    for (const role of [undefined, null, 'admin', '']) {
      const permissions = getAccessPermissions(role)
      expect(permissions.role).toBeNull()
      expect(canViewPage(role, 'home')).toBe(false)
      expect(canUseCapability(role, 'view_inventory')).toBe(false)
      expect(canUseCapability(role, 'manage_display_device')).toBe(false)
    }
  })
})

describe('冰箱端设备组件门禁', () => {
  it('daily_access 不显示绑定、换绑或六位码操作', () => {
    const markup = renderToStaticMarkup(createElement(FridgeDeviceBinding, {
      refrigerator: {
        id: 'fridge-1',
        name: '共享冰箱',
        display_device_status: 'bound',
        access_role: 'daily_access',
      },
      onBack: () => undefined,
      onScanQr: async () => null,
      onBindByQr: async () => undefined,
      onCreatePasscode: async () => ({ passcode: '042913', expiresInSeconds: 300 }),
    }))

    expect(markup).toContain('没有权限管理冰箱端设备')
    expect(markup).not.toContain('更换冰箱端设备')
    expect(markup).not.toContain('使用六位绑定码')
  })
})
