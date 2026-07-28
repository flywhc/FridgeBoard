type RecipeIngredient = { subcategory_name: string; quantity: number }
type Icon = { key: string; label: string; asset_url: string }

/**
 * 返回食谱完成操作应展示的首个食材图标；找不到严格同名图标时保持空状态，避免误导库存扣减语义。
 */
export function getRecipeActionIcon(ingredients: RecipeIngredient[], icons: Icon[]): Icon | undefined {
  const firstIngredient = ingredients[0]
  return firstIngredient ? icons.find(icon => icon.label === firstIngredient.subcategory_name) : undefined
}
