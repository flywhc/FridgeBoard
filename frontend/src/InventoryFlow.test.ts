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

describe('扫码添加入口', () => {
  it('支持从识别页作为初始页面启动', () => {
    expect(source).toContain("initialView?: 'add' | 'list' | 'edit' | 'recognition'")
    expect(source).toContain("initialView === 'recognition'")
  })
})
