import { request } from './appApi'
import type { CustomShoppingItem, RecipeDay, Refrigerator, RestockEntry } from './appTypes'
import { getRefrigeratorWorkspacePath } from './refrigeratorAccess'

export type RecipeCache = {
  days: RecipeDay[]
  restock: RestockEntry[]
  customShoppingItems?: CustomShoppingItem[]
}

/** 拉取当周食谱、补货和自定义购物项，供前台刷新与启动后的静默预取复用。 */
export async function fetchRecipePageData(refrigerator: Refrigerator, monday: string, signal?: AbortSignal): Promise<RecipeCache> {
  const recipesPath = getRefrigeratorWorkspacePath(refrigerator, 'recipes')
  const restockPath = getRefrigeratorWorkspacePath(refrigerator, 'restock')
  const customShoppingItemsPath = getRefrigeratorWorkspacePath(refrigerator, 'custom-shopping-items')
  const [days, restock, customShoppingItems] = await Promise.all([
    request<RecipeDay[]>(`${recipesPath}?week_start=${monday}`, { signal }),
    request<RestockEntry[]>(`${restockPath}?week_start=${monday}`, { signal }),
    request<CustomShoppingItem[]>(customShoppingItemsPath, { signal }),
  ])
  return { days, restock, customShoppingItems }
}
