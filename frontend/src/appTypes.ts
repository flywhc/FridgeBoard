export type Refrigerator = {
  id: string
  name: string
  revision: number
  setup_status: 'needs_layout' | 'ready'
  display_device_status: 'unbound' | 'bound'
  access_role: 'owner' | 'daily_access'
}
export type Device = { id: string; kind: string; label: string; created_at: string; last_seen_at: string | null; last_successful_sync_at?: string | null; revoked_at: string | null; is_current: boolean }
export type DeviceListState =
  | { status: 'loading'; devices: Device[] }
  | { status: 'ready-empty'; devices: [] }
  | { status: 'ready-data'; devices: Device[] }
  | { status: 'error-retry'; devices: []; message: string }

/** 把设备接口响应转换为设置页可区分的加载完成状态，撤销设备不计入空状态判断。 */
export function getDeviceListState(devices: Device[]): DeviceListState {
  return devices.some(device => !device.revoked_at)
    ? { status: 'ready-data', devices }
    : { status: 'ready-empty', devices: [] }
}
export type ZoneGeometry = { x: number; y: number; width: number; height: number; layout_kind: 'vertical' | 'single_row' }
export type ZoneTemplate = { key: string; label: string; temperature_mode: 'cold' | 'frozen'; geometry: ZoneGeometry; layout_kind: 'vertical' | 'single_row'; adjustable_temperature: boolean; is_door: boolean }
export type Template = { key: string; name: string; zones: ZoneTemplate[] }
export type LayoutSlot = { id: string; key: string; custom_name?: string | null }
export type LayoutZone = { key: string; label: string; temperature_mode: 'cold' | 'frozen'; geometry: ZoneGeometry; slots: LayoutSlot[]; is_door: boolean }
export type Layout = { refrigerator_id: string; template_key: string; revision: number; zones: LayoutZone[] }
export type Category = { id: string; parent_id: string | null; name: string; icon_key: string | null; is_custom: boolean; display_order?: number }
export type InventoryBatch = { id: string; subcategory_id: string; subcategory_name: string; icon_key: string | null; storage_slot_id: string; item_name: string; quantity: number; production_date: string | null; best_before: string | null; product_description: string | null; price?: string | null; barcode: string | null; expiry_status: string | null }
export type Icon = { key: string; label: string; asset_url: string; media_type?: 'image/svg+xml' | 'image/png' }
export type ExpirySettings = { ratio_percent: number; minimum_days: number; maximum_days: number }
export type NotificationSettings = { daily_reminder_enabled: boolean; reminder_time: string; device_health_enabled: boolean }
export type DueNotification = { kind: 'food' | 'device_health'; title: string; body: string }
export type RecognitionField = { value: string; confidence: number }
export type RecognitionOrderItem = { item_name: string; specification: string; quantity: number; subcategory_id?: string; subcategory_name?: string; subcategory_confidence?: number }
export type RecognitionResult = { kind: 'item' | 'order' | 'unknown'; fields: Record<string, RecognitionField>; order_items: RecognitionOrderItem[] }
export type CategoryMatchResult = { status: 'matched' | 'needs_ai' | 'not_found'; subcategory_id: string | null; subcategory_name: string | null; source: 'builtin' | 'cache' | 'ai' | null; confidence: number | null; request_id: string | null }
export type BarcodeSuggestion = { item_name: string; subcategory_id: string; product_description: string | null; barcode: string }
export type ProductLookupResult = { found: boolean; item_name: string | null; product_description: string | null; barcode: string; source: string | null }
export type QrLookupResult = { kind: 'item' | 'url' | 'text' | 'unknown'; payload: string; fields: Record<string, RecognitionField> }
export type IconCandidate = { id: string; asset_url: string }
export type IconGeneration = { id: string; candidates: IconCandidate[] }
export type RecipeIngredient = {
  subcategory_name: string
  quantity: number
  subcategory_id?: string | null
  matched_category_name?: string | null
  category_match_state?: 'idle' | 'checking' | 'ai' | 'matched' | 'not_found'
}
export type RecipeEntry = { id: string; weekday: number; dish_name: string; method: string | null; note: string | null; completed: boolean; ingredients: RecipeIngredient[]; missing: RecipeIngredient[] }
export type RecipeDay = { weekday: number; label: string; entries: RecipeEntry[] }
export type RestockEntry = { week_start?: string; weekday: number; label: string; dish_name: string; missing: RecipeIngredient[] }
export type RecipeHistoryWeek = { week_start: string; label: string; recipe_count: number; preview: string }
