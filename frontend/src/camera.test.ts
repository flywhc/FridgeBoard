import { describe, expect, it } from 'vitest'
import { getCameraConstraints, getCameraErrorMessage, getClosedCameraSessionState } from './camera'

describe('P6 相机兼容性', () => {
  it('首次请求只指定后置摄像头意图，不强制 Android 设备分辨率或对焦能力', () => {
    expect(getCameraConstraints()).toEqual({ video: { facingMode: { ideal: 'environment' } }, audio: false })
  })

  it('将未弹出授权框的权限失败提示为系统或浏览器权限设置问题', () => {
    expect(getCameraErrorMessage(new DOMException('blocked', 'NotAllowedError'), { isSecureContext: true, hasGetUserMedia: true })).toContain('浏览器没有弹出授权框')
  })

  it('区分安全上下文和设备能力缺失', () => {
    expect(getCameraErrorMessage(new Error('unavailable'), { isSecureContext: false, hasGetUserMedia: false })).toContain('HTTPS')
    expect(getCameraErrorMessage(new Error('unavailable'), { isSecureContext: true, hasGetUserMedia: false })).toContain('没有提供相机能力')
  })

  it('打开照片选择器前关闭相机 UI 状态', () => {
    expect(getClosedCameraSessionState()).toEqual({ cameraOpen: false, cameraReady: false, cameraCapturing: false })
  })
})
