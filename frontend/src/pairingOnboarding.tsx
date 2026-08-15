import type { Refrigerator } from './appTypes'
import { AppHeader, PageShell } from './sharedUi'

export function EmptyOwnerHome({ onScan, onLogin, message = '' }: { onScan: () => void; onLogin: () => void; message?: string }) {
  return <PageShell className="owner-start pairing-empty-home" header={<AppHeader />} bodyClassName="owner-start-content pairing-empty-content">
    <div className="app-mark" aria-hidden="true" />
    <h1>开始使用家常食橱</h1>
    <p>扫描冰箱屏幕上的二维码，连接已有冰箱；或登录后查看和创建你的冰箱。</p>
    <div className="pairing-entry-actions"><button className="pairing-primary" type="button" onClick={onScan}>扫描冰箱二维码</button><button className="pairing-secondary" type="button" onClick={onLogin}>登录或注册</button></div>
    {message && <p className="notice" role="status">{message}</p>}
  </PageShell>
}

export function PairingResultScreen({ refrigerator, onContinueSetup, onOpenHome }: { refrigerator: Refrigerator; onContinueSetup?: () => void; onOpenHome?: () => void }) {
  const needsSetup = refrigerator.setup_status === 'needs_layout'
  return <PageShell className="pair-success pairing-result-screen" header={<AppHeader />} bodyClassName="success-center">
    <div className="connection-art" aria-hidden="true"><span className="art-fridge" /><span className="art-link">✓</span><span className="art-phone" /></div>
    <h1>{needsSetup ? '冰箱端设备已连接' : `已添加“${refrigerator.name}”`}</h1>
    <p>{needsSetup ? `接下来为“${refrigerator.name}”创建布局。完成后，冰箱屏幕会自动显示新布局。` : '这台手机现在可以管理物品和食谱。'}</p>
    <div className="pairing-entry-actions">
      {needsSetup ? <button className="p7-primary" type="button" onClick={onContinueSetup}>创建冰箱布局</button> : <button className="p7-primary" type="button" onClick={onOpenHome}>打开冰箱首页</button>}
    </div>
  </PageShell>
}

export function PairingFailureScreen({ message, onScan, onBack }: { message: string; onScan: () => void; onBack: () => void }) {
  return <PageShell className="claim-screen pairing-failure-screen" header={<AppHeader />} bodyClassName="success-center">
    <div aria-hidden="true" className="pairing-retry-mark">↻</div>
    <h1>二维码已经更新</h1>
    <p>{message}</p>
    <div className="pairing-entry-actions"><button className="p7-primary" type="button" onClick={onScan}>重新扫描</button><button type="button" onClick={onBack}>返回首页</button></div>
  </PageShell>
}
