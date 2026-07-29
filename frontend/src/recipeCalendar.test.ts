import { describe, expect, it } from 'vitest'
import { addLocalCalendarDays, getLocalMonday } from './recipeCalendar'

describe('getLocalMonday', () => {
  it('周一凌晨仍返回当天，而非 UTC 的前一天', () => {
    expect(getLocalMonday(new Date(2026, 6, 27, 0, 30))).toBe('2026-07-27')
  })

  it('周日晚上归属同一周的周一', () => {
    expect(getLocalMonday(new Date(2026, 6, 26, 23, 59))).toBe('2026-07-20')
  })
})

describe('addLocalCalendarDays', () => {
  it('跨月时保持本地日历日期', () => {
    expect(addLocalCalendarDays('2026-08-31', 7)).toBe('2026-09-07')
  })
})
