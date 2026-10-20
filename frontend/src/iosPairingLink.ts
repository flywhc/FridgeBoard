import { parsePairingQrUrl, type PairingQr } from './pairingFlow'

/** 保留 HTTPS 来源供原生端校验，不允许配对链接切换 App 的服务器。 */
export function createIosPairingLink(pairing: PairingQr, origin: string): string {
  const target = new URL('/pair', origin)
  target.searchParams.set(pairing.kind === 'bootstrap' ? 'bootstrap' : 'token', pairing.token)
  const link = new URL('fridgeboard://pair')
  link.searchParams.set('url', target.toString())
  return link.toString()
}

/** Scheme 只承载同一服务器的两类短效配对链接，拒绝其他导航或附加参数。 */
export function parseIosPairingLink(url: URL, expectedOrigin: string): PairingQr | null {
  if (url.protocol !== 'fridgeboard:' || url.hostname !== 'pair'
    || url.pathname || url.port || url.username || url.password || url.hash
    || url.searchParams.getAll('url').length !== 1
    || [...url.searchParams.keys()].some(key => key !== 'url')) return null
  let target: URL
  try {
    target = new URL(url.searchParams.get('url')!)
  } catch {
    return null
  }
  if (target.protocol !== 'https:' || target.username || target.password || target.hash) return null
  const pairing = parsePairingQrUrl(target.toString(), expectedOrigin)
  if (!pairing) return null
  const parameter = pairing.kind === 'bootstrap' ? 'bootstrap' : 'token'
  return [...target.searchParams.keys()].some(key => key !== parameter) ? null : pairing
}
