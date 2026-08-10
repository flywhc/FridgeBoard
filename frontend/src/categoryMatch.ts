/** 手工录入自动分类的可测试状态和过期结果保护。 */
export type CategoryMatchState = 'idle' | 'checking' | 'ai' | 'matched' | 'not_found'

export function categoryMatchStatusLabel(state: CategoryMatchState): string {
  if (state === 'ai') return '正在自动匹配分类…'
  if (state === 'matched') return '已自动匹配分类'
  if (state === 'not_found') return '未能自动匹配，请手动选择'
  return ''
}

export function isCurrentCategoryMatch(
  sequence: number,
  currentSequence: number,
  aborted: boolean,
  manuallySelected: boolean,
): boolean {
  return !aborted && sequence === currentSequence && !manuallySelected
}
