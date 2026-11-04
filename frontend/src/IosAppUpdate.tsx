import { useCallback, useEffect, useRef, useState } from 'react'

import { formatReleaseNotes } from './appUpdate'
import { checkForIosUpdate, installIosUpdate, markIosUpdateCheck, shouldAutoCheckIosUpdate, type IosUpdateCheck } from './iosUpdate'
import { subscribeAppResume } from './nativeBridge'
import { NoticeDialog } from './sharedUi'

/** 复用关于页更新布局，将 Ad Hoc 安装交给 Safari 和 iOS 系统确认。 */
export function IosAppUpdate() {
  const [result, setResult] = useState<IosUpdateCheck | null>(null)
  const [state, setState] = useState<'idle' | 'checking' | 'opening'>('idle')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)
  const handedOff = useRef(false)

  const check = useCallback(async (install = false) => {
    if (request.current) return
    const controller = new AbortController()
    request.current = controller
    markIosUpdateCheck()
    setState(install ? 'opening' : 'checking')
    setError('')
    setMessage(install ? '正在确认更新并打开安装页面…' : '正在检查最新版…')
    try {
      const next = await (install ? installIosUpdate(fetch, controller.signal) : checkForIosUpdate(fetch, controller.signal))
      if (controller.signal.aborted) return
      setResult(next)
      handedOff.current = install && next.available
      setMessage(handedOff.current
        ? '已打开安装页面。请在 Safari 登录门户，选择 iOS 版本并确认安装；安装进度请查看主屏幕。'
        : next.available ? `发现新版本 v${next.remote?.version}` : '暂无可用的 Ad Hoc 更新。')
    } catch (failure) {
      if (!controller.signal.aborted) {
        const detail = failure instanceof Error ? failure.message : '检查更新失败，请确认网络后重试。'
        setMessage('更新操作未完成，请重试。')
        setError(detail)
      }
    } finally {
      if (request.current === controller) {
        request.current = null
        if (!controller.signal.aborted) setState('idle')
      }
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (shouldAutoCheckIosUpdate()) void check()
    }, 0)
    const unsubscribe = subscribeAppResume(() => {
      if (handedOff.current) {
        handedOff.current = false
        void check()
      }
    })
    return () => {
      window.clearTimeout(timer)
      request.current?.abort()
      unsubscribe()
    }
  }, [check])

  const remote = result?.available ? result.remote : null
  return <section className="p7-about-update" aria-label="iOS 应用更新">
    <p>Ad Hoc 更新由 Safari 下载并交给系统确认安装。此设备必须包含在新版本的授权设备名单中。</p>
    <p className="p7-about-update-status" role="status">{message}</p>
    {remote && <button className="p7-primary p7-about-download" type="button" disabled={state !== 'idle'} onClick={() => void check(true)}>{state === 'opening' ? '正在打开…' : '下载并安装更新'}</button>}
    <button className="p7-about-secondary p7-outline" type="button" disabled={state !== 'idle'} onClick={() => void check()}>{state === 'checking' ? '检查中…' : '检查更新'}</button>
    {remote && <div className="p7-about-update-details"><p className="p7-about-update-notes">v{remote.version} · release {remote.release}</p>{remote.release_notes && <textarea className="p7-about-release-notes" aria-label="版本更新说明" readOnly rows={8} value={formatReleaseNotes(remote.release_notes)} />}</div>}
    {error && <NoticeDialog title="更新失败" message={error} onClose={() => setError('')} />}
  </section>
}
