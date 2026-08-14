// @ts-expect-error The frontend build intentionally omits Node types; this is a test-only source contract.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const androidPlugin = readFileSync(
  new URL('../android/app/src/main/java/com/fridgeboard/app/NativeCapabilitiesPlugin.java', import.meta.url),
  'utf8',
)
const manifest = readFileSync(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8')
const sceneDelegate = readFileSync(new URL('../ios/App/App/SceneDelegate.swift', import.meta.url), 'utf8')
const iosPlugin = readFileSync(new URL('../ios/App/App/NativeCapabilitiesPlugin.swift', import.meta.url), 'utf8')

describe('P13.5 原生能力桥', () => {
  it('Android 注册系统返回、分享和网络状态能力', () => {
    expect(androidPlugin).toContain('@CapacitorPlugin(name = "NativeCapabilities")')
    expect(androidPlugin).toContain('notifyListeners("backButton"')
    expect(androidPlugin).toContain('Intent.ACTION_SEND')
    expect(androidPlugin).toContain('text + "\\n" + url')
    expect(androidPlugin).toContain('registerDefaultNetworkCallback')
    expect(manifest).toContain('android.permission.ACCESS_NETWORK_STATE')
  })

  it('iOS 使用原生边缘手势桥接 React 返回，并关闭 WebView history 手势', () => {
    expect(sceneDelegate).toContain('allowsBackForwardNavigationGestures = false')
    expect(sceneDelegate).toContain('NativeCapabilitiesPlugin()')
    expect(iosPlugin).toContain('UIScreenEdgePanGestureRecognizer')
    expect(iosPlugin).toContain('notifyListeners("backButton"')
  })
})
