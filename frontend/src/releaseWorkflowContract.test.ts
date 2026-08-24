// @ts-expect-error The frontend build intentionally omits Node types; this is a test-only source contract.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const androidWorkflow = readFileSync(new URL('../../.github/workflows/android-release.yml', import.meta.url), 'utf8')
const mobileWorkflow = readFileSync(new URL('../../.github/workflows/mobile-release.yml', import.meta.url), 'utf8')
const releaseScript = readFileSync(new URL('../../scripts/mobile-release.sh', import.meta.url), 'utf8')

describe('Android GitHub Release 发布流程', () => {
  it('由 v* tag 触发并使用当前公开仓库的内置 Token', () => {
    expect(androidWorkflow).toContain('tags:')
    expect(androidWorkflow).toContain('- "v*"')
    expect(androidWorkflow).toContain('contents: write')
    expect(androidWorkflow).toContain('token: ${{ github.token }}')
    expect(androidWorkflow).toContain('1700000000 + GITHUB_RUN_NUMBER')
    expect(androidWorkflow).toContain('FridgeBoard-${{ steps.metadata.outputs.version }}-android-${{ steps.metadata.outputs.build_number }}.apk')
    expect(androidWorkflow).toContain('Verify published APK digest')
    expect(androidWorkflow).toContain('sha256:[0-9a-f]{64}')
    expect(androidWorkflow).not.toContain('FLYCN_PUBLISH_TOKEN')
    expect(androidWorkflow).not.toContain('PUBLIC_RELEASES_TOKEN')
  })

  it('保留现有 iOS 手动发布和 flycn 兼容入口', () => {
    expect(mobileWorkflow).toContain('workflow_dispatch:')
    expect(mobileWorkflow).toContain('FRIDGEBOARD_IOS_CERTIFICATE_BASE64')
    expect(mobileWorkflow).toContain('FLYCN_PUBLISH_TOKEN')
    expect(releaseScript).toContain('Android APK 不再通过 flycn 发布')
  })
})
