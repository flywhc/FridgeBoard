import { useEffect, useState } from 'react'
import {
  approveMobileSessionClear,
  beginMobileLogin,
  getMobileAuthIssue,
  MOBILE_AUTH_ISSUE_EVENT,
  submitMobileAuthDiagnostic,
  type MobileAuthIssue,
} from './mobileAuth'
import { Dialog } from './sharedUi'

type SubmissionState = 'idle' | 'submitting' | 'submitted' | 'failed' | 'clearing' | 'clear-failed'

/** 展示认证中断原因，并把 token 清理严格限制在用户确认动作之后。 */
export function MobileAuthIssueDialog({ issue, onDismiss, onSubmit, onApproveClear, state = 'idle' }: {
  issue: MobileAuthIssue
  onDismiss: () => void
  onSubmit: () => void
  onApproveClear: () => void
  state?: SubmissionState
}) {
  return <Dialog title={issue.title} onClose={onDismiss} closeLabel="暂不处理登录问题" closeDisabled={state === 'clearing'}>
    <p>{issue.message}</p>
    <p className="notice">诊断编号：<code>{issue.reportId}</code></p>
    {state === 'submitted' && <p role="status">现场信息已提交。反馈问题时提供上面的诊断编号即可。</p>}
    {state === 'failed' && <p role="alert">现场信息提交失败。诊断编号仍可用于反馈，请联网后再试。</p>}
    {state === 'clear-failed' && <p role="alert">未能完成清除并打开登录，请检查网络后重试。若清除尚未完成，本地登录信息会继续保留。</p>}
    <div className="modal-actions">
      <button className="modal-secondary" type="button" disabled={state === 'submitting' || state === 'clearing'} onClick={onSubmit}>{state === 'submitting' ? '提交中…' : state === 'submitted' ? '重新提交错误信息' : '提交错误信息'}</button>
      <button className="modal-primary" type="button" disabled={state === 'submitting' || state === 'clearing'} onClick={onApproveClear}>{state === 'clearing' ? '正在清除…' : '重新登录'}</button>
      <button className="modal-secondary" type="button" disabled={state === 'clearing'} onClick={onDismiss}>稍后再试</button>
    </div>
  </Dialog>
}

/** 监听全局认证故障；不论当前业务页面为何，都在原页面上显示诊断和授权操作。 */
export function MobileAuthIssueHost() {
  const [issue, setIssue] = useState<MobileAuthIssue | null>(() => getMobileAuthIssue())
  const [visible, setVisible] = useState(() => Boolean(getMobileAuthIssue()?.requiresLogin))
  const [state, setState] = useState<SubmissionState>('idle')
  useEffect(() => {
    const showLatestIssue = () => {
      const latest = getMobileAuthIssue()
      setIssue(latest)
      setVisible(Boolean(latest?.requiresLogin))
      setState('idle')
    }
    window.addEventListener(MOBILE_AUTH_ISSUE_EVENT, showLatestIssue)
    return () => window.removeEventListener(MOBILE_AUTH_ISSUE_EVENT, showLatestIssue)
  }, [])
  if (!issue?.requiresLogin || !visible) return null
  const submit = async () => {
    setState('submitting')
    try { await submitMobileAuthDiagnostic(issue); setState('submitted') } catch { setState('failed') }
  }
  const approve = async () => {
    setState('clearing')
    try {
      await approveMobileSessionClear()
      setVisible(false)
      await beginMobileLogin({ forceLogin: true })
    } catch {
      setVisible(true)
      setState('clear-failed')
    }
  }
  return <MobileAuthIssueDialog issue={issue} state={state} onDismiss={() => setVisible(false)} onSubmit={() => void submit()} onApproveClear={() => void approve()} />
}
