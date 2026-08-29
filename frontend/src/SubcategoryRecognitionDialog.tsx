import { Dialog } from './sharedUi'

/** 展示自定义小类保存和识别进度，确认结果前暂停原有返回流程。 */
export function SubcategoryRecognitionDialog({
  status,
  names,
  busy,
  error,
  onRetry,
  onConfirm,
}: {
  status: string
  names: string[]
  busy: boolean
  error: string
  onRetry: () => void
  onConfirm: () => void
}) {
  const completed = !busy && !error
  return <Dialog
    title="识别此类物品"
    dialogClassName="p5-category-recognition-dialog"
  >
    <p className={`p5-category-recognition-status${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'} aria-live="polite">
      {error || status}
    </p>
    <label className="p5-category-recognition-list">
      <span>识别并归入此类的物品</span>
      <textarea readOnly rows={5} value={names.join('，')} placeholder={completed ? '未发现匹配物品' : '识别完成后显示物品名称'} />
    </label>
    <div className="modal-actions">
      {error && <button className="modal-secondary" type="button" onClick={onRetry}>重试识别</button>}
      {completed && <button className="modal-primary" type="button" onClick={onConfirm}>确认</button>}
    </div>
  </Dialog>
}
