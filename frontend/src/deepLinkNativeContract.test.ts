// @ts-expect-error The frontend build intentionally omits Node types; this is a test-only source contract.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const manifest = readFileSync(
  new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url),
  'utf8',
)

describe('Android 深链声明', () => {
  it('只匹配两个公开回调路径，不使用会扩大范围的 pathPrefix', () => {
    expect(manifest).toContain('android:path="/pair"')
    expect(manifest).toContain('android:path="/mobile/auth/callback"')
    expect(manifest).not.toContain('android:pathPrefix="/pair"')
    expect(manifest).not.toContain('android:pathPrefix="/mobile/auth/callback"')
  })
})
