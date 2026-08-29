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
import { AppHeader, ConfirmDialog, HeaderTitle, NoticeDialog, P7Navigation, PageHeader, PageShell, RecipeIngredientList } from './sharedUi'
import { getPreselectedInventorySlotId } from './inventoryAddLocation'
import { filterInventoryAcrossRefrigerators } from './inventorySearchUtils'
import { InventoryList } from './inventoryList'
import { InventoryMoveFlow } from './InventoryMoveFlow'
import { countActiveInventoryItems, formatInventoryPrice, getInventoryAddedDaysLabel, getInventoryExpiryLabel, sumInventoryPrices, upsertInventoryBatch } from './inventoryListUtils'
import { getInventorySelectionSummary } from './inventorySelection'
import { shouldTriggerSafeSwipeBack } from './edgeSwipeBack'
import { FridgeHome, FridgeSettings, FridgeSettingsLoading, FridgeSwitcher, MeHome, NotificationsPage } from './App'
import { InventoryFlow, OrderRecognitionList, RecognitionProgress } from './InventoryFlow'
import { AddCustomShoppingDialog, CustomShoppingList, RecipeIngredientEditorRow, RecipeWorkspace, RestockMissingLine, RestockWeekDivider } from './RecipeWorkspace'
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
import { EmptyOwnerHome } from './pairingOnboarding'
import serviceWorkerSource from '../public/sw.js?raw'

const stylesSource = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')
const keyboardViewportSource = readFileSync(new URL('./keyboardViewport.ts', import.meta.url), 'utf8')
const fridgePreviewSource = readFileSync(new URL('./fridgePreview.css', import.meta.url), 'utf8')
const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')
const installAndScannerSource = readFileSync(new URL('./pwaInstallAndScanner.tsx', import.meta.url), 'utf8')
const mainSource = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8')
const fridgeLayoutSource = readFileSync(new URL('./FridgeLayout.tsx', import.meta.url), 'utf8')
const recipeWorkspaceSource = readFileSync(new URL('./RecipeWorkspace.tsx', import.meta.url), 'utf8')
const subcategoryIconEditorSource = readFileSync(new URL('./SubcategoryIconEditor.tsx', import.meta.url), 'utf8')
const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

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
    expect(stylesSource).toContain('.fridge-preview-frame--home .open-fridge-slot:active .food-icon')
  })

  it('仅在 Android APK 输入框中抑制 WebView 原生文本手柄，PWA 不继承该规则', () => {
    expect(mainSource).toContain("if (isAndroidRuntime()) document.documentElement.dataset.platform = 'android'")
    expect(stylesSource).toContain('html[data-platform="android"] :is(input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea)')
    expect(stylesSource).toContain('-webkit-user-select: none; user-select: none; -webkit-touch-callout: none;')
  })

  it('不让 Android WebView 接管会重绘页面的原生选择弹层', () => {
    const bootstrapSource = readFileSync(new URL('./BootstrapPairing.tsx', import.meta.url), 'utf8')
    expect(recipeWorkspaceSource).not.toContain('<select')
    expect(bootstrapSource).not.toContain('<select')
    expect(appSource).not.toContain('type="time"')
    expect(recipeWorkspaceSource).toContain('OptionPickerField label="星期"')
    expect(bootstrapSource).toContain('OptionPickerField label="选择冰箱"')
  })
})

describe('新建小类 AI 图标生成', () => {
  it('使用 AI 文案、禁用的唯一引擎选择框和四个占位生成位', () => {
    expect(subcategoryIconEditorSource).toContain('label="AI 模型"')
    expect(subcategoryIconEditorSource).toContain('modelError')
    expect(subcategoryIconEditorSource).toContain('compatibleModels.map')
    expect(subcategoryIconEditorSource).toContain("tab === 'online' ? '在线' : 'AI'")
    expect(subcategoryIconEditorSource).toContain("generationRunning ? '停止生成' : '开始生成'")
    expect(subcategoryIconEditorSource).toContain('p5-ai-candidate-grid')
    expect(subcategoryIconEditorSource).toContain("showInfo('正在生成图标候选…')")
    expect(subcategoryIconEditorSource).not.toContain('Agnes AI 生成')
    expect(subcategoryIconEditorSource).not.toContain('正在通过 Agnes AI')
    expect(stylesSource).toContain('.p5-custom .p5-inline-notice')
    expect(stylesSource).toContain('border: 0; background: transparent;')
  })
})

describe('选择分类抽屉预填物品名称', () => {
  it('将调用者传入的物品名称交给新建小类流程', () => {
    const categoryPickerSource = readFileSync(new URL('./CategoryPickerPanel.tsx', import.meta.url), 'utf8')
    const inventoryFlowSource = readFileSync(new URL('./InventoryFlow.tsx', import.meta.url), 'utf8')

    expect(categoryPickerSource).toContain('itemName?: string')
    expect(categoryPickerSource).toContain('onClick={() => onAddSubcategory(itemName)}')
    expect(inventoryFlowSource).toContain('itemName={draft.itemName}')
    expect(inventoryFlowSource).toContain('onAddSubcategory={itemName => openCustomCategory(undefined, itemName)}')
    expect(inventoryFlowSource).toContain('initialName={customInitialName}')
    expect(inventoryFlowSource).toContain('setCustomInitialName(category?.name ?? itemName)')
  })
})

describe('选择分类自定义小类编辑入口', () => {
  it('将选择热区与创建者编辑角标拆成两个独立操作', () => {
    const categoryPickerSource = readFileSync(new URL('./CategoryPickerPanel.tsx', import.meta.url), 'utf8')

    expect(categoryPickerSource).toContain('child.can_edit !== false')
    expect(categoryPickerSource).toContain('event.stopPropagation()')
    expect(categoryPickerSource).toContain('p5-edit-subcategory')
    expect(categoryPickerSource).toContain('<svg viewBox="0 0 24 24"')
    expect(subcategoryIconEditorSource).toContain('p5-custom-actions')
    expect(subcategoryIconEditorSource).toContain('删除小类')
    expect(subcategoryIconEditorSource.indexOf('删除小类')).toBeLessThan(subcategoryIconEditorSource.indexOf('保存并更新物品'))
    expect(subcategoryIconEditorSource).toContain('/categories/${categoryId}')
  })

  it('编辑角标保持独立点击行为，主题只替换贴合笔形图标的圆形材质', () => {
    expect(stylesSource).toContain('.p5-icon-grid button.p5-edit-subcategory { position: absolute; top: 2px; right: 2px; width: 20px; height: 20px; min-width: 0; min-height: 0; aspect-ratio: 1; display: grid; place-items: center; align-content: center; gap: 0;')
    expect(stylesSource).toContain('.p5-edit-subcategory::before { content: \'\'; position: absolute; inset: 2px;')
    expect(stylesSource).toContain('.p5-edit-subcategory svg { position: relative; z-index: 1; width: 12px; height: 12px;')
    expect(stylesSource).toContain('[data-theme="ink"] .p5-edit-subcategory::before { border-color: var(--ink); background: var(--ink); }')
    expect(stylesSource).toContain('[data-theme="ink"] .p5-edit-subcategory { color: var(--surface); }')
    expect(stylesSource).toContain('[data-theme="skeuomorphic"] .p5-edit-subcategory::before { border-color: rgb(255 255 255 / 50%); background: rgb(255 255 255 / 42%); backdrop-filter: blur(1px); -webkit-backdrop-filter: blur(1px); }')
  })

  it('编辑小类底部保持删除左、识别或保存右的等宽按钮布局', () => {
    const footerStart = subcategoryIconEditorSource.indexOf('footer={<footer className={`bottom-action-bar')
    const footerSource = subcategoryIconEditorSource.slice(footerStart, footerStart + 900)

    expect(footerSource.indexOf('p5-selection-delete')).toBeLessThan(footerSource.indexOf('p5-add-category'))
    expect(stylesSource).toContain('.p5-custom-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; align-items: center; }')
    expect(stylesSource).toContain('[data-theme="skeuomorphic"] .p5-custom-actions button {\n  position: relative;\n  isolation: isolate;')
    expect(stylesSource).toContain('[data-theme="skeuomorphic"] .p5-custom-actions button::before {\n  border-width: 0 22px !important;')
    expect(stylesSource).not.toContain('p5-custom-delete')
  })
})

describe('编辑物品中新建小类', () => {
  it('目录确认后强制刷新工作区，避免缓存覆盖新分类和图标', () => {
    expect(appSource).toContain('onCatalogChanged={async () => { await loadInventoryWorkspace(currentFridge, true) }}')
  })
})

describe('搜索框放大镜提交入口', () => {
  it('所有放大镜都作为提交按钮，并在提交时忽略空白查询', () => {
    const categoryPickerSource = readFileSync(new URL('./CategoryPickerPanel.tsx', import.meta.url), 'utf8')
    const inventoryFlowSource = readFileSync(new URL('./InventoryFlow.tsx', import.meta.url), 'utf8')
    const inventoryListSource = readFileSync(new URL('./inventoryList.tsx', import.meta.url), 'utf8')

    expect(appSource).toContain('<form className="p5-search p7-inventory-search"')
    expect(categoryPickerSource).toContain('<form className="p5-search p5-catalog-search"')
    expect(inventoryFlowSource).toContain('<form className="p5-search p5-catalog-search"')
    expect(inventoryListSource).toContain('<form className="p5-search p5-inventory-search"')
    expect(subcategoryIconEditorSource).toContain('<form className="p5-search p5-online-search"')
    expect(appSource).toContain('<button type="submit" className="p7-search-submit" aria-label="搜索">')
    expect(categoryPickerSource).toContain('<button type="submit" className="p5-search-submit" aria-label="搜索">')
    expect(inventoryFlowSource).toContain('<button type="submit" className="p5-search-submit" aria-label="搜索">')
    expect(inventoryListSource).toContain('<button type="submit" className="p5-search-submit" aria-label="搜索">')
    expect(subcategoryIconEditorSource).toContain('<button type="submit" className="p5-search-submit" aria-label="搜索在线图标">')
    expect(categoryPickerSource).toContain('const value = query.trim(); if (value) onQueryChange(value)')
    expect(inventoryListSource).toContain('const value = query.trim(); if (value) setQuery(value)')
    expect(stylesSource).toContain('.p5-search-submit')
    expect(stylesSource).toContain('.p5-search-submit::before')
    expect(stylesSource).toContain('.p7-search-submit::before')
  })
})

describe('Android APK 自动更新帮助页', () => {
  it('仅在 Android 原生运行时显示更新入口，并保留系统安装权限提示', () => {
    expect(appSource).toContain('isAndroidRuntime()')
    expect(appSource).toContain('下载并安装更新')
    expect(appSource).toContain('打开安装权限设置')
    expect(appSource).toContain('subscribeApkUpdate')
    expect(appSource).toContain('subscribeAppResume')
    expect(appSource).toContain('canInstallUnknownApps')
    expect(appSource).toContain("updateStateRef.current !== 'install-permission'")
    expect(stylesSource).toContain('.p7-about-update')
  })

  it('检测到可用更新时只显示居中的下载按钮', () => {
    expect(appSource).toContain('className="p7-primary p7-about-download"')
    expect(appSource).toContain("updateState !== 'available' && updateState !== 'install-permission'")
    expect(stylesSource).toContain('.p7-about-update .p7-about-download')
    expect(stylesSource).toContain('margin: 4px auto 0')
  })

  it('关于页刷新按钮重置通用主按钮的外边距，避免满宽按钮被推出内容列', () => {
    expect(stylesSource).toContain('.p7-primary { width: calc(100% - 32px); min-height: 52px; margin: auto 16px 96px;')
    expect(stylesSource).toContain('.p7-about-help button { margin: 4px 0 0; }')
  })

  it('关于与帮助页显示原生包版本和 release，不显示内部构建号', () => {
    expect(appSource).toContain('getNativeAppInfo')
    expect(appSource).toContain('const displayVersion = nativeAppInfo?.versionName || APP_VERSION')
    expect(appSource).toContain("import { APP_RELEASE } from './release'")
    expect(appSource).toContain('<b>v{displayVersion} · release {APP_RELEASE}</b>')
    expect(appSource).toContain('remoteUpdate.release ? ` · release ${remoteUpdate.release}`')
    expect(appSource).not.toContain('v{displayVersion}{buildLabel}')
  })

  it('将 Android 更新详情放在按钮后并使用只读多行文本框', () => {
    expect(appSource).toContain('formatAndroidReleaseNotes')
    expect(appSource).toContain('<textarea className="p7-about-release-notes" aria-label="版本更新说明" readOnly')
    expect(stylesSource).toContain('.p7-about-release-notes')
    expect(appSource.indexOf('p7-about-release-notes')).toBeGreaterThan(appSource.indexOf('下载并安装更新'))
    expect(appSource.indexOf('p7-about-release-notes')).toBeGreaterThan(appSource.indexOf('检查更新'))
  })
})

describe('移动登录启动时序', () => {
  it('冷启动先消费深链，再创建 App，避免认证状态竞态', () => {
    const exchangeIndex = mainSource.indexOf('await completeMobileLoginFromUrl().catch')
    const renderIndex = mainSource.indexOf('createRoot(')

    expect(exchangeIndex).toBeGreaterThan(-1)
    expect(renderIndex).toBeGreaterThan(exchangeIndex)
  })
})

describe('三主题共享令牌与控件形状', () => {
  it('旧流程颜色通过主题令牌覆盖，卡通主题不重写所有按钮圆角', () => {
    expect(stylesSource).toContain('--surface-selected:')
    expect(stylesSource).toContain('[data-theme="cartoon"] .p9-week-tabs')
    expect(stylesSource).toContain('[data-theme="skeuomorphic"] .p5-inventory-select.is-selected')
    expect(stylesSource).not.toContain('[data-theme="cartoon"] button, [data-theme="cartoon"] input')
  })

  it('拟物主题接入最终暖奶油壳层和共享浮雕控件', () => {
    expect(stylesSource).toContain('--paper: #EBE6DD;')
    expect(stylesSource).toContain('--skeu-raised-shadow:')
    expect(stylesSource).toContain('--skeu-inset-shadow:')
    expect(stylesSource).toContain('[data-theme="skeuomorphic"] .app-header')
    expect(stylesSource).toContain('[data-theme="skeuomorphic"] .p7-nav')
    expect(stylesSource).toContain('--skeu-shell: #BFA184;')
    expect(stylesSource).toContain('filter: url(#skeuomorphic-emboss)')
    expect(stylesSource).not.toMatch(/\[data-theme="skeuomorphic"\]\s+\.food-icon\s*\{/)
    expect(stylesSource).not.toMatch(/\[data-theme="skeuomorphic"\]\s+\.open-fridge\s*\{/)
  })

  it('拟物主题使用最终底部三切片和透明顶部操作', () => {
    expect(stylesSource).toContain("url('/assets/theme/buttons/primary-master.webp')")
    expect(stylesSource).toContain("url('/assets/theme/buttons/secondary-master.webp')")
    expect(stylesSource).toContain("url('/assets/theme/buttons/danger-master.webp')")
    expect(stylesSource).toContain('.p7-nav-skin')
    expect(stylesSource).toContain('grid-template-columns: auto minmax(0, 1fr) auto;')
    expect(stylesSource).toContain('background: url(\'/assets/theme/navigation/bottom-center.webp\') center / 100% 100% no-repeat;')
    expect(stylesSource).toContain('column-gap: 0;')
    expect(stylesSource).not.toContain("background: url('/assets/theme/navigation/bottom-center.webp') center / auto 100% repeat-x;")
    expect(stylesSource).toContain('object-fit: contain;')
    expect(stylesSource).toContain('min-height: 56px;\n  padding: var(--app-safe-top) 0 0;')
    expect(stylesSource).toContain('padding: var(--app-safe-top) 0 0;')
    expect(stylesSource).toContain('width: 100%;')
    expect(stylesSource).toContain('margin: 0;')
    expect(stylesSource).toContain('padding: 0 0 var(--app-safe-bottom);')
    expect(stylesSource).toContain('display: none;')
    expect(stylesSource).toContain('filter: url(#skeuomorphic-emboss)')
    expect(stylesSource).toContain('text-shadow: none;')
    const sharedUiSource = readFileSync(new URL('./sharedUi.tsx', import.meta.url), 'utf8')
    expect(sharedUiSource).toContain('id="skeuomorphic-emboss"')
    expect(sharedUiSource).toContain('stdDeviation=".62"')
    expect(sharedUiSource).toContain('azimuth="225"')
    expect(sharedUiSource).toContain('result="contact-shadow"')
    expect(sharedUiSource).toContain('<feMergeNode in="contact-shadow" />')
    expect(sharedUiSource).toContain('bottom-left.webp')
    expect(sharedUiSource).toContain('bottom-right.webp')
  })

  it('拟物主题刷新失败徽记使用透明中心且不套用重浮雕阴影', () => {
    const warningRule = stylesSource.match(/\[data-theme="skeuomorphic"\] \.header-refresh-warning \{[^}]+\}/)?.[0] ?? ''

    expect(warningRule).toContain('background: transparent !important;')
    expect(warningRule).toContain('box-shadow: none !important;')
    expect(warningRule).toContain('filter: none !important;')
  })

  it('HTML 首帧使用独立小启动图，iOS 启动画面保留原资源', () => {
    expect(indexSource).toContain('href="/splash-1024-ice4.png"')
    expect(indexSource).toContain('<img src="/app-boot-ice4.png"')
    expect(indexSource).toContain('color: #765B48;')
    expect(indexSource).toContain("theme === 'skeuomorphic' ? '#EBE6DD'")
    expect(indexSource).not.toContain('<img src="/splash-1024-ice4.png"')
  })

  it('PWA 启动先保留缓存 splash，版本升级时显示状态且更新失败不阻塞首屏', () => {
    expect(indexSource).toContain('id="app-boot-status"')
    expect(mainSource).toContain("setAppBootStatus('正在更新...')")
    expect(mainSource).toContain('PWA_RELEASE_BOOT_TIMEOUT_MS')
    expect(mainSource).toContain('result?.reloaded')
    expect(serviceWorkerSource).toContain('cacheFirstNavigation')
    expect(serviceWorkerSource).toContain('void refreshNavigationCache(request, cache, cached)')
  })

  it('关于与帮助页使用透明冰箱图且资源进入应用壳缓存', () => {
    expect(appSource).toContain('<section className="p7-about-identity"><img src="/app-boot-ice4.png"')
    expect(appSource).not.toContain('<section className="p7-about-identity"><img src="/icon-192-ice3.png"')
    expect(serviceWorkerSource).toContain("'/app-boot-ice4.png'")
  })

  it('首页和二级页标题复用同一公共文字基线', () => {
    const appHeader = renderToStaticMarkup(createElement(AppHeader, { title: createElement(HeaderTitle, { title: '我的冰箱' }) }))
    const pageHeader = renderToStaticMarkup(createElement(PageHeader, { title: '每周食谱' }))

    expect(appHeader).toContain('app-header-title shared-header-title-text')
    expect(appHeader).toContain('shared-header-title-content')
    expect(pageHeader).toContain('class="shared-header-title-text"')
    expect(pageHeader).toContain('class="shared-header-title-content"')
    expect(stylesSource).toContain('[data-theme="skeuomorphic"] :is(.shared-header-title-text, .app-header-title, .page-header h1)')
    expect(stylesSource).toContain('font-size: 21px;\n  font-weight: 700;\n  line-height: 1;')
    expect(stylesSource).toContain('[data-theme="skeuomorphic"] .shared-header-title-content,')
  })

  it('所有二级页返回按钮复用 48px 热区和共享字号', () => {
    const pageHeader = renderToStaticMarkup(createElement(PageHeader, { title: '冰箱设置', onBack: () => undefined }))

    expect(pageHeader).toContain('class="header-button"')
    expect(pageHeader).toContain('aria-label="返回"')
    expect(stylesSource).toContain('.header-button { width: 48px; min-height: 48px;')
    expect(stylesSource).toContain('font-size: 32px; font-weight: 400; }')
    expect(stylesSource).not.toContain('.p71-shell .header-button, .p71-shell .save-text { width: 48px; min-height: 48px; padding: 0; border: 0; border-radius: 0; background: transparent; color: var(--ink); font-size: 22px; }')
  })

  it('拟物编辑物品图标按钮本体保持透明平面', () => {
    expect(stylesSource).toContain('[data-theme="skeuomorphic"] .p5-icon-grid button {')
    expect(stylesSource).toMatch(/\[data-theme="skeuomorphic"\] \.p5-icon-grid button \{[^}]*border: 0;[^}]*background: transparent;[^}]*box-shadow: none;/s)
    expect(stylesSource).toContain('[data-theme="skeuomorphic"] .p5-icon-grid button > span')
    expect(stylesSource).toMatch(/\[data-theme="skeuomorphic"\] \.p5-icon-grid button,\n\[data-theme="skeuomorphic"\] \.p5-icon-grid button > span \{[^}]*border: 0 !important;[^}]*background: transparent !important;[^}]*box-shadow: none !important;/s)
  })

  it('拟物导航辅助结构不会改变水墨主题基线', () => {
    const navigation = renderToStaticMarkup(createElement(P7Navigation, { active: 'home', onHome: () => undefined, onShopping: () => undefined, onMe: () => undefined }))
    const sharedUiSource = readFileSync(new URL('./sharedUi.tsx', import.meta.url), 'utf8')

    expect(stylesSource).toContain('.skeuomorphic-filter-defs { position: absolute; width: 0; height: 0; overflow: hidden; }')
    expect(stylesSource).toContain('.p7-nav-skin { display: none; }')
    expect(stylesSource).toContain('.p7-nav-content { display: contents; }')
    expect(stylesSource).toContain('.p7-nav-icon--ink { display: none; }')
    expect(stylesSource).toContain('[data-theme="ink"] .p7-nav-icon--ink { display: block; }')
    expect(stylesSource).toContain('[data-theme="ink"] .p7-nav-icon--skeuomorphic { display: none; }')
    expect(navigation).toContain('p7-nav-icon--ink')
    expect(navigation).toContain('p7-nav-icon--skeuomorphic')
    expect(sharedUiSource).toContain('className="p7-nav-skin" aria-hidden="true" style={{ display: \'none\' }}')
    expect(sharedUiSource).toContain('className="p7-nav-content" style={{ display: \'contents\' }}')
    expect(sharedUiSource).toContain("style: { display: visible ? 'block' : 'none' }")
    expect(sharedUiSource).toContain("const skeuomorphicIconStyle = { display: theme === 'ink' ? 'none' : 'block' }")
    expect(stylesSource).toContain('[data-theme="skeuomorphic"] .p7-nav-skin {')
    expect(stylesSource).toMatch(/\[data-theme="skeuomorphic"\] \.p7-nav-skin \{[^}]*display: grid !important;/s)
    expect(stylesSource).toMatch(/\[data-theme="skeuomorphic"\] \.p7-nav-content \{[^}]*display: grid !important;/s)
  })

  it('最终拟物控件保持单层搜索、透明状态操作和统一添加/关闭语义', () => {
    expect(stylesSource).toContain('position: absolute !important;')
    expect(stylesSource).toContain('.p7-inventory-search input')
    expect(stylesSource).toContain('.p5-catalog-dialog-heading .p5-catalog-search::before')
    expect(stylesSource).toContain('.p5-inventory-fridge, .p5-inventory-main, .p5-inventory-meta')
    expect(stylesSource).toContain('.header-button-glyph')
    expect(stylesSource).toContain('filter: none;')
    expect(stylesSource).toContain('.p9-list article.is-complete .p9-entry-action')
    expect(stylesSource).toContain('[data-theme="skeuomorphic"] .p9-list article.is-complete :is(.p9-method, .p9-note)')
    expect(stylesSource).toContain('text-decoration: none;')
    expect(stylesSource).toContain('.p9-add-day-button')
    expect(stylesSource).toContain('[data-theme="skeuomorphic"] .p9-add-shopping-row svg')
    expect(stylesSource).toContain('[data-theme="skeuomorphic"] .p9-remove-shopping-row svg')
    expect(stylesSource).toContain('grid-template-columns: minmax(0, 1fr) 106px 48px')
    expect(stylesSource).toContain('p5-add-item:not(.p5-add-item-plus)')
    expect(stylesSource).toContain('.p5-add-group, .p5-new-subcategory, .p9-add-ingredient, .p71-new-fridge')
    expect(stylesSource).toContain('.p5-delete, .p9-delete-recipe, .p71-danger button)')
    expect(stylesSource).toContain('.p5-selection-delete, .p9-delete-recipe, .p71-danger-bar button, .modal-danger)::before')
    expect(stylesSource).toContain('[data-theme="skeuomorphic"] .modal-danger::after')
    expect(stylesSource).toContain('[data-theme="skeuomorphic"] .modal-danger {')
    expect(stylesSource).toContain('color: var(--paper) !important;')
    expect(installAndScannerSource).toContain('className="pwa-install-action p7-primary"')
    expect(appSource).toContain('className="p7-about-secondary p7-outline"')
    expect(appSource).toContain('className="p9-remove-ingredient" type="button"')
    expect(appSource).toContain('aria-label={`移除 ${device.label}`} title="移除"')
    expect(appSource).toContain('className="p71-deleted-link"')
    expect(stylesSource).toContain('[data-theme="skeuomorphic"] .p71-deleted-link { padding-inline: 12px; border: 0; border-radius: 8px; background: var(--surface); box-shadow: var(--skeu-soft-raised-shadow); }')
    expect(stylesSource).not.toContain('.p5-delete, .p9-delete-recipe, .p71-danger button, .p71-danger-bar button)')
    const bootstrapSource = readFileSync(new URL('./BootstrapPairing.tsx', import.meta.url), 'utf8')
    const inventoryFlowSource = readFileSync(new URL('./InventoryFlow.tsx', import.meta.url), 'utf8')
    const pairingSource = readFileSync(new URL('./pairingOnboarding.tsx', import.meta.url), 'utf8')
    expect(bootstrapSource).toContain('className="p7-primary" type="button" onClick={login}')
    expect(bootstrapSource).toContain('className="p7-primary" type="submit"')
    expect(bootstrapSource).toContain('className="p7-outline secondary-action scan-entry"')
    expect(inventoryFlowSource).toContain('className="p7-outline" type="button" onClick={() => setGroupDialogOpen(false)}')
    expect(inventoryFlowSource).toContain('className="p7-primary" type="submit"')
    expect(pairingSource).toContain('className="p7-outline" type="button" onClick={onBack}')
    expect(stylesSource).toContain('.p9-day-heading { min-height: 48px; display: flex; align-items: center; justify-content: flex-start; gap: 0; }')
    expect(stylesSource).toContain('[data-theme="skeuomorphic"] .p9-add-day-button svg')
    expect(stylesSource).not.toMatch(/\[data-theme="skeuomorphic"\][^{]*p9-add-day-button[^{}]*::before/)
    expect(stylesSource).not.toMatch(/\[data-theme="skeuomorphic"\][^{]*p9-add-day-button[^{}]*::after/)
    expect(stylesSource).toContain('.modal-close')
    expect(stylesSource).not.toMatch(/\[data-theme="skeuomorphic"\][^{]*\.p5-slot-link[^{}]*::before/)
    expect(stylesSource).toContain('[data-theme="skeuomorphic"] :is(.p71-name-layout-link, .p5-slot-link) { padding-inline: 12px; border: 0; border-radius: 8px; background: var(--surface); box-shadow: var(--skeu-soft-raised-shadow); }')
    expect(stylesSource).toContain('.p9-remove-shopping-row')
    expect(appSource).toContain('className="p71-name-layout-link"')
    expect(stylesSource).toContain('[data-theme="skeuomorphic"] :is(.p71-name-layout-link, .p5-slot-link)')
    expect(stylesSource).toContain('padding-inline: 12px; border: 0; border-radius: 8px; background: var(--surface);')
    const textPlusRule = stylesSource.match(/\/\* 文本加号入口[\s\S]*?\/\* 删除入口/)?.[0] ?? ''
    expect(textPlusRule).not.toContain('p5-add-item-plus')
    expect(stylesSource).toContain('.p5-add-item-plus')
    expect(stylesSource).toContain('.bottom-action-bar button:not(.p5-selection-cancel)')
    expect(stylesSource).toContain('.p5-selection-actions button { width: 100%; min-width: 0; padding-inline: 4px; white-space: nowrap; }')
    expect(stylesSource).toContain('[data-theme="skeuomorphic"] .p5-selection-actions button {')
    expect(stylesSource).toContain('border-width: 0 22px !important;')
    expect(stylesSource).toContain('border-image-slice: 0 150 fill !important;')
    expect(stylesSource).toContain('border-image-width: 0 22px !important;')
    expect(stylesSource).toContain('border-image-repeat: stretch !important;')
    expect(stylesSource).toContain('[data-theme="skeuomorphic"] .p5-selection-actions .p5-selection-delete')
    expect(stylesSource).toContain('[data-theme="skeuomorphic"] .p5-quantity-control .p5-food-quantity-input {\n  border-radius: 0 !important;\n  background: var(--skeu-control) !important;\n  box-shadow: var(--skeu-inset-shadow) !important;\n}')
  })

  it('拟物凹陷输入框为文字保留安全内边距，搜索框继续由图标避让', () => {
    expect(stylesSource).toContain('padding-inline: 8px;')
    expect(stylesSource).toContain('[data-theme="skeuomorphic"] textarea {\n  padding: 8px;')
    expect(stylesSource).toContain('[data-theme="skeuomorphic"] .p7-inventory-search input,')
    expect(stylesSource).toContain('  padding: 0;\n  border: 0;\n  border-radius: 0;')
    expect(stylesSource).toContain(':not(.p5-food-quantity-input)')
    expect(stylesSource).toContain(':not(.p7-inventory-search input)')
    expect(stylesSource).toContain(':not(.p5-search input)')
    expect(stylesSource).toContain(':not(.p5-catalog-heading input)')
    expect(stylesSource).toContain(':not(.p5-catalog-dialog-heading input)')
  })

  it('选择分类抽屉保持固定高度并从触发条下方展开', () => {
    const categoryPickerSource = readFileSync(new URL('./CategoryPickerPanel.tsx', import.meta.url), 'utf8')
    const inventoryListSource = readFileSync(new URL('./inventoryList.tsx', import.meta.url), 'utf8')
    const inventoryFlowSource = readFileSync(new URL('./InventoryFlow.tsx', import.meta.url), 'utf8')

    expect(categoryPickerSource).toContain('top?: number')
    expect(categoryPickerSource).toContain("style={top === undefined ? undefined : { top: `${top}px`, bottom: 'auto' }}")
    expect(inventoryListSource).toContain('classifyPanelTop')
    expect(inventoryFlowSource).toContain('catalogTop')
    expect(inventoryFlowSource).toContain('view === \'edit\' ? rect.bottom : rect.top')
    expect(stylesSource).toContain('.p5-catalog-panel { position: fixed;')
    expect(stylesSource).toContain('bottom: 0; left: 50%;')
    expect(stylesSource).toContain('height: min(600px, calc(100dvh - 80px));')
    expect(stylesSource).toContain('.p5-catalog-dialog-heading { min-height: 0;')
    expect(stylesSource).toContain('padding: 0 16px;')
    expect(stylesSource).toContain('.p5-catalog-dialog-heading .p5-catalog-search { min-height: 52px; margin: 0;')
    expect(stylesSource).toContain('.p5-catalog-dialog-heading > button { width: 44px; min-height: 44px; align-self: start;')
  })

  it('拟物普通输入框焦点保持内凹，日期输入固定高度且搜索输入层保持透明', () => {
    expect(stylesSource).toContain(':where(input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not(.p5-food-quantity-input)),')
    expect(stylesSource).toContain('box-shadow: var(--skeu-inset-shadow) !important;')
    expect(stylesSource).toContain('.p5-date-input')
    expect(stylesSource).toContain('避免 Android WebView 原生日期弹层重绘底层页面')
    expect(stylesSource).toContain('.p5-catalog-dialog-heading input')
    expect(stylesSource).toContain('.p9-custom-shopping-row > input')
    expect(stylesSource).toContain('box-shadow: none !important;')
  })

  it('拟物列表行横向铺满滚动区并保留窄屏适配', () => {
    expect(stylesSource).toContain('[data-theme="skeuomorphic"] .p5-inventory-items')
    expect(stylesSource).toContain('width: min(100vw, 430px);')
    expect(stylesSource).toContain('background: var(--surface-control);')
    expect(stylesSource).toContain('[data-theme="skeuomorphic"] :is(.p5-row-link.p5-subcategory-link, .p5-inventory-item)')
    expect(stylesSource).toContain('width: calc(100% + 48px);')
    expect(stylesSource).toContain('margin-inline: -24px;')
    expect(stylesSource).toContain('padding-inline: 24px;')
    expect(stylesSource).toContain('[data-theme="skeuomorphic"] .p9-history-row')
    expect(stylesSource).toContain('width: calc(100% + 32px);')
    expect(stylesSource).toContain('margin-inline: -16px;')
    expect(stylesSource).toContain('padding-inline: 16px;')
    expect(stylesSource).toContain('@media (max-width: 359px)')
  })

  it('底部导航使用指定图标，并让选中图标填充输入框同色', () => {
    const sharedUiSource = readFileSync(new URL('./sharedUi.tsx', import.meta.url), 'utf8')
    expect(sharedUiSource).toContain('className="p7-nav-icon p7-nav-icon--home p7-nav-icon--skeuomorphic"')
    expect(sharedUiSource).toContain('className="p7-nav-icon-fill" d={NAV_ICON_ENCLOSED.home[0]} fill="transparent" fillRule="evenodd" stroke="none"')
    expect(sharedUiSource).toContain('className="p7-nav-icon-outline"')
    expect(sharedUiSource).toContain("dataIcon: 'fluent:spatula-spoon-32-regular'")
    expect(sharedUiSource).toContain("dataIcon: 'material-symbols:shopping-cart-outline'")
    expect(sharedUiSource).toContain("dataIcon: 'boxicons:user'")
    expect(sharedUiSource).toContain('const NAV_ICON_ENCLOSED = {')
    expect(sharedUiSource).toContain('className="p7-nav-icon-fill"')
    expect(sharedUiSource).toContain('className="p7-nav-icon-line" d={icon.path} fill="currentColor" stroke="none"')
    expect(sharedUiSource).not.toContain('strokeWidth="1.25"')
    expect(stylesSource).toContain('.p7-nav button.is-active .p7-nav-icon--skeuomorphic .p7-nav-icon-fill')
    expect(stylesSource).toContain('.p7-nav .p7-nav-icon--home .p7-nav-icon-outline { stroke: #CCB8A1; }')
    expect(stylesSource).toContain('.p7-nav .p7-nav-icon--filled .p7-nav-icon-line { fill: #CCB8A1; }')
    expect(stylesSource).toContain('[data-theme="skeuomorphic"] .p7-nav-icon--skeuomorphic { width: 26px; height: 26px; filter: url(#skeuomorphic-nav-emboss); }')
    expect(stylesSource).toContain('[data-theme="skeuomorphic"] .p7-nav button.is-active .p7-nav-icon {\n  filter: url(#skeuomorphic-nav-emboss);\n}')
    expect(sharedUiSource).toContain('id="skeuomorphic-nav-emboss"')
    expect(sharedUiSource).toContain('<feMerge><feMergeNode in="contact-shadow" /><feMergeNode in="diffuse-face" /></feMerge>')
    expect(stylesSource).toContain('fill: var(--skeu-control);')
    expect(stylesSource).not.toContain('.p7-nav button.is-active .p7-nav-icon--filled { color: var(--skeu-control);')
  })
})

describe('拟物主题周切换控件', () => {
  it('只移动激活态的奶白背景，标签文字保持固定列位置', () => {
    expect(stylesSource).toContain('p9-week-tabs.is-next::before')
    expect(stylesSource).toContain('transition: transform 260ms ease')
    expect(stylesSource).toContain('p9-week-tabs button.is-active')
    expect(stylesSource).toContain('border: 0 !important;')
    expect(stylesSource).toContain('background: transparent !important;')
    expect(stylesSource).toContain('box-shadow: none !important;')
    expect(stylesSource).toContain('prefers-reduced-motion: reduce')
  })
})

describe('小类图标编辑器分段滑块', () => {
  it('按滑块自身完整宽度移动到每个目标列', () => {
    expect(stylesSource).toContain('transition: transform 260ms ease')
    expect(stylesSource).toContain('.p5-segmented-tabs.is-index-1::before { transform: translateX(calc(100% + var(--segment-gap))); }')
    expect(stylesSource).toContain('.p5-segmented-tabs.is-index-2::before { transform: translateX(calc(200% + var(--segment-gap) + var(--segment-gap))); }')
    expect(stylesSource).toContain('.p5-segmented-tabs.is-index-3::before { transform: translateX(calc(300% + var(--segment-gap) + var(--segment-gap) + var(--segment-gap))); }')
  })
})

describe('图库图标尺寸与间距', () => {
  it('与选择分类的小类图标规格一致且图标文字无额外间距', () => {
    expect(stylesSource).toContain('.p5-custom-grid { row-gap: 0; }')
    expect(stylesSource).toContain('.p5-custom-grid button { gap: 0; }')
    expect(stylesSource).toContain('.p5-custom-grid button > span > .food-icon,\n.p5-custom-grid button > span > .food-icon-fallback { width: 56px; height: 56px; box-sizing: border-box; padding: 6px; }')
  })
})

describe('新建小类候选文字占位', () => {
  it('空候选保留一行文字区域高度', () => {
    expect(stylesSource).toContain('min-height: 1.35em;')
    expect(stylesSource).toContain('line-height: 1.35;')
  })

  it('拟物主题使用彩色模糊图片占位和上下扫描，水墨主题保留转圈', () => {
    expect(subcategoryIconEditorSource).toContain('className="p5-flow p5-custom-editor"')
    expect(stylesSource).toContain('[data-theme="skeuomorphic"] .p5-custom-editor :is(.p5-ai-candidate-slot.is-generating .p5-ai-candidate-preview, .runtime-image-placeholder)')
    expect(stylesSource).not.toContain('[data-theme="skeuomorphic"] .p5-flow :is(.p5-ai-candidate-slot.is-generating .p5-ai-candidate-preview, .runtime-image-placeholder)')
    expect(stylesSource).not.toContain('[data-theme="skeuomorphic"] .p5-flow :is(.p5-theme-icon-preview.is-placeholder,')
    expect(stylesSource).toContain('radial-gradient(ellipse 17% 21% at 27% 63%, #86A873')
    expect(stylesSource).toContain('filter: blur(10px) saturate(.92);')
    expect(stylesSource).toContain('inset: 0;')
    expect(stylesSource).not.toContain('@keyframes p5-placeholder-image-drift')
    expect(stylesSource).toContain('@keyframes p5-placeholder-scan')
    expect(stylesSource).toContain('50% { transform: translateY(285%); opacity: .9; }')
    expect(stylesSource).toContain('.p5-custom-editor :is(.p5-ai-candidate-slot.is-generating .p5-ai-candidate-preview, .runtime-image-placeholder) .p5-loading-ring')
    expect(stylesSource).toContain('.p5-ai-progress-ring, .p5-loading-ring { position: absolute;')
  })
})

describe('应用偏好入口与主题返回', () => {
  it('将通知与权限放入应用偏好，并在主题选择后返回偏好页', () => {
    expect(appSource).toContain('onNotificationSettings={() => { if (layout) setP7View(\'notifications\'); else setMessage(\'请先选择一台冰箱。\') }}')
    expect(appSource).toContain('onSelect={selectedTheme => { setTheme(selectedTheme); setP7View(\'preferences\') }}')
    expect(appSource).not.toContain('onNotificationSettings,')
    expect(appSource).toContain('<b>当前账号</b>')
    expect(appSource).not.toContain('<b>当前登录账号</b>')
  })
})

describe('我的页当前账号与切换登录', () => {
  const props = {
    theme: 'ink' as const,
    notificationCount: 0,
    onNotifications: () => undefined,
    onAbout: () => undefined,
    onPreferences: () => undefined,
    onHome: () => undefined,
    onRecipes: () => undefined,
    onShopping: () => undefined,
    onSwitchAccount: () => undefined,
  }

  it('显示真实账号、匿名回退和右侧退出图标按钮', () => {
    const signedIn = renderToStaticMarkup(createElement(MeHome, { ...props, account: 'appuser@flycn.fyi' }))
    const anonymous = renderToStaticMarkup(createElement(MeHome, { ...props, account: null }))

    expect(signedIn).toContain('当前账号')
    expect(signedIn).toContain('appuser@flycn.fyi')
    expect(signedIn).toContain('aria-label="切换登录账号"')
    expect(anonymous).toContain('匿名用户')
    expect(signedIn).not.toContain('切换登录账号</b>')
  })

  it('退出图标触发确认切换登录账号页面', () => {
    expect(appSource).toContain('onClick={() => setConfirmingSwitch(true)}')
    expect(appSource).toContain('<ConfirmDialog title="确认切换登录账号"')
    expect(appSource).toContain("'/api/auth/logout'")
    expect(appSource).toContain("'/api/auth/login?prompt=login'")
  })
})

describe('我的冰箱直接拖动排序入口', () => {
  it('把手和布局缩略图是独立拖动热区，不再使用整行长按计时', () => {
    expect(appSource).toContain('className="p71-drag-handle"')
    expect(appSource).toContain('className="p71-layout-drag-source"')
    expect(appSource).toContain('className="p71-leading-drag-source"')
    expect(appSource).toContain('dragPointerIdRef')
    expect(appSource).not.toContain('pressRef')
    expect(appSource).not.toContain('350')
    expect(stylesSource).toContain('.p71-fridge-card { grid-template-columns: 76px minmax(0, 1fr) 48px;')
    expect(stylesSource).toContain('.p71-drag-grip { width: 20px; height: 32px; fill: currentColor; }')
    expect(stylesSource).toContain('.p71-drag-handle, .p71-layout-drag-source { touch-action: none;')
    expect(appSource).toContain('data-pull-refresh-ignore="true"')
    expect(readFileSync(new URL('./sharedUi.tsx', import.meta.url), 'utf8')).toContain('[data-pull-refresh-ignore="true"]')
  })

  it('拖动后将完整顺序提交到服务端，而不是只写入本机存储', () => {
    expect(appSource).toContain("'/api/owner/refrigerator-order'")
    expect(appSource).toContain('refrigerator_ids: ids')
    expect(appSource).toContain('冰箱顺序保存失败')
    expect(appSource).not.toContain('saveRefrigeratorOrder')
  })
})

describe('冰箱布局外框', () => {
  it('恢复冰箱本身外框，首页不再增加额外预览 section', () => {
    expect(stylesSource).toContain('--fridge-frame-radius: 10px')
    expect(stylesSource).toContain('overflow: hidden; border-radius: var(--fridge-frame-radius)')
    expect(stylesSource).toContain('display: block; border-radius: var(--fridge-frame-radius)')
    expect(stylesSource).toContain('.fridge-preview-frame--home { flex: 1; width: auto; height: auto;')
    expect(stylesSource).toContain('.fridge-preview-frame--home .p7-food .food-icon { width: 26px; height: 26px; }')
    expect(stylesSource).not.toContain('.fridge-preview-frame--home .open-fridge-cabinet,')
    expect(fridgePreviewSource).toContain('--fridge-preview-max-width: 100%')
    expect(fridgePreviewSource).toContain('max-width: calc(100% - 8px)')
  })

  it('首页搜索栏下移后预览仍占满并居中剩余空间', () => {
    expect(stylesSource).toContain('.p7-status { gap: 0; min-height: 72px; padding-top: 20px; padding-bottom: 8px; }')
    expect(stylesSource).toContain('.fridge-preview-frame--home { flex: 1; width: auto; height: auto;')
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
  it('通知角标与右箭头保留间距并降低高度', () => {
    expect(stylesSource).toContain('.p7-link-badge { flex: 0 0 auto; height: 16px; margin-left: auto; margin-right: 8px; }')
  })

  it('首页顶部栏和底部导航沿用原外框的内容背景令牌', () => {
    expect(stylesSource).toContain('.p7-shell .app-header, .p7-shell .p7-nav { background: var(--surface); }')
  })

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

  it('切换登录账号必须先经过共享确认弹窗', () => {
    expect(appSource).toContain('setConfirmingSwitch(true)')
    expect(appSource).toContain('<ConfirmDialog title="确认切换登录账号"')
    expect(appSource).toContain('当前账号会在这台设备上退出，之后需要重新登录。确定继续吗？')
  })

  it('刷新中只在下拉区域显示动画，标题不显示重复 spinner', () => {
    const markup = renderToStaticMarkup(createElement(HeaderTitle, { title: '首页', refreshState: 'loading' }))

    expect(markup).toContain('首页')
    expect(markup).not.toContain('header-refresh-spinner')
  })

  it('刷新失败仍渲染可访问的警告徽记', () => {
    const markup = renderToStaticMarkup(createElement(HeaderTitle, { title: '首页', refreshState: 'error' }))

    expect(markup).toContain('class="header-refresh-warning"')
    expect(markup).toContain('aria-label="查看刷新错误"')
    expect(markup).toContain('>!</button>')
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
    expect(listMarkup).toContain('class="p71-drag-handle"')
    expect(listMarkup).toContain('class="p71-layout-drag-source"')
    expect(listMarkup).toContain('aria-label="拖动排序厨房冰箱"')
  })

})

describe('首次未登录首页', () => {
  it('使用设计稿中的应用标记和统一尺寸的主次入口', () => {
    const markup = renderToStaticMarkup(createElement(EmptyOwnerHome, { onScan: () => undefined, onLogin: () => undefined }))

    expect(markup).toContain('class="app-mark"')
    expect(markup).toContain('class="pairing-entry-actions"')
    expect(markup).toContain('class="pairing-primary"')
    expect(markup).toContain('class="pairing-secondary"')
    expect(markup).not.toContain('connection-art')
    expect(stylesSource).toContain('.pairing-empty-content .pairing-entry-actions button { width: 100%; min-height: 48px;')
    expect(stylesSource).toContain('.pairing-empty-content .app-mark { position: relative; width: 124px; height: 164px;')
    expect(stylesSource).toMatch(/\[data-theme="skeuomorphic"\] \.pairing-empty-content \.pairing-secondary \{[^}]*border: 0 !important;[^}]*background: transparent !important;[^}]*box-shadow: none !important;/s)
    expect(stylesSource).toMatch(/\[data-theme="skeuomorphic"\] \.pairing-empty-content \.pairing-secondary::after \{[^}]*background: transparent !important;[^}]*opacity: 0;/s)
  })

  it('移动登录交换期间锁定入口并显示处理中状态', () => {
    const markup = renderToStaticMarkup(createElement(EmptyOwnerHome, {
      onScan: () => undefined,
      onLogin: () => undefined,
      loginPending: true,
    }))

    expect(markup).toContain('正在完成登录…')
    expect(markup).toContain('正在等待登录结果')
    expect(markup).toContain('disabled=""')
    expect(appSource).toContain('const generation = ++ownerLoadGeneration.current')
    expect(appSource).toContain('MOBILE_AUTH_PROGRESS_EVENT')
  })
})

describe('移动端系统栏与安全区', () => {
  it('原生系统栏使用拟物应用壳底色，并让 Android/iOS 共用安全区回退', () => {
    const capacitorConfig = readFileSync(new URL('../capacitor.config.ts', import.meta.url), 'utf8')
    const androidStyles = readFileSync(new URL('../android/app/src/main/res/values/styles.xml', import.meta.url), 'utf8')
    const androidMainActivity = readFileSync(new URL('../android/app/src/main/java/com/fridgeboard/app/MainActivity.java', import.meta.url), 'utf8')
    const androidColors = readFileSync(new URL('../android/app/src/main/res/values/colors.xml', import.meta.url), 'utf8')
    const androidSplash = readFileSync(new URL('../android/app/src/main/res/drawable/splash.xml', import.meta.url), 'utf8')
    const androidTextHandle = readFileSync(new URL('../android/app/src/main/res/drawable/text_select_handle.xml', import.meta.url), 'utf8')
    const iosInfo = readFileSync(new URL('../ios/App/App/Info.plist', import.meta.url), 'utf8')
    const iosLaunchScreen = readFileSync(new URL('../ios/App/App/Base.lproj/LaunchScreen.storyboard', import.meta.url), 'utf8')

    expect(capacitorConfig).toContain("backgroundColor: '#EBE6DD'")
    expect(capacitorConfig).toContain("ios: {\n    backgroundColor: '#EBE6DD'")
    expect(capacitorConfig).toContain("insetsHandling: 'css'")
    expect(capacitorConfig).toContain("style: 'LIGHT'")
    expect(capacitorConfig).toContain("contentInset: 'never'")
    expect(androidColors).toContain('<color name="app_chrome">#EBE6DD</color>')
    expect(androidStyles).toContain('<item name="android:statusBarColor">@color/app_chrome</item>')
    expect(androidStyles).toContain('<item name="android:navigationBarColor">@color/app_chrome</item>')
    expect(androidStyles).not.toContain('<item name="android:statusBarColor">@android:color/transparent</item>')
    expect(androidStyles).toContain('<item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>')
    expect(androidSplash).toContain('<item android:drawable="@color/app_chrome" />')
    expect(androidSplash).toContain('android:src="@drawable/splash_image"')
    expect(androidStyles).toContain('<item name="android:textSelectHandle">@drawable/text_select_handle</item>')
    expect(androidStyles).toContain('<item name="android:textSelectHandleLeft">@drawable/text_select_handle</item>')
    expect(androidStyles).toContain('<item name="android:textSelectHandleRight">@drawable/text_select_handle</item>')
    expect(androidMainActivity).toContain('Build.VERSION.SDK_INT <= Build.VERSION_CODES.Q')
    expect(androidMainActivity).toContain('ViewCompat.setOnApplyWindowInsetsListener(webViewParent')
    expect(androidMainActivity).toContain('view.setPadding(0, 0, 0, 0)')
    expect(androidMainActivity).toContain('Insets.NONE')
    expect(readFileSync(new URL('../android/app/src/main/java/com/fridgeboard/app/NativeCapabilitiesPlugin.java', import.meta.url), 'utf8')).toContain('setSystemBars')
    expect(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8')).toContain('"theme_color": "#EBE6DD"')
    expect(androidStyles).toContain('<item name="colorAccent">@android:color/transparent</item>')
    expect(androidStyles).toContain('<item name="colorControlActivated">@android:color/transparent</item>')
    expect(androidTextHandle).toContain('android:fillColor="@android:color/transparent"')
    expect(androidTextHandle).not.toContain('#FFFFFF')
    expect(iosInfo).toContain('<string>UIStatusBarStyleDarkContent</string>')
    expect(iosLaunchScreen).toContain('red="0.921569" green="0.901961" blue="0.866667"')
    expect(iosLaunchScreen).not.toContain('systemBackgroundColor')
    expect(stylesSource).toContain('--app-safe-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px))')
    expect(stylesSource).toContain('.app-header, .page-header { padding: max(8px, var(--app-safe-top))')
    expect(stylesSource).toContain('.p7-nav { padding-right: max(16px, var(--app-safe-right))')
    expect(stylesSource).toContain('.mobile-page { width: 100%; }')
    expect(stylesSource).toContain('.mobile-page > .mobile-page-body { width: min(100%, 430px); margin-inline: auto; }')
    expect(stylesSource).toContain('.mobile-page:is(.install-guide, .pair-success, .claim-screen, .device-manager, .scanner-screen, .owner-start) > .app-header')
    expect(stylesSource).toContain('[data-keyboard-open="true"] .p7-nav')
    expect(stylesSource).toContain('[data-keyboard-open="true"] .bottom-action-bar')
    expect(stylesSource).toContain('[data-keyboard-open="true"] .p5-note')
    expect(stylesSource).toContain('[data-keyboard-open="true"] .p6-recognition-footer')
    expect(keyboardViewportSource).toContain('scrollIntoView({ block: \'center\', inline: \'nearest\', behavior: \'auto\' })')
    expect(readFileSync(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8')).toContain('android:windowSoftInputMode="adjustResize"')
  })
})

describe('移动端安全存储', () => {
  it('Android 写入检查持久化结果并可恢复永久失效的 Keystore 密钥', () => {
    const androidSecureSession = readFileSync(new URL('../android/app/src/main/java/com/fridgeboard/app/SecureSessionPlugin.java', import.meta.url), 'utf8')

    expect(androidSecureSession).toContain('.setKeySize(256)')
    expect(androidSecureSession).toContain('byte[] iv = cipher.getIV()')
    expect(androidSecureSession).toContain('.commit()')
    expect(androidSecureSession).toContain('secure storage preferences commit failed')
    expect(androidSecureSession).toContain('KeyPermanentlyInvalidatedException')
    expect(androidSecureSession).toContain('resetStorage(getBridge().getContext())')
  })
})

describe('P7.1 冰箱设置加载反馈', () => {
  const device = { id: 'phone-1', kind: 'pwa', label: '家人手机', created_at: '', last_seen_at: null, revoked_at: null, is_current: false }

  it('删除确认态与设置态使用不同页面节点，返回动画不会让设置页保持透明', () => {
    expect(appSource).toContain('<PageShell key="delete-confirmation"')
    expect(appSource).toContain('<PageShell key="settings"')
  })

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
  it('关键词横向列表独立屏蔽页面返回手势', () => {
    const sharedUiSource = readFileSync(new URL('./sharedUi.tsx', import.meta.url), 'utf8')
    const editorSource = readFileSync(new URL('./SubcategoryIconEditor.tsx', import.meta.url), 'utf8')

    expect(sharedUiSource).toContain('[data-edge-swipe-ignore="true"]')
    expect(editorSource).toContain('className="p5-keyword-chips" data-edge-swipe-ignore="true"')
    expect(stylesSource).toContain('padding-bottom: 6px; overflow-x: auto;')
    expect(stylesSource).toContain('.p5-source-status')
  })

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

  it('拟物四个大预览场景按主题启用通用皮肤，缩略图保留 DOM', () => {
    expect(fridgeLayoutSource).toContain("theme === 'skeuomorphic'")
    expect(fridgeLayoutSource).toContain("variant !== 'thumbnail'")
    expect(fridgeLayoutSource).toContain("data-fridge-renderer={useIllustration ? 'illustration' : 'dom'}")
  })

  it('拟物主题控件阴影不应用到透明冰箱格位热区', () => {
    expect(stylesSource).toContain(':not(.fridge-illustration-slot)')
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
  it('优先使用食材分类 ID 对应的分类图标', () => {
    const markup = renderToStaticMarkup(createElement(RecipeIngredientList, {
      ingredients: [{ subcategory_name: '京葱', quantity: 1, subcategory_id: 'builtin-spice' }],
      categories: [{ id: 'builtin-spice', icon_key: 'scallion-ginger' }],
      inventory: [],
      icons: [{ key: 'scallion-ginger', label: '香辛', asset_url: '/icons/scallion-ginger.svg' }],
    }))

    expect(markup).toContain('/icons/scallion-ginger.svg')
  })

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

  it('完成食谱为全部食材标记完成态', () => {
    const markup = renderToStaticMarkup(createElement(RecipeIngredientList, {
      ingredients: [{ subcategory_name: '鸡蛋', quantity: 2 }],
      inventory: [],
      icons: [],
      completed: true,
    }))

    expect(markup).toContain('class="p9-ingredient-list is-complete"')
    expect(markup).toContain('class="p9-ingredient-chip"')
  })
})

describe('RestockMissingLine', () => {
  it('将同一道食谱的缺少项目合并到一行并允许文本自然换行', () => {
    const markup = renderToStaticMarkup(createElement(RestockMissingLine, {
      missing: [
        { subcategory_name: '手抓饭', quantity: 1 },
        { subcategory_name: '牛肉', quantity: 2 },
      ],
      inventory: [{ item_name: '手抓饭', icon_key: 'rice' }],
      icons: [{ key: 'rice', label: '米饭', asset_url: '/icons/rice.svg' }],
    }))

    expect(markup).toContain('class="p9-restock-missing"')
    expect(markup).toContain('class="p9-restock-item"')
    expect(markup).toContain('class="p9-restock-item-icon"')
    expect(markup).toContain('src="/icons/rice.svg"')
    expect(markup).toContain('手抓饭 × 1')
    expect(markup).toContain('牛肉 × 2')
    expect(markup).not.toContain('缺少')
  })
})

describe('CustomShoppingList', () => {
  it('未分类自定义购物项不通过同名库存推断图标', () => {
    const markup = renderToStaticMarkup(createElement(CustomShoppingList, {
      items: [{ id: 'shopping-1', item_name: '鸡蛋', quantity: 1, display_order: 0, subcategory_id: null }],
      inventory: [{ item_name: '鸡蛋', icon_key: 'egg' }],
      icons: [{ key: 'egg', label: '鸡蛋', asset_url: '/icons/egg.svg' }],
    }))

    expect(markup).toContain('鸡蛋 × 1')
    expect(markup).not.toContain('p9-restock-item-icon')
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
    expect(markup).toContain('<h2>周一</h2><button class="p9-add-day-button"')
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
    expect(markup).toContain('class="p9-remove-shopping-row"')
    expect(markup).toContain('class="p9-add-shopping-row"')
  })
})

describe('食谱食材分类入口', () => {
  it('使用带下划线的分类链接，并为分类选择保留可访问名称', () => {
    const markup = renderToStaticMarkup(createElement(RecipeIngredientEditorRow, {
      ingredient: { subcategory_name: '鸡蛋', quantity: 2, subcategory_id: 'category-egg' },
      index: 0,
      completed: false,
      categoryName: '蛋类',
      matchText: '分类：蛋类',
      onCategoryClick: () => undefined,
      onNameChange: () => undefined,
      onNameBlur: () => undefined,
      onQuantityChange: () => undefined,
      onRemove: () => undefined,
    }))

    expect(markup).toContain('class="p9-category-link"')
    expect(markup).toContain('class="p9-remove-ingredient"')
    expect(markup).toContain('aria-label="修改蛋类分类"')
    expect(markup).toContain('>分类：蛋类</button>')
    expect(markup).not.toContain('分类：蛋类</small>')
    expect(stylesSource).toContain('text-decoration: underline')
    expect(stylesSource).toContain('box-shadow: none !important; filter: none !important; font: inherit; font-size: 12px; font-weight: 400;')
    expect(stylesSource).toContain('[data-theme="skeuomorphic"] .p9-remove-ingredient svg')
    expect(stylesSource).toContain('max-height: min(600px, calc(100dvh - 80px))')
  })

  it('食材名称输入过程中不启动分类匹配，失去焦点后才匹配且行不会因改名重建', () => {
    expect(recipeWorkspaceSource).toContain('onBlur={event => onNameBlur(event.target.value)}')
    expect(recipeWorkspaceSource).toContain("const key = `${editing.id || 'new'}:${index}`")
    expect(recipeWorkspaceSource).not.toContain('editingIngredientNames')
    expect(recipeWorkspaceSource).not.toContain('const timer = window.setTimeout(() => {\n        const controller = new AbortController()')
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
  it('首页搜索行不显示临期、过期和通知标识', () => {
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
      onInstallEventConsumed: () => undefined, onScan: () => undefined, onInventory: () => undefined,
      onSlot: () => undefined, onFridgeList: () => undefined, onSwipeFridge: () => undefined, fridgeSwipeTransition: { direction: 'next', phase: 'exit' }, onRefresh: () => undefined, onRecipes: () => undefined, onShopping: () => undefined, onMe: () => undefined, onSearch: () => undefined,
    }))

    expect(markup).toContain('data-icon="lucide:layout-list"')
    expect(markup).toContain('aria-label="查看全部物品列表"')
    expect(markup).toContain('data-icon="lucide:scan-line"')
    expect(markup).toContain('aria-label="扫码添加物品"')
    expect(markup.indexOf('aria-label="查看全部物品列表"')).toBeLessThan(markup.indexOf('aria-label="扫码添加物品"'))
    expect(markup).toContain('class="header-title-trigger"')
    expect(markup).toContain('data-icon="lucide:chevron-down"')
    expect(markup).toContain('aria-label="打开我的冰箱"')
    expect(markup).not.toContain('data-icon="lucide:plus"')
    expect(markup).not.toContain('aria-label="添加物品"')
    expect(markup).not.toContain('data-icon="solar:fridge-outline"')
    expect(markup).not.toContain('class="p7-inventory-summary"')
    expect(markup).not.toContain('件物品')
    expect(markup).not.toContain('class="p7-primary"')
    expect(markup).not.toContain('data-icon="iconoir:clock"')
    expect(markup).not.toContain('data-icon="ant-design:warning-outlined"')
    expect(markup).not.toContain('p7-risk-count')
    expect(markup).toContain('p7-nav-badge')
    expect(markup).toContain('aria-label="我的，有 1 条通知"')
    expect(markup).toContain('class="fridge-preview-frame fridge-preview-frame--home mini p7-fridge-swipe-exit-next"')
    expect(markup).not.toContain('horizontal-swipe-area')
    expect(markup).toContain('type="button"')
  })

  it('通知数量只显示在底部“我的”入口', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => null, setItem: () => undefined } })
    const props = {
      refrigerator: { id: 'fridge-1', name: '家里冰箱', revision: 1, setup_status: 'ready' as const, display_device_status: 'bound' as const, access_role: 'owner' as const },
      layout: { refrigerator_id: 'fridge-1', template_key: 'mini' as const, revision: 1, zones: [] }, homeInventory: [], icons: [],
      refreshState: 'idle' as const, refreshError: '', installEvent: null, installed: true,
      onInstallEventConsumed: () => undefined, onScan: () => undefined, onInventory: () => undefined,
      onSlot: () => undefined, onFridgeList: () => undefined, onSwipeFridge: () => undefined, fridgeSwipeTransition: null, onRefresh: () => undefined, onRecipes: () => undefined, onShopping: () => undefined, onMe: () => undefined, onSearch: () => undefined,
    }
    const withoutNotification = renderToStaticMarkup(createElement(FridgeHome, { ...props, notifications: [] }))
    const withNotification = renderToStaticMarkup(createElement(FridgeHome, { ...props, notifications: [{ kind: 'food', title: '有物品需要留意', body: '鲜牛奶临期。' }] }))

    expect(withoutNotification).not.toContain('p7-status-notice')
    expect(withoutNotification).not.toContain('首页提示')
    expect(withNotification).toContain('p7-nav-badge')
    expect(withNotification).toContain('aria-label="我的，有 1 条通知"')
    expect(withNotification).not.toContain('p7-status-notice')
  })

  it('通知页展示各类消息并提供空状态', () => {
    const refrigerator = { id: 'fridge-1', name: '家里冰箱', revision: 1, setup_status: 'ready' as const, display_device_status: 'bound' as const, access_role: 'owner' as const }
    const withMessages = renderToStaticMarkup(createElement(NotificationsPage, { refrigerator, notifications: [{ kind: 'food', title: '有物品需要留意', body: '鲜牛奶临期。' }, { kind: 'device_health', title: '冰箱端今天尚未同步', body: '请检查网络。' }], onBack: () => undefined }))
    const empty = renderToStaticMarkup(createElement(NotificationsPage, { refrigerator, notifications: [], onBack: () => undefined }))

    expect(withMessages).toContain('通知列表')
    expect(withMessages).toContain('p7-context-icon')
    expect(withMessages).not.toContain('▯')
    expect(withMessages).toContain('食品提醒')
    expect(withMessages).toContain('设备提醒')
    expect(withMessages).toContain('鲜牛奶临期。')
    expect(empty).toContain('目前没有新的通知')
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
      item_name: '已喝完牛奶', quantity: 0, production_date: '2026-08-01', best_before: '2026-08-20', product_description: null,
      barcode: null, expiry_status: null,
    }
    const availableItem = { ...zeroItem, id: 'available-milk', item_name: '还有牛奶', quantity: 2, production_date: null, best_before: null }
    const markup = renderToStaticMarkup(createElement(InventoryList, {
      inventory: [zeroItem, availableItem], icons: [], title: '全部物品', onBack: () => undefined, onAdd: () => undefined,
      onSelect: () => undefined, onSaveQuantity: async () => true,
    }))

    expect(markup).toContain('共 1 件物品')
    expect(markup).not.toContain('共 2 件物品')
    expect(markup).toContain('已喝完牛奶')
    expect(markup).not.toContain('已添加')
    expect(markup).not.toContain('还剩')
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

  it('将冰箱名称和右箭头限制在物品行的第三列内', () => {
    expect(stylesSource).toContain('.p5-inventory-fridge { grid-column: 3; grid-row: 1; min-width: 0; width: 100%; box-sizing: border-box;')
    expect(stylesSource).not.toContain('width: 160px; min-height: 28px; display: flex;')
    expect(stylesSource).not.toContain('.p5-inventory-fridge { width: 144px; }')
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

describe('扫码调用方返回', () => {
  it('InventoryFlow 的外层返回目标由调用入口保存，首页扫码关闭后回首页', () => {
    expect(appSource).toContain("const [inventoryReturnView, setInventoryReturnView] = useState<'home' | 'search'>('home')")
    expect(appSource).toContain('setP7View(inventoryReturnView)')
    expect(appSource).toContain("setInventoryReturnView('home')")
    expect(appSource).toContain("setInventoryReturnView('search')")
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

  it('首页扫码入口直接打开现有识别页，并在识别后保留位置确认流程', () => {
    const markup = renderToStaticMarkup(createElement(InventoryFlow, {
      layout: {
        refrigerator_id: 'fridge-1', template_key: 'mini', revision: 1,
        zones: [{ key: 'cold', label: '冷藏室', temperature_mode: 'cold', is_door: false, geometry: { x: 0, y: 0, width: 100, height: 100, layout_kind: 'vertical' }, slots: [{ id: 'cold-1', key: 'cold-1' }] }],
      },
      categories: [{ id: 'milk', parent_id: 'group', name: '奶品', icon_key: 'milk', is_custom: false }],
      icons: [], inventory: [], refrigerator: { id: 'fridge-1', name: '家里冰箱', revision: 1, setup_status: 'ready', display_device_status: 'bound', access_role: 'owner' }, saving: false,
      initialView: 'recognition', onBack: () => undefined, onSelectFridge: () => undefined,
      onCreateCategory: async () => undefined, onCatalogChanged: async () => undefined, onSave: async () => true, onDelete: async () => true,
    }))

    expect(markup).toContain('p6-recognition')
    expect(markup).toContain('>扫码</button>')
    expect(markup).toContain('>照片</button>')
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
    expect(isFridgeBoardAppCache('fridgeboard-app-v4')).toBe(true)
    expect(isFridgeBoardAppCache('other-app-v1')).toBe(false)
  })
})

describe('PWA 静态资源缓存策略', () => {
  it('常规启动不等待 Service Worker 注册，注册失败不影响首屏', () => {
    const renderIndex = mainSource.indexOf('createRoot(')
    const registerIndex = mainSource.indexOf('navigator.serviceWorker.register')

    expect(renderIndex).toBeGreaterThan(-1)
    expect(registerIndex).toBeGreaterThan(renderIndex)
    expect(mainSource.slice(registerIndex)).toContain('.catch(() => undefined)')
    expect(mainSource).toContain("isAppRelease(APP_RELEASE)")
    expect(mainSource).toContain("!import.meta.env.DEV && isAppRelease(APP_RELEASE)")
  })

  it('页面导航缓存优先并后台刷新，哈希资源和图标缓存优先，业务 API 不进入缓存', () => {
    expect(serviceWorkerSource).toContain("const CACHE_NAME = `fridgeboard-app-${RELEASE}`")
    expect(serviceWorkerSource).toContain('async function cacheFirstNavigation(request)')
    expect(serviceWorkerSource).toContain('async function refreshNavigationCache(request, cache, previousResponse)')
    expect(serviceWorkerSource).toContain('void refreshNavigationCache(request, cache, cached)')
    expect(serviceWorkerSource).toContain("client.postMessage({ type: 'APP_SHELL_UPDATED' })")
    expect(serviceWorkerSource).toContain("fetch(request, { cache: 'no-store' })")
    expect(serviceWorkerSource).toContain("await cache.put('/index.html', response.clone())")
    expect(serviceWorkerSource).toContain("if (request.mode === 'navigate')")
    expect(mainSource).toContain("`/sw.js?release=${encodeURIComponent(APP_RELEASE)}`")
    expect(mainSource).toContain("serviceWorker.register(serviceWorkerUrl, { scope: '/', updateViaCache: 'none' })")
    expect(serviceWorkerSource).toContain('const cached = await cache.match(request)')
    expect(serviceWorkerSource).toContain('if (isIconAsset) {')
    expect(serviceWorkerSource).toContain("if (url.pathname.startsWith('/api/') && !isIconAsset) return")
    expect(serviceWorkerSource).toContain("key.startsWith('fridgeboard-app-') && key !== CACHE_NAME")
    expect(serviceWorkerSource).not.toContain("event.respondWith(cacheFirst(request).catch")
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
