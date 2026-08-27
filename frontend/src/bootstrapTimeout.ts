export const DEEP_LINK_INIT_TIMEOUT_MS = 1_500

export type PromiseOutcome = 'resolved' | 'rejected' | 'timed-out'

/** 将启动依赖限制在有限等待内，同时让原 Promise 继续在后台运行。 */
export function waitForPromiseOutcome<T>(promise: Promise<T>, timeoutMs: number): Promise<PromiseOutcome> {
  return new Promise(resolve => {
    let settled = false
    const timeout = globalThis.setTimeout(() => {
      if (settled) return
      settled = true
      resolve('timed-out')
    }, timeoutMs)
    const finish = (outcome: PromiseOutcome) => {
      if (settled) return
      settled = true
      globalThis.clearTimeout(timeout)
      resolve(outcome)
    }
    void promise.then(() => finish('resolved'), () => finish('rejected'))
  })
}
