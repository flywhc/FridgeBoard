import { useState } from 'react'
import { Dialog } from './sharedUi'
import { formatDateForDisplay, getCalendarMonthDays, getDatePickerInitialMonth, getDatePickerYearOptions, getTodayDatePickerValue, setDatePickerYear, shiftDatePickerMonth, shiftDatePickerYearRange } from './datePickerUtils'

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

function formatMonthTitle(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number)
  return `${year}年${monthNumber}月`
}

function getDatePickerYear(month: string): number {
  return Number(month.slice(0, 4))
}

export function DatePickerYearGrid({ years, selectedYear, onSelect }: {
  years: number[]
  selectedYear: number
  onSelect: (year: number) => void
}) {
  return <div className="p5-date-year-grid" role="grid" aria-label="年份选择器">
    {years.map(year => <button key={year} type="button" className={year === selectedYear ? 'is-selected' : ''} aria-pressed={year === selectedYear} onClick={() => onSelect(year)}>{year}年</button>)}
  </div>
}

export function DatePickerField({ label, value, onChange }: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [visibleMonth, setVisibleMonth] = useState(() => getDatePickerInitialMonth(value))
  const [calendarMode, setCalendarMode] = useState<'days' | 'years'>('days')
  const [yearRangeYear, setYearRangeYear] = useState(() => getDatePickerYear(getDatePickerInitialMonth(value)))

  const days = getCalendarMonthDays(visibleMonth)
  const visibleYear = getDatePickerYear(visibleMonth)
  const yearOptions = getDatePickerYearOptions(yearRangeYear)
  return <>
    <label className="p5-field p5-date-field">
      <span>{label}</span>
      <button className="p5-date-input" type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => { const initialMonth = getDatePickerInitialMonth(value); setVisibleMonth(initialMonth); setYearRangeYear(getDatePickerYear(initialMonth)); setCalendarMode('days'); setOpen(true) }}>
        {formatDateForDisplay(value)}
      </button>
    </label>
    {open && <Dialog title={label} onClose={() => setOpen(false)} closeLabel={`关闭${label}选择`} className="p5-date-modal" dialogClassName="p5-date-dialog">
      <div className="p5-date-picker" aria-label={`${label}日期选择器`}>
        <div className="p5-date-picker-toolbar">
          <button type="button" className="p5-date-nav" onClick={() => calendarMode === 'years' ? setYearRangeYear(current => shiftDatePickerYearRange(current, -1)) : setVisibleMonth(current => shiftDatePickerMonth(current, -1))} aria-label={calendarMode === 'years' ? '上一个年份范围' : '上个月'}>‹</button>
          {calendarMode === 'years'
            ? <button type="button" className="p5-date-title" aria-haspopup="grid" aria-expanded="true" onClick={() => setCalendarMode('days')}>{yearOptions[0]}—{yearOptions.at(-1)}年</button>
            : <button type="button" className="p5-date-title" aria-haspopup="grid" aria-expanded="false" aria-label={`${formatMonthTitle(visibleMonth)}，选择年份`} onClick={() => { setYearRangeYear(visibleYear); setCalendarMode('years') }}>{formatMonthTitle(visibleMonth)}</button>}
          <button type="button" className="p5-date-nav" onClick={() => calendarMode === 'years' ? setYearRangeYear(current => shiftDatePickerYearRange(current, 1)) : setVisibleMonth(current => shiftDatePickerMonth(current, 1))} aria-label={calendarMode === 'years' ? '下一个年份范围' : '下个月'}>›</button>
        </div>
        {calendarMode === 'years' ? <DatePickerYearGrid years={yearOptions} selectedYear={visibleYear} onSelect={year => { setVisibleMonth(current => setDatePickerYear(current, year)); setCalendarMode('days') }} /> : <>
          <div className="p5-date-weekdays" aria-hidden="true">{WEEKDAY_LABELS.map(day => <span key={day}>{day}</span>)}</div>
          <div className="p5-date-grid">
            {days.map((day, index) => day
              ? <button key={day} type="button" className={day === value ? 'is-selected' : ''} aria-label={day} aria-pressed={day === value} onClick={() => { onChange(day); setOpen(false) }}>{Number(day.slice(-2))}</button>
              : <span key={`empty-${index}`} aria-hidden="true" />)}
          </div>
        </>}
        <div className="p5-date-actions">
          <button type="button" className="p5-date-clear" onClick={() => { onChange(''); setOpen(false) }} disabled={!value}>清除日期</button>
          <button type="button" className="p5-date-today" onClick={() => { onChange(getTodayDatePickerValue()); setOpen(false) }}>今天</button>
        </div>
      </div>
    </Dialog>}
  </>
}
