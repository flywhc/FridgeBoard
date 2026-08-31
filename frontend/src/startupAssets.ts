import type { Icon, Refrigerator } from './appTypes'
import { readPageCache, refrigeratorListCacheKey, refrigeratorWorkspaceCacheKey } from './pageCache'
import { resolveIconVariant } from './iconVariants'
import { preloadPersistentRuntimeAssets } from './runtimeAssetCache'
import { selectStartupRefrigerator } from './startupRefrigerator'
import { getTheme } from './theme'
import { applyRefrigeratorOrder } from './fridgeOrdering'

const LAST_REFRIGERATOR_STORAGE_KEY = 'fb-last-refrigerator-id'

type FridgeListCache = { fridges: Refrigerator[] }
type WorkspaceCache = { icons: Icon[] }

/** 将当前冰箱各缓存页面可用的图标恢复到进程内，缺失项留给页面正常加载。 */
export async function preloadCachedWorkspaceIconAssets(): Promise<void> {
  const fridgeCache = readPageCache<FridgeListCache>(refrigeratorListCacheKey())
  const refrigerator = selectStartupRefrigerator(
    applyRefrigeratorOrder(fridgeCache?.data.fridges ?? []),
    window.localStorage.getItem(LAST_REFRIGERATOR_STORAGE_KEY),
  )
  if (!refrigerator) return

  const workspace = readPageCache<WorkspaceCache>(refrigeratorWorkspaceCacheKey(refrigerator.id))?.data
  if (!workspace) return
  const urls = workspace.icons.map(icon => resolveIconVariant(icon, getTheme()).assetUrl)
  await preloadPersistentRuntimeAssets(urls)
}
