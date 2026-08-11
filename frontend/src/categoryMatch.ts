/** 手工录入自动分类的可测试状态和过期结果保护。 */
export type CategoryMatchState = 'idle' | 'checking' | 'ai' | 'matched' | 'not_found'

export function categoryMatchStatusLabel(state: CategoryMatchState): string {
  if (state === 'ai') return '正在自动匹配分类…'
  if (state === 'matched') return '已自动匹配分类'
  if (state === 'not_found') return '未能自动匹配，请手动选择'
  return ''
}

/** 将服务端阶段文案和累计模型文字数合并为单行分类状态。 */
export function categoryMatchDisplayText(
  state: CategoryMatchState,
  statusMessage: string,
  textLength: number,
): string {
  const text = state === 'ai' && statusMessage ? statusMessage : categoryMatchStatusLabel(state)
  return text && textLength > 0 ? `${text}（${textLength}字）` : text
}

export function isCurrentCategoryMatch(
  sequence: number,
  currentSequence: number,
  aborted: boolean,
  manuallySelected: boolean,
): boolean {
  return !aborted && sequence === currentSequence && !manuallySelected
}
