const QUANTITY_PATTERN = /^\d+(?:\.\d{1,2})?$/

/** 解析允许用户输入的非负数量，最多保留两位小数。 */
export function parseQuantity(value: string): number | null {
  const normalized = value.trim()
  if (!QUANTITY_PATTERN.test(normalized)) return null
  const quantity = Number(normalized)
  return Number.isFinite(quantity) && quantity >= 0 ? quantity : null
}

/** 按两位小数格式化数量，避免步进时出现浮点尾数。 */
export function formatQuantity(quantity: number): string {
  return Number(quantity.toFixed(2)).toString()
}

/** 在当前数量上按一个单位步进，并保留最多两位小数。 */
export function stepQuantity(value: string, delta: number, min: number): string {
  const current = parseQuantity(value) ?? min
  return formatQuantity(Math.max(min, current + delta))
}
