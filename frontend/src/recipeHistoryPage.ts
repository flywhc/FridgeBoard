/** 食谱历史列表和详情使用独立页面身份，避免返回动画状态跨页面复用。 */
export function getRecipeHistoryPageKey(view: 'history' | 'history-detail'): string {
  return `recipe-${view}`
}
