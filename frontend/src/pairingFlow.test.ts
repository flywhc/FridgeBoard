import { describe, expect, it } from 'vitest'
import {
  PAIRING_INTENT_STORAGE_KEY,
  clearPairingIntent,
  createLoginReturnPath,
  getPairingResultDestination,
  getUrlWithoutPairingParameters,
  parsePairingQrUrl,
  readPairingIntent,
  savePairingIntent,
  type PairingIntentStorage,
} from './pairingFlow'

const origin = 'https://fridge.flycn.fyi'

function createStorage(): PairingIntentStorage & { values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    values,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: key => { values.delete(key) },
  }
}

describe('配对二维码解析', () => {
  it('区分未配置设备与已配置冰箱的二维码', () => {
    expect(parsePairingQrUrl(`${origin}/pair?bootstrap=first-boot-token`, origin)).toEqual({
      kind: 'bootstrap', token: 'first-boot-token',
    })
    expect(parsePairingQrUrl(`${origin}/pair?token=add-phone-token`, origin)).toEqual({
      kind: 'grant_pwa_access', token: 'add-phone-token',
    })
  })

  it('拒绝异站、错误路径、缺少令牌和同时携带两种令牌的二维码', () => {
    expect(parsePairingQrUrl('https://example.test/pair?token=not-ours', origin)).toBeNull()
    expect(parsePairingQrUrl(`${origin}/other?token=wrong-path`, origin)).toBeNull()
    expect(parsePairingQrUrl(`${origin}/pair`, origin)).toBeNull()
    expect(parsePairingQrUrl(`${origin}/pair?token=a&bootstrap=b`, origin)).toBeNull()
  })
})

describe('登录回跳配对意图', () => {
  it('仅在会话存储中保存短效令牌，并生成不含令牌的登录回跳地址', () => {
    const storage = createStorage()
    savePairingIntent(storage, { kind: 'bootstrap', token: 'short-lived', targetRefrigeratorId: 'fridge-1' })

    expect(storage.values.get(PAIRING_INTENT_STORAGE_KEY)).toContain('short-lived')
    expect(readPairingIntent(storage)).toEqual({ kind: 'bootstrap', token: 'short-lived', targetRefrigeratorId: 'fridge-1' })
    expect(createLoginReturnPath()).toBe('/?pairing_intent=resume')

    clearPairingIntent(storage)
    expect(readPairingIntent(storage)).toBeNull()
  })

  it('忽略损坏或不完整的已存储意图', () => {
    const storage = createStorage()
    storage.setItem(PAIRING_INTENT_STORAGE_KEY, '{not-json')
    expect(readPairingIntent(storage)).toBeNull()

    storage.setItem(PAIRING_INTENT_STORAGE_KEY, JSON.stringify({ kind: 'bootstrap' }))
    expect(readPairingIntent(storage)).toBeNull()
  })
})

describe('配对完成分流与短效参数清理', () => {
  it('按显式 setup_status 进入首页或继续布局，绝不从模板或库存推断', () => {
    expect(getPairingResultDestination({ id: 'ready', setup_status: 'ready' })).toEqual({
      screen: 'home', refrigeratorId: 'ready',
    })
    expect(getPairingResultDestination({ id: 'draft', setup_status: 'needs_layout' })).toEqual({
      screen: 'continue-setup', refrigeratorId: 'draft',
    })
  })

  it('清理地址栏和历史记录中的 token 与 bootstrap，但保留其他参数和 hash', () => {
    expect(getUrlWithoutPairingParameters('/pair?bootstrap=short&source=camera#guide')).toBe('/pair?source=camera#guide')
    expect(getUrlWithoutPairingParameters('/pair?token=short')).toBe('/pair')
    expect(getUrlWithoutPairingParameters('/?source=home#top')).toBe('/?source=home#top')
  })
})
