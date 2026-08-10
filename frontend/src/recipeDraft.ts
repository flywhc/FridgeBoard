import type { RecipeEntry } from './appTypes'

/** 创建指定星期的新食谱草稿，空 id 用于区分新增和已有食谱编辑。 */
export function createNewRecipeEntry(weekday: number): RecipeEntry {
  return { id: '', weekday, dish_name: '', method: null, note: null, completed: false, ingredients: [], missing: [] }
}
