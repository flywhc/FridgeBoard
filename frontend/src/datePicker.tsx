import { useState } from 'react'
import { Dialog } from './sharedUi'
import { formatDateForDisplay, getCalendarMonthDays, getDatePickerInitialMonth, getTodayDatePickerValue, shiftDatePickerMonth } from './datePickerUtils'

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

function formatMonthTitle(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number)
  return `${year}年${monthNumber}月`
}

export function DatePickerField({ label, value, onChange }: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [visibleMonth, setVisibleMonth] = useState(() => getDatePickerInitialMonth(value))

  const days = getCalendarMonthDays(visibleMonth)
  return <>
    <label className="p5-field p5-date-field">
      <span>{label}</span>
      <button className="p5-date-input" type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => { setVisibleMonth(getDatePickerInitialMonth(value)); setOpen(true) }}>
        {formatDateForDisplay(value)}
      </button>
    </label>
    {open && <Dialog title={label} onClose={() => setOpen(false)} closeLabel={`关闭${label}选择`} className="p5-date-modal" dialogClassName="p5-date-dialog">
      <div className="p5-date-picker" aria-label={`${label}日期选择器`}>
        <div className="p5-date-picker-toolbar">
          <button type="button" className="p5-date-nav" onClick={() => setVisibleMonth(current => shiftDatePickerMonth(current, -1))} aria-label="上个月">‹</button>
          <strong>{formatMonthTitle(visibleMonth)}</strong>
          <button type="button" className="p5-date-nav" onClick={() => setVisibleMonth(current => shiftDatePickerMonth(current, 1))} aria-label="下个月">›</button>
        </div>
        <div className="p5-date-weekdays" aria-hidden="true">{WEEKDAY_LABELS.map(day => <span key={day}>{day}</span>)}</div>
        <div className="p5-date-grid">
          {days.map((day, index) => day
            ? <button key={day} type="button" className={day === value ? 'is-selected' : ''} aria-label={day} aria-pressed={day === value} onClick={() => { onChange(day); setOpen(false) }}>{Number(day.slice(-2))}</button>
            : <span key={`empty-${index}`} aria-hidden="true" />)}
        </div>
        <div className="p5-date-actions">
          <button type="button" className="p5-date-clear" onClick={() => { onChange(''); setOpen(false) }} disabled={!value}>清除日期</button>
          <button type="button" className="p5-date-today" onClick={() => { onChange(getTodayDatePickerValue()); setOpen(false) }}>今天</button>
        </div>
      </div>
    </Dialog>}
  </>
}
