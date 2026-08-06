/** 将本地日期格式化为 API 使用的本地日历日期，避免 UTC 序列化改变日期。 */
function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** 返回给定本地日期所在周的周一，格式与食谱 API 的 week_start 参数一致。 */
export function getLocalMonday(date: Date): string {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  return formatLocalDate(monday)
}

/** 对 API 日期字符串执行本地日历日加减，不经过 UTC 序列化。 */
export function addLocalCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const result = new Date(year, month - 1, day)
  result.setDate(result.getDate() + days)
  return formatLocalDate(result)
}

/**
 * 将食谱按完成状态分组，并在每个分组内按周一至周日排列。
 *
 * 空白日期保留在未完成食谱和已完成食谱之间，避免为了突出完成状态而把
 * “添加食谱”入口排到已完成食谱之后；同一天存在多道菜时，未完成菜仍排在前面。
 */
export function orderRecipeDaysByCompletion<
  T extends { weekday: number; entries: readonly { completed: boolean }[] },
>(days: T[]): T[] {
  const completionGroup = (day: T): number => {
    if (day.entries.some(entry => !entry.completed)) return 0
    if (day.entries.length === 0) return 1
    return 2
  }

  return [...days]
    .sort((left, right) => completionGroup(left) - completionGroup(right) || left.weekday - right.weekday)
    .map(day => ({
      ...day,
      entries: [...day.entries].sort((left, right) => Number(left.completed) - Number(right.completed)),
    }))
}
