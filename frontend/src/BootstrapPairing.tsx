/** 首次配对领取页。 */
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Refrigerator } from './appTypes'
import { InstallationGuide, PairingSuccess, PageHeader, PageShell } from './sharedUi'
import { isStandalone, request } from './appApi'

export function BootstrapPairing({ token, onScan }: { token: string; onScan: () => void }) {
  const [mode, setMode] = useState<'sso' | 'local' | null>(null)
  const [fridges, setFridges] = useState<Refrigerator[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [newName, setNewName] = useState('家里冰箱')
  const [message, setMessage] = useState('')
  const [paired, setPaired] = useState<Refrigerator | null>(null)
  useEffect(() => {
    if (!isStandalone()) return
    void request<{ mode: 'sso' | 'local' }>('/api/auth/mode').then(async result => {
      setMode(result.mode)
      try {
        const available = await request<Refrigerator[]>('/api/owner/refrigerators')
        setFridges(available); setSelectedId(available[0]?.id ?? '')
      } catch {
        setMode(result.mode)
      }
    }).catch(error => setMessage(error.message))
  }, [])
  const login = () => {
    const returnTo = `${window.location.pathname}${window.location.search}`
    window.location.assign(`/api/auth/login?return_to=${encodeURIComponent(returnTo)}`)
  }
  const claim = async (event: FormEvent) => {
    event.preventDefault()
    try {
      const payload = selectedId ? { pairing_token: token, standalone: true, refrigerator_id: selectedId } : { pairing_token: token, standalone: true, new_refrigerator_name: newName, new_template_key: 'mini' }
      setPaired(await request<Refrigerator>('/api/first-boot-pairings/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }))
    } catch (error) {
      const detail = (error as Error).message
      setMessage(detail.includes('无效') || detail.includes('过期') || detail.includes('已使用')
        ? '该首次配对二维码已失效。请在冰箱端刷新二维码，然后点“扫描新的二维码”。'
        : detail)
    }
  }
  if (!isStandalone()) return <InstallationGuide />
  if (paired) return <PairingSuccess refrigerator={paired} />
  if (mode === 'sso' && !fridges.length && !message) return <PageShell className="claim-screen" header={<PageHeader title="连接冰箱" />} bodyClassName="claim-content"><p>登录后可选择已有冰箱，或新建一台冰箱。</p><button onClick={login}>登录 flycn</button></PageShell>
  return <PageShell className="claim-screen" header={<PageHeader title="连接这台冰箱" />} bodyClassName="claim-content"><p>二维码仍有效时，直接连接即可；失效时可重新扫码。</p>{message && <p role="alert" className="claim-error">{message}</p>}<form onSubmit={claim}>{fridges.length ? <label>选择冰箱<select value={selectedId} onChange={event => setSelectedId(event.target.value)}><option value="">新建一台冰箱</option>{fridges.map(fridge => <option key={fridge.id} value={fridge.id}>{fridge.name}</option>)}</select></label> : null}{!selectedId && <label>冰箱名称<input value={newName} onChange={event => setNewName(event.target.value)} required maxLength={120} /></label>}<button type="submit">连接冰箱</button></form><button className="secondary-action scan-entry" onClick={onScan}>扫描新的二维码</button></PageShell>
}
