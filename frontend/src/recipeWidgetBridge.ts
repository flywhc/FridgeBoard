import { Capacitor, registerPlugin } from '@capacitor/core'

import type { RecipeDay, Refrigerator } from './appTypes'
import { orderRecipeDaysByCompletion } from './recipeCalendar'
import type { RecipeCache } from './recipePageData'
import { formatQuantity } from './quantity'

/** The intentionally small refrigerator record persisted for widget selection. */
export type RecipeWidgetFridge = Pick<Refrigerator, 'id' | 'name' | 'access_role'>

export type RecipeWidgetEntry = {
  id: string
  weekday: number
  label: string
  dishName: string
  ingredientsDisplay: string
  completed: boolean
  missingCount: number
}

export type RecipeWidgetSnapshot = {
  refrigerator: RecipeWidgetFridge
  weekStart: string
  capturedAt: number
  entries: RecipeWidgetEntry[]
}

type RecipeWidgetPlugin = {
  publishFridges(options: { fridges: Array<{ id: string; name: string; accessRole: Refrigerator['access_role'] }> }): Promise<void>
  publishWeek(options: {
    refrigerator: { id: string; name: string; accessRole: Refrigerator['access_role'] }
    weekStart: string
    capturedAt: number
    entries: RecipeWidgetEntry[]
  }): Promise<void>
  refreshWidgets(options: { refrigeratorId?: string }): Promise<void>
  clearForFridge(options: { refrigeratorId: string }): Promise<void>
  clearAll(): Promise<void>
  advanceAccountGeneration(): Promise<void>
}

const MAX_FRIDGES = 32
const MAX_SNAPSHOTS = 64
const MAX_ID_LENGTH = 128
const MAX_NAME_LENGTH = 128
const MAX_LABEL_LENGTH = 32
const MAX_DISH_NAME_LENGTH = 128
const MAX_INGREDIENT_NAME_LENGTH = 64
const MAX_INGREDIENTS_DISPLAY_LENGTH = 256
const MAX_INGREDIENTS = 64
const WEEK_START_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const RecipeWidget = registerPlugin<RecipeWidgetPlugin>('RecipeWidget', {
  web: () => ({
    publishFridges: async () => undefined,
    publishWeek: async () => undefined,
    refreshWidgets: async () => undefined,
    clearForFridge: async () => undefined,
    clearAll: async () => undefined,
    advanceAccountGeneration: async () => undefined,
  }),
})

function isAndroidRuntime(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

function requireString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') throw new TypeError(`${field} must be a string`)
  const normalized = value.trim()
  if (!normalized || normalized.length > maxLength) throw new RangeError(`${field} is invalid`)
  return normalized
}

function normalizeFridge(fridge: RecipeWidgetFridge): RecipeWidgetFridge {
  const id = requireString(fridge?.id, 'refrigerator.id', MAX_ID_LENGTH)
  const name = requireString(fridge?.name, 'refrigerator.name', MAX_NAME_LENGTH)
  const accessRole = fridge?.access_role
  if (accessRole !== 'owner' && accessRole !== 'daily_access') throw new TypeError('refrigerator.access_role is invalid')
  return {
    id,
    name,
    access_role: accessRole,
  }
}

function toNativeFridge(fridge: RecipeWidgetFridge): { id: string; name: string; accessRole: Refrigerator['access_role'] } {
  const normalized = normalizeFridge(fridge)
  return { id: normalized.id, name: normalized.name, accessRole: normalized.access_role }
}

function normalizeWeekStart(weekStart: string): string {
  const normalized = requireString(weekStart, 'weekStart', 10)
  if (!WEEK_START_PATTERN.test(normalized)) throw new RangeError('weekStart is invalid')
  return normalized
}

function getDays(value: RecipeDay[] | RecipeCache): RecipeDay[] {
  if (Array.isArray(value)) return value
  if (value && Array.isArray(value.days)) return value.days
  throw new TypeError('recipe days are required')
}

function sameIngredient(left: RecipeDay['entries'][number]['ingredients'][number], right: RecipeDay['entries'][number]['missing'][number]): boolean {
  const leftId = left.subcategory_id ?? null
  const rightId = right.subcategory_id ?? null
  return left.subcategory_name.trim() === right.subcategory_name.trim()
    && (leftId === null || rightId === null || leftId === rightId)
}

function isMissingIngredient(entryIngredient: RecipeDay['entries'][number]['ingredients'][number], missing: RecipeDay['entries'][number]['missing']): boolean {
  return missing.some(item => (
    item.quantity > 0
      && sameIngredient(entryIngredient, item)
  ))
}

function formatIngredient(ingredient: RecipeDay['entries'][number]['ingredients'][number], missing: RecipeDay['entries'][number]['missing']): string {
  const name = requireString(ingredient.subcategory_name, 'ingredient.subcategory_name', MAX_INGREDIENT_NAME_LENGTH)
  if (!Number.isFinite(ingredient.quantity) || ingredient.quantity < 0) throw new RangeError('ingredient.quantity is invalid')
  const base = `${name} × ${formatQuantity(ingredient.quantity)}`
  if (!isMissingIngredient(ingredient, missing)) return base
  const missingItem = missing.find(item => (
    item.quantity > 0
      && sameIngredient(ingredient, item)
  ))
  const missingQuantity = missingItem && Number.isFinite(missingItem.quantity) && missingItem.quantity > 0
    ? `-缺${formatQuantity(missingItem.quantity)}`
    : '-缺货'
  return `${base}${missingQuantity}`
}

function formatIngredients(entry: RecipeDay['entries'][number]): string {
  const text = entry.ingredients.map(ingredient => formatIngredient(ingredient, entry.missing)).join('、')
  return text.length <= MAX_INGREDIENTS_DISPLAY_LENGTH
    ? text
    : `${text.slice(0, MAX_INGREDIENTS_DISPLAY_LENGTH - 1)}…`
}

function toSnapshots(days: RecipeDay[]): RecipeWidgetEntry[] {
  if (days.length > 14) throw new RangeError('too many recipe days')
  for (const day of days) {
    if (!day || !Array.isArray(day.entries)) throw new TypeError('day entries are invalid')
    if (day.entries.length > MAX_SNAPSHOTS) throw new RangeError('too many recipe entries')
  }
  const nonEmptyDays = days.filter(day => Array.isArray(day?.entries) && day.entries.length > 0)
  const orderedDays = orderRecipeDaysByCompletion(nonEmptyDays)
  const snapshots = orderedDays.flatMap(day => {
    const weekday = day.weekday
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new RangeError('weekday is invalid')
    const label = requireString(day.label, 'day.label', MAX_LABEL_LENGTH)
    return day.entries.map(entry => {
      const id = requireString(entry.id, 'entry.id', MAX_ID_LENGTH)
      const dishName = requireString(entry.dish_name, 'entry.dish_name', MAX_DISH_NAME_LENGTH)
      if (typeof entry.completed !== 'boolean') throw new TypeError('entry.completed is invalid')
      if (!Array.isArray(entry.ingredients) || !Array.isArray(entry.missing)) throw new TypeError('entry ingredients are invalid')
      if (entry.ingredients.length > MAX_INGREDIENTS || entry.missing.length > MAX_INGREDIENTS) throw new RangeError('too many ingredients')
      for (const ingredient of [...entry.ingredients, ...entry.missing]) {
        if (!Number.isFinite(ingredient.quantity) || ingredient.quantity < 0) throw new RangeError('ingredient.quantity is invalid')
      }
      const missingCount = entry.missing.filter(item => Number.isFinite(item.quantity) && item.quantity > 0).length
      return { id, weekday, label, dishName, ingredientsDisplay: formatIngredients(entry), completed: entry.completed, missingCount }
    })
  })
  if (snapshots.length > MAX_SNAPSHOTS) throw new RangeError('too many recipe snapshots')
  return snapshots
}

/** Publish the fridge names available to widget configuration screens. Web and iOS are no-ops. */
export async function publishFridges(fridges: readonly RecipeWidgetFridge[]): Promise<void> {
  if (!isAndroidRuntime()) return
  if (!Array.isArray(fridges) || fridges.length > MAX_FRIDGES) throw new RangeError('too many refrigerators')
  await RecipeWidget.publishFridges({ fridges: fridges.map(toNativeFridge) })
}

/** Publish the current week's non-empty recipe entries as a bounded Android widget snapshot. */
export async function publishWeek(refrigerator: RecipeWidgetFridge, weekStart: string, daysOrCache: RecipeDay[] | RecipeCache): Promise<void> {
  if (!isAndroidRuntime()) return
  const normalizedRefrigerator = toNativeFridge(refrigerator)
  const normalizedWeekStart = normalizeWeekStart(weekStart)
  const capturedAt = Date.now()
  const entries = toSnapshots(getDays(daysOrCache))
  await RecipeWidget.publishWeek({ refrigerator: normalizedRefrigerator, weekStart: normalizedWeekStart, capturedAt, entries })
}

/** Redraw widgets using already-published snapshots; this never starts a network refresh. */
export async function refreshWidgets(refrigeratorId?: string): Promise<void> {
  if (!isAndroidRuntime()) return
  const options = refrigeratorId === undefined ? {} : { refrigeratorId: requireString(refrigeratorId, 'refrigeratorId', MAX_ID_LENGTH) }
  await RecipeWidget.refreshWidgets(options)
}

/** Remove snapshots and widget bindings for one refrigerator. */
export async function clearForFridge(refrigeratorId: string): Promise<void> {
  if (!isAndroidRuntime()) return
  await RecipeWidget.clearForFridge({ refrigeratorId: requireString(refrigeratorId, 'refrigeratorId', MAX_ID_LENGTH) })
}

/** Clear all widget data when the active account is explicitly cleared. */
export async function clearAll(): Promise<void> {
  if (!isAndroidRuntime()) return
  await RecipeWidget.clearAll()
}

/** Advance the native account generation so snapshots from the previous account cannot be reused. */
export async function advanceAccountGeneration(): Promise<void> {
  if (!isAndroidRuntime()) return
  await RecipeWidget.advanceAccountGeneration()
}

export const recipeWidgetLimits = {
  maxIngredientsDisplayLength: MAX_INGREDIENTS_DISPLAY_LENGTH,
  maxSnapshots: MAX_SNAPSHOTS,
} as const
