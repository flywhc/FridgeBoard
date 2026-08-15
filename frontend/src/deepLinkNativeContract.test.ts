// @ts-expect-error The frontend build intentionally omits Node types; this is a test-only source contract.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const manifest = readFileSync(
  new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url),
  'utf8',
)
const iosInfo = readFileSync(new URL('../ios/App/App/Info.plist', import.meta.url), 'utf8')

describe('Android 深链声明', () => {
  it('配对使用 HTTPS，移动认证使用 App 专属 scheme，且不使用会扩大范围的 pathPrefix', () => {
    expect(manifest).toContain('android:path="/pair"')
    expect(manifest).toContain('android:scheme="fridgeboard"')
    expect(manifest).toContain('android:host="mobile"')
    expect(manifest).toContain('android:path="/auth/callback"')
    expect(manifest).not.toContain('android:host="fridge.flycn.fyi" android:path="/mobile/auth/callback"')
    expect(manifest).not.toContain('android:pathPrefix="/pair"')
    expect(manifest).not.toContain('android:pathPrefix="/auth/callback"')
    expect(iosInfo).toContain('<string>fridgeboard</string>')
  })
})
