import type { Refrigerator } from './appTypes'

/** 为新建流程生成当前所有者尚未使用的默认冰箱名称。 */
export function suggestRefrigeratorName(refrigerators: Pick<Refrigerator, 'name'>[]): string {
  const names = new Set(refrigerators.map(refrigerator => refrigerator.name.trim()))
  const baseName = '家里冰箱'
  if (!names.has(baseName)) return baseName
  let suffix = 2
  while (names.has(`${baseName} ${suffix}`)) suffix += 1
  return `${baseName} ${suffix}`
}
