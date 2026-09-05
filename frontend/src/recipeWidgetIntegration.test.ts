// @ts-expect-error The frontend build intentionally omits Node types; this is a test-only source contract.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')
const workspaceSource = readFileSync(new URL('./RecipeWorkspace.tsx', import.meta.url), 'utf8')

describe('食谱小组件前端接线契约', () => {
  it('授权冰箱列表和后台本周/下周预取会发布白名单数据', () => {
    expect(appSource).toContain('publishFridges(loaded)')
    expect(appSource).toContain('publishWeek(fridge, recipeMonday, data)')
    expect(appSource).toContain('clearRecipeWidgetData()')
    expect(appSource).toContain('clearForFridge(previous.id)')
    expect(appSource).toContain('advanceAccountGeneration()')
  })

  it('食谱工作区发布命中缓存、网络和乐观状态，并验证当前周', () => {
    expect(workspaceSource).toContain('const publishCurrentWeek = useCallback')
    expect(workspaceSource).toContain('publishCurrentWeek(monday, cached.data)')
    expect(workspaceSource).toContain('publishCurrentWeek(monday, data)')
    expect(workspaceSource).toContain('publishCurrentWeek(monday, nextDays)')
    expect(workspaceSource).toContain('publishWeek(refrigerator, targetWeekStart, importedWeek)')
    expect(workspaceSource).toContain('publishWeek(refrigerator, target, { days: copied, restock: shortages, customShoppingItems })')
  })
})
