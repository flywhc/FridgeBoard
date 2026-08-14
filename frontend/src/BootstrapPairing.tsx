/** 手机端短效二维码领取、授权和结果分流页。 */
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Refrigerator } from './appTypes'
import { InstallationGuide, PageHeader, PageShell } from './sharedUi'
import { isStandalone, request } from './appApi'
import { appRuntime, resolveApiUrl } from './runtime'
import { addMobileDeviceToken } from './mobileAuth'
import { clearPairingIntent, savePairingIntent, type PairingQr, type DisplayBindingPurpose } from './pairingFlow'
import { PairingResultScreen } from './pairingOnboarding'

type PairingMode = 'loading' | 'signed-in' | 'signed-out'

export function BootstrapPairing({ token, kind = 'bootstrap', onScan, targetRefrigeratorId, displayBindingPurpose, onContinueSetup, onOpenHome }: {
  token: string
  kind?: PairingQr['kind']
  onScan: () => void
  targetRefrigeratorId?: string
  displayBindingPurpose?: DisplayBindingPurpose
  onContinueSetup?: (refrigerator: Refrigerator) => void
  onOpenHome?: (refrigerator: Refrigerator) => void
}) {
  const [mode, setMode] = useState<PairingMode>('loading')
  const [fridges, setFridges] = useState<Refrigerator[]>([])
  const [selectedId, setSelectedId] = useState(targetRefrigeratorId ?? '')
  const [newName, setNewName] = useState('家里冰箱')
  const [message, setMessage] = useState('')
  const [paired, setPaired] = useState<Refrigerator | null>(null)
  const [consuming, setConsuming] = useState(false)

  useEffect(() => {
    if (!isStandalone()) return
    let active = true
    const load = async () => {
      try {
        const available = await request<Refrigerator[]>('/api/owner/refrigerators')
        if (!active) return
        setFridges(available)
        setSelectedId(targetRefrigeratorId ?? available[0]?.id ?? '')
        setMode('signed-in')
      } catch (error) {
        if (!active) return
        const status = (error as Error & { status?: number }).status
        if (kind === 'grant_pwa_access' && status === 401) setMode('signed-out')
        else if (status === 401) setMode('signed-out')
        else { setMode('signed-out'); setMessage((error as Error).message) }
      }
    }
    void load()
    return () => { active = false }
  }, [kind, targetRefrigeratorId])

  const login = () => {
    savePairingIntent(window.sessionStorage, { kind, token, targetRefrigeratorId, displayBindingPurpose })
    window.location.assign(`${resolveApiUrl('/api/auth/login', appRuntime)}?return_to=%2F%3Fpairing_intent%3Dresume`)
  }

  const consume = async (event?: FormEvent) => {
    event?.preventDefault()
    setConsuming(true)
    setMessage('')
    try {
      const payload = kind === 'grant_pwa_access'
        ? { pairing_token: token, standalone: true as const, label: '我的手机', client: appRuntime.kind === 'capacitor' ? 'mobile' as const : 'pwa' as const }
        : selectedId
          ? { pairing_token: token, standalone: true as const, refrigerator_id: selectedId, label: '我的手机', purpose: displayBindingPurpose ?? 'bind_display_device', client: appRuntime.kind === 'capacitor' ? 'mobile' as const : 'pwa' as const }
          : { pairing_token: token, standalone: true as const, new_refrigerator_name: newName, new_template_key: 'mini', label: '我的手机', purpose: displayBindingPurpose ?? 'bind_display_device', client: appRuntime.kind === 'capacitor' ? 'mobile' as const : 'pwa' as const }
      const refrigerator = await request<Refrigerator & { device_token?: string }>(kind === 'grant_pwa_access' ? '/api/pairings/consume' : '/api/first-boot-pairings/claim', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      if (refrigerator.device_token) await addMobileDeviceToken(refrigerator.id, refrigerator.device_token)
      clearPairingIntent(window.sessionStorage)
      setPaired(refrigerator)
    } catch (error) {
      const detail = (error as Error).message
      setMessage(detail.includes('无效') || detail.includes('过期') || detail.includes('已使用')
        ? '二维码已失效或已被使用。请回到冰箱屏幕，扫描当前显示的二维码。'
        : detail)
    } finally { setConsuming(false) }
  }

  if (!isStandalone()) return <InstallationGuide />
  if (paired) {
    return <PairingResultScreen refrigerator={paired} onContinueSetup={() => onContinueSetup?.(paired)} onOpenHome={() => onOpenHome?.(paired)} />
  }
  if (mode === 'loading') return <PageShell className="claim-screen" header={<PageHeader title="连接冰箱" />} bodyClassName="claim-content"><p>正在检查当前登录状态…</p></PageShell>
  if (mode === 'signed-out') return <PageShell className="claim-screen" header={<PageHeader title="连接冰箱" />} bodyClassName="claim-content"><p>{kind === 'grant_pwa_access' ? '登录不是必需的；登录后也可以保留本次扫码意图。' : '登录后可选择已有冰箱，或新建一台冰箱。'}</p>{message && <p role="alert" className="claim-error">{message}</p>}<button type="button" onClick={login}>登录或注册</button><button className="secondary-action scan-entry" type="button" onClick={onScan}>扫描新的二维码</button>{kind === 'grant_pwa_access' && <button className="p7-primary" type="button" disabled={consuming} onClick={() => void consume()}>{consuming ? '连接中…' : '继续连接'}</button>}</PageShell>
  return <PageShell className="claim-screen" header={<PageHeader title={kind === 'grant_pwa_access' ? '连接冰箱' : '连接这台冰箱'} />} bodyClassName="claim-content"><p>{kind === 'grant_pwa_access' ? '扫描已配置冰箱的二维码后，这台手机即可获得日常访问权限。' : '二维码仍有效时，选择目标冰箱并完成绑定。'}</p>{message && <p role="alert" className="claim-error">{message}</p>}
    {kind === 'grant_pwa_access' ? <button className="p7-primary" type="button" disabled={consuming} onClick={() => void consume()}>{consuming ? '连接中…' : '连接冰箱'}</button> : <form onSubmit={consume}>{targetRefrigeratorId ? <p>将绑定到：{fridges.find(fridge => fridge.id === targetRefrigeratorId)?.name ?? '目标冰箱'}</p> : fridges.length ? <label>选择冰箱<select value={selectedId} onChange={event => setSelectedId(event.target.value)}><option value="">新建一台冰箱</option>{fridges.map(fridge => <option key={fridge.id} value={fridge.id}>{fridge.name}</option>)}</select></label> : null}{!selectedId && !targetRefrigeratorId && <label>冰箱名称<input value={newName} onChange={event => setNewName(event.target.value)} required maxLength={120} /></label>}<button type="submit" disabled={consuming}>{consuming ? '连接中…' : '连接冰箱'}</button></form>}
    <button className="secondary-action scan-entry" type="button" onClick={onScan}>扫描新的二维码</button>
  </PageShell>
}
