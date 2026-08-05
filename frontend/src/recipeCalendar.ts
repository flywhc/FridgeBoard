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

/** 将一周的日期按本地今天开始排列，保持今天之后再到今天之前的顺序。 */
export function orderWeekDaysFromToday<T extends { weekday: number }>(days: T[], date = new Date()): T[] {
  const todayWeekday = (date.getDay() + 6) % 7
  return [...days].sort((left, right) => {
    const leftOffset = (left.weekday - todayWeekday + 7) % 7
    const rightOffset = (right.weekday - todayWeekday + 7) % 7
    return leftOffset - rightOffset
  })
}
