import type { Category } from './appTypes'

/** 返回未显式选择小类时可安全写入库存的默认小类。 */
export function getDefaultSubcategory(
  parent: Category | undefined,
  children: Category[],
): Category | undefined {
  return children.find(child => child.name === parent?.name) ?? children[0]
}
