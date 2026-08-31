import { describe, expect, it } from 'vitest'
import { PageRefreshGuard } from './pageRefreshGuard'

describe('页面刷新提交守卫', () => {
  it('账号代次变化时中止在途请求并拒绝旧任务提交', () => {
    const guard = new PageRefreshGuard()
    const scope = guard.begin('workspace:fridge-1')!

    guard.invalidate()

    expect(scope.controller.signal.aborted).toBe(true)
    expect(guard.canCommit(scope)).toBe(false)
    expect(guard.begin('workspace:fridge-1', scope.generation)).toBeNull()
  })

  it('用户写入后拒绝更早启动的后台读取覆盖缓存', () => {
    const guard = new PageRefreshGuard()
    const scope = guard.begin('workspace:fridge-1')!

    guard.markMutation('workspace:fridge-1')

    expect(guard.canCommit(scope)).toBe(false)
    expect(guard.canCommit(guard.begin('workspace:fridge-1')!)).toBe(true)
  })

  it('账号代次变化时拒绝用户操作提交并取消其请求', () => {
    const guard = new PageRefreshGuard()
    const scope = guard.beginOperation()!

    guard.invalidate()

    expect(scope.controller.signal.aborted).toBe(true)
    expect(guard.canCommitOperation(scope)).toBe(false)
    expect(guard.beginOperation(scope.generation)).toBeNull()
  })
})
