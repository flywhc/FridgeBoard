import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MobileAuthIssueDialog } from './MobileAuthIssueDialog'

describe('移动认证故障授权弹窗', () => {
  it('允许先提交现场或保留 token，清除操作必须写明需要用户同意', () => {
    const markup = renderToStaticMarkup(createElement(MobileAuthIssueDialog, {
      issue: {
        reportId: 'auth-server-12345678',
        occurredAt: '2026-09-04T08:30:00.000Z',
        stage: 'refresh',
        reason: 'server_rejected',
        requiresLogin: true,
        title: '登录会话已被服务器撤销',
        message: '服务器记录显示这台手机的长期登录会话已被撤销。',
      },
      onDismiss: () => undefined,
      onSubmit: () => undefined,
      onApproveClear: () => undefined,
    }))

    expect(markup).toContain('auth-server-12345678')
    expect(markup).toContain('提交错误信息')
    expect(markup).toContain('重新登录')
    expect(markup).toContain('稍后再试')
  })
})
