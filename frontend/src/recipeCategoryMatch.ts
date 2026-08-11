import type { CategoryMatchState } from './categoryMatch'

/** 返回食谱编辑器中食材分类后台匹配的可读状态。 */
export function recipeIngredientMatchText(
  state: CategoryMatchState,
  categoryName: string | null | undefined,
): string {
  if (state === 'checking') return '正在自动匹配分类…'
  if (state === 'ai') return '正在使用智能匹配分类…'
  if (state === 'not_found') return '暂未匹配到分类，可继续编辑名称'
  if (state === 'matched' && categoryName) return `分类：${categoryName}`
  return ''
}

/** 将分类状态与模型累计文字数合并为食谱编辑器的一行状态文案。 */
export function recipeIngredientMatchDisplayText(
  state: CategoryMatchState,
  categoryName: string | null | undefined,
  textLength: number,
  statusMessage = '',
): string {
  const text = (state === 'checking' || state === 'ai') && statusMessage
    ? statusMessage
    : recipeIngredientMatchText(state, categoryName)
  return text && textLength > 0 ? `${text}（${textLength}字）` : text
}
