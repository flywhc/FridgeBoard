import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DatePickerField } from './datePicker'
import { formatDateForDisplay, getCalendarMonthDays } from './datePickerUtils'

describe('应用内日期选择器', () => {
  it('按 ISO 日期生成完整月份网格并保持周日为第一列', () => {
    const days = getCalendarMonthDays('2026-08')
    expect(days).toHaveLength(42)
    expect(days[6]).toBe('2026-08-01')
    expect(days[36]).toBe('2026-08-31')
  })

  it('显示月日，空值显示占位文案', () => {
    expect(formatDateForDisplay('2026-08-04')).toBe('08/04')
    expect(formatDateForDisplay('')).toBe('请选择日期')
    expect(formatDateForDisplay('2026-02-30')).toBe('请选择日期')
  })

  it('日期字段不再渲染原生 date input', () => {
    const markup = renderToStaticMarkup(createElement(DatePickerField, { label: '生产日期', value: '2026-08-04', onChange: () => undefined }))
    expect(markup).toContain('class="p5-date-input"')
    expect(markup).not.toContain('type="date"')
    expect(markup).toContain('08/04')
  })
})
