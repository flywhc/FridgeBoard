function getTodayIso(): string {
  const today = new Date()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${today.getFullYear()}-${month}-${day}`
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

export function getDatePickerInitialMonth(value: string): string {
  return isIsoDate(value) ? value.slice(0, 7) : getTodayIso().slice(0, 7)
}

export function shiftDatePickerMonth(month: string, amount: number): string {
  const [year, monthNumber] = month.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + amount, 1))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`
}

export function getCalendarMonthDays(month: string): string[] {
  const [year, monthNumber] = month.split('-').map(Number)
  const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1))
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  const days: string[] = []
  for (let index = 0; index < firstDay.getUTCDay(); index += 1) days.push('')
  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push(`${year}-${String(monthNumber).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
  }
  while (days.length % 7 !== 0) days.push('')
  return days
}

export function formatDateForDisplay(value: string): string {
  if (!isIsoDate(value)) return '请选择日期'
  const [, month, day] = value.split('-')
  return `${month}/${day}`
}

export function getTodayDatePickerValue(): string {
  return getTodayIso()
}
