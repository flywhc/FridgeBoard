import { describe, expect, it } from 'vitest'
import { addLocalCalendarDays, getLocalMonday, orderRecipeDaysByCompletion } from './recipeCalendar'

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

describe('orderRecipeDaysByCompletion', () => {
  it('未完成食谱优先，已完成食谱最后，两个分组内按星期排列', () => {
    const days = [
      { weekday: 4, entries: [{ completed: true }] },
      { weekday: 1, entries: [{ completed: false }] },
      { weekday: 3, entries: [] },
      { weekday: 0, entries: [{ completed: false }] },
      { weekday: 2, entries: [{ completed: true }] },
    ]

    expect(orderRecipeDaysByCompletion(days).map(day => day.weekday)).toEqual([0, 1, 3, 2, 4])
  })

  it('同一天有多道食谱时未完成食谱排在前面', () => {
    const days = [{ weekday: 2, entries: [{ completed: true }, { completed: false }] }]

    expect(orderRecipeDaysByCompletion(days)[0].entries.map(entry => entry.completed)).toEqual([false, true])
  })
})
