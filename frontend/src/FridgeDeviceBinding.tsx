import { useEffect, useState } from 'react'
import type { Refrigerator } from './appTypes'
import { NoticeDialog, PageHeader, PageShell } from './sharedUi'
import { canUseCapability, type RefrigeratorAccessRole } from './accessPermissions'
import {
  formatPasscodeExpiry,
  getDisplayBindingErrorMessage,
  getDisplayPasscodeErrorMessage,
  getDisplayQrBindingErrorMessage,
  type BindingView,
  type DisplayBindingPurpose,
  type DisplayBindingSuccess,
  type DisplayDeviceBindRequest,
  type DisplayPasscodeRequest,
  type DisplayPasscodeResult,
  type DisplayQrScanRequest,
  type DisplayQrScanResult,
} from './fridgeDeviceBinding.logic'

export type FridgeDeviceBindingProps = {
  refrigerator: Pick<Refrigerator, 'id' | 'name' | 'display_device_status'> & { access_role?: RefrigeratorAccessRole }
  onBack: () => void
  /** 由宿主打开真实扫码器；取消返回 null，成功时返回带用途的二维码结果。 */
  onScanQr: (request: DisplayQrScanRequest) => Promise<DisplayQrScanResult | null>
  /** 由宿主调用绑定 API；换绑必须由 purpose 明确区分，服务端负责原子替换。 */
  onBindByQr: (request: DisplayDeviceBindRequest) => Promise<void>
  /** 由宿主调用六位码创建 API；返回的码只在当前页面展示，不写入长期存储。 */
  onCreatePasscode: (request: DisplayPasscodeRequest) => Promise<DisplayPasscodeResult>
  onBindingSuccess?: (result: DisplayBindingSuccess) => void
  onCancelScan?: () => void
}

export type LayoutBindingGuideProps = {
  refrigeratorName: string
  onBindNow: () => void
  onLater: () => void
}

/**
 * 冰箱设置中的冰箱端绑定/换绑流程。
 *
 * UI 只负责展示状态和编排用户动作，扫码器、API、缓存刷新及路由均通过 props 注入。
 * 换绑请求失败时不修改传入的旧设备列表，因此旧设备继续保持展示和访问语义。
 */
export function FridgeDeviceBinding({
  refrigerator,
  onBack,
  onScanQr,
  onBindByQr,
  onCreatePasscode,
  onBindingSuccess,
  onCancelScan,
}: FridgeDeviceBindingProps) {
  const [view, setView] = useState<BindingView>('overview')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [passcodeResult, setPasscodeResult] = useState<DisplayPasscodeResult | null>(null)
  const [remainingPasscodeSeconds, setRemainingPasscodeSeconds] = useState(0)

  const purpose: DisplayBindingPurpose = refrigerator.display_device_status === 'bound'
    ? 'replace_display_device'
    : 'bind_display_device'

  useEffect(() => {
    if (!passcodeResult) return
    const timer = window.setInterval(() => {
      setRemainingPasscodeSeconds(seconds => Math.max(0, seconds - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [passcodeResult])

  const canManageDisplayDevice = refrigerator.access_role === undefined
    || canUseCapability(refrigerator.access_role, 'manage_display_device')

  if (!canManageDisplayDevice) {
    return <PageShell className="device-manager" header={<PageHeader title="冰箱设置" onBack={onBack} />} bodyClassName="p7-scroll">
      <section className="fridge-heading">
        <i className="large-fridge" aria-hidden="true" />
        <h2>{refrigerator.name}</h2>
        <small>冰箱端设备管理</small>
      </section>
      <section className="p7-notice" role="alert">
        <h3>没有权限管理冰箱端设备</h3>
        <p>你可以继续使用这台冰箱，但当前操作仅限所有者。</p>
        <button type="button" className="p7-outline" onClick={onBack}>返回冰箱设置</button>
      </section>
    </PageShell>
  }

  const closeError = () => setError('')
  const closeFlow = () => {
    if (view === 'scanning') onCancelScan?.()
    setView('overview')
    setBusy(false)
  }

  const bindWithQr = async () => {
    setError('')
    setView('scanning')
    setBusy(true)
    try {
      const result = await onScanQr({ refrigeratorId: refrigerator.id, purpose })
      if (result === null) {
        setView('overview')
        return
      }
      const qrError = getDisplayQrBindingErrorMessage(result)
      if (qrError) {
        setView('overview')
        setError(qrError)
        return
      }
      setView('success')
      await onBindByQr({ refrigeratorId: refrigerator.id, purpose, token: result.token })
      onBindingSuccess?.({ method: 'qr', purpose })
    } catch (caughtError) {
      setView('overview')
      setError(getDisplayBindingErrorMessage(caughtError, purpose))
    } finally {
      setBusy(false)
    }
  }

  const beginQrFlow = () => {
    setError('')
    if (purpose === 'replace_display_device') {
      setView('confirm-replace')
      return
    }
    void bindWithQr()
  }

  const createPasscode = async () => {
    setError('')
    setBusy(true)
    try {
      const result = await onCreatePasscode({ refrigeratorId: refrigerator.id, purpose })
      setPasscodeResult(result)
      setRemainingPasscodeSeconds(Math.max(0, result.expiresInSeconds))
    } catch (caughtError) {
      setError(getDisplayPasscodeErrorMessage(caughtError, purpose))
    } finally {
      setBusy(false)
    }
  }

  if (view === 'scanning') {
    return <PageShell className="scanner-screen" header={<PageHeader title="扫描冰箱二维码" onBack={closeFlow} />} bodyClassName="scanner-content">
      <div className="camera-frame" aria-label="冰箱二维码取景区域"><i aria-hidden="true" /></div>
      <p>{busy ? '正在等待扫描结果…' : '扫描冰箱屏幕上的绑定二维码。'}</p>
      <button type="button" className="p7-outline" onClick={closeFlow}>取消扫描</button>
      <button type="button" className="p7-outline" onClick={() => { closeFlow(); setView('passcode') }}>相机无法使用？使用六位绑定码</button>
    </PageShell>
  }

  if (view === 'passcode') {
    return <PageShell className="device-manager" header={<PageHeader title="六位绑定码" onBack={() => setView('overview')} />} bodyClassName="p7-scroll">
      <section className="fridge-device">
        <h2>{purpose === 'replace_display_device' ? '更换冰箱端设备' : '绑定冰箱端设备'}</h2>
        <p>在冰箱端绑定页面输入下面的六位码，完成{purpose === 'replace_display_device' ? '换绑' : '绑定'}。</p>
        {passcodeResult ? <div className="passcode-display" role="status" aria-live="polite">
          <strong>{passcodeResult.passcode}</strong>
          <small>{remainingPasscodeSeconds > 0 ? `${formatPasscodeExpiry(remainingPasscodeSeconds)}，仅可使用一次` : '验证码已过期，请重新生成。'}</small>
        </div> : <button type="button" className="p7-primary" disabled={busy} onClick={() => void createPasscode()}>{busy ? '生成中…' : '生成六位绑定码'}</button>}
        {passcodeResult && <button type="button" className="p7-outline" disabled={busy} onClick={() => void createPasscode()}>重新生成</button>}
        <p className="p7-help">请保持冰箱端页面打开。验证码只显示在这里，不需要在手机端输入。</p>
      </section>
      {error && <NoticeDialog title="无法生成绑定码" message={error} onClose={closeError} />}
    </PageShell>
  }

  return <PageShell className="device-manager" header={<PageHeader title={purpose === 'replace_display_device' ? '更换冰箱端设备' : '绑定冰箱端设备'} onBack={onBack} />} bodyClassName="p7-scroll">
    <section className="fridge-device">
      <h2>{purpose === 'replace_display_device' ? '更换冰箱端设备' : '绑定冰箱端设备'}</h2>
      <p>{purpose === 'replace_display_device'
        ? `为“${refrigerator.name}”扫描新冰箱端当前显示的绑定二维码。新设备成功绑定后，旧设备才会停止访问。`
        : `扫描冰箱端当前显示的绑定二维码，让它显示“${refrigerator.name}”的内容。`}</p>
      <button type="button" className="p7-primary" disabled={busy} onClick={beginQrFlow}>{purpose === 'replace_display_device' ? '扫描新设备二维码' : '扫描冰箱二维码'}</button>
      <button type="button" className="p7-outline" disabled={busy} onClick={() => { setError(''); setPasscodeResult(null); setRemainingPasscodeSeconds(0); setView('passcode') }}>使用六位绑定码</button>
    </section>
    {view === 'confirm-replace' && <ReplaceConfirmation refrigeratorName={refrigerator.name} deviceLabel="当前冰箱端" onCancel={() => setView('overview')} onConfirm={() => void bindWithQr()} />}
    {view === 'success' && <div className="p7-notice-modal" role="status" aria-live="polite"><section className="p7-notice-dialog"><h2>正在绑定冰箱端</h2><p>已识别二维码，正在确认新设备。绑定成功后会刷新当前设置。</p></section></div>}
    {error && <NoticeDialog title="绑定失败" message={error} onClose={closeError} />}
  </PageShell>
}

function ReplaceConfirmation({ refrigeratorName, deviceLabel, onCancel, onConfirm }: { refrigeratorName: string; deviceLabel: string; onCancel: () => void; onConfirm: () => void }) {
  return <div className="p7-notice-modal p7-replace-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="replace-display-title">
    <section className="p7-notice-dialog">
      <button type="button" className="p7-notice-close" onClick={onCancel} aria-label="关闭换绑确认">×</button>
      <h2 id="replace-display-title">更换冰箱端设备？</h2>
      <p>扫描并成功绑定新设备后，“{deviceLabel}”将停止访问“{refrigeratorName}”。扫描失败或取消不会影响当前设备。</p>
      <button type="button" className="p7-primary" onClick={onConfirm}>扫描新设备</button>
      <button type="button" className="p7-outline" onClick={onCancel}>取消</button>
    </section>
  </div>
}

/** 布局保存成功后的非阻塞分流：立即绑定或返回首页稍后处理。 */
export function LayoutBindingGuide({ refrigeratorName, onBindNow, onLater }: LayoutBindingGuideProps) {
  return <PageShell className="pair-success" header={<PageHeader title="布局已完成" />} bodyClassName="success-center">
    <div className="connection-art" aria-hidden="true"><span className="art-fridge" /><span className="art-link">✓</span><span className="art-phone" /></div>
    <h1>冰箱布局已创建</h1>
    <p>接下来可以绑定冰箱端设备，让冰箱屏幕显示“{refrigeratorName}”的布局。</p>
    <div className="actions">
      <button type="button" className="p7-primary" onClick={onBindNow}>扫码绑定冰箱端</button>
      <button type="button" className="p7-outline" onClick={onLater}>稍后绑定</button>
    </div>
  </PageShell>
}
