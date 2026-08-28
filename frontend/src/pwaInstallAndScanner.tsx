/** PWA 安装提示和二维码扫描页面。
 *
 * 组件只管理浏览器安装引导与相机扫描生命周期；配对结果仍交回 App 处理，避免
 * 在展示组件中写入业务状态或改变配对协议。
 */
import { useEffect, useRef, useState } from 'react'
import type { IScannerControls } from '@zxing/browser'
import { getCameraErrorMessage } from './camera'
import { getPwaInstallPromptMode } from './pwaInstallPrompt'
import { isPairingQrUrlFromDifferentOrigin, PAIRING_QR_DIFFERENT_ORIGIN_MESSAGE, parsePairingQrUrl, savePairingIntent, type PairingQr } from './pairingFlow'
import { appRuntime, resolveApiUrl } from './runtime'
import { Dialog, PageHeader, PageShell } from './sharedUi'

const PWA_INSTALL_DISMISSED_STORAGE_KEY = 'fb-pwa-install-dismissed'

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isAppleMobile(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

function AndroidShortcutIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 6.5h10a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 17 16.5H7A1.5 1.5 0 0 1 5.5 15V8A1.5 1.5 0 0 1 7 6.5Z" />
    <path d="M9.5 20h5M12 16.5V20" />
    <path d="M3.5 2.5v5M1.5 5.5l2 2 2-2" />
  </svg>
}

function AndroidInstallPrompt({ close, dontRemind, onDontRemindChange, onInstall }: { close: () => void; dontRemind: boolean; onDontRemindChange: (value: boolean) => void; onInstall?: () => void }) {
  return <Dialog title="安装家常食橱" onClose={close} closeLabel="关闭安装提示" className="pwa-install-modal" dialogClassName="pwa-install-dialog">
      <p>安装后，在应用内再扫一次冰箱上的二维码即可连接。</p>
      <ol className="pwa-install-steps" aria-label="Android 安装步骤">
        <li><span aria-hidden="true">⋮</span><b>浏览器菜单</b></li>
        <li aria-hidden="true">›</li>
        <li><span aria-hidden="true"><AndroidShortcutIcon /></span><b>安装并创建快捷方式</b></li>
        <li aria-hidden="true">›</li>
        <li><span aria-hidden="true">✓</span><b>完成安装</b></li>
      </ol>
      <label className="pwa-install-dismiss"><input type="checkbox" checked={dontRemind} onChange={event => onDontRemindChange(event.target.checked)} />不再提醒</label>
      {onInstall && <button className="pwa-install-action p7-primary" type="button" onClick={onInstall}>安装应用</button>}
  </Dialog>
}

export function PwaInstallPrompt({ installEvent, installed, onInstallEventConsumed }: { installEvent: BeforeInstallPromptEvent | null; installed: boolean; onInstallEventConsumed: () => void }) {
  const [open, setOpen] = useState(() => window.localStorage.getItem(PWA_INSTALL_DISMISSED_STORAGE_KEY) !== 'true')
  const [dontRemind, setDontRemind] = useState(false)
  const mode = getPwaInstallPromptMode({ isAppleMobile: isAppleMobile(), hasInstallEvent: installEvent !== null })
  if (installed || !open) return null
  const close = () => {
    if (dontRemind) window.localStorage.setItem(PWA_INSTALL_DISMISSED_STORAGE_KEY, 'true')
    setOpen(false)
  }
  if (mode === 'install') {
    const install = async () => {
      if (!installEvent) return
      await installEvent.prompt()
      await installEvent.userChoice
      onInstallEventConsumed()
      close()
    }
    return <AndroidInstallPrompt close={close} dontRemind={dontRemind} onDontRemindChange={setDontRemind} onInstall={() => void install()} />
  }
  const isAppleGuide = mode === 'apple-guide'
  if (!isAppleGuide) return <AndroidInstallPrompt close={close} dontRemind={dontRemind} onDontRemindChange={setDontRemind} />
  return <Dialog title="添加到主屏幕" onClose={close} closeLabel="关闭安装提示" className="pwa-install-modal" dialogClassName="pwa-install-dialog">
      <p>这是一个网页应用，为了安装它，请先在Safari中点击菜单“共享”或“分享”按钮，再选择“添加到主屏幕”。</p>
      <label className="pwa-install-dismiss"><input type="checkbox" checked={dontRemind} onChange={event => setDontRemind(event.target.checked)} />不再提醒</label>
  </Dialog>
}

/** 在已安装 PWA 中调用浏览器原生二维码检测，成功后进入配对流程。 */
export function PwaScanner({ onClose, targetRefrigeratorId, displayBindingPurpose, onScanResult }: { onClose: () => void; targetRefrigeratorId?: string; displayBindingPurpose?: 'bind_display_device' | 'replace_display_device'; onScanResult?: (parsed: PairingQr) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [message, setMessage] = useState('正在打开相机…')
  const pairingOrigin = appRuntime.apiOrigin ?? window.location.origin
  useEffect(() => {
    let controls: IScannerControls | undefined
    let active = true
    const start = async () => {
      if (!videoRef.current) return
      try {
        const { BrowserQRCodeReader } = await import('@zxing/browser')
        if (!active || !videoRef.current) return
        const reader = new BrowserQRCodeReader()
        controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (!active || !result) return
          try {
            const scannedText = result.getText()
            if (isPairingQrUrlFromDifferentOrigin(scannedText, pairingOrigin)) {
              setMessage(PAIRING_QR_DIFFERENT_ORIGIN_MESSAGE)
              return
            }
            const parsed = parsePairingQrUrl(scannedText, pairingOrigin)
            if (!parsed) { setMessage('这不是家常食橱可识别的冰箱二维码。'); return }
            if (onScanResult) {
              controls?.stop()
              onScanResult(parsed)
              return
            }
            savePairingIntent(window.sessionStorage, { ...parsed, targetRefrigeratorId, displayBindingPurpose })
            controls?.stop()
            const parameter = parsed.kind === 'bootstrap' ? 'bootstrap' : 'token'
            window.location.assign(resolveApiUrl(`/pair?${parameter}=${encodeURIComponent(parsed.token)}`, appRuntime))
          } catch { setMessage('无法识别该二维码，请对准冰箱端页面后重试。') }
        })
        setMessage('将冰箱端上的二维码放入取景框。')
      } catch (error) {
        if (active) setMessage(getCameraErrorMessage(error, {
          isSecureContext: window.isSecureContext,
          hasGetUserMedia: Boolean(navigator.mediaDevices?.getUserMedia),
        }))
      }
    }
    void start()
    return () => { active = false; controls?.stop() }
  }, [displayBindingPurpose, onScanResult, pairingOrigin, targetRefrigeratorId])
  return <PageShell className="scanner-screen" header={<PageHeader title="扫描冰箱端二维码" onBack={onClose} />} bodyClassName="scanner-content"><div className="camera-frame"><video ref={videoRef} muted playsInline /><i /></div><p role="status">{message}</p></PageShell>
}
