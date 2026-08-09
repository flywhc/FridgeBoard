import { addLocalCalendarDays } from './recipeCalendar'
import type { RestockEntry } from './appTypes'

export type RestockWeekGroups = { current: RestockEntry[]; next: RestockEntry[] }

/**
 * Splits the API result into the current and following calendar weeks.
 *
 * Entries without a week marker remain in the current group for compatibility
 * with cached responses from before the API exposed `week_start`.
 *
 * @param entries Restock entries returned by the API.
 * @param currentWeekStart Monday of the current week in local date format.
 * @returns Entries grouped by the current and following week.
 */
export function splitRestockByWeek(entries: RestockEntry[], currentWeekStart: string): RestockWeekGroups {
  const nextWeekStart = addLocalCalendarDays(currentWeekStart, 7)
  return entries.reduce<RestockWeekGroups>((groups, entry) => {
    groups[entry.week_start === nextWeekStart ? 'next' : 'current'].push(entry)
    return groups
  }, { current: [], next: [] })
}
