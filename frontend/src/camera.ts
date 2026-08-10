/** P6 相机调用使用的跨浏览器约束和错误文案。 */

export type CameraEnvironment = {
  isSecureContext: boolean
  hasGetUserMedia: boolean
}

export type CameraSessionUiState = {
  cameraOpen: boolean
  cameraReady: boolean
  cameraCapturing: boolean
}

/** 返回照片选择器打开前必须使用的相机 UI 状态。 */
export function getClosedCameraSessionState(): CameraSessionUiState {
  return { cameraOpen: false, cameraReady: false, cameraCapturing: false }
}

/**
 * 返回移动浏览器兼容的后置摄像头请求参数。
 *
 * 不在首次请求时强制分辨率或对焦模式；部分 Android PWA 会将设备能力
 * 约束失败表现为权限失败，导致用户既看不到授权框，也无法进入取景页。
 */
export function getCameraConstraints(): MediaStreamConstraints {
  return { video: { facingMode: { ideal: 'environment' } }, audio: false }
}

/** 将相机启动失败转换为下一步明确的用户提示。 */
export function getCameraErrorMessage(
  error: unknown,
  environment: CameraEnvironment,
): string {
  if (!environment.isSecureContext) return '当前页面不是 HTTPS 安全连接，浏览器不会开放相机。请通过 HTTPS 地址打开 PWA。'
  if (!environment.hasGetUserMedia) return '当前浏览器没有提供相机能力。请使用 HTTPS 打开 PWA，或选择照片识别。'
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return '相机权限未开启，且浏览器没有弹出授权框。请在浏览器或 Android 系统设置中允许家常食橱使用相机，然后重试。'
    if (error.name === 'NotFoundError') return '没有检测到可用摄像头。你仍可以选择照片识别。'
    if (error.name === 'NotReadableError' || error.name === 'AbortError') return '相机可能正被其他应用占用，请关闭后重试。'
    if (error.name === 'OverconstrainedError') return '当前摄像头不支持所需模式。请重试，或选择照片识别。'
  }
  return '无法打开相机。你仍可以选择照片识别，或检查浏览器相机权限后重试。'
}
