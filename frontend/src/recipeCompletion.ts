/** 为食谱完成/撤销操作提供同步级互斥，避免同一点击窗口内重复提交。 */
export class RecipeCompletionRequestGate {
  private activeEntryId: string | null = null

  /** 尝试占用完成操作；已有操作未释放时拒绝新的提交。 */
  acquire(entryId: string): boolean {
    if (this.activeEntryId !== null) return false
    this.activeEntryId = entryId
    return true
  }

  /** 仅允许当前持有者释放操作，避免晚到请求解锁新操作。 */
  release(entryId: string): void {
    if (this.activeEntryId === entryId) this.activeEntryId = null
  }
}
