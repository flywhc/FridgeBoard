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
