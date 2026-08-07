export const PAIRING_INTENT_STORAGE_KEY = 'fb-pairing-intent'
export const PAIRING_QR_DIFFERENT_ORIGIN_MESSAGE = '扫描的二维码地址与本App服务器不同。请确保 Kindle 地址和本App地址相同。'

const pairingParameters = ['bootstrap', 'token', 'pairing_intent'] as const

export type PairingQr =
  | { kind: 'bootstrap'; token: string }
  | { kind: 'grant_pwa_access'; token: string }

export type DisplayBindingPurpose = 'bind_display_device' | 'replace_display_device'

export type PairingIntent = PairingQr & {
  targetRefrigeratorId?: string
  displayBindingPurpose?: DisplayBindingPurpose
}

export type PairingIntentStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type PairingResultRefrigerator = {
  id: string
  setup_status: 'needs_layout' | 'ready'
}

export type PairingResultDestination =
  | { screen: 'continue-setup'; refrigeratorId: string }
  | { screen: 'home'; refrigeratorId: string }

/** 仅接受本应用生成的两类短效配对二维码，其他文本由扫码页显示为不可识别。 */
export function parsePairingQrUrl(value: string, expectedOrigin: string): PairingQr | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.origin !== expectedOrigin || url.pathname !== '/pair') return null

  const bootstrap = url.searchParams.getAll('bootstrap')
  const token = url.searchParams.getAll('token')
  if (bootstrap.length === 1 && bootstrap[0] && token.length === 0) {
    return { kind: 'bootstrap', token: bootstrap[0] }
  }
  if (token.length === 1 && token[0] && bootstrap.length === 0) {
    return { kind: 'grant_pwa_access', token: token[0] }
  }
  return null
}

/** 判断二维码是否是本应用配对格式但来自不同域名，供扫码页给出可操作的提示。 */
export function isPairingQrUrlFromDifferentOrigin(value: string, expectedOrigin: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.origin === expectedOrigin || url.pathname !== '/pair') return false

  const bootstrap = url.searchParams.getAll('bootstrap')
  const token = url.searchParams.getAll('token')
  return (bootstrap.length === 1 && Boolean(bootstrap[0]) && token.length === 0)
    || (token.length === 1 && Boolean(token[0]) && bootstrap.length === 0)
}

/** 把需要跨登录延续的会话意图留在当前浏览器会话，避免令牌进入长期启动地址。 */
export function savePairingIntent(storage: PairingIntentStorage, intent: PairingIntent): void {
  storage.setItem(PAIRING_INTENT_STORAGE_KEY, JSON.stringify(intent))
}

export function readPairingIntent(storage: PairingIntentStorage): PairingIntent | null {
  const raw = storage.getItem(PAIRING_INTENT_STORAGE_KEY)
  if (!raw) return null
  try {
    const candidate: unknown = JSON.parse(raw)
    return isPairingIntent(candidate) ? candidate : null
  } catch {
    return null
  }
}

export function clearPairingIntent(storage: PairingIntentStorage): void {
  storage.removeItem(PAIRING_INTENT_STORAGE_KEY)
}

/** 登录完成后回到固定 PWA 入口，通过会话存储恢复本次配对，不回传短效令牌。 */
export function createLoginReturnPath(): string {
  return '/?pairing_intent=resume'
}

/** 使用服务端返回的显式 setup_status 决定后续流程，避免根据模板或库存猜测。 */
export function getPairingResultDestination(
  refrigerator: PairingResultRefrigerator,
): PairingResultDestination {
  return refrigerator.setup_status === 'ready'
    ? { screen: 'home', refrigeratorId: refrigerator.id }
    : { screen: 'continue-setup', refrigeratorId: refrigerator.id }
}

/** 从当前地址中移除短效会话和回跳标记，同时保留其他正常的查询参数与锚点。 */
export function getUrlWithoutPairingParameters(pathAndSearchAndHash: string): string {
  const url = new URL(pathAndSearchAndHash, 'https://fridgeboard.invalid')
  for (const parameter of pairingParameters) url.searchParams.delete(parameter)
  return `${url.pathname}${url.search}${url.hash}`
}

/** 消费或暂存短效令牌后，用 replaceState 防止它留在可回退的浏览器历史中。 */
export function clearPairingParametersFromAddressBar(
  location: Pick<Location, 'pathname' | 'search' | 'hash'>,
  history: Pick<History, 'replaceState'>,
): boolean {
  const current = `${location.pathname}${location.search}${location.hash}`
  const safeUrl = getUrlWithoutPairingParameters(current)
  if (safeUrl === current) return false
  history.replaceState(null, '', safeUrl)
  return true
}

function isPairingIntent(value: unknown): value is PairingIntent {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<PairingIntent>
  if ((candidate.kind !== 'bootstrap' && candidate.kind !== 'grant_pwa_access') || !isNonEmptyString(candidate.token)) return false
  if (candidate.targetRefrigeratorId !== undefined && !isNonEmptyString(candidate.targetRefrigeratorId)) return false
  return candidate.displayBindingPurpose === undefined
    || candidate.displayBindingPurpose === 'bind_display_device'
    || candidate.displayBindingPurpose === 'replace_display_device'
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}
