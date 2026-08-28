// @ts-expect-error The frontend build intentionally omits Node types; this is a test-only source contract.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./InventoryFlow.tsx', import.meta.url), 'utf8')

describe('编辑物品位置返回流程', () => {
  it('确认位置和编辑物品使用独立页面壳，返回时不会复用已完成退出动画的 DOM', () => {
    expect(source).toContain('if (view === \'location\') return <PageShell key="location"')
    expect(source).toContain('if (view === \'edit\') return <PageShell key="edit"')
  })
})

describe('新建/编辑小类父级展示', () => {
  it('从分类目录解析并传递大类名称，不把内部 ID 作为界面文案', () => {
    expect(source).toContain('parentName={parents.find(parent => parent.id === (editingCustomCategory?.parent_id ?? activeGroupId))?.name}')
  })
})

describe('库存日期字段', () => {
  it('添加和编辑流程统一使用应用内日期选择器', () => {
    expect(source).toContain("import { DatePickerField } from './datePicker'")
    expect(source).toContain('<DatePickerField label="生产日期"')
    expect(source).not.toContain('type="date"')
  })
})

describe('库存流程返回栈', () => {
  it('页面跳转保存分类选择器上下文，小类编辑返回时恢复选择分类弹窗', () => {
    expect(source).toContain('const flowHistoryRef = useRef<FlowHistoryEntry[]>([])')
    expect(source).toContain('const captureFlowHistoryEntry = (): FlowHistoryEntry => ({ view, query, activeGroupId, catalogExpanded, catalogTop })')
    expect(source).toContain('setCatalogExpanded(restoreCatalog && previous.catalogExpanded)')
    expect(source).toContain("navigateTo('custom')")
    expect(source).toContain("restorePreviousView(() => setView(returnToList ? 'list' : 'add'))")
  })

  it('位置确认、识别和添加/编辑页面都通过同一返回栈切换', () => {
    expect(source).toContain("navigateTo('location')")
    expect(source).toContain("navigateTo('recognition')")
    expect(source).toContain('const backFrom = () => restorePreviousView(onBack)')
  })
})

describe('扫码添加入口', () => {
  it('支持从识别页作为初始页面启动', () => {
    expect(source).toContain("initialView?: 'add' | 'list' | 'edit' | 'recognition'")
    expect(source).toContain("initialView === 'recognition'")
  })

  it('识别页返回时使用实际调用页面，而不是根据初始模式固定返回列表', () => {
    expect(source).toContain('restorePreviousView(onBack)')
    expect(source).toContain("replaceView('order')")
    expect(source).toContain("replaceView('add', true)")
    expect(source).toContain("const returnToList = initialView === 'list' || initialView === 'edit'")
  })
})
