type Icon = { key: string; label: string; asset_url: string }

/**
 * 返回食谱食材应展示的严格同名图标；找不到时保持空状态，避免误导库存扣减语义。
 */
export function getRecipeIngredientIcon(name: string, icons: Icon[]): Icon | undefined {
  return icons.find(icon => icon.label === name)
}
