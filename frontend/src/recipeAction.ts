import type { Icon, InventoryBatch } from './appTypes'

/**
 * 返回食谱食材对应库存批次保存的图标；找不到时保持空状态，避免用分类标签猜测图标。
 */
export function getRecipeIngredientIcon(name: string, inventory: Pick<InventoryBatch, 'item_name' | 'icon_key'>[], icons: Icon[]): Icon | undefined {
  const iconKey = inventory.find(item => item.item_name === name && item.icon_key)?.icon_key
  return iconKey ? icons.find(icon => icon.key === iconKey) : undefined
}
