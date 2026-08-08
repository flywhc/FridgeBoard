import type { Device, Refrigerator } from './appTypes'
import type { PairingQr } from './pairingFlow'

export type DisplayBindingPurpose = 'bind_display_device' | 'replace_display_device'
export type DisplayBindingMethod = 'qr' | 'passcode'

export type DisplayQrScanRequest = {
  refrigeratorId: string
  purpose: DisplayBindingPurpose
}

export type DisplayQrScanResult = PairingQr

export type DisplayDeviceBindRequest = DisplayQrScanRequest & {
  token: string
}

export type DisplayPasscodeRequest = DisplayQrScanRequest

export type DisplayPasscodeResult = {
  passcode: string
  expiresInSeconds: number
}

export type DisplayBindingSuccess = {
  method: DisplayBindingMethod
  purpose: DisplayBindingPurpose
}

export type BindingView = 'overview' | 'confirm-replace' | 'scanning' | 'passcode' | 'success'

export const DISPLAY_BINDING_POLL_INTERVAL_MS = 5_000
export const DISPLAY_BINDING_TIMEOUT_MS = 60_000

/** 返回当前仍有效的冰箱端设备，供设置页展示换绑影响范围。 */
export function getActiveDisplayDevice(devices: Pick<Device, 'kind' | 'revoked_at'>[]): Device | undefined {
  return devices.find(device => device.kind === 'kindle' && device.revoked_at === null) as Device | undefined
}

/** 判断冰箱端是否已经完成本次绑定；换绑必须确认活跃设备已经更换。 */
export function isDisplayBindingComplete(
  refrigerator: Pick<Refrigerator, 'display_device_status'> | undefined,
  devices: Pick<Device, 'id' | 'kind' | 'revoked_at'>[],
  previousDisplayDeviceId?: string,
): boolean {
  const activeDevice = getActiveDisplayDevice(devices)
  if (previousDisplayDeviceId) return activeDevice?.id !== previousDisplayDeviceId && activeDevice !== undefined
  return refrigerator?.display_device_status === 'bound' || activeDevice !== undefined
}

/** 从服务端状态和设备列表推导设置页的绑定文案；不以旧设备列表反推布局状态。 */
export function getDisplayBindingSummary(
  refrigerator: Pick<Refrigerator, 'display_device_status'>,
  device: Pick<Device, 'label' | 'last_seen_at' | 'last_successful_sync_at'> | undefined,
): { bound: boolean; title: string; detail: string; badge: string } {
  if (refrigerator.display_device_status === 'bound') {
    return {
      bound: true,
      title: device?.label || '当前冰箱端',
      detail: formatLastSeen(device?.last_successful_sync_at ?? device?.last_seen_at ?? null),
      badge: '已连接',
    }
  }
  return {
    bound: false,
    title: '尚未绑定',
    detail: '扫描冰箱屏幕上的绑定二维码。',
    badge: '未连接',
  }
}

/** 六位兼容绑定码只保留数字，并限制为服务端接受的长度。 */
export function normalizeDisplayPasscode(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6)
}

/** 判断兼容绑定码是否已经达到提交长度。 */
export function isDisplayPasscodeComplete(value: string): boolean {
  return /^\d{6}$/.test(value)
}

/** 把绑定错误转换成不泄露内部实现细节、且能指导下一步的用户提示。 */
export function getDisplayBindingErrorMessage(error: unknown, purpose: DisplayBindingPurpose): string {
  const message = error instanceof Error && error.message.trim() ? error.message.trim() : ''
  const fallback = purpose === 'replace_display_device'
    ? '新设备绑定失败，请回到冰箱屏幕扫描当前二维码。'
    : '绑定失败，请回到冰箱屏幕扫描当前显示的二维码。'
  const preserveOldDevice = purpose === 'replace_display_device' ? ' 当前绑定设备仍保持访问。' : ''
  return `${message || fallback}${preserveOldDevice}`
}

/** 为六位码创建失败提供与扫码流程不同的下一步提示。 */
export function getDisplayPasscodeErrorMessage(error: unknown, purpose: DisplayBindingPurpose): string {
  const message = error instanceof Error && error.message.trim() ? error.message.trim() : ''
  const preserveOldDevice = purpose === 'replace_display_device' ? ' 当前绑定设备仍保持访问。' : ''
  return `${message || '六位绑定码生成失败，请稍后重试。'}${preserveOldDevice}`
}

/** 拒绝只能授权手机访问的二维码，避免误调用冰箱端绑定接口。 */
export function getDisplayQrBindingErrorMessage(result: DisplayQrScanResult): string | null {
  if (result.kind === 'bootstrap') return null
  return '这是“添加手机访问”二维码，不能用于绑定冰箱端设备。请在未绑定的冰箱端打开绑定页面，并扫描其显示的冰箱端绑定二维码。'
}

/** 统一生成六位码的有效期文案，避免页面显示不一致。 */
export function formatPasscodeExpiry(seconds: number): string {
  if (seconds >= 60) return `${Math.ceil(seconds / 60)} 分钟内有效`
  return `${Math.max(0, seconds)} 秒内有效`
}

function formatLastSeen(value: string | null): string {
  if (!value) return '尚未同步'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '最近同步时间未知'
  return `最近同步于 ${new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(date)}`
}
