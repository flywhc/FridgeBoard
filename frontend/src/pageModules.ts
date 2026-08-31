import { createElement, type ComponentType } from 'react'

const loadInventoryFlow = () => import('./InventoryFlow').then(module => ({ default: module.InventoryFlow }))
const loadInventorySearch = () => import('./InventorySearch').then(module => ({ default: module.InventorySearch }))
const loadInventoryMoveFlow = () => import('./InventoryMoveFlow').then(module => ({ default: module.InventoryMoveFlow }))

function createPreloadableComponent<Props extends object>(load: () => Promise<{ default: ComponentType<Props> }>) {
  let loaded: ComponentType<Props> | null = null
  let pending: Promise<void> | null = null
  const preload = () => {
    if (loaded) return Promise.resolve()
    pending ??= load().then(module => { loaded = module.default }).catch(error => {
      pending = null
      throw error
    })
    return pending
  }
  const Component = (props: Props) => {
    if (!loaded) throw preload()
    return createElement(loaded, props)
  }
  return { Component, preload }
}

const inventoryFlowModule = createPreloadableComponent(loadInventoryFlow)
const inventorySearchModule = createPreloadableComponent(loadInventorySearch)
const inventoryMoveFlowModule = createPreloadableComponent(loadInventoryMoveFlow)

export const LazyInventoryFlow = inventoryFlowModule.Component
export const LazyInventorySearch = inventorySearchModule.Component
export const LazyInventoryMoveFlow = inventoryMoveFlowModule.Component

/** 原生包中的页面 chunk 都是本地文件，启动时读取可消除首次导航的 Suspense 页面。 */
export async function preloadCapacitorPageModules(): Promise<void> {
  await Promise.all([
    inventoryFlowModule.preload(),
    inventorySearchModule.preload(),
    inventoryMoveFlowModule.preload(),
  ])
}
