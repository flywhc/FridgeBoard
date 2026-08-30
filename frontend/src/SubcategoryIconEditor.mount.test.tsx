import { act, createElement, type ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  streamRequest: vi.fn(),
  fetchRuntimeAsset: vi.fn(),
  pickNativeImage: vi.fn(),
  prepareIconImage: vi.fn(),
}))

vi.mock('./appApi', () => mocks)
vi.mock('./nativeBridge', () => ({ pickNativeImage: mocks.pickNativeImage }))
vi.mock('./iconImage', () => ({ prepareIconImage: mocks.prepareIconImage }))
vi.mock('./runtime', () => ({ appRuntime: { kind: 'pwa', apiOrigin: null } }))
vi.mock('./iconVariants', () => ({ resolveIconVariant: (icon: { asset_url: string; media_type?: string }) => ({ assetUrl: icon.asset_url, mediaType: icon.media_type ?? 'image/svg+xml', isFallback: false }) }))
vi.mock('./sharedUi', () => ({
  PageHeader: ({ title, onBack, right }: { title: ReactNode; onBack?: () => void; right?: ReactNode }) => createElement('header', null, onBack && createElement('button', { type: 'button', onClick: onBack, 'aria-label': '返回' }, '返回'), title, right),
  PageShell: ({ header, footer, children }: { header: ReactNode; footer?: ReactNode; children: ReactNode }) => createElement('main', null, header, createElement('section', null, children), footer),
  Dialog: ({ title, onClose, children }: { title: ReactNode; onClose?: () => void; children: ReactNode }) => createElement('section', { role: 'dialog', 'aria-modal': 'true' }, createElement('h2', null, title), onClose && createElement('button', { type: 'button', onClick: onClose }, '关闭'), children),
  RuntimeImage: ({ src, alt }: { src: string; alt: string }) => createElement('img', { src, alt }),
  OptionPickerField: ({ label, value, options, onChange, disabled }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void; disabled?: boolean }) => createElement('label', null, label, createElement('select', { value, disabled, onChange: (event: { target: { value: string } }) => onChange(event.target.value) }, options.map(option => createElement('option', { key: option.value, value: option.value }, option.label))),),
}))

class TestNode {
  nodeType: number
  nodeName: string
  ownerDocument: TestDocument
  parentNode: TestNode | null = null
  childNodes: TestNode[] = []
  listeners = new Map<string, Set<(event: unknown) => void>>()
  constructor(nodeName: string, ownerDocument: TestDocument, nodeType = 1) {
    this.nodeName = nodeName.toUpperCase()
    this.ownerDocument = ownerDocument
    this.nodeType = nodeType
  }
  appendChild<T extends TestNode>(node: T): T { node.parentNode = this; this.childNodes.push(node); return node }
  insertBefore<T extends TestNode>(node: T, before: TestNode | null): T { node.parentNode = this; const index = before ? this.childNodes.indexOf(before) : -1; if (index < 0) this.childNodes.push(node); else this.childNodes.splice(index, 0, node); return node }
  removeChild<T extends TestNode>(node: T): T { const index = this.childNodes.indexOf(node); if (index >= 0) this.childNodes.splice(index, 1); node.parentNode = null; return node }
  addEventListener(name: string, listener: (event: unknown) => void): void { const listeners = this.listeners.get(name) ?? new Set(); listeners.add(listener); this.listeners.set(name, listeners) }
  removeEventListener(name: string, listener: (event: unknown) => void): void { this.listeners.get(name)?.delete(listener) }
  contains(node: TestNode): boolean { return this === node || this.childNodes.some(child => child.contains(node)) }
  get firstChild(): TestNode | null { return this.childNodes[0] ?? null }
  get textContent(): string { return this.childNodes.map(child => child.textContent).join('') }
  set textContent(value: string) { this.childNodes = value ? [new TestTextNode(value, this.ownerDocument)] : [] }
  focus(): void { if (this instanceof TestElement) this.ownerDocument.activeElement = this }
  getRootNode(): TestNode { return this.parentNode ? this.parentNode.getRootNode() : this }
}

class TestTextNode extends TestNode {
  value: string
  constructor(value: string, ownerDocument: TestDocument) { super('#text', ownerDocument, 3); this.value = value }
  get textContent(): string { return this.value }
  set textContent(value: string) { this.value = value }
}

class TestElement extends TestNode {
  attributes = new Map<string, string>()
  style = { cssText: '', setProperty: () => undefined, removeProperty: () => undefined }
  namespaceURI: string | null = 'http://www.w3.org/1999/xhtml'
  tagName: string
  constructor(tagName: string, ownerDocument: TestDocument, namespaceURI?: string) { super(tagName, ownerDocument); this.tagName = tagName.toUpperCase(); this.namespaceURI = namespaceURI ?? this.namespaceURI }
  get options(): TestElement[] { return this.childNodes.filter((child): child is TestElement => child instanceof TestElement) }
  setAttribute(name: string, value: string): void { this.attributes.set(name, String(value)) }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null }
  getAttributeNames(): string[] { return [...this.attributes.keys()] }
  removeAttribute(name: string): void { this.attributes.delete(name) }
  setAttributeNS(_namespace: string | null, name: string, value: string): void { this.setAttribute(name, value) }
  removeAttributeNS(_namespace: string | null, name: string): void { this.removeAttribute(name) }
}

class TestDocument extends TestNode {
  defaultView: Record<string, unknown>
  documentElement: TestElement
  head: TestElement
  body: TestElement
  activeElement: TestElement
  readyState = 'complete'
  constructor() {
    super('#document', undefined as unknown as TestDocument, 9)
    this.ownerDocument = this
    this.defaultView = {}
    this.documentElement = new TestElement('html', this)
    this.head = new TestElement('head', this)
    this.body = new TestElement('body', this)
    this.documentElement.appendChild(this.head)
    this.documentElement.appendChild(this.body)
    this.appendChild(this.documentElement)
    this.activeElement = this.body
  }
  createElement(tagName: string): TestElement { return new TestElement(tagName, this) }
  createElementNS(namespaceURI: string, tagName: string): TestElement { return new TestElement(tagName, this, namespaceURI) }
  createTextNode(value: string): TestTextNode { return new TestTextNode(value, this) }
  querySelector(): TestElement | null { return null }
}

function installDom(): TestDocument {
  const documentRef = new TestDocument()
  const windowRef: Record<string, unknown> = { document: documentRef, addEventListener: () => undefined, removeEventListener: () => undefined, setTimeout, clearTimeout }
  documentRef.defaultView = windowRef
  const globals = globalThis as unknown as Record<string, unknown>
  globals.document = documentRef
  globals.window = windowRef
  Object.defineProperty(globals, 'navigator', { configurable: true, value: { onLine: true, userAgent: 'test' } })
  globals.Node = TestNode
  globals.Element = TestElement
  globals.HTMLElement = TestElement
  globals.SVGElement = TestElement
  globals.HTMLIFrameElement = TestElement
  windowRef.HTMLIFrameElement = TestElement
  windowRef.Node = TestNode
  windowRef.HTMLElement = TestElement
  windowRef.Element = TestElement
  globals.Text = TestTextNode
  globals.IS_REACT_ACT_ENVIRONMENT = true
  globals.requestAnimationFrame = (callback: FrameRequestCallback) => setTimeout(callback, 0)
  globals.cancelAnimationFrame = (id: number) => clearTimeout(id)
  return documentRef
}

function findNode(root: TestNode, predicate: (node: TestElement) => boolean): TestElement | null {
  for (const child of root.childNodes) {
    if (child instanceof TestElement && predicate(child)) return child
    const nested = findNode(child, predicate)
    if (nested) return nested
  }
  return null
}

function findNodes(root: TestNode, predicate: (node: TestElement) => boolean): TestElement[] {
  const matches: TestElement[] = []
  for (const child of root.childNodes) {
    if (child instanceof TestElement) {
      if (predicate(child)) matches.push(child)
      matches.push(...findNodes(child, predicate))
    }
  }
  return matches
}

function findText(root: TestNode, text: string): TestElement | null {
  return findNode(root, node => node.tagName === 'BUTTON' && node.textContent.trim() === text)
}

function reactProps(node: TestElement | null): Record<string, unknown> | null {
  if (!node) return null
  const key = Object.keys(node).find(name => name.startsWith('__reactProps$'))
  return key ? (node as unknown as Record<string, Record<string, unknown>>)[key] : null
}

function invoke(node: TestElement | null, eventName: string, event: unknown = {}): void {
  const handler = reactProps(node)?.[eventName]
  if (typeof handler === 'function') handler(event)
}

async function flush(): Promise<void> {
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
}

const baseDraft = {
  id: 'draft-1', category_id: null, parent_id: 'group-1', name: '牛奶', fallback_theme: 'skeuomorphic', version: 1,
  variants: { ink: { asset_url: '/icons/milk.svg', media_type: 'image/svg+xml', source: 'library', source_id: 'milk' } },
}

describe('SubcategoryIconEditor 挂载交互', () => {
  let SubcategoryIconEditor: typeof import('./SubcategoryIconEditor').SubcategoryIconEditor
  let createRoot: typeof import('react-dom/client').createRoot
  let documentRef: TestDocument
  beforeAll(async () => {
    documentRef = installDom()
    ;({ createRoot } = await import('react-dom/client'))
    ;({ SubcategoryIconEditor } = await import('./SubcategoryIconEditor'))
  })
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.request.mockImplementation((path: string, init?: RequestInit) => {
      if (path.includes('/recognize-items')) return Promise.resolve({ category_id: 'custom-1', category_name: '牛奶', items: [] })
      if (path.endsWith('/icon-drafts') && init?.method === 'POST') return Promise.resolve({ ...baseDraft })
      if (path.endsWith('/icon-models')) return Promise.resolve([{ id: 'agnes', label: 'Agnes', capabilities: ['svg', 'image'] }])
      if (path.endsWith('/icon-keywords')) return Promise.resolve({ keywords: ['milk', 'dairy'] })
      if (path.includes('/icon-search?')) return Promise.resolve({ results: [] })
      if (path.includes('/icon-drafts/') && path.endsWith('/variants')) return Promise.resolve({ ...baseDraft })
      if (path.includes('/icon-drafts/') && path.includes('/variants/upload')) return Promise.resolve({ ...baseDraft })
      return Promise.resolve(undefined)
    })
    mocks.streamRequest.mockResolvedValue({ id: 'generation-1', candidates: [{ id: 'candidate-1', asset_url: '/candidate.svg', media_type: 'image/svg+xml' }] })
    mocks.fetchRuntimeAsset.mockResolvedValue(new Blob(['<svg/>'], { type: 'image/svg+xml' }))
    mocks.prepareIconImage.mockResolvedValue({ file: new File(['normalized'], 'icon.png', { type: 'image/png' }), width: 256, height: 128, backgroundRemoved: false })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-icon')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  })

  function renderEditor(onCancel = vi.fn(), overrides: Record<string, unknown> = {}) {
    const container = documentRef.createElement('div')
    documentRef.body.appendChild(container)
    const root = createRoot(container as unknown as Element)
    root.render(createElement(SubcategoryIconEditor, {
      refrigeratorId: 'fridge-1', parentId: 'group-1', parents: [{ id: 'group-1', parent_id: null, name: '点心奶品', icon_key: null, is_custom: false }, { id: 'group-2', parent_id: null, name: '粮油酱料', icon_key: null, is_custom: false }], initialName: '牛奶', theme: 'ink', icons: [{ key: 'milk', label: '牛奶', asset_url: '/icons/milk.svg' }],
      onCatalogChanged: async () => undefined, onComplete: () => undefined, onCancel,
      ...overrides,
    }))
    return { container, root }
  }

  it('取消前不会创建或删除服务端 draft', async () => {
    const { root, container } = renderEditor()
    await flush()
    const back = findNode(container, node => node.getAttribute('aria-label') === '返回')
    expect(back).not.toBeNull()
    expect(findNode(container, node => node.getAttribute('aria-label') === '关闭')).toBeNull()
    await act(async () => { invoke(back, 'onClick'); await Promise.resolve(); await Promise.resolve() })
    expect(mocks.request.mock.calls.some(([path]) => String(path).includes('/icon-drafts'))).toBe(false)
    await act(async () => { root.unmount(); await Promise.resolve() })
  })

  it('系统图标同名时拒绝用其他图库图标确认', async () => {
    const { root, container } = renderEditor(vi.fn(), {
      initialName: '杂粮',
      icons: [
        { key: 'bean', label: '杂粮', asset_url: '/api/icon-library/bean.svg' },
        { key: 'egg', label: '鸡蛋', asset_url: '/api/icon-library/egg.svg' },
      ],
    })
    await flush()
    expect(container.textContent).toContain('系统图标“杂粮”已存在，请在图库中选择并复用该图标。')
    await act(async () => { invoke(findText(container, '鸡蛋'), 'onClick'); await Promise.resolve() })
    await flush()
    await act(async () => {
      invoke(findText(container, '创建并识别此类物品'), 'onClick')
      await Promise.resolve()
    })
    await flush()
    expect(container.textContent).toContain('系统图标“杂粮”已存在，请在图库中选择并复用该图标。')
    expect(mocks.request.mock.calls.some(([path]) => String(path).endsWith('/icon-drafts'))).toBe(false)
    await act(async () => { root.unmount(); await Promise.resolve() })
  })

  it('未修改的小类可直接识别，确认后才刷新目录并返回', async () => {
    let resolveRecognition: ((value: unknown) => void) | undefined
    const recognition = new Promise<unknown>(resolve => { resolveRecognition = resolve })
    mocks.request.mockImplementation((path: string) => {
      if (path.includes('/recognize-items')) return recognition
      if (path.endsWith('/icon-models')) return Promise.resolve([])
      return Promise.resolve(undefined)
    })
    const onCatalogChanged = vi.fn(async () => undefined)
    const onComplete = vi.fn()
    const { root, container } = renderEditor(vi.fn(), {
      initialCategory: { id: 'custom-1', parent_id: 'group-1', name: '牛奶', icon_key: 'milk', is_custom: true, revision: 1, fallback_theme: 'ink' },
      icons: [{ key: 'milk', label: '牛奶', asset_url: '/icons/milk.svg', variants: { ink: { asset_url: '/icons/milk.svg', media_type: 'image/svg+xml', source: 'library' } } }],
      onCatalogChanged,
      onComplete,
    })
    await flush()
    const recognize = findText(container, '识别此类物品')
    await act(async () => { invoke(recognize, 'onClick'); await Promise.resolve() })
    expect(container.textContent).toContain('正在识别此类物品')
    expect(onCatalogChanged).not.toHaveBeenCalled()

    await act(async () => {
      resolveRecognition?.({ category_id: 'custom-1', category_name: '牛奶', items: [{ item_name: '牛奶', source: 'current' }] })
      await Promise.resolve()
    })
    await flush()
    expect(container.textContent).toContain('识别完成')
    expect(container.textContent).toContain('牛奶')
    await act(async () => { invoke(findText(container, '确认'), 'onClick'); await Promise.resolve() })
    await flush()
    expect(onCatalogChanged).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ id: 'custom-1' }))
    await act(async () => { root.unmount(); await Promise.resolve() })
  })

  it('点击所属大类后可切换选项，编辑保存请求使用新大类', async () => {
    const { root, container } = renderEditor(vi.fn(), {
      initialCategory: { id: 'custom-1', parent_id: 'group-1', name: '牛奶', icon_key: 'milk', is_custom: true, revision: 1, fallback_theme: 'ink' },
      icons: [{ key: 'milk', label: '牛奶', asset_url: '/icons/milk.svg', variants: { ink: { asset_url: '/icons/milk.svg', media_type: 'image/svg+xml', source: 'library' } } }],
    })
    await flush()
    const parentPicker = findNode(container, node => node.tagName === 'SELECT' && reactProps(node)?.value === 'group-1')
    expect(parentPicker).not.toBeNull()
    await act(async () => { invoke(parentPicker, 'onChange', { target: { value: 'group-2' } }); await Promise.resolve() })
    await flush()
    const save = findText(container, '保存并更新物品')
    expect(reactProps(save)?.disabled).toBe(false)
    await act(async () => { invoke(save, 'onClick'); await Promise.resolve(); await Promise.resolve() })
    await flush()
    const confirmCall = mocks.request.mock.calls.find(([path]) => String(path).endsWith('/confirm'))
    expect(confirmCall).toBeDefined()
    expect(JSON.parse(String((confirmCall?.[1] as RequestInit).body))).toEqual(expect.objectContaining({ parent_id: 'group-2' }))
    await act(async () => { root.unmount(); await Promise.resolve() })
  })

  it('三主题槽位显示专用图标勾选和自动借用问号', async () => {
    const { root, container } = renderEditor(vi.fn(), {
      initialCategory: { id: 'custom-1', parent_id: 'group-1', name: '牛奶', icon_key: 'milk', is_custom: true, revision: 1, fallback_theme: 'ink' },
      icons: [{ key: 'milk', label: '牛奶', asset_url: '/icons/milk.svg', variants: { ink: { asset_url: '/icons/milk.svg', media_type: 'image/svg+xml', source: 'library' } } }],
    })
    await flush()
    await flush()
    const slots = findNodes(container, node => node.getAttribute('class')?.split(' ').includes('p5-theme-icon-slot') ?? false)
    expect(slots).toHaveLength(3)
    expect(findNode(container, node => node.getAttribute('aria-label') === '水墨主题图标已选择')).not.toBeNull()
    expect(findNode(container, node => node.getAttribute('aria-label') === '拟物主题借用水墨图标，待确认')).not.toBeNull()
    expect(findNode(container, node => node.getAttribute('aria-label') === '卡通主题借用水墨图标，待确认')).not.toBeNull()
    expect(findNodes(container, node => node.getAttribute('class')?.startsWith('p5-theme-icon-status') ?? false)).toHaveLength(3)
    expect(findNodes(container, node => (node.getAttribute('class')?.split(' ').includes('p5-theme-icon-slot') ?? false) && (node.getAttribute('class')?.includes('is-borrowed') ?? false))).toHaveLength(2)
    expect(findNodes(container, node => node.tagName === 'BUTTON' && node.getAttribute('class') === 'p5-theme-icon-status is-borrowed')).toHaveLength(2)
    expect(findNodes(container, node => node.tagName === 'B' && ['拟物', '水墨', '卡通'].includes(node.textContent))).toHaveLength(0)
    expect(container.textContent).not.toContain('当前主题未设置')
    expect(container.textContent).not.toContain('将借用')
    expect(container.textContent).not.toContain('三主题汇总')
    await act(async () => { root.unmount(); await Promise.resolve() })
  })

  it('点击借用问号打开只列出已选主题的模态框并可切换借用主题', async () => {
    const { root, container } = renderEditor(vi.fn(), {
      initialCategory: { id: 'custom-1', parent_id: 'group-1', name: '牛奶', icon_key: 'milk', is_custom: true, revision: 1, fallback_theme: 'ink' },
      icons: [{ key: 'milk', label: '牛奶', asset_url: '/icons/milk.svg', variants: { ink: { asset_url: '/icons/milk.svg', media_type: 'image/svg+xml', source: 'library' } } }],
    })
    await flush()
    await flush()
    const borrowedStatus = findNode(container, node => node.tagName === 'BUTTON' && node.getAttribute('class') === 'p5-theme-icon-status is-borrowed')
    expect(borrowedStatus).not.toBeNull()
    await act(async () => { invoke(borrowedStatus, 'onClick'); await Promise.resolve() })
    const dialog = findNode(container, node => node.getAttribute('role') === 'dialog')
    expect(dialog).not.toBeNull()
    expect(dialog?.textContent).toContain('使用其他主题图标')
    const options = findNodes(dialog!, node => node.getAttribute('role') === 'option')
    expect(options).toHaveLength(1)
    expect(options[0].textContent).toBe('水墨')
    await act(async () => { invoke(options[0], 'onClick'); await Promise.resolve() })
    expect(findNode(container, node => node.getAttribute('role') === 'dialog')).toBeNull()
    await act(async () => { root.unmount(); await Promise.resolve() })
  })

  it('卸载会清理 AI generation 和本地 ObjectURL，但不删除前端 draft', async () => {
    const { root, container } = renderEditor()
    await flush()
    const aiTab = findText(container, 'AI')
    await act(async () => { invoke(aiTab, 'onClick'); await Promise.resolve() })
    await flush()
    const generate = findText(container, '开始生成')
    await act(async () => { invoke(generate, 'onClick'); await Promise.resolve(); await Promise.resolve() })
    await flush()
    const localTab = findText(container, '本地')
    await act(async () => { invoke(localTab, 'onClick'); await Promise.resolve() })
    const photoInput = findNode(container, node => node.tagName === 'INPUT' && reactProps(node)?.type === 'file' && reactProps(node)?.accept === 'image/*')
    const fileInput = findNode(container, node => node.tagName === 'INPUT' && reactProps(node)?.type === 'file' && reactProps(node)?.accept === 'image/png,image/jpeg,image/webp')
    expect(photoInput).not.toBeNull()
    expect(fileInput).not.toBeNull()
    await act(async () => { (reactProps(fileInput)?.onChange as ((event: unknown) => void) | undefined)?.({ target: { files: [new File(['x'], 'icon.png', { type: 'image/png' })] } }); await Promise.resolve() })
    root.unmount()
    await flush()
    expect(mocks.request).toHaveBeenCalledWith('/api/owner/refrigerators/fridge-1/icon-candidates/generation-1', { method: 'DELETE' })
    expect(mocks.request.mock.calls.some(([path]) => String(path).includes('/icon-drafts'))).toBe(false)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-icon')
  })

  it('AI 页先显示四个占位位，生成中可停止并保留已到达候选', async () => {
    let emit: ((event: { type: string; data: Record<string, unknown> }) => void) | undefined
    mocks.streamRequest.mockImplementation((_path: string, init: RequestInit, onEvent: (event: { type: string; data: Record<string, unknown> }) => void) => {
      emit = onEvent
      onEvent({ type: 'start', data: { generation_id: 'generation-live', total: 4, completed: 0 } })
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('请求被取消')), { once: true })
      })
    })
    const { root, container } = renderEditor()
    await flush()
    await act(async () => { invoke(findText(container, 'AI'), 'onClick'); await Promise.resolve() })
    await flush()
    const aiGrid = findNode(container, node => node.getAttribute('class') === 'p5-ai-candidate-grid')
    expect(aiGrid).not.toBeNull()
    expect(findNodes(aiGrid!, node => node.getAttribute('class') === 'p5-theme-icon-preview is-placeholder')).toHaveLength(4)
    expect(findNodes(aiGrid!, node => node.tagName === 'B' && node.textContent === '')).toHaveLength(4)
    expect(container.textContent).not.toContain('待生成')
    const generate = findText(container, '开始生成')
    await act(async () => { invoke(generate, 'onClick'); await Promise.resolve() })
    expect(findText(container, '停止生成')).not.toBeNull()
    expect(findNodes(container, node => node.getAttribute('class')?.includes('p5-ai-candidate-slot') ?? false)).toHaveLength(4)
    expect(findNodes(container, node => node.getAttribute('class')?.includes('is-generating') ?? false)).toHaveLength(1)
    await act(async () => { emit?.({ type: 'candidate', data: { candidate: { id: 'candidate-live', asset_url: '/candidate.png', media_type: 'image/png' }, candidate_index: 0, total: 4, completed: 1 } }); await Promise.resolve() })
    expect(findNodes(container, node => node.getAttribute('class')?.includes('has-result') ?? false)).toHaveLength(1)
    await act(async () => { invoke(findText(container, '停止生成'), 'onClick'); await Promise.resolve() })
    expect(findText(container, '开始生成')).not.toBeNull()
    expect(container.textContent).toContain('已保留 1 张候选')
    root.unmount()
    await flush()
  })

  it('本地选择后立即加入候选并保留转换后的 PNG，确认时提交', async () => {
    const normalized = new File(['normalized'], 'icon.png', { type: 'image/png' })
    const original = new File(['original'], 'icon-original.png', { type: 'image/png' })
    mocks.prepareIconImage.mockResolvedValue({ file: normalized, originalFile: original, width: 256, height: 128, backgroundRemoved: true })
    const { root, container } = renderEditor()
    await flush()
    await act(async () => { invoke(findText(container, '本地'), 'onClick'); await Promise.resolve() })
    const fileInput = findNode(container, node => node.tagName === 'INPUT' && reactProps(node)?.accept === 'image/png,image/jpeg,image/webp')
    await act(async () => { invoke(fileInput, 'onChange', { target: { files: [new File(['source'], 'original.jpg', { type: 'image/jpeg' })] } }); await Promise.resolve(); await Promise.resolve() })
    expect(container.textContent).not.toContain('当前主题图片')
    expect(container.textContent).not.toContain('使用此图片')
    expect(findNodes(container, node => node.getAttribute('class')?.includes('has-result') ?? false)).toHaveLength(2)
    expect(findText(container, '去背景 1')).not.toBeNull()
    expect(findText(container, '原图 2')).not.toBeNull()
    expect(container.textContent).toContain('图片背景已移除，原图候选已保留')
    expect(mocks.request.mock.calls.some(([path]) => String(path).includes('/variants/upload'))).toBe(false)
    await act(async () => { invoke(findText(container, '创建并识别此类物品'), 'onClick'); await Promise.resolve(); await Promise.resolve() })
    expect(mocks.request).toHaveBeenCalledWith('/api/owner/refrigerators/fridge-1/icon-drafts/draft-1/variants/upload?theme_key=ink', expect.objectContaining({ body: normalized }))
    await act(async () => { root.unmount(); await Promise.resolve() })
  })

  it('本地页按顺序填充四个候选位，第五次从第一个候选位覆盖并可点击切换', async () => {
    let uploadCount = 0
    let objectUrlCount = 0
    mocks.request.mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith('/icon-drafts') && init?.method === 'POST') return Promise.resolve({ ...baseDraft, variants: {} })
      if (path.endsWith('/icon-models')) return Promise.resolve([])
      if (path.includes('/variants/upload')) {
        uploadCount += 1
        return Promise.resolve({
          ...baseDraft,
          variants: {
            skeuomorphic: {
              asset_url: `/uploaded-${uploadCount}.png`,
              media_type: 'image/png',
              source: 'upload',
            },
          },
        })
      }
      return Promise.resolve(undefined)
    })
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:local-${++objectUrlCount}`)
    mocks.prepareIconImage.mockImplementation(async (file: File) => ({ file, width: 256, height: 256, backgroundRemoved: false }))
    const { root, container } = renderEditor(vi.fn(), { theme: 'skeuomorphic' })
    await flush()
    await act(async () => { invoke(findText(container, '本地'), 'onClick'); await Promise.resolve() })
    expect(findNodes(container, node => node.getAttribute('class')?.includes('p5-local-candidate-slot') ?? false)).toHaveLength(4)
    const localGrid = findNode(container, node => node.getAttribute('class') === 'p5-ai-candidate-grid p5-local-candidate-grid')
    expect(localGrid).not.toBeNull()
    expect(findNodes(localGrid!, node => node.getAttribute('class') === 'p5-theme-icon-preview is-placeholder')).toHaveLength(4)
    expect(findNodes(localGrid!, node => node.tagName === 'B' && node.textContent === '')).toHaveLength(4)
    expect(findNodes(container, node => node.getAttribute('class')?.includes('has-result') ?? false)).toHaveLength(0)
    expect(container.textContent).not.toContain('待选择')
    expect(findNodes(container, node => (node.getAttribute('class')?.includes('p5-local-candidate-slot') ?? false) && (node.getAttribute('class')?.includes('is-selected') ?? false))).toHaveLength(0)
    expect(findText(container, '相册照片')).not.toBeNull()
    expect(findText(container, '本机文件')).not.toBeNull()

    const fileInput = findNode(container, node => node.tagName === 'INPUT' && reactProps(node)?.accept === 'image/png,image/jpeg,image/webp')
    for (let index = 0; index < 4; index += 1) {
      await act(async () => { invoke(fileInput, 'onChange', { target: { files: [new File([`icon-${index}`], `icon-${index}.png`, { type: 'image/png' })] } }); await flush() })
    }
    expect(uploadCount).toBe(0)
    expect(findNodes(container, node => node.getAttribute('class')?.includes('has-result') ?? false)).toHaveLength(4)

    await act(async () => { invoke(fileInput, 'onChange', { target: { files: [new File(['icon-4'], 'icon-4.png', { type: 'image/png' })] } }); await flush() })
    expect(uploadCount).toBe(0)
    expect(findNodes(container, node => node.getAttribute('class')?.includes('has-result') ?? false)).toHaveLength(4)

    await act(async () => { invoke(findText(container, '原图 3'), 'onClick'); await flush() })
    expect(uploadCount).toBe(0)
    expect(findText(container, '原图 3')?.getAttribute('class')).toContain('is-selected')
    await act(async () => { root.unmount(); await Promise.resolve() })
  })

  it('模型能力请求失败时禁用 AI 生成', async () => {
    mocks.request.mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith('/icon-drafts') && init?.method === 'POST') return Promise.resolve({ ...baseDraft })
      if (path.endsWith('/icon-models')) return Promise.reject(new Error('模型目录不可用'))
      return Promise.resolve(undefined)
    })
    const { root, container } = renderEditor()
    await flush()
    const aiTab = findText(container, 'AI')
    await act(async () => { invoke(aiTab, 'onClick'); await Promise.resolve() })
    await flush()
    const generate = findText(container, '开始生成')
    expect(reactProps(generate)?.disabled).toBe(true)
    expect(container.textContent).toContain('模型目录不可用')
    expect(findNodes(container, node => node.tagName === 'P' && (node.getAttribute('class')?.startsWith('p5-source-status') ?? false))).toHaveLength(1)
    expect(findNode(container, node => node.tagName === 'P' && node.getAttribute('class') === 'p5-source-status is-error')).not.toBeNull()
    root.unmount()
  })

  it('编辑非 ink 主题时保留服务端真实 fallback_theme 和名称', async () => {
    mocks.request.mockImplementation((path: string) => path.endsWith('/icon-models') ? Promise.resolve([]) : Promise.resolve(undefined))
    const { root, container } = renderEditor(vi.fn(), {
      theme: 'skeuomorphic', initialName: '客户端名称', initialFallbackTheme: 'skeuomorphic',
      initialCategory: { id: 'custom-1', parent_id: 'group-1', name: '服务端名称', icon_key: 'milk', is_custom: true, revision: 3, fallback_theme: 'cartoon' },
      icons: [{ key: 'milk', label: '牛奶', asset_url: '/icons/milk.png', variants: { skeuomorphic: { asset_url: '/icons/milk.png', media_type: 'image/png', source: 'library', source_id: 'milk' } } }],
    })
    await flush()
    const nameInput = findNode(container, node => node.tagName === 'INPUT' && reactProps(node)?.value === '服务端名称')
    expect(findNode(container, node => node.getAttribute('class') === 'p5-fallback-select')).toBeNull()
    expect(nameInput).not.toBeNull()
    root.unmount()
  })

  it('进入在线页后自动生成关键词，点击关键词立即提交搜索', async () => {
    const { root, container } = renderEditor()
    await flush()
    const onlineTab = findText(container, '在线')
    await act(async () => { invoke(onlineTab, 'onClick'); await Promise.resolve() })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 500)) })
    await flush()
    expect(mocks.request).toHaveBeenCalledWith('/api/owner/refrigerators/fridge-1/icon-keywords', expect.objectContaining({ method: 'POST' }))
    expect(container.textContent).toContain('milk')
    expect(container.textContent).toContain('dairy')
    expect(findText(container, '关键词')).toBeNull()
    expect(findText(container, '搜索')).toBeNull()
    const keyword = findText(container, 'milk')
    await act(async () => { invoke(keyword, 'onClick'); await Promise.resolve(); await Promise.resolve() })
    expect(mocks.request).toHaveBeenCalledWith(expect.stringContaining('/api/owner/refrigerators/fridge-1/icon-search?provider=iconify&query=milk'), expect.anything())
    const searchForm = findNode(container, node => node.tagName === 'FORM' && reactProps(node)?.className === 'p5-search p5-online-search')
    await act(async () => { invoke(searchForm, 'onSubmit', { preventDefault: vi.fn() }); await Promise.resolve(); await Promise.resolve() })
    expect(mocks.request.mock.calls.filter(([path]) => String(path).includes('/icon-search?'))).toHaveLength(2)
    root.unmount()
  })

  it('新建小类仍为待命名小类时不自动生成关键词', async () => {
    const { root, container } = renderEditor(vi.fn(), { initialName: '' })
    await flush()
    await act(async () => { invoke(findText(container, '在线'), 'onClick'); await Promise.resolve() })
    await flush()
    expect(mocks.request.mock.calls.some(([path]) => String(path).endsWith('/icon-keywords'))).toBe(false)
    expect(findNode(container, node => node.getAttribute('aria-label') === '刷新英语关键词')).toBeNull()
    root.unmount()
  })

  it('刷新按钮强制重新生成关键词，生成中旋转并在完成后恢复静态状态', async () => {
    let keywordCallCount = 0
    let resolveRefresh: ((value: unknown) => void) | undefined
    mocks.request.mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith('/icon-drafts') && init?.method === 'POST') return Promise.resolve({ ...baseDraft })
      if (path.endsWith('/icon-models')) return Promise.resolve([{ id: 'agnes', label: 'Agnes', capabilities: ['svg', 'image'] }])
      if (path.endsWith('/icon-keywords')) {
        keywordCallCount += 1
        return keywordCallCount === 1
          ? Promise.resolve({ keywords: ['milk', 'dairy'] })
          : new Promise(resolve => { resolveRefresh = resolve })
      }
      if (path.includes('/icon-search?')) return Promise.resolve({ results: [] })
      return Promise.resolve(undefined)
    })
    const { root, container } = renderEditor()
    await flush()
    await act(async () => { invoke(findText(container, '在线'), 'onClick'); await Promise.resolve() })
    await flush()
    const refresh = findNode(container, node => node.getAttribute('aria-label') === '刷新英语关键词')
    expect(refresh?.getAttribute('class')).toBe('p5-keyword-refresh')
    expect(refresh?.getAttribute('aria-busy')).toBe('false')
    await act(async () => { invoke(refresh, 'onClick'); await Promise.resolve() })
    expect(keywordCallCount).toBe(2)
    const loadingRefresh = findNode(container, node => node.getAttribute('aria-label') === '刷新英语关键词')
    expect(loadingRefresh?.getAttribute('class')).toBe('p5-keyword-refresh is-loading')
    expect(reactProps(loadingRefresh)?.disabled).toBe(true)
    await act(async () => { resolveRefresh?.({ keywords: ['milk carton'] }); await Promise.resolve() })
    await flush()
    const finishedRefresh = findNode(container, node => node.getAttribute('aria-label') === '刷新英语关键词')
    expect(finishedRefresh?.getAttribute('class')).toBe('p5-keyword-refresh')
    expect(reactProps(finishedRefresh)?.disabled).toBe(false)
    expect(container.textContent).toContain('milk carton')
    root.unmount()
  })

  it('在线页默认显示四个占位且隐藏来源，搜索结果后替换为实际结果', async () => {
    mocks.request.mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith('/icon-drafts') && init?.method === 'POST') return Promise.resolve({ ...baseDraft })
      if (path.endsWith('/icon-models')) return Promise.resolve([{ id: 'agnes', label: 'Agnes', capabilities: ['svg', 'image'] }])
      if (path.endsWith('/icon-keywords')) return Promise.resolve({ keywords: ['milk'] })
      if (path.includes('/icon-search?')) return Promise.resolve({ results: [{ id: 'online-1', label: 'Online milk', preview_url: '/icons/online-preview.svg', license: 'CC0' }] })
      return Promise.resolve(undefined)
    })
    const { root, container } = renderEditor()
    await flush()
    await act(async () => { invoke(findText(container, '在线'), 'onClick'); await Promise.resolve() })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 500)) })
    await flush()

    const onlineGrid = findNode(container, node => node.getAttribute('aria-label') === '在线图标候选占位')
    expect(onlineGrid).not.toBeNull()
    const placeholders = () => {
      const currentGrid = findNode(container, node => node.getAttribute('aria-label') === '在线图标候选占位')
      return currentGrid ? findNodes(currentGrid, node => node.getAttribute('class') === 'p5-theme-icon-preview is-placeholder') : []
    }
    expect(placeholders().length).toBe(4)
    expect(findNodes(onlineGrid!, node => node.tagName === 'B' && node.textContent === '')).toHaveLength(4)
    expect(container.textContent).not.toContain('待搜索')
    expect(container.textContent).not.toContain('来源：')

    const searchInput = findNode(container, node => node.tagName === 'INPUT' && reactProps(node)?.['aria-label'] === '在线图标搜索')
    const searchForm = findNode(container, node => node.tagName === 'FORM' && reactProps(node)?.className === 'p5-search p5-online-search')
    await act(async () => { invoke(searchInput, 'onChange', { target: { value: 'milk' } }); invoke(searchForm, 'onSubmit', { preventDefault: vi.fn() }); await Promise.resolve(); await Promise.resolve() })
    await flush()
    expect(mocks.fetchRuntimeAsset).toHaveBeenCalledWith('/icons/online-preview.svg', expect.anything())
    expect(placeholders().length).toBe(0)
    expect(findText(container, 'Online milk')).not.toBeNull()
    expect(container.textContent).toContain('来源：Iconify · 许可证：CC0')
    await act(async () => { root.unmount(); await Promise.resolve() })
  })

  it('小类名称仅在失焦且名称变化后请求关键词', async () => {
    mocks.request.mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith('/icon-drafts') && init?.method === 'POST') return Promise.resolve({ ...baseDraft })
      if (path.endsWith('/icon-models')) return Promise.resolve([{ id: 'agnes', label: 'Agnes', capabilities: ['svg', 'image'] }])
      if (path.endsWith('/icon-keywords')) return Promise.resolve({ keywords: ['milk'] })
      return Promise.resolve(undefined)
    })
    const { root, container } = renderEditor()
    await flush()
    await act(async () => { invoke(findText(container, '在线'), 'onClick'); await Promise.resolve() })
    await flush()

    const keywordRequests = () => mocks.request.mock.calls.filter(([path]) => String(path).endsWith('/icon-keywords'))
    expect(keywordRequests()).toHaveLength(1)
    const nameInput = findNode(container, node => node.tagName === 'INPUT' && reactProps(node)?.value === '牛奶')
    await act(async () => { invoke(nameInput, 'onChange', { target: { value: '鸡蛋' } }); await Promise.resolve() })
    expect(keywordRequests()).toHaveLength(1)
    await act(async () => { invoke(nameInput, 'onBlur'); await Promise.resolve(); await Promise.resolve() })
    expect(keywordRequests()).toHaveLength(2)
    await act(async () => { invoke(nameInput, 'onBlur'); await Promise.resolve() })
    expect(keywordRequests()).toHaveLength(2)
    await act(async () => { root.unmount(); await Promise.resolve() })
  })

  it('离开在线来源后再次进入时会重新显示同名关键词', async () => {
    mocks.request.mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith('/icon-drafts') && init?.method === 'POST') return Promise.resolve({ ...baseDraft })
      if (path.endsWith('/icon-models')) return Promise.resolve([{ id: 'agnes', label: 'Agnes', capabilities: ['svg', 'image'] }])
      if (path.endsWith('/icon-keywords')) return Promise.resolve({ keywords: ['milk'] })
      return Promise.resolve(undefined)
    })
    const { root, container } = renderEditor()
    await flush()
    const keywordRequests = () => mocks.request.mock.calls.filter(([path]) => String(path).endsWith('/icon-keywords'))

    await act(async () => { invoke(findText(container, '在线'), 'onClick'); await Promise.resolve() })
    await flush()
    expect(keywordRequests()).toHaveLength(1)
    expect(container.textContent).toContain('milk')

    await act(async () => { invoke(findText(container, '图库'), 'onClick'); await Promise.resolve() })
    await act(async () => { invoke(findText(container, '在线'), 'onClick'); await Promise.resolve() })
    await flush()
    expect(keywordRequests()).toHaveLength(1)
    expect(container.textContent).toContain('milk')
    await act(async () => { root.unmount(); await Promise.resolve() })
  })

  it('未打开在线来源时名称失焦不请求关键词', async () => {
    mocks.request.mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith('/icon-drafts') && init?.method === 'POST') return Promise.resolve({ ...baseDraft })
      if (path.endsWith('/icon-models')) return Promise.resolve([{ id: 'agnes', label: 'Agnes', capabilities: ['svg', 'image'] }])
      if (path.endsWith('/icon-keywords')) return Promise.resolve({ keywords: ['milk'] })
      return Promise.resolve(undefined)
    })
    const { root, container } = renderEditor()
    await flush()
    const nameInput = findNode(container, node => node.tagName === 'INPUT' && reactProps(node)?.value === '牛奶')
    await act(async () => { invoke(nameInput, 'onChange', { target: { value: '鸡蛋' } }); invoke(nameInput, 'onBlur'); await Promise.resolve() })
    expect(mocks.request.mock.calls.filter(([path]) => String(path).endsWith('/icon-keywords'))).toHaveLength(0)
    await act(async () => { root.unmount(); await Promise.resolve() })
  })

  it('在线搜索期间在来源选择框下方显示统一状态', async () => {
    let resolveSearch: ((value: { results: [] }) => void) | undefined
    const searchResponse = new Promise<{ results: [] }>(resolve => { resolveSearch = resolve })
    mocks.request.mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith('/icon-drafts') && init?.method === 'POST') return Promise.resolve({ ...baseDraft })
      if (path.endsWith('/icon-models')) return Promise.resolve([{ id: 'agnes', label: 'Agnes', capabilities: ['svg', 'image'] }])
      if (path.endsWith('/icon-keywords')) return Promise.resolve({ keywords: ['milk', 'dairy'] })
      if (path.includes('/icon-search?')) return searchResponse
      return Promise.resolve(undefined)
    })
    const { root, container } = renderEditor()
    await flush()
    await act(async () => { invoke(findText(container, '在线'), 'onClick'); await Promise.resolve() })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 500)) })
    await flush()
    await act(async () => { invoke(findText(container, 'milk'), 'onClick'); await Promise.resolve() })
    const status = findNode(container, node => node.tagName === 'P' && node.getAttribute('class') === 'p5-source-status')
    expect(status?.textContent).toBe('正在搜索...')
    resolveSearch?.({ results: [] })
    await flush()
    await act(async () => { root.unmount(); await Promise.resolve() })
  })

  it('在线结果每页最多三行，并用 p9-category-link 翻页且新搜索回到第一页', async () => {
    const results = Array.from({ length: 13 }, (_, index) => ({ id: `online-${index + 1}`, label: `Online ${index + 1}`, preview_url: `/icons/${index + 1}.svg`, license: 'CC0' }))
    mocks.request.mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith('/icon-drafts') && init?.method === 'POST') return Promise.resolve({ ...baseDraft })
      if (path.endsWith('/icon-models')) return Promise.resolve([{ id: 'agnes', label: 'Agnes', capabilities: ['svg', 'image'] }])
      if (path.endsWith('/icon-keywords')) return Promise.resolve({ keywords: ['milk', 'dairy'] })
      if (path.includes('/icon-search?')) return Promise.resolve({ results })
      return Promise.resolve(undefined)
    })
    const { root, container } = renderEditor()
    await flush()
    await act(async () => { invoke(findText(container, '在线'), 'onClick'); await Promise.resolve() })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 500)) })
    await flush()
    await act(async () => { invoke(findText(container, 'milk'), 'onClick'); await Promise.resolve(); await Promise.resolve() })
    const resultButtons = () => findNodes(container, node => node.tagName === 'BUTTON' && /^Online \d+$/.test(node.textContent.trim()))
    expect(resultButtons()).toHaveLength(12)
    const next = findText(container, '下一页')
    expect(next?.getAttribute('class')).toBe('p9-category-link')
    await act(async () => { invoke(next, 'onClick'); await Promise.resolve() })
    expect(resultButtons()).toHaveLength(1)
    const previous = findText(container, '上一页')
    expect(previous?.getAttribute('class')).toBe('p9-category-link')
    await act(async () => { invoke(findText(container, 'dairy'), 'onClick'); await Promise.resolve(); await Promise.resolve() })
    expect(resultButtons()).toHaveLength(12)
    await act(async () => { root.unmount(); await Promise.resolve() })
  })

  it('图库结果每页最多三行，并使用同一分页控件', async () => {
    const icons = Array.from({ length: 13 }, (_, index) => ({ key: `library-${index + 1}`, label: `Library ${index + 1}`, asset_url: `/icons/library-${index + 1}.svg` }))
    const { root, container } = renderEditor(vi.fn(), { icons })
    await flush()

    const libraryButtons = () => findNodes(container, node => node.tagName === 'BUTTON' && /^Library \d+$/.test(node.textContent.trim()))
    expect(libraryButtons()).toHaveLength(12)
    expect(findNode(container, node => node.tagName === 'NAV' && node.getAttribute('aria-label') === '图库图标分页')).not.toBeNull()
    const next = findText(container, '下一页')
    expect(next?.getAttribute('class')).toBe('p9-category-link')
    await act(async () => { invoke(next, 'onClick'); await Promise.resolve() })
    expect(libraryButtons()).toHaveLength(1)
    expect(libraryButtons()[0].textContent.trim()).toBe('Library 13')
    const previous = findText(container, '上一页')
    expect(previous?.getAttribute('class')).toBe('p9-category-link')
    await act(async () => { invoke(previous, 'onClick'); await Promise.resolve() })
    expect(libraryButtons()).toHaveLength(12)
    await act(async () => { root.unmount(); await Promise.resolve() })
  })

  it('点击在线图标结果只更新前端预览，确认时才写入草稿', async () => {
    const selectedDraft = {
      ...baseDraft,
      variants: { ink: { asset_url: '/draft/ink', media_type: 'image/svg+xml', source: 'iconify', source_id: 'remote-1' } },
    }
    mocks.request.mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith('/icon-drafts') && init?.method === 'POST') return Promise.resolve({ ...baseDraft })
      if (path.endsWith('/icon-models')) return Promise.resolve([{ id: 'agnes', label: 'Agnes', capabilities: ['svg', 'image'] }])
      if (path.endsWith('/icon-keywords')) return Promise.resolve({ keywords: ['milk'] })
      if (path.includes('/icon-search?')) return Promise.resolve({ results: [{ id: 'remote-1', label: 'Online milk', preview_url: '/icons/online.svg', license: 'CC0', author: 'Example' }] })
      if (path.endsWith('/variants')) return Promise.resolve(selectedDraft)
      if (path.endsWith('/confirm')) return Promise.resolve({ id: 'custom-1', parent_id: 'group-1', name: '牛奶', icon_key: 'online', is_custom: true })
      return Promise.resolve(undefined)
    })
    const { root, container } = renderEditor()
    await flush()
    await act(async () => { invoke(findText(container, '在线'), 'onClick'); await Promise.resolve() })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 500)) })
    const searchForm = findNode(container, node => node.tagName === 'FORM' && reactProps(node)?.className === 'p5-search p5-online-search')
    await act(async () => { invoke(searchForm, 'onSubmit', { preventDefault: vi.fn() }); await Promise.resolve(); await Promise.resolve() })
    const onlineResult = findNode(container, node => node.tagName === 'BUTTON' && node.textContent.includes('Online milk'))
    expect(onlineResult).not.toBeNull()
    await act(async () => { invoke(onlineResult, 'onClick'); await Promise.resolve(); await Promise.resolve() })
    expect(mocks.request.mock.calls.filter(([path]) => path.endsWith('/icon-drafts/draft-1/variants'))).toHaveLength(0)
    expect(mocks.request.mock.calls.filter(([path, init]) => String(path).endsWith('/icon-drafts') && (init as RequestInit | undefined)?.method === 'POST')).toHaveLength(0)
    expect(findText(container, '保存中…')).toBeNull()
    expect(findText(container, '使用此图标')).toBeNull()
    expect(findText(container, 'Online milk')?.textContent).not.toContain('CC0')
    expect(container.textContent).toContain('来源：Iconify · 许可证：CC0')
    expect(container.textContent).not.toContain('许可证和署名随结果展示')
    expect(findNode(container, node => node.tagName === 'IMG' && reactProps(node)?.src === '/icons/online.svg')).not.toBeNull()
    const confirm = findText(container, '创建并识别此类物品')
    await act(async () => { invoke(confirm, 'onClick'); await Promise.resolve(); await Promise.resolve() })
    expect(mocks.request).toHaveBeenCalledWith('/api/owner/refrigerators/fridge-1/icon-drafts', expect.objectContaining({ method: 'POST' }))
    expect(mocks.request).toHaveBeenCalledWith('/api/owner/refrigerators/fridge-1/icon-drafts/draft-1/variants', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ theme_key: 'ink', provider: 'iconify', item_id: 'remote-1' }),
    }))
    expect(mocks.request).toHaveBeenCalledWith('/api/owner/refrigerators/fridge-1/icon-drafts/draft-1/confirm', expect.objectContaining({ method: 'POST' }))
    await act(async () => { root.unmount(); await Promise.resolve() })
  })

  it('在线图标切换到水墨并生成 AI 后，确认时一次性提交前端完整草稿', async () => {
    mocks.request.mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith('/icon-models')) return Promise.resolve([{ id: 'agnes', label: 'Agnes', capabilities: ['svg', 'image'] }])
      if (path.endsWith('/icon-keywords')) return Promise.resolve({ keywords: ['milk'] })
      if (path.includes('/icon-search?')) return Promise.resolve({ results: [{ id: 'remote-1', label: 'Online milk', preview_url: '/icons/online.png', license: 'CC0' }] })
      if (path.endsWith('/icon-drafts') && init?.method === 'POST') return Promise.resolve({ ...baseDraft, variants: {} })
      if (path.includes('/variants/upload')) return Promise.resolve({ ...baseDraft, variants: { ink: { asset_url: '/draft/ink', media_type: 'image/svg+xml', source: 'upload' } } })
      if (path.endsWith('/variants')) return Promise.resolve({ ...baseDraft, variants: { skeuomorphic: { asset_url: '/draft/skeuo', media_type: 'image/png', source: 'thiings', source_id: 'remote-1' } } })
      if (path.endsWith('/confirm')) return Promise.resolve({ id: 'custom-1', parent_id: 'group-1', name: '牛奶', icon_key: 'online', is_custom: true })
      return Promise.resolve(undefined)
    })
    mocks.streamRequest.mockResolvedValue({ id: 'generation-1', candidates: [{ id: 'candidate-1', asset_url: '/candidate.svg', media_type: 'image/svg+xml' }] })
    mocks.fetchRuntimeAsset.mockResolvedValue(new Blob(['<svg/>'], { type: 'image/svg+xml' }))
    const { root, container } = renderEditor(vi.fn(), { theme: 'skeuomorphic' })
    await flush()
    await act(async () => { invoke(findText(container, '在线'), 'onClick'); await Promise.resolve() })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 500)) })
    const searchForm = findNode(container, node => node.tagName === 'FORM' && reactProps(node)?.className === 'p5-search p5-online-search')
    await act(async () => { invoke(searchForm, 'onSubmit', { preventDefault: vi.fn() }); await Promise.resolve(); await Promise.resolve() })
    await act(async () => { invoke(findText(container, 'Online milk'), 'onClick'); await Promise.resolve() })
    await act(async () => { invoke(findText(container, '水墨'), 'onClick'); await Promise.resolve() })
    await act(async () => { invoke(findText(container, 'AI'), 'onClick'); await Promise.resolve() })
    await flush()
    await act(async () => { invoke(findText(container, '开始生成'), 'onClick'); await Promise.resolve(); await Promise.resolve() })
    await flush()
    expect(findText(container, '使用此候选')).toBeNull()
    const candidate = findText(container, '候选 1')
    expect(candidate?.tagName).toBe('BUTTON')
    await act(async () => { invoke(candidate, 'onClick'); await Promise.resolve(); await Promise.resolve() })
    expect(findText(container, '候选 1')).not.toBeNull()
    expect(findNode(container, node => node.tagName === 'IMG' && reactProps(node)?.src === 'blob:test-icon')).not.toBeNull()
    expect(container.textContent).toContain('AI 候选已应用到当前主题')
    expect(mocks.request.mock.calls.filter(([path]) => String(path).includes('/icon-drafts'))).toHaveLength(0)
    await act(async () => { invoke(findText(container, '创建并识别此类物品'), 'onClick'); await Promise.resolve(); await Promise.resolve() })
    expect(mocks.request).toHaveBeenCalledWith('/api/owner/refrigerators/fridge-1/icon-drafts', expect.objectContaining({ method: 'POST' }))
    expect(mocks.request).toHaveBeenCalledWith('/api/owner/refrigerators/fridge-1/icon-drafts/draft-1/variants', expect.objectContaining({ body: JSON.stringify({ theme_key: 'skeuomorphic', provider: 'thiings', item_id: 'remote-1' }) }))
    expect(mocks.request).toHaveBeenCalledWith('/api/owner/refrigerators/fridge-1/icon-drafts/draft-1/variants/upload?theme_key=ink', expect.objectContaining({ method: 'POST' }))
    expect(mocks.request).toHaveBeenCalledWith('/api/owner/refrigerators/fridge-1/icon-drafts/draft-1/confirm', expect.objectContaining({ method: 'POST' }))
    await act(async () => { root.unmount(); await Promise.resolve() })
  })

  it('关键词生成状态不占用保存按钮，且同一页面重复进入在线页使用缓存', async () => {
    let resolveKeywords: ((value: { keywords: string[] }) => void) | undefined
    const keywordsResponse = new Promise<{ keywords: string[] }>(resolve => { resolveKeywords = resolve })
    mocks.request.mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith('/icon-drafts') && init?.method === 'POST') return Promise.resolve({ ...baseDraft })
      if (path.endsWith('/icon-models')) return Promise.resolve([{ id: 'agnes', label: 'Agnes', capabilities: ['svg', 'image'] }])
      if (path.endsWith('/icon-keywords')) return keywordsResponse
      return Promise.resolve(undefined)
    })
    const { root, container } = renderEditor()
    await flush()
    const onlineTab = findText(container, '在线')
    await act(async () => { invoke(onlineTab, 'onClick'); await Promise.resolve() })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 500)) })
    await flush()
    expect(container.textContent).toContain('正在生成关键词…')
    expect(findText(container, '保存中…')).toBeNull()
    resolveKeywords?.({ keywords: ['milk', 'dairy'] })
    await flush()

    const libraryTab = findText(container, '图库')
    await act(async () => { invoke(libraryTab, 'onClick'); await Promise.resolve() })
    await act(async () => { invoke(findText(container, '在线'), 'onClick'); await Promise.resolve() })
    await flush()
    expect(mocks.request.mock.calls.filter(([path]) => path === '/api/owner/refrigerators/fridge-1/icon-keywords')).toHaveLength(1)
    expect(container.textContent).toContain('milk')
    await act(async () => { root.unmount(); await Promise.resolve() })

    const reopened = renderEditor()
    await flush()
    await act(async () => { invoke(findText(reopened.container, '在线'), 'onClick'); await Promise.resolve() })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 500)) })
    await flush()
    expect(mocks.request.mock.calls.filter(([path]) => path === '/api/owner/refrigerators/fridge-1/icon-keywords')).toHaveLength(2)
    await act(async () => { reopened.root.unmount(); await Promise.resolve() })
  })

  it('生成期间手工修改搜索框仍缓存模型返回，但不覆盖手工输入', async () => {
    let resolveKeywords: ((value: { keywords: string[] }) => void) | undefined
    const keywordsResponse = new Promise<{ keywords: string[] }>(resolve => { resolveKeywords = resolve })
    mocks.request.mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith('/icon-drafts') && init?.method === 'POST') return Promise.resolve({ ...baseDraft })
      if (path.endsWith('/icon-models')) return Promise.resolve([{ id: 'agnes', label: 'Agnes', capabilities: ['svg', 'image'] }])
      if (path.endsWith('/icon-keywords')) return keywordsResponse
      return Promise.resolve(undefined)
    })
    const { root, container } = renderEditor()
    await flush()
    await act(async () => { invoke(findText(container, '在线'), 'onClick'); await Promise.resolve() })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 500)) })
    const searchInput = findNode(container, node => node.tagName === 'INPUT' && reactProps(node)?.['aria-label'] === '在线图标搜索')
    await act(async () => { (reactProps(searchInput)?.onChange as ((event: unknown) => void) | undefined)?.({ target: { value: 'hand edited' } }); await Promise.resolve() })
    resolveKeywords?.({ keywords: ['milk', 'dairy'] })
    await flush()
    expect(reactProps(searchInput)?.value).toBe('hand edited')
    expect(findNode(container, node => node.getAttribute('class') === 'p5-keyword-chips')).toBeNull()
    const libraryTab = findText(container, '图库')
    await act(async () => { invoke(libraryTab, 'onClick'); await Promise.resolve() })
    await act(async () => { invoke(findText(container, '在线'), 'onClick'); await Promise.resolve() })
    await flush()
    expect(mocks.request.mock.calls.filter(([path]) => path === '/api/owner/refrigerators/fridge-1/icon-keywords')).toHaveLength(1)
    await act(async () => { root.unmount(); await Promise.resolve() })
  })

  it('关键词请求超时显示在统一状态文本框', async () => {
    const timeoutMessage = '请求超过 30 秒仍未完成，请检查网络连接后重试。'
    mocks.request.mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith('/icon-drafts') && init?.method === 'POST') return Promise.resolve({ ...baseDraft })
      if (path.endsWith('/icon-models')) return Promise.resolve([{ id: 'agnes', label: 'Agnes', capabilities: ['svg', 'image'] }])
      if (path.endsWith('/icon-keywords')) return Promise.reject(new Error(timeoutMessage))
      return Promise.resolve(undefined)
    })
    const { root, container } = renderEditor()
    await flush()
    await act(async () => { invoke(findText(container, '在线'), 'onClick'); await Promise.resolve() })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 500)) })
    await flush()
    const sourceStatus = findNode(container, node => node.tagName === 'P' && node.getAttribute('class') === 'p5-source-status is-error')
    expect(sourceStatus?.textContent).toBe(timeoutMessage)
    expect(findNodes(container, node => node.tagName === 'P' && (node.getAttribute('class')?.startsWith('p5-source-status') ?? false))).toHaveLength(1)
    expect(findText(container, '保存中…')).toBeNull()
    await act(async () => { root.unmount(); await Promise.resolve() })
  })

  it('卡通主题的在线入口保持可选', async () => {
    const { root, container } = renderEditor(vi.fn(), { theme: 'cartoon' })
    await flush()
    const onlineTab = findText(container, '在线')
    expect(reactProps(onlineTab)?.disabled).not.toBe(true)
    root.unmount()
  })

  it('切换主题后保持当前图标来源页', async () => {
    const { root, container } = renderEditor()
    await flush()
    await act(async () => { invoke(findText(container, '本地'), 'onClick'); await Promise.resolve() })
    expect(findText(container, '本地')?.getAttribute('aria-selected')).toBe('true')

    await act(async () => { invoke(findText(container, '拟物'), 'onClick'); await Promise.resolve(); await Promise.resolve() })

    expect(findText(container, '本地')?.getAttribute('aria-selected')).toBe('true')
    expect(findText(container, '图库')?.getAttribute('aria-selected')).toBe('false')
    await act(async () => { root.unmount(); await Promise.resolve() })
  })

  it('主题切换会取消并清理当前 generation', async () => {
    const { root, container } = renderEditor()
    await flush()
    const aiTab = findText(container, 'AI')
    await act(async () => { invoke(aiTab, 'onClick'); await Promise.resolve() })
    await flush()
    const generate = findText(container, '开始生成')
    await act(async () => { invoke(generate, 'onClick'); await Promise.resolve(); await Promise.resolve() })
    await flush()
    const skeuomorphic = findText(container, '拟物')
    await act(async () => { invoke(skeuomorphic, 'onClick'); await Promise.resolve(); await Promise.resolve() })
    expect(mocks.request).toHaveBeenCalledWith('/api/owner/refrigerators/fridge-1/icon-candidates/generation-1', { method: 'DELETE' })
    root.unmount()
  })
})
