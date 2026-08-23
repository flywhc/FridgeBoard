// @ts-expect-error The frontend build intentionally omits Node types; this is a test-only source contract.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const androidPlugin = readFileSync(
  new URL('../android/app/src/main/java/com/fridgeboard/app/NativeCapabilitiesPlugin.java', import.meta.url),
  'utf8',
)
const manifest = readFileSync(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8')
const iosInfo = readFileSync(new URL('../ios/App/App/Info.plist', import.meta.url), 'utf8')
const sceneDelegate = readFileSync(new URL('../ios/App/App/SceneDelegate.swift', import.meta.url), 'utf8')
const iosPlugin = readFileSync(new URL('../ios/App/App/NativeCapabilitiesPlugin.swift', import.meta.url), 'utf8')

describe('P13.5 原生能力桥', () => {
  it('Android 注册系统返回、分享和网络状态能力', () => {
    expect(androidPlugin).toContain('@CapacitorPlugin(name = "NativeCapabilities")')
    expect(androidPlugin).toContain('notifyListeners("backButton"')
    expect(androidPlugin).toContain('Intent.ACTION_SEND')
    expect(androidPlugin).toContain('text + "\\n" + url')
    expect(androidPlugin).toContain('registerDefaultNetworkCallback')
    expect(androidPlugin).toContain('backCallback.remove()')
    expect(androidPlugin).toContain('@ActivityCallback')
    expect(androidPlugin).toContain('shareCompleted')
    expect(androidPlugin).toContain('openExternalUrl')
    expect(androidPlugin).toContain('CustomTabsClient.getPackageName')
    expect(androidPlugin).toContain('CustomTabsIntent.Builder')
    expect(androidPlugin).not.toContain('com.android.chrome')
    expect(manifest).toContain('android:enableOnBackInvokedCallback="true"')
    expect(manifest).toContain('android.permission.ACCESS_NETWORK_STATE')
  })

  it('Android 与 iOS 原生 App 仅支持正向竖屏', () => {
    expect(manifest).toContain('android:screenOrientation="portrait"')
    expect(iosInfo).toContain('<key>UIRequiresFullScreen</key>')
    expect(iosInfo).toContain('<key>UISupportedInterfaceOrientations</key>')
    expect(iosInfo).toContain('<key>UISupportedInterfaceOrientations~ipad</key>')
    expect(iosInfo).not.toContain('UIInterfaceOrientationLandscapeLeft')
    expect(iosInfo).not.toContain('UIInterfaceOrientationLandscapeRight')
    expect(iosInfo).not.toContain('UIInterfaceOrientationPortraitUpsideDown')
  })

  it('iOS 使用原生边缘手势桥接 React 返回，并关闭 WebView history 手势', () => {
    expect(sceneDelegate).toContain('allowsBackForwardNavigationGestures = false')
    expect(sceneDelegate).toContain('NativeCapabilitiesPlugin()')
    expect(iosPlugin).toContain('UIScreenEdgePanGestureRecognizer')
    expect(iosPlugin).toContain('gesture.cancelsTouchesInView = false')
    expect(iosPlugin).toContain('gestureRecognizerShouldBegin')
    expect(iosPlugin).toContain('completionWithItemsHandler')
    expect(iosPlugin).toContain('openExternalUrl')
    expect(iosPlugin).toContain('UIApplication.shared.open')
    expect(iosPlugin).toContain('DispatchQueue.main.async')
    expect(iosPlugin).toContain('notifyListeners("backButton"')
  })
})
