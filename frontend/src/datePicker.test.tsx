import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DatePickerField, DatePickerYearGrid } from './datePicker'
import { formatDateForDisplay, getCalendarMonthDays, getDatePickerYearOptions, setDatePickerYear, shiftDatePickerYearRange } from './datePickerUtils'

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

  it('按十年范围生成可直接点选的年份列表', () => {
    expect(getDatePickerYearOptions(2026)).toEqual([2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030])
    expect(shiftDatePickerYearRange(2026, 1)).toBe(2036)
    expect(shiftDatePickerYearRange(2026, -1)).toBe(2016)
    expect(setDatePickerYear('2026-08', 2030)).toBe('2030-08')
  })

  it('年份选择器渲染可访问的年份按钮并标记当前年份', () => {
    const markup = renderToStaticMarkup(createElement(DatePickerYearGrid, { years: [2025, 2026], selectedYear: 2026, onSelect: () => undefined }))
    expect(markup).toContain('role="grid" aria-label="年份选择器"')
    expect(markup).toContain('2025年')
    expect(markup).toContain('class="is-selected" aria-pressed="true"')
  })

  it('日期字段不再渲染原生 date input', () => {
    const markup = renderToStaticMarkup(createElement(DatePickerField, { label: '生产日期', value: '2026-08-04', onChange: () => undefined }))
    expect(markup).toContain('class="p5-date-input"')
    expect(markup).not.toContain('type="date"')
    expect(markup).toContain('08/04')
  })
})
