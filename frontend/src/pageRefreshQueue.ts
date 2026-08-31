type RefreshTask = () => Promise<void>

type QueueEntry = {
  key: string
  task: RefreshTask
  promise: Promise<void>
  resolve: () => void
  reject: (reason: unknown) => void
}

/** 单并发执行页面刷新任务，并允许用户正在进入的页面提升到等待队列首位。 */
export class PageRefreshQueue {
  private readonly entries = new Map<string, QueueEntry>()
  private readonly pending: QueueEntry[] = []
  private running: QueueEntry | null = null
  private cancelled = false

  enqueue(key: string, task: RefreshTask): Promise<void> {
    if (this.cancelled) return Promise.reject(this.cancellationError())
    const existing = this.entries.get(key)
    if (existing) return existing.promise

    let resolve!: () => void
    let reject!: (reason: unknown) => void
    const promise = new Promise<void>((onResolve, onReject) => {
      resolve = onResolve
      reject = onReject
    })
    const entry = { key, task, promise, resolve, reject }
    this.entries.set(key, entry)
    this.pending.push(entry)
    this.runNext()
    return promise
  }

  prioritize(key: string): Promise<void> | null {
    if (this.cancelled) return null
    const entry = this.entries.get(key)
    if (!entry) return null
    if (this.running === entry) return entry.promise
    const index = this.pending.indexOf(entry)
    if (index > 0) {
      this.pending.splice(index, 1)
      this.pending.unshift(entry)
    }
    return entry.promise
  }

  /** 立即结算已暴露的 Promise，并阻止旧账号队列继续启动等待任务。 */
  cancel(): void {
    if (this.cancelled) return
    this.cancelled = true
    const reason = this.cancellationError()
    if (this.running) {
      this.entries.delete(this.running.key)
      this.running.reject(reason)
    }
    for (const entry of this.pending.splice(0)) {
      this.entries.delete(entry.key)
      entry.reject(reason)
    }
  }

  private runNext(): void {
    if (this.running || !this.pending.length) return
    const entry = this.pending.shift()!
    this.running = entry
    void entry.task().then(entry.resolve, entry.reject).finally(() => {
      if (this.entries.get(entry.key) === entry) this.entries.delete(entry.key)
      if (this.running === entry) this.running = null
      if (!this.cancelled) this.runNext()
    })
  }

  private cancellationError(): Error {
    const error = new Error('页面刷新队列已取消。')
    error.name = 'AbortError'
    return error
  }
}
