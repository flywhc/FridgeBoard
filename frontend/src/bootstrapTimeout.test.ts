import { describe, expect, it, vi } from 'vitest'
import { waitForPromiseOutcome } from './bootstrapTimeout'

describe('启动阶段有界等待', () => {
  it('深链初始化一直 pending 时在超时点继续启动', async () => {
    vi.useFakeTimers()
    try {
      const pending = new Promise<void>(() => undefined)
      const outcome = waitForPromiseOutcome(pending, 1_500)
      let settled = false
      void outcome.then(() => { settled = true })

      await vi.advanceTimersByTimeAsync(1_499)
      expect(settled).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      await expect(outcome).resolves.toBe('timed-out')
    } finally {
      vi.useRealTimers()
    }
  })

  it('初始化快速失败时不阻塞启动，并将失败标记为 rejected', async () => {
    await expect(waitForPromiseOutcome(Promise.reject(new Error('插件不可用')), 1_500)).resolves.toBe('rejected')
  })
})
