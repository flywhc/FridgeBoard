import { describe, expect, it } from 'vitest'
import {
  getFirstBootStatusAction,
  getKindlePageStateAction,
  getKindleQrImagePath,
  getKindleRequestErrorAction,
  getPairingStatusAction,
} from './KindleDeviceFlow'

const refrigerator = { id: 'fridge-1', name: '厨房冰箱', setup_status: 'ready' as const }

describe('Kindle 页面状态分流', () => {
  it('首次入口只为未配置设备创建首次二维码，已配置设备进入首页，撤销设备停在撤销提示', () => {
    expect(getKindlePageStateAction('entry', 'unconfigured')).toBe('create-first-boot')
    expect(getKindlePageStateAction('entry', 'configured')).toBe('redirect-device')
    expect(getKindlePageStateAction('entry', 'revoked')).toBe('revoked')
  })

  it('已配置设备的添加手机入口只允许 configured 状态创建二维码', () => {
    expect(getKindlePageStateAction('pairing', 'configured')).toBe('create-pairing')
    expect(getKindlePageStateAction('pairing', 'unconfigured')).toBe('revoked')
    expect(getKindlePageStateAction('pairing', 'revoked')).toBe('revoked')
  })

  it('首次绑定完成后按显式布局状态分到首页或等待布局', () => {
    expect(getFirstBootStatusAction('pending')).toBe('pending')
    expect(getFirstBootStatusAction('bound', refrigerator)).toBe('bound')
    expect(getFirstBootStatusAction('bound', { ...refrigerator, setup_status: 'needs_layout' })).toBe('waiting-layout')
    expect(getFirstBootStatusAction('bound', null)).toBe('waiting-layout')
  })

  it('区分添加手机二维码的已使用、到期和等待状态', () => {
    expect(getPairingStatusAction('pending')).toBe('pending')
    expect(getPairingStatusAction('used')).toBe('complete')
    expect(getPairingStatusAction('expired')).toBe('expired')
    expect(getPairingStatusAction('missing')).toBe('expired')
  })

  it('网络错误不自动把仍有效的二维码标记为到期，权限错误才进入撤销', () => {
    expect(getKindleRequestErrorAction('poll-first-boot', 503)).toBe('network-error')
    expect(getKindleRequestErrorAction('poll-pairing', 0)).toBe('network-error')
    expect(getKindleRequestErrorAction('poll-pairing', 404)).toBe('expired')
    expect(getKindleRequestErrorAction('poll-layout', 401)).toBe('revoked')
    expect(getKindleRequestErrorAction('page-state', 403)).toBe('revoked')
  })

  it('使用对应的同域服务端二维码地址，不把 pairing URL 当作长期凭证', () => {
    expect(getKindleQrImagePath('entry', 'first/token')).toBe('/api/kindle/first-boot-sessions/qr?token=first%2Ftoken')
    expect(getKindleQrImagePath('pairing', 'phone-token')).toBe('/api/kindle/pairing-sessions/qr?token=phone-token')
  })
})
