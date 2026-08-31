import { request } from './appApi'
import type { InventoryBatch, Layout, Refrigerator } from './appTypes'
import { getRefrigeratorWorkspacePath } from './refrigeratorAccess'

export type FridgeOverview = {
  summaries: Record<string, { template: string; foods: number }>
  layouts: Record<string, Layout>
  deletedCount: number
}

/**
 * 读取冰箱概览；后台完整预取使用严格模式，避免将降级结果标记为完整缓存。
 */
export async function fetchFridgeOverview(
  fridges: Refrigerator[],
  signal?: AbortSignal,
  strict = false,
): Promise<FridgeOverview> {
  function withFallback<T>(promise: Promise<T>, fallback: T): Promise<T> {
    return strict ? promise : promise.catch(() => fallback)
  }
  const [items, deleted] = await Promise.all([
    Promise.all(fridges.map(async fridge => {
      const workspacePath = (resource: 'layout' | 'inventory') => getRefrigeratorWorkspacePath(fridge, resource)
      const [layout, inventory] = await Promise.all([
        withFallback(request<Layout>(workspacePath('layout'), { signal }), null),
        withFallback(request<InventoryBatch[]>(`${workspacePath('inventory')}?include_zero=false`, { signal }), null),
      ])
      return {
        id: fridge.id,
        layout,
        summary: {
          template: layout ? (layout.template_key === 'mini' ? '迷你冰箱' : '已配置布局') : (fridge.setup_status === 'needs_layout' ? '待完成布局' : '已配置布局'),
          foods: inventory?.reduce((total, item) => total + item.quantity, 0) ?? 0,
        },
      }
    })),
    withFallback(request<Refrigerator[]>('/api/owner/refrigerators/deleted', { signal }), []),
  ])
  return {
    summaries: Object.fromEntries(items.map(item => [item.id, item.summary])),
    layouts: items.reduce<Record<string, Layout>>((result, item) => {
      if (item.layout) result[item.id] = item.layout
      return result
    }, {}),
    deletedCount: deleted.length,
  }
}
