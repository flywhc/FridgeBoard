import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FridgePreviewFrame, OpenFridge } from './FridgeLayout'
import { getRecipeIngredientIcon } from './recipeAction'
import { getPwaInstallPromptMode } from './pwaInstallPrompt'
import { selectStartupRefrigerator } from './startupRefrigerator'
import { getDoorColdRegion, getDoorGridRows, getDoorTemperatureBoundary } from './fridgeDoorLayout'
import { filterInventory, formatInventoryScopeTitle, readInventorySortKey, saveInventorySortKey, sortInventory } from './inventoryListFilters'
import { getFoodIconPosition, getFoodIconPositions } from './fridgeFoodLayout'
import { isFridgeBoardAppCache } from './pwaCache'
import { formatLayoutSlotOption, LAYOUT_SLOT_OPTIONS } from './layoutSlotOptions'
import { completeLayoutZones } from './layoutDraft'
import type { Layout } from './appTypes'
import { getFridgePreviewFitSize, getFridgeShellGeometry, getFridgeZoneRows } from './fridgeGeometry'
import { suggestRefrigeratorName } from './refrigeratorName'
import { HeaderTitle, P7Navigation, PageShell, RecipeIngredientList } from './sharedUi'
import { getPreselectedInventorySlotId } from './inventoryAddLocation'
import { filterInventoryAcrossRefrigerators } from './inventorySearchUtils'
import { InventoryList } from './inventoryList'
import { InventoryMoveFlow } from './InventoryMoveFlow'
import { getInventoryAddedDaysLabel, getInventoryExpiryLabel } from './inventoryListUtils'
import { getInventorySelectionSummary } from './inventorySelection'
import { shouldTriggerSafeSwipeBack } from './edgeSwipeBack'
import { FridgeSettingsLoading } from './App'
import { RecognitionProgress } from './InventoryFlow'

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

  it('刷新中只在下拉区域显示动画，标题不显示重复 spinner', () => {
    const markup = renderToStaticMarkup(createElement(HeaderTitle, { title: '首页', refreshState: 'loading' }))

    expect(markup).toContain('首页')
    expect(markup).not.toContain('header-refresh-spinner')
  })
})

describe('P7.1 冰箱设置加载反馈', () => {
  it('加载设置数据时显示带动画语义的状态页', () => {
    const markup = renderToStaticMarkup(createElement(FridgeSettingsLoading, { onBack: () => undefined }))

    expect(markup).toContain('正在读取冰箱设置…')
    expect(markup).toContain('class="p71-loading-spinner"')
    expect(markup).toContain('role="status"')
  })
})

describe('P6 识别中状态反馈', () => {
  it('使用页面中央的大型动画，不显示空闲选择提示', () => {
    const markup = renderToStaticMarkup(createElement(RecognitionProgress))

    expect(markup).toContain('class="p6-recognition-progress"')
    expect(markup).toContain('class="p6-recognition-animation"')
    expect(markup).toContain('正在识别…')
    expect(markup).not.toContain('选择一种方式开始识别')
  })
})

describe('页面安全区域右滑返回', () => {
  it('接受从左侧系统手势区域内缩后的明显右滑', () => {
    expect(shouldTriggerSafeSwipeBack(64, 320, 152, 340)).toBe(true)
  })

  it('忽略系统边缘区域、过深内容区域、向左滑动或纵向滚动', () => {
    expect(shouldTriggerSafeSwipeBack(12, 320, 100, 340)).toBe(false)
    expect(shouldTriggerSafeSwipeBack(40, 320, 128, 340)).toBe(false)
    expect(shouldTriggerSafeSwipeBack(129, 320, 217, 340)).toBe(false)
    expect(shouldTriggerSafeSwipeBack(64, 320, 142, 320)).toBe(true)
    expect(shouldTriggerSafeSwipeBack(64, 320, 124, 430)).toBe(false)
    expect(shouldTriggerSafeSwipeBack(64, 320, -28, 320)).toBe(false)
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
  it('使用冰箱库存中同名食材保存的图标，而不是按名称匹配分类标签', () => {
    const icons = [
      { key: 'tomato', label: '西红柿', asset_url: '/tomato.svg' },
      { key: 'egg', label: '鸡蛋', asset_url: '/egg.svg' },
    ]
    const inventory = [{ item_name: '土鸡蛋', icon_key: 'egg' }]

    expect(getRecipeIngredientIcon('土鸡蛋', inventory, icons)).toEqual(icons[1])
  })

  it('食材没有图库图标时不伪造图标', () => {
    expect(getRecipeIngredientIcon('未知食材', [], [])).toBeUndefined()
  })
})

describe('RecipeIngredientList', () => {
  it('将缺少数量合并到原食材项，并保留充足食材的原显示', () => {
    const markup = renderToStaticMarkup(createElement(RecipeIngredientList, {
      ingredients: [{ subcategory_name: '鸡蛋', quantity: 4 }, { subcategory_name: '河粉', quantity: 1 }],
      missing: [{ subcategory_name: '鸡蛋', quantity: 2 }],
      inventory: [],
      icons: [],
    }))

    expect(markup).toContain('class="p9-ingredient-chip is-missing"')
    expect(markup).toContain('鸡蛋×4-2')
    expect(markup).toContain('河粉×1</span>')
    expect(markup).not.toContain('缺少：')
  })

  it('缺少数量为0时不标红也不追加缺口', () => {
    const markup = renderToStaticMarkup(createElement(RecipeIngredientList, {
      ingredients: [{ subcategory_name: '鸡蛋', quantity: 4 }],
      missing: [{ subcategory_name: '鸡蛋', quantity: 0 }],
      inventory: [],
      icons: [],
    }))

    expect(markup).not.toContain('is-missing')
    expect(markup).toContain('鸡蛋×4</span>')
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

describe('物品列表', () => {
  it('分类跟在名称后，添加天数和有效期按要求显示，空备注不占位', () => {
    const item = {
      id: 'milk', subcategory_id: 'milk', subcategory_name: '奶品', icon_key: 'milk', storage_slot_id: 'cold-1',
      item_name: '鲜牛奶', quantity: 2, production_date: '2026-08-04', best_before: '2026-08-10', product_description: null,
      barcode: null, expiry_status: 'expiring',
    }
    const markup = renderToStaticMarkup(createElement(InventoryList, {
      inventory: [item], icons: [], title: '全部物品', onBack: () => undefined, onAdd: () => undefined,
      onSelect: () => undefined, onSaveQuantity: async () => true,
    }))

    expect(markup).toContain('鲜牛奶</span><small class="p5-inventory-category"> · 奶品</small>')
    expect(markup).toMatch(/已添加\d+天/)
    expect(markup).toMatch(/还有\d+天/)
    expect(markup).not.toContain('未填写品牌')
    expect(markup).toContain('aria-label="鲜牛奶 数量"')
    expect(markup).not.toContain('p5-inventory-arrow')
    expect(markup).toContain('>−</button>')
    expect(markup).toContain('>＋</button>')
    expect(markup).toContain('aria-label="增加 鲜牛奶 数量"')
    expect(markup).toContain('aria-label="减少 鲜牛奶 数量"')
  })

  it('在列表行上方显示可跳转的冰箱名称，并在标题栏提供筛选按钮', () => {
    const item = {
      id: 'milk-fridge', subcategory_id: 'milk', subcategory_name: '奶品', icon_key: 'milk', storage_slot_id: 'cold-1',
      item_name: '鲜牛奶', quantity: 2, production_date: '2026-08-04', best_before: null, product_description: null,
      barcode: null, expiry_status: null,
    }
    const markup = renderToStaticMarkup(createElement(InventoryList, {
      inventory: [item], icons: [], title: '全部物品', refrigerator: { id: 'home', name: '家里冰箱', revision: 1 },
      onBack: () => undefined, onAdd: () => undefined, onSelect: () => undefined, onSelectFridge: () => undefined,
      onSaveQuantity: async () => true,
    }))

    expect(markup).toContain('aria-label="筛选物品"')
    expect(markup).toContain('class="p5-inventory-fridge"')
    expect(markup).toContain('家里冰箱')
    expect(markup.indexOf('家里冰箱')).toBeLessThan(markup.indexOf('鲜牛奶'))
  })

  it('无保质期时不生成有效期文案', () => {
    expect(getInventoryExpiryLabel({ best_before: null }, new Date('2026-08-04T12:00:00'))).toBe('')
  })

  it('有备注时将备注放在日期信息下一行', () => {
    const item = {
      id: 'milk-note', subcategory_id: 'milk', subcategory_name: '奶品', icon_key: 'milk', storage_slot_id: 'cold-1',
      item_name: '鲜牛奶', quantity: 1, production_date: '2026-08-01', best_before: null, product_description: '蒙牛 250ml × 6',
      barcode: null, expiry_status: null,
    }
    const markup = renderToStaticMarkup(createElement(InventoryList, {
      inventory: [item], icons: [], title: '全部物品', onBack: () => undefined, onAdd: () => undefined,
      onSelect: () => undefined, onSaveQuantity: async () => true,
    }))

    expect(markup).toContain('<span class="p5-inventory-meta"><span class="p5-inventory-meta-primary"><small>已添加')
    expect(markup).toContain('<small class="p5-inventory-note">蒙牛 250ml × 6</small>')
  })

  it('按自然日计算添加天数，并将未来日期限制为0天', () => {
    expect(getInventoryAddedDaysLabel({ production_date: '2026-08-01' }, new Date('2026-08-04T12:00:00'))).toBe('已添加3天')
    expect(getInventoryAddedDaysLabel({ production_date: '2026-08-05' }, new Date('2026-08-04T12:00:00'))).toBe('已添加0天')
    expect(getInventoryAddedDaysLabel({ production_date: null }, new Date('2026-08-04T12:00:00'))).toBe('')
  })

  it('数量为0的项目保留在列表中并给名称加中划线', () => {
    const item = {
      id: 'empty-milk', subcategory_id: 'milk', subcategory_name: '奶品', icon_key: 'milk', storage_slot_id: 'cold-1',
      item_name: '已喝完牛奶', quantity: 0, production_date: '2026-08-04', best_before: null, product_description: null,
      barcode: null, expiry_status: null,
    }
    const availableItem = { ...item, id: 'available-milk', item_name: '还有牛奶', quantity: 2 }
    const markup = renderToStaticMarkup(createElement(InventoryList, {
      inventory: [item, availableItem], icons: [], title: '全部物品', onBack: () => undefined, onAdd: () => undefined,
      onSelect: () => undefined, onSaveQuantity: async () => true,
    }))

    expect(markup).toContain('p5-inventory-item is-empty')
    expect(markup).toContain('class="p5-inventory-name-is-empty"')
    expect(markup).toContain('min="0"')
    expect(markup.indexOf('还有牛奶')).toBeLessThan(markup.indexOf('已喝完牛奶'))
    expect(markup).not.toContain('已添加0天')
  })
})

describe('物品列表排序', () => {
  const inventory = [
    { id: 'old', production_date: '2026-08-01', best_before: '2026-08-20' },
    { id: 'new', production_date: '2026-08-05', best_before: null },
    { id: 'soon', production_date: '2026-08-03', best_before: '2026-08-08' },
  ] as Parameters<typeof sortInventory>[0]

  it('最近添加和最早添加分别按添加日期倒序和正序', () => {
    expect(sortInventory(inventory, 'recent').map(item => item.id)).toEqual(['new', 'soon', 'old'])
    expect(sortInventory(inventory, 'oldest').map(item => item.id)).toEqual(['old', 'soon', 'new'])
  })

  it('临近过期优先，无有效期的项目按最近添加倒序', () => {
    expect(sortInventory(inventory, 'expiry').map(item => item.id)).toEqual(['soon', 'old', 'new'])
  })

  it('保存并读取跨物品列表共用的排序偏好', () => {
    const values = new Map<string, string>()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value) },
      },
    })

    expect(readInventorySortKey()).toBe('recent')
    saveInventorySortKey('oldest')
    expect(readInventorySortKey()).toBe('oldest')
    values.set('fb-inventory-sort-key', 'invalid')
    expect(readInventorySortKey()).toBe('recent')
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('物品批量移动摘要', () => {
  it('使用第一项名称开头并以逗号连接其余名称，超长时截断', () => {
    expect(getInventorySelectionSummary([{ item_name: '鲜牛奶' }, { item_name: '鸡蛋' }, { item_name: '猪肉' }])).toBe('鲜牛奶，鸡蛋，猪肉')
    expect(getInventorySelectionSummary([{ item_name: '这是一个很长的物品名称' }, { item_name: '另一个物品' }], 8)).toBe('这是一个很长的…')
  })

  it('在目标冰箱列表中给当前冰箱保留对勾位置并显示对勾', () => {
    const markup = renderToStaticMarkup(createElement(InventoryMoveFlow, {
      items: [{ item_name: '鲜牛奶', id: 'milk', subcategory_id: 'milk', subcategory_name: '奶品', icon_key: null, storage_slot_id: 'slot-1', quantity: 1, production_date: null, best_before: null, product_description: null, barcode: null, expiry_status: null }],
      icons: [],
      refrigerators: [{ id: 'home', name: '家里冰箱', revision: 1 }, { id: 'other', name: '办公室冰箱', revision: 1 }],
      currentRefrigeratorId: 'home',
      onClose: () => undefined,
      onComplete: () => undefined,
    }))

    expect(markup).toContain('class="p5-move-fridge-check"><svg')
    expect(markup).toContain('家里冰箱')
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
    expect(getFoodIconPosition(0, 1)).toEqual({ x: 0.5, y: 0.5 })
  })

  it('将两个食材放在水平三等分点', () => {
    expect([getFoodIconPosition(0, 2), getFoodIconPosition(1, 2)]).toEqual([
      { x: 1 / 3, y: 0.5 },
      { x: 2 / 3, y: 0.5 },
    ])
  })

  it('三个食材使用三角形分布，同时错开上下和左右', () => {
    expect([getFoodIconPosition(0, 3), getFoodIconPosition(1, 3), getFoodIconPosition(2, 3)]).toEqual([
      { x: 0.5, y: 1 / 3 },
      { x: 1 / 3, y: 2 / 3 },
      { x: 2 / 3, y: 2 / 3 },
    ])
  })

  it('图标较多时使用蓝噪声候选点，避免整齐的行列对齐', () => {
    const positions = getFoodIconPositions(['a', 'b', 'c', 'd', 'e', 'f'], { width: 160, height: 96 })
    expect(new Set(positions.map(position => position.x)).size).toBe(positions.length)
    expect(new Set(positions.map(position => position.y)).size).toBe(positions.length)
  })

  it('高密度分布仍同时产生横向和纵向错位，并把不完整行居中', () => {
    const positions = getFoodIconPositions(['a', 'b', 'c', 'd', 'e', 'f', 'g'], { width: 160, height: 96 })
    expect(new Set(positions.map(position => position.x)).size).toBeGreaterThan(1)
    expect(new Set(positions.map(position => position.y)).size).toBeGreaterThan(1)
    expect(positions.every(position => position.x >= 0 && position.x <= 1 && position.y >= 0 && position.y <= 1)).toBe(true)
  })

  it('相同物品顺序和尺寸下位置确定，不会因重新计算随机跳动', () => {
    const items = ['milk', 'egg', 'fish', 'apple', 'rice', 'meat']
    expect(getFoodIconPositions(items, { width: 96, height: 160 })).toEqual(getFoodIconPositions(items, { width: 96, height: 160 }))
  })

  it('实际格子比例影响高密度图标的横纵分散方向', () => {
    const wide = getFoodIconPositions(['a', 'b', 'c', 'd', 'e', 'f'], { width: 220, height: 72 })
    const tall = getFoodIconPositions(['a', 'b', 'c', 'd', 'e', 'f'], { width: 72, height: 220 })
    const range = (values: number[]) => Math.max(...values) - Math.min(...values)
    expect(range(wide.map(position => position.x)) * 194).toBeGreaterThan(range(wide.map(position => position.y)) * 50)
    expect(range(tall.map(position => position.y)) * 198).toBeGreaterThan(range(tall.map(position => position.x)) * 46)
  })
})

describe('isFridgeBoardAppCache', () => {
  it('只识别 FridgeBoard 应用壳缓存', () => {
    expect(isFridgeBoardAppCache('fridgeboard-app-v2')).toBe(true)
    expect(isFridgeBoardAppCache('other-app-v1')).toBe(false)
  })
})
