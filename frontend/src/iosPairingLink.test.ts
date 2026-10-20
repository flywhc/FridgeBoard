import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BootstrapPairing } from './BootstrapPairing'
import { InstallationGuide } from './sharedUi'
import { parseAppDeepLink } from './deepLink'
import { createIosPairingLink } from './iosPairingLink'
import type { PairingQr } from './pairingFlow'

const origin = 'https://fridge.flycn.fyi'
const pairings: PairingQr[] = [
  { kind: 'bootstrap', token: 'first+boot&=?中文' },
  { kind: 'grant_pwa_access', token: 'add+phone&=?中文' },
]

afterEach(() => vi.unstubAllGlobals())

function stubBrowser(userAgent: string, maxTouchPoints = 0) {
  const assign = vi.fn()
  vi.stubGlobal('navigator', { userAgent, maxTouchPoints })
  vi.stubGlobal('window', {
    location: { origin, assign },
    localStorage: { getItem: () => null },
    matchMedia: () => ({ matches: false }),
  })
  vi.stubGlobal('document', { referrer: '' })
  return assign
}

describe('iOS 配对 Scheme', () => {
  it.each(pairings)('保留 $kind 的令牌内容，只有 iOS 接收新增 Scheme', pairing => {
    const link = createIosPairingLink(pairing, origin)
    expect(parseAppDeepLink(link, origin, 'ios')).toEqual({ kind: 'pairing', pairing })
    expect(parseAppDeepLink(link, origin, 'android')).toBeNull()
    expect(parseAppDeepLink(link, origin, 'web')).toBeNull()
  })

  it('保留 Kindle 别名白名单，拒绝其他服务器', () => {
    const link = createIosPairingLink(pairings[0], 'https://kindle.flycn.fyi')
    expect(parseAppDeepLink(link, origin, 'ios')).toEqual({ kind: 'pairing', pairing: pairings[0] })
    expect(parseAppDeepLink(link, 'https://fridge.other.example', 'ios')).toBeNull()
  })

  it.each([
    'https://evil.example/pair?token=one',
    'http://fridge.flycn.fyi/pair?token=one',
    `${origin}/other?token=one`,
    `${origin}/pair?token=one&token=two`,
    `${origin}/pair?token=one&bootstrap=two`,
    `${origin}/pair?token=one&redirect=https://evil.example`,
    `${origin}/pair?token=one#fragment`,
    'https://user:secret@fridge.flycn.fyi/pair?token=one',
    `${origin}/pair?token=`,
    'invalid',
  ])('拒绝非法嵌套地址 %s', target => {
    expect(parseAppDeepLink(`fridgeboard://pair?url=${encodeURIComponent(target)}`, origin, 'ios')).toBeNull()
  })

  it('拒绝 Scheme 路径、身份信息、重复参数和附加参数', () => {
    const link = createIosPairingLink(pairings[0], origin)
    for (const invalid of [
      link.replace('://pair?', '://pair/other?'),
      link.replace('://pair?', '://user@pair?'),
      link.replace('://pair?', '://pair:123?'),
      link.replace('fridgeboard:', 'otherapp:'),
      `${link}&url=other`, `${link}&extra=one`, `${link}#fragment`, 'fridgeboard://pair',
    ]) expect(parseAppDeepLink(invalid, origin, 'ios')).toBeNull()
  })

  it('Android 原有 HTTPS 配对路径继续可用', () => {
    expect(parseAppDeepLink(`${origin}/pair?token=one`, origin, 'android')).toEqual({
      kind: 'pairing', pairing: { kind: 'grant_pwa_access', token: 'one' },
    })
  })
})

describe('浏览器配对交接入口', () => {
  it.each(['iPhone', 'iPad', 'Macintosh'])('在 %s 配对页提供打开 App 操作及 PWA 安装步骤', userAgent => {
    stubBrowser(userAgent, userAgent === 'Macintosh' ? 5 : 0)
    for (const pairing of pairings) {
      const markup = renderToStaticMarkup(createElement(BootstrapPairing, { ...pairing, onScan: () => undefined }))
      expect(markup).toContain('在 iOS App 中打开')
      expect(markup).toContain('install-steps')
    }
  })

  it('用户点击时才唤起 App，不自动跳转或提前消费令牌', () => {
    const assign = stubBrowser('iPhone')
    const link = createIosPairingLink(pairings[0], origin)
    const guide = InstallationGuide({ iosPairingLink: link })
    // 直接触发无状态组件返回的原生按钮，验证用户操作交出的实际 URL。
    const children = guide.props.children as ReactElement<{ children: ReactElement[] }>[]
    const group = children.find(child => child && typeof child === 'object' && typeof child.type === 'symbol')!
    const button = group.props.children[0] as ReactElement<{ onClick: () => void }>
    expect(assign).not.toHaveBeenCalled()
    button.props.onClick()
    expect(assign).toHaveBeenCalledExactlyOnceWith(link)
  })

  it('Android、桌面浏览器及无配对上下文不显示 iOS 入口', () => {
    for (const userAgent of ['Android', 'Windows', 'Macintosh']) {
      stubBrowser(userAgent)
      const markup = renderToStaticMarkup(createElement(BootstrapPairing, { ...pairings[0], onScan: () => undefined }))
      expect(markup).not.toContain('在 iOS App 中打开')
    }
    stubBrowser('iPhone')
    expect(renderToStaticMarkup(createElement(InstallationGuide))).not.toContain('在 iOS App 中打开')
  })
})
