export class TestNode {
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

export class TestTextNode extends TestNode {
  value: string
  constructor(value: string, ownerDocument: TestDocument) { super('#text', ownerDocument, 3); this.value = value }
  get textContent(): string { return this.value }
  set textContent(value: string) { this.value = value }
}

export class TestElement extends TestNode {
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

export class TestDocument extends TestNode {
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

export function installDom(): TestDocument {
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

export function findNode(root: TestNode, predicate: (node: TestElement) => boolean): TestElement | null {
  for (const child of root.childNodes) {
    if (child instanceof TestElement && predicate(child)) return child
    const nested = findNode(child, predicate)
    if (nested) return nested
  }
  return null
}

export function findNodes(root: TestNode, predicate: (node: TestElement) => boolean): TestElement[] {
  const matches: TestElement[] = []
  for (const child of root.childNodes) {
    if (child instanceof TestElement) {
      if (predicate(child)) matches.push(child)
      matches.push(...findNodes(child, predicate))
    }
  }
  return matches
}

export function findText(root: TestNode, text: string): TestElement | null {
  return findNode(root, node => node.tagName === 'BUTTON' && node.textContent.trim() === text)
}

export function reactProps(node: TestElement | null): Record<string, unknown> | null {
  if (!node) return null
  const key = Object.keys(node).find(name => name.startsWith('__reactProps$'))
  return key ? (node as unknown as Record<string, Record<string, unknown>>)[key] : null
}

export function invoke(node: TestElement | null, eventName: string, event: unknown = {}): void {
  const handler = reactProps(node)?.[eventName]
  if (typeof handler === 'function') handler(event)
}
