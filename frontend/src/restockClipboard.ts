import type { RestockEntry } from './appTypes'

/**
 * Formats restock items for clipboard use without adding recipe context.
 *
 * @param restock Restock entries whose missing items should be copied.
 * @returns One missing item with its quantity per line.
 */
export function formatRestockClipboardText(restock: RestockEntry[]): string {
  return restock.flatMap(item => item.missing.map(missing => `${missing.subcategory_name}×${missing.quantity}`)).join('\n')
}
