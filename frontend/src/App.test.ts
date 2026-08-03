import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FridgePreviewFrame, OpenFridge } from './FridgeLayout'
import { getRecipeIngredientIcon } from './recipeAction'
import { getPwaInstallPromptMode } from './pwaInstallPrompt'
import { selectStartupRefrigerator } from './startupRefrigerator'
import { getDoorColdRegion, getDoorGridRows, getDoorTemperatureBoundary } from './fridgeDoorLayout'
import { filterInventory, formatInventoryScopeTitle } from './inventoryListFilters'
import { getFoodIconPosition } from './fridgeFoodLayout'
import { isFridgeBoardAppCache } from './pwaCache'
import { formatLayoutSlotOption, LAYOUT_SLOT_OPTIONS } from './layoutSlotOptions'
import { completeLayoutZones } from './layoutDraft'
import type { Layout } from './appTypes'
import { getFridgePreviewFitSize, getFridgeShellGeometry, getFridgeZoneRows } from './fridgeGeometry'
import { suggestRefrigeratorName } from './refrigeratorName'
import { P7Navigation, PageShell } from './sharedUi'
import { getPreselectedInventorySlotId } from './inventoryAddLocation'
import { filterInventoryAcrossRefrigerators } from './inventorySearchUtils'

const fridges = [{ id: 'fridge-1' }, { id: 'fridge-2' }]

describe('P7 顶级页面应用壳', () => {
  it('将共享底部导航放在可滚动内容区之外', () => {
    const markup = renderToStaticMarkup(createElement(PageShell, {
      className: 'p7-top-level',
      header: createElement('header', null, '标题'),
      children: createElement('p', null, '内容'),
      footer: createElement(P7Navigation, {
        active: 'home',
        onHome: () => undefined,
        onRecipes: () => undefined,
        onFridge: () => undefined,
        onMe: () => undefined,
      }),
    }))

    expect(markup).toContain('<div class="mobile-page-body"><p>内容</p></div><nav class="p7-nav"')
    expect(markup).toContain('首页')
    expect(markup).toContain('食谱')
    expect(markup).toContain('冰箱')
    expect(markup).toContain('我的')
  })
})

describe('布局方案分格选项', () => {
  it('提供不可用和 1 至 8 个存放位置', () => {
    expect(LAYOUT_SLOT_OPTIONS).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
    expect(formatLayoutSlotOption(0)).toBe('不可用')
    expect(formatLayoutSlotOption(8)).toBe('8 格')
  })

  it('为旧布局补齐默认不可用的新门区', () => {
    const layout = {
      refrigerator_id: 'fridge', template_key: 'top_freezer_single', revision: 1,
      zones: [{ key: 'door', label: '冷藏室对侧门', temperature_mode: 'cold' as const, geometry: { x: 0, y: 40, width: 100, height: 60, layout_kind: 'vertical' as const }, is_door: true, slots: [{ id: 'door-1', key: 'door-1' }] }],
    }
    const template = {
      key: 'top_freezer_single', name: '上置冷冻单门', zones: [
        { key: 'door_freezer', label: '冷冻室对侧门', temperature_mode: 'frozen' as const, geometry: { x: 0, y: 0, width: 100, height: 40, layout_kind: 'vertical' as const }, layout_kind: 'vertical' as const, adjustable_temperature: false, is_door: true },
        { key: 'door', label: '冷藏室对侧门', temperature_mode: 'cold' as const, geometry: { x: 0, y: 40, width: 100, height: 60, layout_kind: 'vertical' as const }, layout_kind: 'vertical' as const, adjustable_temperature: false, is_door: true },
      ],
    }

    expect(completeLayoutZones(layout, template).zones.map(zone => [zone.key, zone.slots.length])).toEqual([
      ['door_freezer', 0], ['door', 1],
    ])
  })
})

describe('共享冰箱几何', () => {
  it.each(['top_freezer_single', 'side_by_side', 'french_door', 'mini'])('%s 按可用矩形的最小缩放比例完整显示', templateKey => {
    const size = getFridgePreviewFitSize(templateKey, 300, 200, 358)
    const geometry = getFridgeShellGeometry(templateKey)

    expect(size.width / size.height).toBeCloseTo(geometry.width / geometry.height)
    expect(size.width).toBeLessThanOrEqual(300)
    expect(size.height).toBeLessThanOrEqual(200)
  })

  it('首页窄高容器由高度反推宽度，而不是靠 max-height 截短', () => {
    const size = getFridgePreviewFitSize('top_freezer_single', 358, 200, 358)

    expect(size.width).toBeCloseTo(238 * (200 / 315))
    expect(size.height).toBeCloseTo(200)
  })

  it('对开门始终使用左右门、两组合页和中间主体的五列结构', () => {
    expect(getFridgeShellGeometry('side_by_side').columns).toHaveLength(5)
  })

  it('迷你冰箱上下区域固定各占一半', () => {
    expect(getFridgeZoneRows('mini', [])).toBe('1fr 1fr')
  })

  it('共享冰箱只输出内部几何变量，不内联页面宽高', () => {
    const layout: Layout = {
      refrigerator_id: 'fridge', template_key: 'mini', revision: 1,
      zones: [
        { key: 'freezer', label: '冷冻室', temperature_mode: 'frozen', geometry: { x: 0, y: 0, width: 100, height: 50, layout_kind: 'vertical' }, is_door: false, slots: [] },
        { key: 'refrigerator', label: '冷藏室', temperature_mode: 'cold', geometry: { x: 0, y: 50, width: 100, height: 50, layout_kind: 'vertical' }, is_door: false, slots: [] },
      ],
    }

    const markup = renderToStaticMarkup(createElement(OpenFridge, { layout }))

    expect(markup).toContain('--fridge-shell-aspect:180 / 245')
    expect(markup).toContain('--fridge-shell-columns:')
    expect(markup).not.toContain('width:min(100%')
    expect(markup).not.toContain('height:auto')
  })

  it('页面尺寸由统一预览外层声明场景', () => {
    const layout: Layout = {
      refrigerator_id: 'fridge', template_key: 'mini', revision: 1,
      zones: [
        { key: 'freezer', label: '冷冻室', temperature_mode: 'frozen', geometry: { x: 0, y: 0, width: 100, height: 50, layout_kind: 'vertical' }, is_door: false, slots: [] },
        { key: 'refrigerator', label: '冷藏室', temperature_mode: 'cold', geometry: { x: 0, y: 50, width: 100, height: 50, layout_kind: 'vertical' }, is_door: false, slots: [] },
      ],
    }

    const markup = renderToStaticMarkup(createElement(FridgePreviewFrame, { layout, variant: 'location' }))

    expect(markup).toContain('fridge-preview-frame--location')
    expect(markup).toContain('mini')
  })
})

describe('suggestRefrigeratorName', () => {
  it('重复进入创建流程时生成未占用的默认名称', () => {
    expect(suggestRefrigeratorName([{ name: '家里冰箱' }, { name: '家里冰箱 2' }])).toBe('家里冰箱 3')
  })
})

describe('OpenFridge 宽体模板', () => {
  it.each(['side_by_side', 'french_door'])('%s 同时渲染左右冰箱门和两组合页', templateKey => {
    const layout: Layout = {
      refrigerator_id: 'fridge',
      template_key: templateKey,
      revision: 1,
      zones: [
        { key: 'left', label: '左侧', temperature_mode: templateKey === 'side_by_side' ? 'frozen' : 'cold', geometry: { x: 0, y: 0, width: 50, height: templateKey === 'french_door' ? 65 : 100, layout_kind: 'vertical' }, is_door: false, slots: [{ id: 'left-1', key: 'left-1' }] },
        { key: 'right', label: '右侧', temperature_mode: 'cold', geometry: { x: 50, y: 0, width: 50, height: templateKey === 'french_door' ? 65 : 100, layout_kind: 'vertical' }, is_door: false, slots: [{ id: 'right-1', key: 'right-1' }] },
        ...(templateKey === 'french_door' ? [{ key: 'freezer', label: '冷冻室', temperature_mode: 'frozen' as const, geometry: { x: 0, y: 65, width: 100, height: 35, layout_kind: 'vertical' as const }, is_door: false, slots: [{ id: 'freezer-1', key: 'freezer-1' }] }] : []),
        { key: 'door', label: '冰箱门', temperature_mode: 'cold', geometry: { x: 0, y: 0, width: 100, height: 100, layout_kind: 'vertical' }, is_door: true, slots: [{ id: 'door-1', key: 'door-1' }, { id: 'door-2', key: 'door-2' }] },
      ],
    }

    const markup = renderToStaticMarkup(createElement(OpenFridge, { layout }))

    expect(markup).toContain('aria-label="左侧冰箱门"')
    expect(markup).toContain('aria-label="右侧冰箱门"')
    expect(markup.match(/open-fridge-hinges/g)).toHaveLength(2)
  })
})

describe('selectStartupRefrigerator', () => {
  it('优先选择仍在列表中的上次冰箱', () => {
    expect(selectStartupRefrigerator(fridges, 'fridge-2')).toEqual({ id: 'fridge-2' })
  })

  it('没有上次冰箱时选择列表中的第一台', () => {
    expect(selectStartupRefrigerator(fridges, null)).toEqual({ id: 'fridge-1' })
  })

  it('上次冰箱已不在列表中时回退到第一台', () => {
    expect(selectStartupRefrigerator(fridges, 'deleted-fridge')).toEqual({ id: 'fridge-1' })
  })
})

describe('getRecipeIngredientIcon', () => {
  it('只使用严格同名食材的图标', () => {
    const icons = [
      { key: 'tomato', label: '西红柿', asset_url: '/tomato.svg' },
      { key: 'egg', label: '鸡蛋', asset_url: '/egg.svg' },
    ]

    expect(getRecipeIngredientIcon('鸡蛋', icons)).toEqual(icons[1])
  })

  it('食材没有图库图标时不伪造图标', () => {
    expect(getRecipeIngredientIcon('未知食材', [])).toBeUndefined()
  })
})

describe('getPwaInstallPromptMode', () => {
  it('Android 尚未收到浏览器安装事件时仍显示菜单安装引导', () => {
    expect(getPwaInstallPromptMode({ isAppleMobile: false, hasInstallEvent: false })).toBe('android-guide')
  })

  it('浏览器提供安装事件时优先显示一键安装操作', () => {
    expect(getPwaInstallPromptMode({ isAppleMobile: false, hasInstallEvent: true })).toBe('install')
  })

  it('iOS 没有浏览器安装事件时保留 Safari 引导', () => {
    expect(getPwaInstallPromptMode({ isAppleMobile: true, hasInstallEvent: false })).toBe('apple-guide')
  })
})

describe('getDoorGridRows', () => {
  it('将门内全部分格均分在冷藏门区域内', () => {
    const zones = [
      { temperature_mode: 'frozen' as const, geometry: { x: 0, y: 0, width: 100, height: 40, layout_kind: 'vertical' as const } },
      { temperature_mode: 'cold' as const, geometry: { x: 0, y: 40, width: 100, height: 60, layout_kind: 'vertical' as const } },
    ]

    expect(getDoorGridRows(zones, 4)).toBe('repeat(4, minmax(0, 1fr))')
  })

  it('对开门的整高冷藏区域也保持均分', () => {
    const zones = [{ temperature_mode: 'cold' as const, geometry: { x: 0, y: 0, width: 100, height: 100, layout_kind: 'vertical' as const } }]

    expect(getDoorGridRows(zones, 4)).toBe('repeat(4, minmax(0, 1fr))')
  })

  it('返回最大冷藏室在门上的上下位置和高度', () => {
    const zones = [{ temperature_mode: 'cold' as const, geometry: { x: 0, y: 40, width: 100, height: 60, layout_kind: 'vertical' as const } }]

    expect(getDoorColdRegion(zones)).toEqual({ y: 40, height: 60 })
  })

  it('为冷藏区与冷冻区返回结构分隔线位置', () => {
    const zones = [{ temperature_mode: 'cold' as const, geometry: { x: 0, y: 0, width: 100, height: 45, layout_kind: 'vertical' as const } }]

    expect(getDoorTemperatureBoundary(zones)).toBe(45)
  })
})

describe('filterInventory', () => {
  const inventory = [
    { id: 'milk', item_name: '鲜牛奶', subcategory_name: '牛奶', product_description: '蒙牛 250ml × 6', storage_slot_id: 'cold-1', best_before: '2026-07-22' },
    { id: 'egg', item_name: '鸡蛋', subcategory_name: '鸡蛋', product_description: null, storage_slot_id: 'door-1', best_before: null },
  ] as Parameters<typeof filterInventory>[0]

  it('按名称、品牌规格备注等字段做包含匹配', () => {
    expect(filterInventory(inventory, '250ML')).toHaveLength(1)
    expect(filterInventory(inventory, '牛')).toEqual([inventory[0]])
  })

  it('可以限制为指定分格，并在空关键词时返回该格全部食材', () => {
    expect(filterInventory(inventory, '', 'door-1')).toEqual([inventory[1]])
  })
})

describe('全冰箱库存搜索', () => {
  it('按物品名称、分类、备注和冰箱名称做包含匹配', () => {
    const results = [
      { refrigerator: { id: 'home', name: '家里冰箱', revision: 1 }, item: { item_name: '鲜牛奶', subcategory_name: '牛奶', product_description: '蒙牛 250ml', id: 'milk' } },
      { refrigerator: { id: 'parents', name: '爸妈家', revision: 1 }, item: { item_name: '鸡蛋', subcategory_name: '蛋类', product_description: null, id: 'egg' } },
    ] as Parameters<typeof filterInventoryAcrossRefrigerators>[0]

    expect(filterInventoryAcrossRefrigerators(results, '250ML').map(result => result.item.id)).toEqual(['milk'])
    expect(filterInventoryAcrossRefrigerators(results, '爸妈').map(result => result.item.id)).toEqual(['egg'])
  })

  it('空关键词保留全部库存结果', () => {
    const results = [{ refrigerator: { id: 'home', name: '家里冰箱', revision: 1 }, item: { id: 'milk' } }] as Parameters<typeof filterInventoryAcrossRefrigerators>[0]
    expect(filterInventoryAcrossRefrigerators(results, ' ')).toBe(results)
  })
})

describe('从首页分格新增物品', () => {
  it('沿用进入物品列表时点击的有效分格', () => {
    expect(getPreselectedInventorySlotId('door-2', [{ id: 'cold-1' }, { id: 'door-2' }])).toBe('door-2')
  })

  it('布局变化导致原分格失效时不沿用失效位置', () => {
    expect(getPreselectedInventorySlotId('door-2', [{ id: 'cold-1' }])).toBeUndefined()
  })

  it('普通添加入口没有预选分格', () => {
    expect(getPreselectedInventorySlotId(undefined, [{ id: 'cold-1' }])).toBeUndefined()
  })
})

describe('formatInventoryScopeTitle', () => {
  it('将分格内部 key 转为用户可读的区域序号', () => {
    expect(formatInventoryScopeTitle('冷藏室', 'refrigerator-1')).toBe('冷藏室-1')
    expect(formatInventoryScopeTitle('冰箱门', 'door-4')).toBe('冰箱门-4')
  })
})

describe('getFoodIconPosition', () => {
  it('将一个食材放在分格正中', () => {
    expect(getFoodIconPosition(0, 1)).toEqual({ x: 0.5, verticalOffset: 0 })
  })

  it('将两个食材放在水平三等分点', () => {
    expect([getFoodIconPosition(0, 2), getFoodIconPosition(1, 2)]).toEqual([
      { x: 1 / 3, verticalOffset: 0 },
      { x: 2 / 3, verticalOffset: 0 },
    ])
  })

  it('三个及以上食材交错上下错开并保持三分之一图标高度重叠', () => {
    expect([getFoodIconPosition(0, 3), getFoodIconPosition(1, 3), getFoodIconPosition(2, 3)]).toEqual([
      { x: 1 / 4, verticalOffset: 6 },
      { x: 1 / 2, verticalOffset: -6 },
      { x: 3 / 4, verticalOffset: 6 },
    ])
  })
})

describe('isFridgeBoardAppCache', () => {
  it('只识别 FridgeBoard 应用壳缓存', () => {
    expect(isFridgeBoardAppCache('fridgeboard-app-v2')).toBe(true)
    expect(isFridgeBoardAppCache('other-app-v1')).toBe(false)
  })
})
