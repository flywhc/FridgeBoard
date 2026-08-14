import { afterEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error The frontend build intentionally omits Node types; this is a test-only source contract.
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FridgePreviewFrame, OpenFridge } from './FridgeLayout'
import { getRecipeIngredientIcon } from './recipeAction'
import { getPwaInstallPromptMode } from './pwaInstallPrompt'
import { selectStartupRefrigerator } from './startupRefrigerator'
import { getDoorColdRegion, getDoorGridRows, getDoorTemperatureBoundary } from './fridgeDoorLayout'
import { filterInventory, formatInventoryScopeTitle, formatStorageSlotLabel, INVENTORY_SORT_LABELS, readInventorySortKey, saveInventorySortKey, sortInventory } from './inventoryListFilters'
import { getFoodIconPosition, getFoodIconPositions } from './fridgeFoodLayout'
import { isFridgeBoardAppCache, resetPwaScrollPosition } from './pwaCache'
import { formatLayoutSlotOption, LAYOUT_SLOT_OPTIONS } from './layoutSlotOptions'
import { completeLayoutZones } from './layoutDraft'
import { getDeviceListState, type Category, type InventoryBatch, type Layout, type RecognitionOrderItem } from './appTypes'
import { getFridgePreviewFitSize, getFridgeShellGeometry } from './fridgeGeometry'
import { suggestRefrigeratorName } from './refrigeratorName'
import { ConfirmDialog, HeaderTitle, NoticeDialog, P7Navigation, PageShell, RecipeIngredientList } from './sharedUi'
import { getPreselectedInventorySlotId } from './inventoryAddLocation'
import { filterInventoryAcrossRefrigerators } from './inventorySearchUtils'
import { InventoryList } from './inventoryList'
import { InventoryMoveFlow } from './InventoryMoveFlow'
import { countActiveInventoryItems, formatInventoryPrice, getInventoryAddedDaysLabel, getInventoryExpiryLabel, sumInventoryPrices, upsertInventoryBatch } from './inventoryListUtils'
import { getInventorySelectionSummary } from './inventorySelection'
import { shouldTriggerSafeSwipeBack } from './edgeSwipeBack'
import { FridgeHome, FridgeSettings, FridgeSettingsLoading, FridgeSwitcher } from './App'
import { InventoryFlow, OrderRecognitionList, RecognitionProgress } from './InventoryFlow'
import { AddCustomShoppingDialog, RecipeWorkspace, RestockMissingLine, RestockWeekDivider } from './RecipeWorkspace'
import { formatRestockClipboardText } from './restockClipboard'
import { getLocalMonday } from './recipeCalendar'
import { recipeCacheKey, writePageCache } from './pageCache'
import { splitRestockByWeek } from './restockGroups'
import { isMenuPointerOutside } from './menuBehavior'
import { createNewRecipeEntry } from './recipeDraft'
import { categoryMatchDisplayText, categoryMatchStatusLabel, isCurrentCategoryMatch } from './categoryMatch'
import { getSelectedOrderItems } from './orderRecognition'
import { recipeIngredientMatchDisplayText, recipeIngredientMatchText } from './recipeCategoryMatch'
import { getRecipeHistoryPageKey } from './recipeHistoryPage'
import serviceWorkerSource from '../public/sw.js?raw'

const stylesSource = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

const fridges = [{ id: 'fridge-1' }, { id: 'fridge-2' }]

describe('Android 触摸与焦点反馈', () => {
  it('关闭系统触摸高亮、焦点框和控件触摸态变色', () => {
    expect(stylesSource).toContain('-webkit-tap-highlight-color: transparent')
    expect(stylesSource).toContain('*:focus {')
    expect(stylesSource).toContain('*:focus-visible {')
    expect(stylesSource).toContain('outline: none !important')
    expect(stylesSource).toContain('box-shadow: none !important')
    expect(stylesSource).toContain('border-color: var(--line) !important')
    expect(stylesSource).toContain('background: transparent !important')
    expect(stylesSource).toContain('.p7-fridge-preview .open-fridge-slot:active .food-icon')
  })
})

describe('冰箱布局外框', () => {
  it('柜体和门架使用统一的小圆角', () => {
    expect(stylesSource).toContain('--fridge-frame-radius: 10px')
    expect(stylesSource).toContain('overflow: hidden; border-radius: var(--fridge-frame-radius)')
    expect(stylesSource).toContain('display: block; border-radius: var(--fridge-frame-radius)')
  })
})

describe('P5 自动分类状态', () => {
  it('显示后台分类状态并拒绝取消或手工选择后的晚到结果', () => {
    expect(categoryMatchStatusLabel('ai')).toBe('正在自动匹配分类…')
    expect(categoryMatchDisplayText('ai', '正在等待自动分类模型响应…', 12)).toBe('正在等待自动分类模型响应…（12字）')
    expect(categoryMatchStatusLabel('not_found')).toBe('未能自动匹配，请手动选择')
    expect(isCurrentCategoryMatch(2, 2, false, false)).toBe(true)
    expect(isCurrentCategoryMatch(1, 2, false, false)).toBe(false)
    expect(isCurrentCategoryMatch(2, 2, true, false)).toBe(false)
    expect(isCurrentCategoryMatch(2, 2, false, true)).toBe(false)
  })

  it('食谱食材显示后台匹配、AI匹配和已选分类状态', () => {
    expect(recipeIngredientMatchText('checking', null)).toBe('正在自动匹配分类…')
    expect(recipeIngredientMatchText('ai', null)).toBe('正在使用智能匹配分类…')
    expect(recipeIngredientMatchText('matched', '蛋类')).toBe('分类：蛋类')
    expect(recipeIngredientMatchText('not_found', null)).toContain('暂未匹配到分类')
    expect(recipeIngredientMatchDisplayText('ai', null, 8, '正在等待自动分类模型响应…')).toBe('正在等待自动分类模型响应…（8字）')
  })
})

describe('手机端共享居中模态框', () => {
  it('通知弹窗和确认弹窗复用统一容器，确认弹窗不重复显示关闭按钮', () => {
    const notice = renderToStaticMarkup(createElement(NoticeDialog, { title: '首页提示', message: '请重试。', onClose: () => undefined }))
    const confirmation = renderToStaticMarkup(createElement(ConfirmDialog, { title: '更换设备？', message: '旧设备会停止访问。', confirmLabel: '继续', onConfirm: () => undefined, onCancel: () => undefined }))

    expect(notice).toContain('class="modal-backdrop"')
    expect(notice).toContain('class="modal-dialog"')
    expect(notice).toContain('class="modal-dialog-header has-close"')
    expect(notice).toContain('aria-modal="true"')
    expect(notice).toContain('关闭通知')
    expect(confirmation).toContain('class="modal-backdrop"')
    expect(confirmation).toContain('class="modal-dialog-header"')
    expect(confirmation).not.toContain('modal-dialog-header has-close')
    expect(confirmation).toContain('继续')
    expect(confirmation).toContain('取消')
    expect(confirmation).not.toContain('class="modal-close"')
  })
})

describe('顶部栏弹出菜单共享关闭行为', () => {
  it('点击菜单外部时关闭，点击菜单容器内部时保持打开', () => {
    const inside = {} as Node
    const outside = {} as Node
    const menu = { contains: (target: Node | null) => target === inside } as Pick<HTMLElement, 'contains'>

    expect(isMenuPointerOutside(menu, outside)).toBe(true)
    expect(isMenuPointerOutside(menu, inside)).toBe(false)
    expect(isMenuPointerOutside(null, outside)).toBe(true)
  })
})

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
        onShopping: () => undefined,
        onMe: () => undefined,
      }),
    }))

    expect(markup).toContain('<div class="mobile-page-body"><p>内容</p></div><nav class="p7-nav"')
    expect(markup).toContain('首页')
    expect(markup).toContain('食谱')
    expect(markup).toContain('购物')
    expect(markup).not.toContain('冰箱')
    expect(markup).toContain('我的')
  })

  it('刷新中只在下拉区域显示动画，标题不显示重复 spinner', () => {
    const markup = renderToStaticMarkup(createElement(HeaderTitle, { title: '首页', refreshState: 'loading' }))

    expect(markup).toContain('首页')
    expect(markup).not.toContain('header-refresh-spinner')
  })

  it('无冰箱初始化页使用一级标题栏，已有冰箱列表才显示返回栏', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => null, setItem: () => undefined } })
    const props = {
      displayBindingStatus: null,
      onSelect: () => undefined,
      onContinueSetup: () => undefined,
      onSettings: () => undefined,
      onScan: () => undefined,
      onCreate: () => undefined,
      onDeleted: () => undefined,
      onRefresh: async () => undefined,
    }
    const emptyMarkup = renderToStaticMarkup(createElement(FridgeSwitcher, { ...props, fridges: [], currentId: '' }))
    const listMarkup = renderToStaticMarkup(createElement(FridgeSwitcher, { ...props, fridges: [{ id: 'fridge-1', name: '厨房冰箱', revision: 1, setup_status: 'ready', display_device_status: 'unbound', access_role: 'owner' }], currentId: 'fridge-1', onBack: () => undefined }))

    expect(emptyMarkup).toContain('class="app-header"')
    expect(emptyMarkup).not.toContain('class="page-header"')
    expect(emptyMarkup).not.toContain('aria-label="返回"')
    expect(listMarkup).toContain('class="page-header"')
    expect(listMarkup).toContain('aria-label="返回"')
  })
})

describe('P7.1 冰箱设置加载反馈', () => {
  const device = { id: 'phone-1', kind: 'pwa', label: '家人手机', created_at: '', last_seen_at: null, revoked_at: null, is_current: false }

  it('加载设置数据时显示带动画语义的状态页', () => {
    const markup = renderToStaticMarkup(createElement(FridgeSettingsLoading, { onBack: () => undefined }))

    expect(markup).toContain('正在读取冰箱设置…')
    expect(markup).toContain('class="p71-loading-spinner"')
    expect(markup).toContain('role="status"')
  })

  it('区分设备列表的有效数据和仅含撤销设备的空状态', () => {
    expect(getDeviceListState([])).toEqual({ status: 'ready-empty', devices: [] })
    expect(getDeviceListState([{ ...device, revoked_at: '2026-08-07T00:00:00Z' }])).toEqual({ status: 'ready-empty', devices: [] })
    expect(getDeviceListState([device])).toEqual({ status: 'ready-data', devices: [device] })
  })

  it('设置页从设备列表状态读取手机访问数据，不依赖另一份设备数组', () => {
    const markup = renderToStaticMarkup(createElement(FridgeSettings, {
      refrigerator: { id: 'fridge-1', name: '厨房冰箱', revision: 1, setup_status: 'ready', display_device_status: 'unbound', access_role: 'owner' },
      layout: { refrigerator_id: 'fridge-1', template_key: 'mini', revision: 1, zones: [] },
      deviceListState: { status: 'ready-data', devices: [device] },
      onBack: () => undefined,
      onNameAndLayout: () => undefined,
      onDeviceBinding: () => undefined,
      onRetryDevices: () => undefined,
      onExpiry: () => undefined,
      onRemove: () => undefined,
      onDelete: async () => null,
    }))

    expect(markup).toContain('家人手机')
    expect(markup).toContain('手机访问')
  })

  it('绑定轮询期间显示进行中，超时后保留重新绑定入口', () => {
    const props = {
      refrigerator: { id: 'fridge-1', name: '厨房冰箱', revision: 1, setup_status: 'ready' as const, display_device_status: 'unbound' as const, access_role: 'owner' as const },
      layout: { refrigerator_id: 'fridge-1', template_key: 'mini' as const, revision: 1, zones: [] },
      deviceListState: { status: 'ready-empty' as const, devices: [] as [] },
      onBack: () => undefined,
      onNameAndLayout: () => undefined,
      onDeviceBinding: () => undefined,
      onRetryDevices: () => undefined,
      onExpiry: () => undefined,
      onRemove: () => undefined,
      onDelete: async () => null,
    }
    const pending = renderToStaticMarkup(createElement(FridgeSettings, { ...props, displayBindingState: 'pending' }))
    expect(pending).toContain('正在绑定')
    expect(pending).toContain('等待冰箱端确认')
    expect(pending).toContain('正在绑定…')

    const timeout = renderToStaticMarkup(createElement(FridgeSettings, { ...props, displayBindingState: 'timeout' }))
    expect(timeout).toContain('绑定超时')
    expect(timeout).toContain('重新绑定冰箱端设备')
  })
})

describe('P6 识别中状态反馈', () => {
  it('将可滚动的灰色模型文字流与动画覆盖层分离，并显示累计字数', () => {
    const markup = renderToStaticMarkup(createElement(RecognitionProgress, {
      message: '正在解析图片…',
      text: '{"item_name":"鲜牛奶"}',
      textLength: 20,
    }))

    expect(markup).toContain('class="p6-recognition-progress"')
    expect(markup).toContain('class="p6-recognition-animation"')
    expect(markup).toContain('class="p6-recognition-output"')
    expect(markup).toContain('class="p6-recognition-output-scroll"')
    expect(markup).toMatch(/class="p6-recognition-output"[^>]*><div class="p6-recognition-output-scroll">[\s\S]*<\/div><span class="p6-recognition-animation"/)
    expect(markup).toContain('正在解析图片…')
    expect(markup).toContain('已收到 20 字')
    expect(markup).not.toContain('选择一种方式开始识别')
  })
})

describe('P6 订单逐项分类', () => {
  const categories: Category[] = [
    { id: 'food', parent_id: null, name: '食品', icon_key: null, is_custom: false },
    { id: 'milk', parent_id: 'food', name: '奶品', icon_key: 'milk', is_custom: false },
  ]
  const items: RecognitionOrderItem[] = [
    { item_name: '鲜牛奶', specification: '950ml', quantity: 1, subcategory_id: 'milk' },
    { item_name: '新商品', specification: '', quantity: 2 },
    { item_name: '旧分类商品', specification: '', quantity: 1, subcategory_id: 'removed-category' },
  ]

  it('逐项显示合法分类，未分类和失效分类都要求手工选择', () => {
    const markup = renderToStaticMarkup(createElement(OrderRecognitionList, {
      items,
      selection: { 0: true, 1: false, 2: true },
      categories,
      onToggle: () => undefined,
      onChooseCategory: () => undefined,
    }))

    expect(markup).toContain('分类：奶品')
    expect(markup.match(/选择分类（必填）/g)).toHaveLength(2)
    expect(markup).toContain('aria-label="为新商品选择分类"')
    expect(markup).toContain('aria-label="为旧分类商品选择分类"')
    expect(markup.match(/type="checkbox" disabled=""/g)).toHaveLength(2)
  })

  it('批量添加只接受已勾选且仍属于当前冰箱的小类', () => {
    expect(getSelectedOrderItems(items, { 0: true, 1: true, 2: true }, categories).map(item => item.item_name)).toEqual(['鲜牛奶'])
  })

  it('订单商品同时展示实付金额和可修改的存放位置', () => {
    const markup = renderToStaticMarkup(createElement(OrderRecognitionList, {
      items: [{ ...items[0], price: '20.99', storage_slot_id: 'cold-1' }],
      selection: { 0: true },
      categories,
      locations: [{ id: 'cold-1', label: '冷藏室 · 第 1 格' }],
      onToggle: () => undefined,
      onChooseCategory: () => undefined,
      onChooseLocation: () => undefined,
    }))

    expect(markup).toContain('实付 ¥20.99')
    expect(markup).toContain('冷藏室 · 第 1 格')
    expect(markup).toContain('aria-label="为鲜牛奶选择存放位置"')
  })

  it('连续添加订单商品时保留此前已成功保存的商品', () => {
    const existing = { id: 'existing', item_name: '原有商品', quantity: 1 } as InventoryBatch
    const first = { id: 'first', item_name: '第一项', quantity: 1 } as InventoryBatch
    const second = { id: 'second', item_name: '第二项', quantity: 2 } as InventoryBatch
    const third = { id: 'third', item_name: '第三项', quantity: 1 } as InventoryBatch

    const saved = [first, second, third].reduce(upsertInventoryBatch, [existing])

    expect(saved.map(item => item.item_name)).toEqual(['原有商品', '第一项', '第二项', '第三项'])
  })
})

describe('页面安全区域右滑返回', () => {
  it('接受避开系统边缘后从页面左半区或中部起手的明显右滑', () => {
    expect(shouldTriggerSafeSwipeBack(32, 320, 112, 340, 390)).toBe(true)
    expect(shouldTriggerSafeSwipeBack(190, 320, 270, 340, 390)).toBe(true)
  })

  it('忽略系统边缘、靠右起手、向左滑动或纵向滚动', () => {
    expect(shouldTriggerSafeSwipeBack(12, 320, 100, 340, 390)).toBe(false)
    expect(shouldTriggerSafeSwipeBack(300, 320, 380, 340, 390)).toBe(false)
    expect(shouldTriggerSafeSwipeBack(64, 320, 142, 320, 390)).toBe(true)
    expect(shouldTriggerSafeSwipeBack(64, 320, 124, 430, 390)).toBe(false)
    expect(shouldTriggerSafeSwipeBack(64, 320, -28, 320, 390)).toBe(false)
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

  it('标准冰箱消费共享计划，按整行分带并渲染两块合页', () => {
    const layout: Layout = {
      refrigerator_id: 'fridge', template_key: 'three_door', revision: 1,
      zones: [
        { key: 'top', label: '上层', temperature_mode: 'cold', geometry: { x: 0, y: 0, width: 100, height: 45, layout_kind: 'vertical' }, is_door: false, slots: [{ id: 'top-1', key: 'top-1' }] },
        { key: 'middle', label: '中层', temperature_mode: 'cold', geometry: { x: 0, y: 45, width: 100, height: 15, layout_kind: 'single_row' }, is_door: false, slots: [{ id: 'middle-1', key: 'middle-1' }, { id: 'middle-2', key: 'middle-2' }] },
        { key: 'bottom', label: '下层', temperature_mode: 'frozen', geometry: { x: 0, y: 60, width: 100, height: 40, layout_kind: 'vertical' }, is_door: false, slots: [{ id: 'bottom-1', key: 'bottom-1' }] },
        { key: 'door', label: '冰箱门', temperature_mode: 'cold', geometry: { x: 0, y: 0, width: 100, height: 100, layout_kind: 'vertical' }, is_door: true, slots: [{ id: 'door-1', key: 'door-1' }] },
      ],
    }

    const markup = renderToStaticMarkup(createElement(OpenFridge, { layout }))

    expect(markup.match(/open-fridge-band/g)).toHaveLength(3)
    expect(markup.match(/open-fridge-hinges/g)).toHaveLength(1)
    expect(markup).toContain('<span class="open-fridge-hinges" aria-hidden="true"><i></i><i></i></span>')
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

  it('列表缩略图复用冰箱实际布局而不是通用占位图形', () => {
    const layout: Layout = {
      refrigerator_id: 'fridge', template_key: 'three_door', revision: 1,
      zones: [
        { key: 'top', label: '上层', temperature_mode: 'cold', geometry: { x: 0, y: 0, width: 100, height: 45, layout_kind: 'vertical' }, is_door: false, slots: [{ id: 'top-1', key: 'top-1' }] },
        { key: 'middle', label: '中层', temperature_mode: 'cold', geometry: { x: 0, y: 45, width: 100, height: 15, layout_kind: 'single_row' }, is_door: false, slots: [{ id: 'middle-1', key: 'middle-1' }, { id: 'middle-2', key: 'middle-2' }] },
        { key: 'bottom', label: '下层', temperature_mode: 'frozen', geometry: { x: 0, y: 60, width: 100, height: 40, layout_kind: 'vertical' }, is_door: false, slots: [{ id: 'bottom-1', key: 'bottom-1' }] },
        { key: 'door', label: '冰箱门', temperature_mode: 'cold', geometry: { x: 0, y: 0, width: 100, height: 100, layout_kind: 'vertical' }, is_door: true, slots: [{ id: 'door-1', key: 'door-1' }] },
      ],
    }

    const markup = renderToStaticMarkup(createElement(FridgePreviewFrame, { layout, variant: 'thumbnail' }))

    expect(markup).toContain('fridge-preview-frame--thumbnail')
    expect(markup).toContain('open-fridge three_door')
    expect(markup).toContain('open-fridge-band')
    expect(markup).not.toContain('large-fridge')
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
    expect(markup).toContain('河粉</span>')
    expect(markup).not.toContain('缺少：')
  })

  it('缺货食材排在充足食材前，数量为1时省略数量后缀', () => {
    const markup = renderToStaticMarkup(createElement(RecipeIngredientList, {
      ingredients: [
        { subcategory_name: '西红柿', quantity: 1 },
        { subcategory_name: '鸡蛋', quantity: 4 },
        { subcategory_name: '食用油', quantity: 2 },
        { subcategory_name: '盐', quantity: 1 },
      ],
      missing: [{ subcategory_name: '鸡蛋', quantity: 2 }, { subcategory_name: '盐', quantity: 1 }],
      inventory: [],
      icons: [],
    }))

    expect(markup.indexOf('鸡蛋×4-2')).toBeLessThan(markup.indexOf('西红柿'))
    expect(markup.indexOf('盐-1')).toBeLessThan(markup.indexOf('西红柿'))
    expect(markup).toContain('食用油×2')
    expect(markup).not.toContain('西红柿×1')
    expect(markup).not.toContain('盐×1')
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

describe('RestockMissingLine', () => {
  it('将同一道食谱的缺少项目合并到一行并允许文本自然换行', () => {
    const markup = renderToStaticMarkup(createElement(RestockMissingLine, {
      missing: [
        { subcategory_name: '手抓饭', quantity: 1 },
        { subcategory_name: '牛肉', quantity: 2 },
      ],
    }))

    expect(markup).toContain('class="p9-restock-missing"')
    expect(markup).toContain('<b>手抓饭 × 1，牛肉 × 2</b>')
    expect(markup).not.toContain('缺少')
  })
})

describe('补货清单周次分组', () => {
  it('按 week_start 将本周和下周缺货分组，并保留原组内顺序', () => {
    const current = { week_start: '2026-08-10', weekday: 1, label: '周二', dish_name: '本周菜', missing: [] }
    const next = { week_start: '2026-08-17', weekday: 0, label: '周一', dish_name: '下周菜', missing: [] }

    expect(splitRestockByWeek([next, current], '2026-08-10')).toEqual({ current: [current], next: [next] })
  })

  it('用满宽黑线和下周标签标记分组边界', () => {
    const markup = renderToStaticMarkup(createElement(RestockWeekDivider))

    expect(markup).toContain('class="p9-restock-week-divider"')
    expect(markup).toContain('role="separator"')
    expect(markup).toContain('>下周</span>')
  })
})

describe('RecipeWorkspace 做法展示', () => {
  it('为食谱历史列表和详情使用不同页面身份，返回时重置退出状态', () => {
    expect(getRecipeHistoryPageKey('history')).not.toBe(getRecipeHistoryPageKey('history-detail'))
    expect(getRecipeHistoryPageKey('history')).toBe('recipe-history')
    expect(getRecipeHistoryPageKey('history-detail')).toBe('recipe-history-detail')
  })

  it('列表按做法、备注顺序展示，且空做法不占位', () => {
    const values = new Map<string, string>()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value) },
        removeItem: (key: string) => { values.delete(key) },
      },
    })
    const weekStart = getLocalMonday(new Date())
    writePageCache(recipeCacheKey('fridge-1', weekStart), {
      days: [{
        weekday: 0,
        label: '周一',
        entries: [{
          id: 'recipe-1', weekday: 0, dish_name: '番茄炒蛋', method: '先炒蛋，再加入番茄', note: '少放油',
          completed: false, ingredients: [], missing: [],
        }, {
          id: 'recipe-2', weekday: 0, dish_name: '白灼菜心', method: null, note: '最后淋油',
          completed: false, ingredients: [], missing: [],
        }],
      }, ...Array.from({ length: 6 }, (_, weekday) => ({ weekday: weekday + 1, label: `周${weekday + 2}`, entries: [] }))],
      restock: [],
    })

    const markup = renderToStaticMarkup(createElement(RecipeWorkspace, {
      refrigerator: { id: 'fridge-1', name: '厨房冰箱', revision: 1, setup_status: 'ready', display_device_status: 'unbound', access_role: 'owner' },
      icons: [], inventory: [], refreshAt: 0, onBack: () => undefined, onMe: () => undefined,
      onInventoryChanged: async () => undefined,
    }))

    expect(markup.indexOf('先炒蛋，再加入番茄')).toBeLessThan(markup.indexOf('少放油'))
    expect(markup.match(/p9-method/g)).toHaveLength(1)
    expect(markup).not.toContain('>做法<')
    expect(markup).toContain('p9-week-list')
    expect(markup).toContain('class="p7-nav"')
    expect(markup).toContain('>购物</small>')
    expect(markup).not.toContain('查看购物清单')
    expect(markup.match(/p9-add-day-button/g)).toHaveLength(7)
    expect(markup).toContain('aria-label="周一添加食谱"')
    expect(markup).not.toContain('p9-empty-action')
  })

  it('新增食谱草稿预填目标星期且没有已有 id', () => {
    expect(createNewRecipeEntry(2)).toMatchObject({ id: '', weekday: 2, dish_name: '', ingredients: [] })
  })

  it('购物导航直接打开购物清单', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => null, setItem: () => undefined } })
    const markup = renderToStaticMarkup(createElement(RecipeWorkspace, {
      refrigerator: { id: 'fridge-1', name: '厨房冰箱', revision: 1, setup_status: 'ready', display_device_status: 'unbound', access_role: 'owner' },
      icons: [], inventory: [], refreshAt: 0, initialView: 'restock', onBack: () => undefined, onMe: () => undefined,
      onInventoryChanged: async () => undefined,
    }))

    expect(markup).toContain('购物清单')
    expect(markup).toContain('>购物</small>')
    expect(markup).toContain('class="app-header"')
    expect(markup).toContain('p7-top-level')
    expect(markup).not.toContain('class="page-header"')
    expect(markup).not.toContain('aria-label="返回"')
    expect(markup).toContain('aria-label="复制购物清单"')
    expect(markup).toContain('aria-label="编辑购物清单"')
    expect(markup).toContain('aria-label="本周"')
    expect(markup).toContain('>本周</span>')
    expect(markup).toContain('aria-label="自定义"')
    expect(markup).toContain('>自定义</span>')
  })

  it('自定义购物项模态框复用物品列表的横向数量控件', () => {
    const markup = renderToStaticMarkup(createElement(AddCustomShoppingDialog, {
      initialItems: [{ id: 'custom-1', item_name: '洗衣液', quantity: 2, display_order: 0 }],
      saving: false,
      onClose: () => undefined,
      onSave: () => undefined,
    }))

    expect(markup).toContain('value="洗衣液"')
    expect(markup).toContain('value="2"')
    expect(markup).toContain('class="p5-quantity-control p5-inventory-quantity"')
    expect(markup).not.toContain('p9-custom-shopping-quantity')
    expect(markup).not.toContain('>取消</button>')
    expect(markup).toContain('aria-label="删除洗衣液"')
  })
})

describe('formatRestockClipboardText', () => {
  it('复制时仅保留缺货物品和数量，不包含星期或菜名', () => {
    expect(formatRestockClipboardText([
      { weekday: 0, label: '周一', dish_name: '番茄炒蛋', missing: [{ subcategory_name: '鸡蛋', quantity: 4 }] },
      { weekday: 1, label: '周二', dish_name: '牛肉面', missing: [{ subcategory_name: '牛肉', quantity: 2 }, { subcategory_name: '面条', quantity: 1 }] },
    ])).toBe('鸡蛋×4\n牛肉×2\n面条×1')
  })

  it('复制时追加自定义购物项', () => {
    expect(formatRestockClipboardText([], [
      { id: 'custom-1', item_name: '洗衣液', quantity: 2, display_order: 0 },
      { id: 'custom-2', item_name: '垃圾袋', quantity: 3, display_order: 1 },
    ])).toBe('洗衣液×2\n垃圾袋×3')
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
  it('首页临期和过期提示使用图标、右上角数字和可访问列表入口', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => null, setItem: () => undefined } })
    const markup = renderToStaticMarkup(createElement(FridgeHome, {
      refrigerator: { id: 'fridge-1', name: '家里冰箱', revision: 1, setup_status: 'ready', display_device_status: 'bound', access_role: 'owner' },
      layout: { refrigerator_id: 'fridge-1', template_key: 'mini', revision: 1, zones: [] }, homeInventory: [{
        id: 'expiring-milk', subcategory_id: 'milk', subcategory_name: '奶品', icon_key: 'milk', storage_slot_id: 'cold-1', item_name: '鲜牛奶', quantity: 1,
        production_date: '2026-08-04', best_before: '2026-08-10', product_description: null, barcode: null, expiry_status: 'expiring',
      }, {
        id: 'expired-meat', subcategory_id: 'meat', subcategory_name: '肉类', icon_key: 'meat', storage_slot_id: 'cold-1', item_name: '牛肉', quantity: 1,
        production_date: '2026-08-01', best_before: '2026-08-09', product_description: null, barcode: null, expiry_status: 'expired',
      }], icons: [], notifications: [], refreshState: 'idle', refreshError: '', installEvent: null, installed: true,
      onInstallEventConsumed: () => undefined, onAdd: () => undefined, onInventory: () => undefined, onExpiring: () => undefined, onExpired: () => undefined,
      onSlot: () => undefined, onManage: () => undefined, onFridgeList: () => undefined, onSwipeFridge: () => undefined, fridgeSwipeTransition: { direction: 'next', phase: 'exit' }, onRefresh: () => undefined, onRecipes: () => undefined, onShopping: () => undefined, onMe: () => undefined, onSearch: () => undefined,
    }))

    expect(markup).toContain('data-icon="iconoir:clock"')
    expect(markup).toContain('data-icon="solar:fridge-outline"')
    expect(markup).toContain('aria-label="查看我的冰箱"')
    expect(markup).toContain('data-icon="iconoir:clock" viewBox="0 0 24 24" fill="none"')
    expect(markup).toContain('data-icon="ant-design:warning-outlined"')
    expect(markup.match(/class="p7-risk-count"/g)).toHaveLength(2)
    expect(markup).toContain('class="horizontal-swipe-area p7-fridge-preview p7-fridge-swipe-exit-next"')
    expect(markup).toContain('aria-label="查看 1 件临期物品"')
    expect(markup).toContain('aria-label="查看 1 件过期物品"')
    expect(markup).toContain('type="button"')
  })

  it('首页只为真正的通知显示警告入口', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => null, setItem: () => undefined } })
    const props = {
      refrigerator: { id: 'fridge-1', name: '家里冰箱', revision: 1, setup_status: 'ready' as const, display_device_status: 'bound' as const, access_role: 'owner' as const },
      layout: { refrigerator_id: 'fridge-1', template_key: 'mini' as const, revision: 1, zones: [] }, homeInventory: [], icons: [],
      refreshState: 'idle' as const, refreshError: '', installEvent: null, installed: true,
      onInstallEventConsumed: () => undefined, onAdd: () => undefined, onInventory: () => undefined, onExpiring: () => undefined, onExpired: () => undefined,
      onSlot: () => undefined, onManage: () => undefined, onFridgeList: () => undefined, onSwipeFridge: () => undefined, fridgeSwipeTransition: null, onRefresh: () => undefined, onRecipes: () => undefined, onShopping: () => undefined, onMe: () => undefined, onSearch: () => undefined,
    }
    const withoutNotification = renderToStaticMarkup(createElement(FridgeHome, { ...props, notifications: [] }))
    const withNotification = renderToStaticMarkup(createElement(FridgeHome, { ...props, notifications: [{ kind: 'food', title: '有物品需要留意', body: '鲜牛奶临期。' }] }))

    expect(withoutNotification).not.toContain('p7-status-notice')
    expect(withoutNotification).not.toContain('首页提示')
    expect(withNotification).toContain('p7-status-notice')
    expect(withNotification).toContain('aria-label="查看 1 条通知"')
    expect(withNotification).not.toContain('aria-label="查看首页提示"')
  })

  it('临期入口只显示临期物品，不混入普通或过期物品', () => {
    const item = {
      id: 'milk', subcategory_id: 'milk', subcategory_name: '奶品', icon_key: 'milk', storage_slot_id: 'cold-1', item_name: '鲜牛奶', quantity: 1,
      production_date: '2026-08-04', best_before: '2026-08-10', product_description: null, barcode: null, expiry_status: 'expiring',
    }
    const markup = renderToStaticMarkup(createElement(InventoryList, {
      inventory: [item, { ...item, id: 'fresh', item_name: '新鲜鸡蛋', expiry_status: null }, { ...item, id: 'expired', item_name: '过期牛肉', expiry_status: 'expired' }],
      icons: [], title: '临期物品', expiryStatus: 'expiring', onBack: () => undefined, onAdd: () => undefined, onSelect: () => undefined, onSaveQuantity: async () => true,
    }))

    expect(markup).toContain('鲜牛奶')
    expect(markup).not.toContain('新鲜鸡蛋')
    expect(markup).not.toContain('过期牛肉')
  })

  it('过期入口只显示过期物品', () => {
    const item = {
      id: 'milk', subcategory_id: 'milk', subcategory_name: '奶品', icon_key: 'milk', storage_slot_id: 'cold-1', item_name: '鲜牛奶', quantity: 1,
      production_date: '2026-08-04', best_before: '2026-08-10', product_description: null, barcode: null, expiry_status: 'expiring',
    }
    const markup = renderToStaticMarkup(createElement(InventoryList, {
      inventory: [item, { ...item, id: 'expired', item_name: '过期牛肉', expiry_status: 'expired' }],
      icons: [], title: '过期物品', expiryStatus: 'expired', onBack: () => undefined, onAdd: () => undefined, onSelect: () => undefined, onSaveQuantity: async () => true,
    }))

    expect(markup).toContain('过期牛肉')
    expect(markup).not.toContain('鲜牛奶')
  })

  it('编辑物品页在品牌规格备注右侧提供价格输入框并回填已有价格', () => {
    const item = {
      id: 'priced-milk', subcategory_id: 'milk', subcategory_name: '奶品', icon_key: 'milk', storage_slot_id: 'cold-1',
      item_name: '鲜牛奶', quantity: 1, production_date: '2026-08-01', best_before: null, product_description: '蒙牛 250ml × 6',
      price: '12.30', barcode: null, expiry_status: null,
    }
    const markup = renderToStaticMarkup(createElement(InventoryFlow, {
      layout: {
        refrigerator_id: 'fridge-1', template_key: 'mini', revision: 1,
        zones: [{ key: 'cold', label: '冷藏室', temperature_mode: 'cold', is_door: false, geometry: { x: 0, y: 0, width: 100, height: 100, layout_kind: 'vertical' }, slots: [{ id: 'cold-1', key: 'cold-1' }] }],
      },
      categories: [
        { id: 'group', parent_id: null, name: '点心奶品', icon_key: null, is_custom: false },
        { id: 'milk', parent_id: 'group', name: '奶品', icon_key: 'milk', is_custom: false },
      ],
      icons: [], inventory: [item], refrigerator: { id: 'fridge-1', name: '家里冰箱', revision: 1, setup_status: 'ready', display_device_status: 'bound', access_role: 'owner' }, saving: false,
      initialItemId: item.id, initialView: 'edit', onBack: () => undefined, onSelectFridge: () => undefined,
      onCreateCategory: async () => undefined, onCatalogChanged: async () => undefined, onSave: async () => true, onDelete: async () => true,
    }))

    expect(markup).toContain('品牌规格备注')
    expect(markup).toContain('aria-label="价格"')
    expect(markup).toContain('value="12.30"')
  })

  it('统计数字只计算数量大于0的物品，仍保留零数量行', () => {
    const zeroItem = {
      id: 'empty-milk', subcategory_id: 'milk', subcategory_name: '奶品', icon_key: 'milk', storage_slot_id: 'cold-1',
      item_name: '已喝完牛奶', quantity: 0, production_date: null, best_before: null, product_description: null,
      barcode: null, expiry_status: null,
    }
    const availableItem = { ...zeroItem, id: 'available-milk', item_name: '还有牛奶', quantity: 2 }
    const markup = renderToStaticMarkup(createElement(InventoryList, {
      inventory: [zeroItem, availableItem], icons: [], title: '全部物品', onBack: () => undefined, onAdd: () => undefined,
      onSelect: () => undefined, onSaveQuantity: async () => true,
    }))

    expect(markup).toContain('共 1 件物品')
    expect(markup).not.toContain('共 2 件物品')
    expect(markup).toContain('已喝完牛奶')
  })

  it('搜索结果统计数字也排除零数量物品', () => {
    const zeroItem = {
      id: 'empty-milk-search', subcategory_id: 'milk', subcategory_name: '奶品', icon_key: 'milk', storage_slot_id: 'cold-1',
      item_name: '已喝完牛奶', quantity: 0, production_date: null, best_before: null, product_description: null,
      barcode: null, expiry_status: null,
    }
    const availableItem = { ...zeroItem, id: 'available-milk-search', item_name: '还有牛奶', quantity: 2 }
    const markup = renderToStaticMarkup(createElement(InventoryList, {
      inventory: [zeroItem, availableItem], icons: [], title: '搜索物品', summaryLabel: '搜索“牛奶”', onBack: () => undefined,
      onSelect: () => undefined, onSaveQuantity: async () => true,
    }))

    expect(markup).toContain('搜索“牛奶”')
    expect(markup).toContain('1 条结果')
    expect(markup).not.toContain('2 条结果')
  })

  it('分类跟在名称后，添加天数和有效期按要求显示，空备注不占位', () => {
    const item = {
      id: 'milk', subcategory_id: 'milk', subcategory_name: '奶品', icon_key: 'milk', storage_slot_id: 'cold-1',
      item_name: '鲜牛奶', quantity: 2, production_date: '2099-01-04', best_before: '2099-01-10', product_description: null,
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
    expect(markup).toContain('>+</button>')
    expect(markup).toContain('aria-label="增加 鲜牛奶 数量"')
    expect(markup).toContain('aria-label="减少 鲜牛奶 数量"')
  })

  it('在列表行上方显示可跳转的冰箱名称，并在标题栏提供筛选按钮', () => {
    const item = {
      id: 'milk-fridge', subcategory_id: 'milk', subcategory_name: '奶品', icon_key: 'milk', storage_slot_id: 'cold-1', storage_slot_name: '冷藏室第2格',
      item_name: '鲜牛奶', quantity: 2, production_date: '2026-08-04', best_before: null, product_description: null,
      barcode: null, expiry_status: null,
    }
    const markup = renderToStaticMarkup(createElement(InventoryList, {
      inventory: [item], icons: [], title: '全部物品', refrigerator: { id: 'home', name: '家里冰箱', revision: 1, setup_status: 'ready', display_device_status: 'bound', access_role: 'owner' },
      onBack: () => undefined, onAdd: () => undefined, onSelect: () => undefined, onSelectFridge: () => undefined,
      onSaveQuantity: async () => true,
    }))

    expect(markup).toContain('aria-label="筛选物品"')
    expect(markup).toContain('class="p5-inventory-fridge"')
    expect(markup).toContain('家里冰箱·冷藏室第2格')
    expect(markup.indexOf('家里冰箱')).toBeLessThan(markup.indexOf('鲜牛奶'))
  })

  it('旧库存缓存缺少位置文案时从布局补出分隔名称', () => {
    const item = {
      id: 'cached-milk', subcategory_id: 'milk', subcategory_name: '奶品', icon_key: 'milk', storage_slot_id: 'cold-2',
      item_name: '鲜牛奶', quantity: 1, production_date: null, best_before: null, product_description: null,
      barcode: null, expiry_status: null,
    }
    const markup = renderToStaticMarkup(createElement(InventoryList, {
      inventory: [item], icons: [], title: '全部物品', refrigerator: { id: 'home', name: '家里冰箱', revision: 1, setup_status: 'ready', display_device_status: 'bound', access_role: 'owner' },
      layoutsByRefrigeratorId: { home: { refrigerator_id: 'home', template_key: 'mini', revision: 1, zones: [{ key: 'cold', label: '冷藏室', temperature_mode: 'cold', geometry: { x: 0, y: 0, width: 100, height: 100, layout_kind: 'vertical' }, slots: [{ id: 'cold-2', key: 'cold-2' }], is_door: false }] } },
      onBack: () => undefined, onSelect: () => undefined, onSaveQuantity: async () => true,
    }))

    expect(markup).toContain('家里冰箱·冷藏室第2格')
  })

  it('无保质期时不生成有效期文案', () => {
    expect(getInventoryExpiryLabel({ best_before: null }, new Date('2026-08-04T12:00:00'))).toBe('')
  })

  it('有备注时将备注放在日期信息下一行', () => {
    const item = {
      id: 'milk-note', subcategory_id: 'milk', subcategory_name: '奶品', icon_key: 'milk', storage_slot_id: 'cold-1',
      item_name: '鲜牛奶', quantity: 1, production_date: '2026-08-01', best_before: null, product_description: '蒙牛 250ml × 6',
      price: '12.30', barcode: null, expiry_status: null,
    }
    const markup = renderToStaticMarkup(createElement(InventoryList, {
      inventory: [item], icons: [], title: '全部物品', onBack: () => undefined, onAdd: () => undefined,
      onSelect: () => undefined, onSaveQuantity: async () => true,
    }))

    expect(markup).toContain('<span class="p5-inventory-meta"><span class="p5-inventory-meta-primary"><small>已添加')
    expect(markup).toContain('<span class="p5-inventory-meta-secondary"><small class="p5-inventory-note">蒙牛 250ml × 6</small><small class="p5-inventory-price">¥12.30</small></span>')
    expect(markup).toContain('<small class="p5-inventory-note">蒙牛 250ml × 6</small>')
    expect(markup).toContain('<small class="p5-inventory-price">¥12.30</small>')
    expect(markup).toContain('合计 ¥12.30')
  })

  it('无价格按0计入合计，并用分计算避免浮点误差', () => {
    expect(formatInventoryPrice(null)).toBe('')
    expect(sumInventoryPrices([
      { quantity: 1, price: '0.10' },
      { quantity: 2, price: '0.20' },
      { quantity: 0, price: '99.99' },
      { quantity: 1, price: null },
    ])).toBe('¥0.30')
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

describe('库存统计规则', () => {
  it('只统计正库存批次', () => {
    expect(countActiveInventoryItems([3, 0, 1, 0])).toBe(2)
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

  it('价格最低和最高都把无价格项目放到最后，无价格项目按最近添加排序', () => {
    const pricedInventory = [
      { id: 'no-price-new', production_date: '2026-08-08', best_before: null, price: null },
      { id: 'expensive', production_date: '2026-08-07', best_before: null, price: '18.80' },
      { id: 'cheap', production_date: '2026-08-06', best_before: null, price: '3.20' },
      { id: 'no-price-old', production_date: '2026-08-01', best_before: null, price: null },
      { id: 'free', production_date: '2026-08-02', best_before: null, price: '0.00' },
    ] as Parameters<typeof sortInventory>[0]

    expect(sortInventory(pricedInventory, 'price-low').map(item => item.id)).toEqual(['free', 'cheap', 'expensive', 'no-price-new', 'no-price-old'])
    expect(sortInventory(pricedInventory, 'price-high').map(item => item.id)).toEqual(['expensive', 'cheap', 'free', 'no-price-new', 'no-price-old'])
  })

  it('排序菜单包含两个价格排序选项', () => {
    expect(INVENTORY_SORT_LABELS['price-low']).toBe('价格最低')
    expect(INVENTORY_SORT_LABELS['price-high']).toBe('价格最高')
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
    saveInventorySortKey('price-low')
    expect(readInventorySortKey()).toBe('price-low')
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
      refrigerators: [
        { id: 'home', name: '家里冰箱', revision: 1, setup_status: 'ready', display_device_status: 'bound', access_role: 'owner' },
        { id: 'other', name: '办公室冰箱', revision: 1, setup_status: 'ready', display_device_status: 'bound', access_role: 'owner' },
      ],
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
      { refrigerator: { id: 'home', name: '家里冰箱', revision: 1, setup_status: 'ready', display_device_status: 'bound', access_role: 'owner' }, item: { item_name: '鲜牛奶', subcategory_name: '牛奶', product_description: '蒙牛 250ml', id: 'milk' } },
      { refrigerator: { id: 'parents', name: '爸妈家', revision: 1, setup_status: 'ready', display_device_status: 'bound', access_role: 'owner' }, item: { item_name: '鸡蛋', subcategory_name: '蛋类', product_description: null, id: 'egg' } },
    ] as Parameters<typeof filterInventoryAcrossRefrigerators>[0]

    expect(filterInventoryAcrossRefrigerators(results, '250ML').map(result => result.item.id)).toEqual(['milk'])
    expect(filterInventoryAcrossRefrigerators(results, '爸妈').map(result => result.item.id)).toEqual(['egg'])
  })

  it('空关键词保留全部库存结果', () => {
    const results = [{ refrigerator: { id: 'home', name: '家里冰箱', revision: 1, setup_status: 'ready', display_device_status: 'bound', access_role: 'owner' }, item: { id: 'milk' } }] as Parameters<typeof filterInventoryAcrossRefrigerators>[0]
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

  it('添加物品页提供可选价格输入框', () => {
    const markup = renderToStaticMarkup(createElement(InventoryFlow, {
      layout: {
        refrigerator_id: 'fridge-1', template_key: 'mini', revision: 1,
        zones: [{ key: 'cold', label: '冷藏室', temperature_mode: 'cold', is_door: false, geometry: { x: 0, y: 0, width: 100, height: 100, layout_kind: 'vertical' }, slots: [{ id: 'cold-1', key: 'cold-1' }] }],
      },
      categories: [{ id: 'milk', parent_id: 'group', name: '奶品', icon_key: 'milk', is_custom: false }],
      icons: [], inventory: [], refrigerator: { id: 'fridge-1', name: '家里冰箱', revision: 1, setup_status: 'ready', display_device_status: 'bound', access_role: 'owner' }, saving: false,
      initialView: 'add', onBack: () => undefined, onSelectFridge: () => undefined,
      onCreateCategory: async () => undefined, onCatalogChanged: async () => undefined, onSave: async () => true, onDelete: async () => true,
    }))

    expect(markup).toContain('品牌 / 规格 / 备注')
    expect(markup).toContain('aria-label="价格"')
    expect(markup).toContain('placeholder="0.00"')
  })
})

describe('formatInventoryScopeTitle', () => {
  it('将分格内部 key 转为用户可读的区域序号', () => {
    expect(formatInventoryScopeTitle('冷藏室', 'refrigerator-1')).toBe('冷藏室 · 第 1 格')
    expect(formatInventoryScopeTitle('冰箱门', 'door-4')).toBe('冰箱门 · 第 4 格')
  })

  it('优先显示分层的自定义名字', () => {
    expect(formatInventoryScopeTitle('冷藏室', 'refrigerator-1', '早餐食材')).toBe('早餐食材')
    expect(formatStorageSlotLabel('冷藏室', 'refrigerator-1', '早餐食材')).toBe('早餐食材')
  })
})

describe('getFoodIconPosition', () => {
  it('将一个食材放在分格正中', () => {
    expect(getFoodIconPosition(0, 1)).toEqual({ x: 0.5, y: 0.5 })
  })

  it('两个至五个食材统一使用二维采样，避免只在水平线上排列', () => {
    for (let count = 2; count <= 5; count += 1) {
      const positions = getFoodIconPositions(Array.from({ length: count }, (_, index) => `item-${index}`), { width: 160, height: 96 })
      expect(new Set(positions.map(position => position.x)).size).toBe(count)
      expect(new Set(positions.map(position => position.y)).size).toBe(count)
    }
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
    expect(isFridgeBoardAppCache('fridgeboard-app-v3')).toBe(true)
    expect(isFridgeBoardAppCache('other-app-v1')).toBe(false)
  })
})

describe('PWA 静态资源缓存策略', () => {
  it('图标和应用壳使用缓存优先，业务 API 不进入 Service Worker 缓存', () => {
    expect(serviceWorkerSource).toContain("const CACHE_NAME = 'fridgeboard-app-v3'")
    expect(serviceWorkerSource).toContain('const cached = await cache.match(request)')
    expect(serviceWorkerSource).toContain('if (isIconAsset) {')
    expect(serviceWorkerSource).toContain("if (url.pathname.startsWith('/api/') && !isIconAsset) return")
    expect(serviceWorkerSource).not.toContain('event.waitUntil(refresh.catch')
  })
})

describe('PWA 刷新滚动位置', () => {
  it('刷新前清除根页面和应用壳滚动位置，并关闭浏览器滚动恢复', () => {
    const body = { scrollTop: 128 }
    const appBody = { scrollTop: 256 }
    const document = {
      body,
      documentElement: { scrollTop: 64 },
      querySelectorAll: () => [appBody],
    }
    const targetWindow = {
      history: { scrollRestoration: 'auto' as ScrollRestoration },
      scrollTo: vi.fn(),
      document,
    } as unknown as Window

    resetPwaScrollPosition(targetWindow)

    expect(targetWindow.history.scrollRestoration).toBe('manual')
    expect(targetWindow.scrollTo).toHaveBeenCalledWith(0, 0)
    expect(document.documentElement.scrollTop).toBe(0)
    expect(body.scrollTop).toBe(0)
    expect(appBody.scrollTop).toBe(0)
  })
})
