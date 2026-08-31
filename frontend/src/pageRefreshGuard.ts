export type PageRefreshScope = {
  cacheKey: string
  generation: number
  mutationVersion: number
  controller: AbortController
}

export type PageOperationScope = {
  generation: number
  controller: AbortController
}

/** 隔离账号代次和用户写入，阻止过期后台读取提交缓存。 */
export class PageRefreshGuard {
  private generation = 0
  private readonly mutationVersions = new Map<string, number>()
  private readonly controllers = new Set<AbortController>()

  currentGeneration(): number {
    return this.generation
  }

  begin(cacheKey: string, expectedGeneration = this.generation): PageRefreshScope | null {
    if (expectedGeneration !== this.generation) return null
    const controller = new AbortController()
    this.controllers.add(controller)
    return {
      cacheKey,
      generation: expectedGeneration,
      mutationVersion: this.mutationVersions.get(cacheKey) ?? 0,
      controller,
    }
  }

  beginOperation(expectedGeneration = this.generation): PageOperationScope | null {
    if (expectedGeneration !== this.generation) return null
    const controller = new AbortController()
    this.controllers.add(controller)
    return { generation: expectedGeneration, controller }
  }

  canCommit(scope: PageRefreshScope): boolean {
    return !scope.controller.signal.aborted
      && scope.generation === this.generation
      && scope.mutationVersion === (this.mutationVersions.get(scope.cacheKey) ?? 0)
  }

  canCommitOperation(scope: PageOperationScope): boolean {
    return !scope.controller.signal.aborted && scope.generation === this.generation
  }

  isGenerationCurrent(generation: number): boolean {
    return generation === this.generation
  }

  markMutation(cacheKey: string): void {
    this.mutationVersions.set(cacheKey, (this.mutationVersions.get(cacheKey) ?? 0) + 1)
  }

  release(scope: PageRefreshScope): void {
    this.controllers.delete(scope.controller)
  }

  releaseOperation(scope: PageOperationScope): void {
    this.controllers.delete(scope.controller)
  }

  invalidate(): void {
    this.generation += 1
    for (const controller of this.controllers) controller.abort()
    this.controllers.clear()
    this.mutationVersions.clear()
  }
}

export const pageRefreshGuard = new PageRefreshGuard()
