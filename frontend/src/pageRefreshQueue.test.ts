import { describe, expect, it, vi } from 'vitest'
import { PageRefreshQueue } from './pageRefreshQueue'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(onResolve => { resolve = onResolve })
  return { promise, resolve }
}

describe('页面静默刷新队列', () => {
  it('逐页串行刷新，避免启动时并发打满全部接口', async () => {
    const queue = new PageRefreshQueue()
    const first = deferred()
    const order: string[] = []
    const firstRun = queue.enqueue('home', async () => { order.push('home:start'); await first.promise; order.push('home:end') })
    const secondRun = queue.enqueue('recipes', async () => { order.push('recipes') })

    await Promise.resolve()
    expect(order).toEqual(['home:start'])
    first.resolve()
    await Promise.all([firstRun, secondRun])
    expect(order).toEqual(['home:start', 'home:end', 'recipes'])
  })

  it('用户进入尚未刷新的页面时把该页提升到等待队列首位', async () => {
    const queue = new PageRefreshQueue()
    const first = deferred()
    const order: string[] = []
    const running = queue.enqueue('home', () => first.promise)
    const later = queue.enqueue('other-fridge', async () => { order.push('other-fridge') })
    const wanted = queue.enqueue('recipes', async () => { order.push('recipes') })

    expect(queue.prioritize('recipes')).toBe(wanted)
    first.resolve()
    await Promise.all([running, later, wanted])
    expect(order).toEqual(['recipes', 'other-fridge'])
  })

  it('相同页面任务复用同一个 Promise，避免导航与后台预取重复请求', async () => {
    const queue = new PageRefreshQueue()
    const task = vi.fn(async () => undefined)
    const first = queue.enqueue('home', task)
    const second = queue.enqueue('home', task)

    expect(second).toBe(first)
    await Promise.all([first, second])
    expect(task).toHaveBeenCalledTimes(1)
  })

  it('单页失败后继续刷新后续页面', async () => {
    const queue = new PageRefreshQueue()
    const failed = queue.enqueue('home', async () => { throw new Error('offline') })
    const next = vi.fn(async () => undefined)
    const completed = queue.enqueue('recipes', next)

    await expect(failed).rejects.toThrow('offline')
    await completed
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('取消队列时立即拒绝运行项和全部等待项，不再启动后续任务', async () => {
    const queue = new PageRefreshQueue()
    const runningTask = deferred()
    const nextTask = vi.fn(async () => undefined)
    const running = queue.enqueue('home', () => runningTask.promise)
    const pending = queue.enqueue('recipes', nextTask)

    queue.cancel()

    await expect(running).rejects.toMatchObject({ name: 'AbortError' })
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    runningTask.resolve()
    await Promise.resolve()
    expect(nextTask).not.toHaveBeenCalled()
  })
})
