/** P5 物品录入、识别和按格位编辑工作区。 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getCameraConstraints, getCameraErrorMessage, getClosedCameraSessionState } from './camera'
import type { BarcodeSuggestion, Category, CategoryMatchResult, Icon, IconGeneration, InventoryBatch, Layout, ProductLookupResult, QrLookupResult, RecognitionField, RecognitionOrderItem, RecognitionResult, Refrigerator } from './appTypes'
import { FridgePreviewFrame } from './FridgeLayout'
import { CategoryIcon, Dialog, NoticeDialog, PageHeader, PageShell, QuantityArrowControl, RuntimeImage, SaveIcon } from './sharedUi'
import { CategoryPickerPanel } from './CategoryPickerPanel'
import { request, streamRequest, type SseEvent } from './appApi'
import { InventoryList } from './inventoryList'
import { formatInventoryScopeTitle, formatStorageSlotLabel, type InventoryExpiryStatus } from './inventoryListFilters'
import { getPreselectedInventorySlotId } from './inventoryAddLocation'
import { categoryMatchDisplayText, isCurrentCategoryMatch, type CategoryMatchState } from './categoryMatch'
import { getSelectedOrderItems } from './orderRecognition'
import { prepareRecognitionImage, prepareRecognitionPhoto, RecognitionImageProcessingError, type PreparedRecognitionImage } from './recognitionImage'
import { formatQuantity, parseQuantity, stepQuantity } from './quantity'
import { resolveIconVariant } from './iconVariants'
import { useTheme } from './theme'

function todayIso(): string {
  const today = new Date()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${today.getFullYear()}-${month}-${day}`
}

/** 识别请求进行中时显示动画、阶段状态和自动上滚的模型文字流。 */
export function RecognitionProgress({ message = '正在识别…', text = '', textLength = 0 }: { message?: string; text?: string; textLength?: number }) {
  const outputRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight })
  }, [text])
  return <div className="p6-recognition-progress" role="status" aria-live="polite">
    <strong>{message}</strong>
    <div className="p6-recognition-output" role="log" aria-label="大模型流式输出">
      <div ref={outputRef} className="p6-recognition-output-scroll">
        <span className="p6-recognition-output-text">{text || '等待模型输出…'}</span>
        {textLength > 0 && <small>已收到 {textLength} 字</small>}
      </div>
      <span className="p6-recognition-animation" aria-hidden="true"><i /><i /><i /></span>
    </div>
  </div>
}

/** 展示订单识别结果，未分类项目必须先手工选择小类。 */
export function OrderRecognitionList({ items, selection, categories, onToggle, onChooseCategory, locations = [], onChooseLocation }: {
  items: RecognitionOrderItem[]
  selection: Record<number, boolean>
  categories: Category[]
  onToggle: (index: number) => void
  onChooseCategory: (index: number) => void
  locations?: { id: string; label: string }[]
  onChooseLocation?: (index: number) => void
}) {
  const subcategories = categories.filter(category => category.parent_id)
  return <div className="p6-order-list">
    {items.map((item, index) => {
      const category = subcategories.find(candidate => candidate.id === item.subcategory_id)
      const selected = Boolean(category && selection[index])
      return <div className={`p6-order-item ${selected ? 'is-selected' : ''} ${category ? '' : 'is-unclassified'}`} key={`${item.item_name}-${index}`}>
        <input
          type="checkbox"
          disabled={!category}
          checked={selected}
          onChange={() => onToggle(index)}
          aria-label={category ? `选择${item.item_name}` : `${item.item_name}尚未分类`}
        />
        <div className="p6-order-main">
          <strong>{item.item_name}</strong>
          {item.specification && <small>{item.specification}</small>}
          {item.price != null && <small className="p6-order-price">实付 ¥{Number(item.price).toFixed(2)}</small>}
          <div className="p6-order-meta-row">
            <button
              type="button"
              className={`p6-order-category ${category ? '' : 'is-missing'}`}
              onClick={() => onChooseCategory(index)}
              aria-label={`为${item.item_name}${category ? '更改' : '选择'}分类`}
            >
              <span>{category ? `分类：${category.name}` : '选择分类（必填）'}</span><i aria-hidden="true">›</i>
            </button>
            {onChooseLocation && <button
              type="button"
              className="p6-order-location"
              onClick={() => onChooseLocation(index)}
              aria-label={`为${item.item_name}选择存放位置`}
            >
              <span>{locations.find(location => location.id === item.storage_slot_id)?.label ?? '选择位置'}</span><i aria-hidden="true">›</i>
            </button>}
          </div>
        </div>
        <b>×{item.quantity}</b>
      </div>
    })}
  </div>
}

function deduplicateCategories(items: Category[], keyOf: (item: Category) => string) {
  const seen = new Set<string>()
  return items.filter(item => {
    const key = keyOf(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function InventoryFlow({ layout, categories, icons, inventory, refrigerator, saving, initialSlotId, initialItemId, initialView = 'add', initialExpiryStatus, onBack, onSelectFridge, onRenameSlot, onCreateCategory, onCatalogChanged, onSave, onDelete, onMoveSelected, onDeleteSelected, onClassifySelected }: {
  layout: Layout; categories: Category[]; icons: Icon[]; inventory: InventoryBatch[]; refrigerator: Refrigerator; saving: boolean; onBack: () => void
  onSelectFridge: (refrigerator: Refrigerator) => void
  onRenameSlot?: (slotId: string, name: string) => Promise<string | null>
  initialSlotId?: string; initialItemId?: string; initialView?: 'add' | 'list' | 'edit'; initialExpiryStatus?: InventoryExpiryStatus
  onCreateCategory: (parentId: string, name: string, iconKey: string) => Promise<Category | undefined>
  onCatalogChanged: () => Promise<void>
  onSave: (draft: { id?: string; subcategoryId: string; slotId: string; itemName: string; quantity: number; bestBefore: string; bestBeforeChanged?: boolean; description: string; productionDate: string; price: string; barcode: string; mergeSameName?: boolean }) => Promise<boolean>
  onDelete: (id: string) => Promise<boolean>
  onMoveSelected?: (items: InventoryBatch[], icons: Icon[]) => void
  onDeleteSelected?: (items: InventoryBatch[]) => Promise<boolean>
  onClassifySelected?: (items: InventoryBatch[], subcategoryId: string) => Promise<boolean>
}) {
  const theme = useTheme()
  type View = 'list' | 'add' | 'recognition' | 'order' | 'location' | 'custom' | 'edit'
  const parents = categories.filter(item => !item.parent_id)
  const subcategories = categories.filter(item => item.parent_id)
  const returnToList = initialView !== 'add'
  const initialItem = initialItemId ? inventory.find(item => item.id === initialItemId) : undefined
  const [view, setView] = useState<View>(initialView === 'edit' && initialItem ? 'edit' : returnToList ? 'list' : 'add')
  const [customReturnView, setCustomReturnView] = useState<'add' | 'edit' | 'list'>('add')
  const [draft, setDraft] = useState(() => initialItem ? { id: initialItem.id, subcategoryId: initialItem.subcategory_id, slotId: initialItem.storage_slot_id, itemName: initialItem.item_name, quantity: initialItem.quantity, bestBefore: initialItem.best_before ?? '', description: initialItem.product_description ?? '', productionDate: initialItem.production_date ?? '', price: initialItem.price ?? '' } : { id: '', subcategoryId: '', slotId: initialSlotId ?? '', itemName: '', quantity: 1, bestBefore: '', description: '', productionDate: todayIso(), price: '' })
  const [quantityInput, setQuantityInput] = useState(() => String(initialItem?.quantity ?? 1))
  const [bestBeforeChanged, setBestBeforeChanged] = useState(false)
  const [query, setQuery] = useState('')
  const [catalogExpanded, setCatalogExpanded] = useState(false)
  const [catalogTop, setCatalogTop] = useState(0)
  const [activeGroupId, setActiveGroupId] = useState(parents[0]?.id ?? '')
  const [recentCategories, setRecentCategories] = useState<Category[]>([])
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupError, setGroupError] = useState('')
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customIcon, setCustomIcon] = useState(icons[0]?.key ?? '')
  const [iconMode, setIconMode] = useState<'library' | 'agnes'>('library')
  const [generation, setGeneration] = useState<IconGeneration | null>(null)
  const [selectedCandidateId, setSelectedCandidateId] = useState('')
  const [generatingIcons, setGeneratingIcons] = useState(false)
  const [notice, setNotice] = useState('')
  const [errorNotice, setErrorNotice] = useState('')
  const [recognizing, setRecognizing] = useState(false)
  const [recognitionStatus, setRecognitionStatus] = useState('正在识别…')
  const [recognitionText, setRecognitionText] = useState('')
  const [recognitionTextLength, setRecognitionTextLength] = useState(0)
  const [recognitionError, setRecognitionError] = useState('')
  const recognitionErrorRef = useRef(false)
  const [categoryMatching, setCategoryMatching] = useState<CategoryMatchState>('idle')
  const [categoryMatchTextLength, setCategoryMatchTextLength] = useState(0)
  const [categoryMatchMessage, setCategoryMatchMessage] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraCapturing, setCameraCapturing] = useState(false)
  const [cameraSession, setCameraSession] = useState(0)
  const [conflicts, setConflicts] = useState<Record<string, RecognitionField>>({})
  const [barcode, setBarcode] = useState('')
  const [orderItems, setOrderItems] = useState<RecognitionOrderItem[]>([])
  const [orderSelection, setOrderSelection] = useState<Record<number, boolean>>({})
  const [orderCategoryIndex, setOrderCategoryIndex] = useState<number | null>(null)
  const [orderLocationIndex, setOrderLocationIndex] = useState<number | null>(null)
  const [addingOrder, setAddingOrder] = useState(false)
  const [locationOpen, setLocationOpen] = useState(false)
  const [addAnimation, setAddAnimation] = useState(false)
  const [slotTransitioning, setSlotTransitioning] = useState(false)
  const [locationSubmitting, setLocationSubmitting] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const activeStreamsRef = useRef<Set<MediaStream>>(new Set())
  const cameraRequestRef = useRef(0)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const locationSubmittingRef = useRef(false)
  const slotTransitionTimerRef = useRef<number | null>(null)
  const catalogElementRef = useRef<HTMLElement | null>(null)
  const orderCatalogElementRef = useRef<HTMLDivElement | null>(null)
  const customCategoryCreatedRef = useRef<((category: Category) => void) | null>(null)
  const categoryMatchControllerRef = useRef<AbortController | null>(null)
  const categoryMatchRequestRef = useRef<string | null>(null)
  const categoryMatchSequenceRef = useRef(0)
  const categoryManualRef = useRef(Boolean(initialItem))
  const categorySuppressedNameRef = useRef('')
  const selectedChild = subcategories.find(item => item.id === draft.subcategoryId)
  const canManageCatalog = refrigerator.access_role === 'owner'
  const apiBasePath = refrigerator.access_role === 'daily_access'
    ? `/api/daily/refrigerators/${encodeURIComponent(refrigerator.id)}`
    : `/api/owner/refrigerators/${encodeURIComponent(refrigerator.id)}`
  const children = deduplicateCategories(
    subcategories.filter(item => item.parent_id === activeGroupId),
    item => item.name.trim(),
  )
  const matchingChildren = query.trim()
    ? deduplicateCategories(
      subcategories.filter(item => item.name.includes(query.trim())),
      item => item.name.trim(),
    )
    : children
  const recentDisplayCategories = deduplicateCategories(
    recentCategories,
    item => item.icon_key ?? item.id,
  ).slice(0, 16)
  const slots = useMemo(() => layout.zones.flatMap(zone => zone.slots.map(slot => ({ ...slot, zone }))), [layout])
  const selectedSlot = slots.find(slot => slot.id === draft.slotId)
  const selectedOrderItems = getSelectedOrderItems(orderItems, orderSelection, categories)
  const orderLocations = slots.map(slot => ({
    id: slot.id,
    label: formatStorageSlotLabel(slot.zone.label, slot.key, slot.custom_name),
  }))
  const listTitle = initialExpiryStatus === 'expiring'
    ? '临期物品'
    : initialExpiryStatus === 'expired'
      ? '过期物品'
      : initialSlotId && selectedSlot
        ? formatInventoryScopeTitle(selectedSlot.zone.label, selectedSlot.key, selectedSlot.custom_name)
        : '全部物品'
  const update = (change: Partial<typeof draft>) => setDraft(current => ({ ...current, ...change }))
  const setQuantity = (value: number) => { const minimum = draft.id ? 0 : 1; const next = Math.max(minimum, value); update({ quantity: next }); setQuantityInput(formatQuantity(next)) }
  const onQuantityInputChange = (value: string) => { setQuantityInput(value); const parsed = parseQuantity(value); const minimum = draft.id ? 0 : 1; if (parsed !== null && parsed >= minimum) update({ quantity: parsed }) }
  const normalizeQuantityInput = () => { const minimum = draft.id ? 0 : 1; const parsed = parseQuantity(quantityInput); const next = parsed !== null && parsed >= minimum ? parsed : minimum; setQuantity(next); setQuantityInput(formatQuantity(next)); return next }
  const waitForVideoMetadata = async (video: HTMLVideoElement) => {
    if (video.videoWidth > 0 && video.videoHeight > 0) return
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        video.removeEventListener('loadedmetadata', onMetadata)
        reject(new Error('相机画面尚未就绪'))
      }, 4000)
      const onMetadata = () => {
        window.clearTimeout(timeout)
        resolve()
      }
      video.addEventListener('loadedmetadata', onMetadata, { once: true })
    })
  }
  const stopCamera = useCallback(() => {
    cameraRequestRef.current += 1
    activeStreamsRef.current.forEach(stream => stream.getTracks().forEach(track => track.stop()))
    activeStreamsRef.current.clear()
    streamRef.current = null
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.srcObject = null
    }
  }, [])
  const closeCameraView = useCallback(() => {
    stopCamera()
    const closedState = getClosedCameraSessionState()
    setCameraOpen(closedState.cameraOpen)
    setCameraReady(closedState.cameraReady)
    setCameraCapturing(closedState.cameraCapturing)
  }, [setCameraCapturing, setCameraOpen, setCameraReady, stopCamera])
  useEffect(() => () => {
    stopCamera()
  }, [stopCamera])
  useEffect(() => {
    if (view !== 'recognition' || !cameraOpen) return
    let active = true
    const requestId = ++cameraRequestRef.current
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return
    void navigator.mediaDevices.getUserMedia(getCameraConstraints())
      .then(async stream => {
        if (!active || requestId !== cameraRequestRef.current) { stream.getTracks().forEach(track => track.stop()); return }
        activeStreamsRef.current.add(stream)
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play().catch(() => undefined)
          await waitForVideoMetadata(video).catch(() => undefined)
        }
        if (!active || requestId !== cameraRequestRef.current) {
          stream.getTracks().forEach(trackItem => trackItem.stop())
          activeStreamsRef.current.delete(stream)
          return
        }
        setCameraReady(true)
        if (!recognitionErrorRef.current) setNotice('')
      })
      .catch(error => {
        if (!active || requestId !== cameraRequestRef.current) return
        closeCameraView()
        setNotice(getCameraErrorMessage(error, {
          isSecureContext: window.isSecureContext,
          hasGetUserMedia: Boolean(navigator.mediaDevices?.getUserMedia),
        }))
      })
    return () => {
      active = false
      setCameraReady(false)
      stopCamera()
    }
  }, [view, cameraOpen, cameraSession, closeCameraView, stopCamera])
  useEffect(() => {
    void request<Category[]>(`${apiBasePath}/categories/recent`)
      .then(setRecentCategories)
      .catch(error => setNotice(error.message))
  }, [apiBasePath, layout.refrigerator_id, inventory.length])
  const normalizedCategoryName = (value: string) => value.trim().toLocaleLowerCase()
  const cancelCategoryMatch = (suppressCurrentName = false) => {
    categoryMatchSequenceRef.current += 1
    categoryMatchControllerRef.current?.abort()
    categoryMatchControllerRef.current = null
    const requestId = categoryMatchRequestRef.current
    categoryMatchRequestRef.current = null
    if (requestId) {
      void request(`${apiBasePath}/category-match/${encodeURIComponent(requestId)}`, { method: 'DELETE' }).catch(() => undefined)
    }
    if (suppressCurrentName) categorySuppressedNameRef.current = normalizedCategoryName(draft.itemName)
    setCategoryMatchTextLength(0)
    setCategoryMatchMessage('')
    setCategoryMatching('idle')
  }

  const handleModelStreamEvent = (event: SseEvent, setStatus: (value: string) => void, setText: (value: string | ((current: string) => string)) => void, setLength: (value: number) => void) => {
    if (event.type === 'status') setStatus(String(event.data.message ?? '处理中…'))
    if (event.type === 'token') {
      const text = String(event.data.text ?? '')
      setText(current => current + text)
      setLength(Number(event.data.text_length ?? 0))
    }
  }
  useEffect(() => {
    if (view !== 'add' || categoryManualRef.current) return
    const itemName = draft.itemName.trim()
    const normalizedName = normalizedCategoryName(itemName)
    if (itemName.length < 2 || normalizedName === categorySuppressedNameRef.current) {
      setCategoryMatching('idle')
      return
    }
    const sequence = ++categoryMatchSequenceRef.current
    const timer = window.setTimeout(() => {
      const controller = new AbortController()
      categoryMatchControllerRef.current = controller
      setCategoryMatching('checking')
      void request<CategoryMatchResult>(`${apiBasePath}/category-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_name: itemName }),
        signal: controller.signal,
      }).then(async result => {
        if (!isCurrentCategoryMatch(sequence, categoryMatchSequenceRef.current, controller.signal.aborted, categoryManualRef.current)) return
        if (result.status === 'matched' && result.subcategory_id) {
          setDraft(current => ({ ...current, subcategoryId: result.subcategory_id! }))
          setCategoryMatching('matched')
          return
        }
        if (result.status !== 'needs_ai' || !result.request_id) {
          setCategoryMatching('not_found')
          return
        }
        categoryMatchRequestRef.current = result.request_id
        setCategoryMatching('ai')
        setCategoryMatchTextLength(0)
        setCategoryMatchMessage('正在请求自动分类…')
        const aiResult = await streamRequest<CategoryMatchResult>(`${apiBasePath}/category-match/ai/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item_name: itemName, request_id: result.request_id }),
          signal: controller.signal,
        }, event => {
          if (event.type === 'status') setCategoryMatchMessage(String(event.data.message ?? '正在自动分类…'))
          if (event.type === 'token') setCategoryMatchTextLength(Number(event.data.text_length ?? 0))
        })
        if (!isCurrentCategoryMatch(sequence, categoryMatchSequenceRef.current, controller.signal.aborted, categoryManualRef.current)) return
        categoryMatchRequestRef.current = null
        if (aiResult.status === 'matched' && aiResult.subcategory_id) {
          setDraft(current => ({ ...current, subcategoryId: aiResult.subcategory_id! }))
          setCategoryMatching('matched')
        } else setCategoryMatching('not_found')
      }).catch(error => {
        if (!isCurrentCategoryMatch(sequence, categoryMatchSequenceRef.current, controller.signal.aborted, categoryManualRef.current)) return
        categoryMatchRequestRef.current = null
        setCategoryMatching((error as Error).message === '请求被取消' ? 'idle' : 'not_found')
      })
    }, 450)
    return () => {
      window.clearTimeout(timer)
      categoryMatchSequenceRef.current += 1
      categoryMatchControllerRef.current?.abort()
      categoryMatchControllerRef.current = null
    }
  }, [apiBasePath, draft.itemName, view])
  useEffect(() => {
    if (!catalogExpanded && orderCategoryIndex === null) return
    const updateCatalogTop = () => setCatalogTop(
      Math.max(0, (orderCategoryIndex === null
        ? catalogElementRef.current
        : orderCatalogElementRef.current)?.getBoundingClientRect().top ?? 0),
    )
    window.addEventListener('resize', updateCatalogTop)
    return () => window.removeEventListener('resize', updateCatalogTop)
  }, [catalogExpanded, orderCategoryIndex])
  useEffect(() => {
    if (view !== 'order' || !orderItems.length || !slots.length) return
    let active = true
    const fallback = slots[0].id
    const applyDefaultLocation = (storageSlotId: string | null) => {
      if (!active) return
      const defaultSlotId = slots.some(slot => slot.id === storageSlotId) ? storageSlotId! : fallback
      setOrderItems(current => current.map(item => item.storage_slot_id && slots.some(slot => slot.id === item.storage_slot_id)
        ? item
        : { ...item, storage_slot_id: defaultSlotId }))
    }
    void request<{ storage_slot_id: string | null }>(`${apiBasePath}/inventory/default-location`)
      .then(result => applyDefaultLocation(result.storage_slot_id))
      .catch(() => applyDefaultLocation(null))
    return () => { active = false }
  }, [apiBasePath, layout.revision, orderItems.length, slots, view])
  useEffect(() => () => {
    if (slotTransitionTimerRef.current !== null) window.clearTimeout(slotTransitionTimerRef.current)
  }, [])
  const applySuggestion = (suggestion: Partial<BarcodeSuggestion> | Record<string, RecognitionField>) => {
    const next: Partial<typeof draft> = {}
    const nextConflicts: Record<string, RecognitionField> = {}
    const values: Record<string, RecognitionField> = 'item_name' in suggestion && typeof suggestion.item_name === 'object'
      ? suggestion as Record<string, RecognitionField>
      : Object.fromEntries(Object.entries(suggestion).filter(([, value]) => value != null).map(([key, value]) => [key, { value: String(value), confidence: 1 }]))
    const recognizedChild = values.subcategory_name && subcategories.filter(item => item.name === values.subcategory_name?.value)
    if (recognizedChild?.length === 1) values.subcategory_id = { ...values.subcategory_name!, value: recognizedChild[0].id }
    if (values.subcategory_name && recognizedChild?.length !== 1) setNotice('识别到的分类需要你在选择物品中确认。')
    const mapping: Record<string, keyof typeof draft> = { item_name: 'itemName', product_description: 'description', subcategory_id: 'subcategoryId', production_date: 'productionDate', best_before: 'bestBefore' }
    for (const [source, field] of Object.entries(mapping)) {
      const candidate = values[source]
      if (!candidate?.value) continue
      if (draft[field] && draft[field] !== candidate.value) nextConflicts[field] = candidate
      else next[field] = candidate.value as never
    }
    if (Object.keys(next).length) update(next)
    if (values.barcode?.value && !barcode) setBarcode(values.barcode.value)
    if (Object.keys(nextConflicts).length) setConflicts(nextConflicts)
    return Object.keys(next).length > 0 || Object.keys(nextConflicts).length > 0
  }
  const scheduleRecognitionCameraRetry = (message: string) => {
    recognitionErrorRef.current = true
    setRecognitionError(message)
    setNotice(message)
    setCameraReady(false)
    setCameraOpen(true)
  }
  const retryRecognitionCamera = () => {
    recognitionErrorRef.current = false
    setRecognitionError('')
    setNotice('')
    closeCameraView()
    setCameraReady(false)
    setCameraOpen(true)
    setCameraSession(current => current + 1)
  }
  const captureCurrentFrame = async (profile: 'camera' | 'barcode'): Promise<PreparedRecognitionImage | null> => {
    const video = videoRef.current
    if (!cameraReady || !streamRef.current || !video || video.videoWidth === 0) {
      setCameraOpen(true)
      setNotice('相机画面尚未准备好，请稍候再试。')
      return null
    }
    setCameraCapturing(true)
    setNotice('正在拍照…')
    try {
      await new Promise(resolve => window.setTimeout(resolve, 250))
      if (!streamRef.current || video.videoWidth === 0 || video.videoHeight === 0) return null
      return await prepareRecognitionImage(video, video.videoWidth, video.videoHeight, profile)
    } catch (error) {
      setNotice(error instanceof RecognitionImageProcessingError
        ? error.message
        : getCameraErrorMessage(error, {
          isSecureContext: window.isSecureContext,
          hasGetUserMedia: Boolean(navigator.mediaDevices?.getUserMedia),
        }))
      return null
    } finally {
      closeCameraView()
    }
  }
  const applyRecognitionResult = (result: RecognitionResult) => {
    if (result.kind === 'order' && result.order_items.length > 0) {
      const enrichedItems = result.order_items.map(item => {
        const category = subcategories.find(candidate => candidate.id === item.subcategory_id)
          ?? subcategories.find(candidate => candidate.name === item.subcategory_name)
        const existing = inventory.find(candidate =>
          candidate.item_name.trim().toLocaleLowerCase() === item.item_name.trim().toLocaleLowerCase())
        return {
          ...item,
          subcategory_id: category?.id,
          subcategory_name: category?.name,
          storage_slot_id: existing?.storage_slot_id,
        }
      })
      setOrderItems(enrichedItems)
      setOrderSelection(Object.fromEntries(enrichedItems.map((item, index) => [index, Boolean(item.subcategory_id)])))
      setOrderCategoryIndex(null)
      setOrderLocationIndex(null)
      setView('order')
      return true
    }
    if (result.kind === 'unknown' || !applySuggestion(result.fields)) {
      setNotice('没有识别出可用信息，请换一个角度重试，或直接手工填写。')
      return false
    }
    setView('add')
    return true
  }
  const recognizeImage = async (image: PreparedRecognitionImage, mode: 'image' | 'photo') => {
    recognitionErrorRef.current = false
    setRecognitionError('')
    setRecognizing(true); setNotice(''); setRecognitionStatus('正在上传图片并请求识别…'); setRecognitionText(''); setRecognitionTextLength(0)
    try {
      const applied = applyRecognitionResult(await streamRequest<RecognitionResult>('/api/recognition/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: image.imageBase64, content_type: image.contentType, mode, refrigerator_id: refrigerator.id }),
      }, event => handleModelStreamEvent(event, setRecognitionStatus, setRecognitionText, setRecognitionTextLength)))
      if (!applied) scheduleRecognitionCameraRetry('没有识别出可用信息，请换一个角度重试。')
    } catch (error) {
      scheduleRecognitionCameraRetry((error as Error).message || '识别失败，请换一个角度重试。')
    } finally { setRecognizing(false) }
  }
  const runImageRecognition = async () => {
    const image = await captureCurrentFrame('camera')
    if (!image) return
    await recognizeImage(image, 'image')
  }
  const runBarcodeRecognition = async () => {
    const image = await captureCurrentFrame('barcode')
    if (!image) return
    recognitionErrorRef.current = false
    setRecognitionError('')
    setRecognizing(true); setNotice(''); setRecognitionStatus('正在本地识别条码…'); setRecognitionText(''); setRecognitionTextLength(0)
    try {
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
        import('@zxing/browser'),
        import('@zxing/library'),
      ])
      const hints = new Map()
      hints.set(DecodeHintType.TRY_HARDER, true)
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX, BarcodeFormat.AZTEC,
        BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF,
      ])
      const result = await new BrowserMultiFormatReader(hints).decodeFromImageUrl(`data:${image.contentType};base64,${image.imageBase64}`)
      const value = result.getText().trim()
      if (!value) { scheduleRecognitionCameraRetry('没有识别到条码或二维码，请对准后重试。'); return }
      setBarcode(value)
      let isQrPayload = false
      try {
        const format = result.getBarcodeFormat()
        isQrPayload = [BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX, BarcodeFormat.AZTEC].includes(format)
        if (isQrPayload) {
          setRecognitionStatus('正在解析二维码内容…')
          const qr = await streamRequest<QrLookupResult>('/api/owner/product-lookup/qr/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payload: value }),
          }, event => handleModelStreamEvent(event, setRecognitionStatus, setRecognitionText, setRecognitionTextLength))
          if (qr.kind === 'item' && applySuggestion(qr.fields)) {
            setNotice('已通过大模型解析二维码并填入商品信息。')
          } else if (qr.kind === 'url') {
            setNotice('二维码内容是网址，已保留原始内容，请继续填写商品信息。')
          } else {
            setNotice('二维码不是可直接填充的商品信息，已保留原始内容，请继续填写。')
          }
        } else {
          const product = await request<ProductLookupResult>(`/api/owner/product-lookup/barcode/${encodeURIComponent(value)}`)
          if (product.found) {
            applySuggestion({
              item_name: product.item_name ?? '',
              product_description: product.product_description,
              barcode: product.barcode,
            })
            setNotice(`已从${product.source ?? '公开商品库'}找到商品信息。`)
          } else {
            setNotice(`已识别条码：${value}，公开商品库暂未收录，请继续填写。`)
          }
        }
      } catch {
        setNotice(isQrPayload ? '已识别二维码，但大模型解析失败，请继续填写。' : `已识别条码：${value}，商品库查询失败，请继续填写。`)
      }
      setView('add')
    } catch {
      scheduleRecognitionCameraRetry('没有识别到条码或二维码，请对准后重试。')
    } finally { setRecognizing(false) }
  }
  const handlePhotoSelected = async (file: File | undefined) => {
    if (!file) {
      if (photoInputRef.current) photoInputRef.current.value = ''
      return
    }
    if (!file.type.startsWith('image/')) { setNotice('请选择图片文件。'); return }
    recognitionErrorRef.current = false
    setRecognitionError('')
    setRecognizing(true); setNotice(''); setRecognitionStatus('正在读取并压缩照片…'); setRecognitionText(''); setRecognitionTextLength(0)
    try {
      const image = await prepareRecognitionPhoto(file)
      setRecognitionStatus('正在上传照片并请求识别…')
      const applied = applyRecognitionResult(await streamRequest<RecognitionResult>('/api/recognition/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: image.imageBase64, content_type: image.contentType, mode: 'photo', refrigerator_id: refrigerator.id }),
      }, event => handleModelStreamEvent(event, setRecognitionStatus, setRecognitionText, setRecognitionTextLength)))
      if (!applied) scheduleRecognitionCameraRetry('没有识别出可用信息，请换一个角度重试。')
    } catch (error) {
      scheduleRecognitionCameraRetry((error as Error).message || '无法读取图片，请重试。')
    } finally {
      setRecognizing(false)
      if (photoInputRef.current) photoInputRef.current.value = ''
    }
  }
  const openPhotoPicker = () => {
    if (recognizing || cameraCapturing) return
    // The file picker does not reliably emit a cancel/change event on mobile,
    // so the live stream must be released before opening it.
    closeCameraView()
    photoInputRef.current?.click()
  }
  const chooseChild = (child: Category) => {
    cancelCategoryMatch()
    categoryManualRef.current = true
    update({ subcategoryId: child.id, itemName: draft.itemName || child.name })
    setCatalogExpanded(false)
  }
  const openCatalog = () => {
    cancelCategoryMatch(true)
    setActiveGroupId(selectedChild?.parent_id ?? activeGroupId)
    setCatalogTop(Math.max(0, catalogElementRef.current?.getBoundingClientRect().top ?? 0))
    setCatalogExpanded(true)
  }
  const openCustomCategory = (onCreated?: (category: Category) => void) => {
    if (!canManageCatalog) { setNotice('日常访问不能创建分类。'); return }
    customCategoryCreatedRef.current = onCreated ?? null
    setCustomReturnView(view === 'list' ? 'list' : view === 'edit' ? 'edit' : 'add')
    setCustomName('')
    setGeneration(null)
    setCatalogExpanded(false)
    setView('custom')
  }
  const advance = async () => {
    if (!draft.itemName.trim() || !draft.subcategoryId) { setErrorNotice('请先选择物品小类并填写物品名称。'); return }
    const preselectedSlotId = getPreselectedInventorySlotId(initialSlotId, slots)
    if (preselectedSlotId) {
      await save(preselectedSlotId)
      return
    }
    const fallback = slots[0]?.id ?? ''
    try {
      const result = await request<{ storage_slot_id: string | null }>(`${apiBasePath}/inventory/default-location`)
      update({
        slotId: slots.some(slot => slot.id === result.storage_slot_id) ? result.storage_slot_id! : fallback,
      })
    } catch (error) {
      update({ slotId: fallback }); setErrorNotice((error as Error).message); return
    }
    setLocationOpen(true)
  }
  const resetDraft = () => { cancelCategoryMatch(); categoryManualRef.current = false; categorySuppressedNameRef.current = ''; setDraft({ id: '', subcategoryId: '', slotId: initialSlotId ?? '', itemName: '', quantity: 1, bestBefore: '', description: '', productionDate: todayIso(), price: '' }); setBestBeforeChanged(false); setQuantityInput('1'); setBarcode(''); setConflicts({}); setOrderItems([]); setOrderSelection({}); setOrderCategoryIndex(null); setOrderLocationIndex(null); setCatalogExpanded(false) }
  const openAdd = () => { resetDraft(); setNotice(''); setView('add') }
  const save = async (slotId = draft.slotId) => { if (!slotId) { setNotice('请选择存放位置。'); return }; const quantity = normalizeQuantityInput(); if (await onSave({ ...draft, slotId, quantity, barcode, bestBeforeChanged })) { resetDraft(); setView(returnToList ? 'list' : 'add'); setNotice(returnToList ? '' : '已加入冰箱。') } }
  const saveFromLocation = async (slotId = draft.slotId) => {
    if (!slotId || locationSubmittingRef.current || saving || addAnimation) return
    locationSubmittingRef.current = true
    setLocationSubmitting(true)
    const quantity = normalizeQuantityInput()
    if (!await onSave({ ...draft, slotId, quantity, barcode, bestBeforeChanged })) { locationSubmittingRef.current = false; setLocationSubmitting(false); return }
    setAddAnimation(true)
    window.setTimeout(() => { locationSubmittingRef.current = false; setAddAnimation(false); setLocationSubmitting(false); setLocationOpen(false); resetDraft(); setNotice('') }, 550)
  }
  const selectLocationSlot = (slotId: string) => {
    if (slotTransitioning || locationSubmitting || addAnimation || slotId === draft.slotId) return
    update({ slotId })
    setSlotTransitioning(true)
    slotTransitionTimerRef.current = window.setTimeout(() => {
      slotTransitionTimerRef.current = null
      setSlotTransitioning(false)
      void saveFromLocation(slotId)
    }, 300)
  }
  const openRecognition = () => {
    recognitionErrorRef.current = false
    setRecognitionError('')
    const notice = !window.isSecureContext
      ? '当前页面不是 HTTPS 安全连接，浏览器不会开放相机。请通过 HTTPS 地址打开 PWA，或选择照片识别。'
      : !navigator.mediaDevices?.getUserMedia
        ? '当前浏览器没有提供相机能力。请使用 HTTPS 打开 PWA，或选择照片识别。'
        : ''
    setNotice(notice); setBarcode(''); setOrderItems([]); setOrderSelection({}); setOrderCategoryIndex(null); setOrderLocationIndex(null); setCameraReady(false); setCameraOpen(!notice); setView('recognition')
  }
  const closeRecognition = () => { recognitionErrorRef.current = false; setRecognitionError(''); closeCameraView(); setView('add') }
  const toggleOrderItem = (index: number) => {
    const item = orderItems[index]
    if (!item || !subcategories.some(category => category.id === item.subcategory_id)) return
    setOrderSelection(current => ({ ...current, [index]: !current[index] }))
  }
  const openOrderCategory = (index: number) => {
    const currentCategory = subcategories.find(category => category.id === orderItems[index]?.subcategory_id)
    setQuery('')
    setActiveGroupId(currentCategory?.parent_id ?? parents[0]?.id ?? '')
    setCatalogTop(Math.max(0, orderCatalogElementRef.current?.getBoundingClientRect().top ?? 0))
    setOrderCategoryIndex(index)
  }
  const chooseOrderCategory = (category: Category) => {
    if (orderCategoryIndex === null) return
    const index = orderCategoryIndex
    setOrderItems(current => current.map((item, itemIndex) => itemIndex === index
      ? { ...item, subcategory_id: category.id, subcategory_name: category.name }
      : item))
    setOrderSelection(current => ({ ...current, [index]: true }))
    setOrderCategoryIndex(null)
    setNotice('')
  }
  const chooseOrderLocation = (slotId: string) => {
    if (orderLocationIndex === null) return
    setOrderItems(current => current.map((item, index) => index === orderLocationIndex
      ? { ...item, storage_slot_id: slotId }
      : item))
  }
  const addSelectedOrderItems = async () => {
    const selected = selectedOrderItems
    if (!selected.length) { setNotice('请至少勾选一件已分类的商品。'); return }
    if (!slots.length) { setNotice('当前冰箱缺少可用存放位置，请先完成冰箱设置。'); return }
    setAddingOrder(true); setNotice('')
    try {
      const result = await request<{ storage_slot_id: string | null }>(`${apiBasePath}/inventory/default-location`)
      const slotId = slots.some(slot => slot.id === result.storage_slot_id) ? result.storage_slot_id! : slots[0].id
      for (const item of selected) {
        const selectedSlotId = slots.some(slot => slot.id === item.storage_slot_id) ? item.storage_slot_id! : slotId
        const saved = await onSave({ id: undefined, subcategoryId: item.subcategory_id!, slotId: selectedSlotId, itemName: item.item_name, quantity: item.quantity, bestBefore: '', bestBeforeChanged: false, description: item.specification, productionDate: todayIso(), price: item.price ?? '', barcode: '', mergeSameName: true })
        if (!saved) throw new Error('部分商品添加失败，请检查冰箱网络后重试。')
      }
      setOrderItems([]); setOrderSelection({}); setOrderCategoryIndex(null); setView('list'); setNotice(`已添加 ${selected.length} 件商品，可在物品列表中逐个编辑。`)
    } catch (error) { setNotice((error as Error).message) } finally { setAddingOrder(false) }
  }
  const startEdit = (item: InventoryBatch) => { setDraft({ id: item.id, subcategoryId: item.subcategory_id, slotId: item.storage_slot_id, itemName: item.item_name, quantity: item.quantity, bestBefore: item.best_before ?? '', description: item.product_description ?? '', productionDate: item.production_date ?? '', price: item.price ?? '' }); setBestBeforeChanged(false); setQuantityInput(String(item.quantity)); setBarcode(item.barcode ?? ''); setNotice(''); setView('edit') }
  const generateIcons = async () => {
    if (!canManageCatalog) return
    if (!customName.trim()) { setNotice('请先填写小类名称。'); return }
    if (generatingIcons) return
    setGeneratingIcons(true)
    setNotice('正在通过 Agnes AI 生成四个候选…')
    try {
      if (generation) {
        await request<void>(`/api/owner/refrigerators/${layout.refrigerator_id}/icon-candidates/${generation.id}`, { method: 'DELETE' })
        setGeneration(null); setSelectedCandidateId('')
      }
      const result = await streamRequest<IconGeneration>(`/api/owner/refrigerators/${layout.refrigerator_id}/icon-candidates/stream`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subcategory_name: customName }) }, event => {
        if (event.type === 'status') setNotice(String(event.data.message ?? '正在生成图标候选…'))
      })
      setGeneration(result); setSelectedCandidateId(result.candidates[0]?.id ?? ''); setNotice('请选择一个候选图标。')
    } catch (error) { setNotice((error as Error).message) } finally { setGeneratingIcons(false) }
  }
  const cancelGeneratedIcons = () => {
    if (!generation) return
    const generationId = generation.id
    setGeneration(null); setSelectedCandidateId('')
    void request<void>(`/api/owner/refrigerators/${layout.refrigerator_id}/icon-candidates/${generationId}`, { method: 'DELETE' }).catch(() => undefined)
  }
  const completeCustomCategory = (created: Category) => {
    update({ subcategoryId: created.id, itemName: draft.itemName || created.name })
    customCategoryCreatedRef.current?.(created)
    customCategoryCreatedRef.current = null
    setView(customReturnView)
  }
  const confirmGeneratedIcon = async () => {
    if (!canManageCatalog) return
    if (!generation || !selectedCandidateId || !activeGroupId) return
    try {
      const created = await request<Category>(`/api/owner/refrigerators/${layout.refrigerator_id}/icon-candidates/${generation.id}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ candidate_id: selectedCandidateId, parent_id: activeGroupId, subcategory_name: customName }) })
      await onCatalogChanged()
      completeCustomCategory(created)
      setGeneration(null)
    } catch (error) { setNotice((error as Error).message) }
  }
  const createGroup = async () => {
    if (!canManageCatalog) return
    const name = groupName.trim()
    if (!name) { setGroupError('请输入大类名称。'); return }
    if (creatingGroup) return
    setCreatingGroup(true); setGroupError('')
    try {
      const created = await request<Category>(`/api/owner/refrigerators/${layout.refrigerator_id}/categories/groups`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
      await onCatalogChanged(); setActiveGroupId(created.id); setGroupDialogOpen(false); setGroupName('')
    } catch (error) { setGroupError((error as Error).message) } finally { setCreatingGroup(false) }
  }
  const openGroupDialog = () => { if (!canManageCatalog) { setNotice('日常访问不能创建分类。'); return }; setGroupName(''); setGroupError(''); setGroupDialogOpen(true) }
  const backFrom = () => { if (view === 'location') setView('edit'); else if (view === 'edit') setView(returnToList ? 'list' : 'add'); else if (view === 'custom') { cancelGeneratedIcons(); customCategoryCreatedRef.current = null; setView(customReturnView) } else onBack() }

  const catalogPanel = catalogExpanded ? <CategoryPickerPanel
    top={catalogTop}
    title="选择分类"
    query={query}
    parents={parents}
    children={matchingChildren}
    icons={icons}
    activeGroupId={activeGroupId}
    selectedCategoryId={draft.subcategoryId}
    onQueryChange={setQuery}
    onSelectGroup={setActiveGroupId}
    onSelectCategory={chooseChild}
    onClose={() => setCatalogExpanded(false)}
    onAddGroup={openGroupDialog}
    onAddSubcategory={openCustomCategory}
  /> : null
  const orderCatalogPanel = orderCategoryIndex !== null ? <CategoryPickerPanel
    top={catalogTop}
    title="选择分类"
    query={query}
    parents={parents}
    children={matchingChildren}
    icons={icons}
    activeGroupId={activeGroupId}
    selectedCategoryId={orderItems[orderCategoryIndex]?.subcategory_id}
    onQueryChange={setQuery}
    onSelectGroup={setActiveGroupId}
    onSelectCategory={chooseOrderCategory}
    onClose={() => setOrderCategoryIndex(null)}
  /> : null
  const categoryMatchStatus = categoryMatchDisplayText(categoryMatching, categoryMatchMessage, categoryMatchTextLength)
  const catalogSection = <section ref={element => { catalogElementRef.current = element }} className="p5-catalog"><div className="p5-catalog-heading"><div className="p5-catalog-heading-title"><span>选择物品</span>{categoryMatchStatus && <small className="p5-category-match-status" role="status">{categoryMatchStatus}</small>}</div><label><svg className="p5-search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索全部小类" aria-label="搜索全部小类" /></label><button type="button" onClick={openCatalog} aria-label="展开选择物品"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 10 6 6 6-6" /></svg></button></div><div className="p5-parent-grid">{(query.trim() ? matchingChildren : recentDisplayCategories).map(child => <button className={child.id === draft.subcategoryId ? 'is-selected' : ''} key={child.id} onClick={() => chooseChild(child)}><CategoryIcon iconKey={child.icon_key} icons={icons} label={child.name} /><b>{child.name}</b></button>)}</div>{catalogPanel}</section>
  const groupDialog = groupDialogOpen && <Dialog title="添加大类" onClose={() => setGroupDialogOpen(false)} closeLabel="关闭添加大类" closeDisabled={creatingGroup} className="p5-group-modal" dialogClassName="p5-group-dialog"><form onSubmit={event => { event.preventDefault(); void createGroup() }}><p className="p5-group-description">为物品选择器新增一个导航大类。</p><label className="p5-group-field"><span>大类名称</span><input autoFocus value={groupName} maxLength={80} onChange={event => { setGroupName(event.target.value); setGroupError('') }} placeholder="请输入名称" disabled={creatingGroup} /></label>{groupError && <p className="p5-group-error" role="alert">{groupError}</p>}<div className="p5-group-actions"><button type="button" onClick={() => setGroupDialogOpen(false)} disabled={creatingGroup}>取消</button><button type="submit" disabled={creatingGroup}>{creatingGroup ? '添加中…' : '添加大类'}</button></div></form></Dialog>

  if (view === 'list') return <><InventoryList inventory={inventory} icons={icons} categories={categories} title={listTitle} slotId={initialSlotId} slot={initialSlotId ? selectedSlot : undefined} onRenameSlot={initialSlotId ? onRenameSlot : undefined} expiryStatus={initialExpiryStatus} refrigerator={refrigerator} layoutsByRefrigeratorId={{ [refrigerator.id]: layout }} onSelectFridge={onSelectFridge} onBack={onBack} onAdd={openAdd} onSelect={startEdit} onMoveSelected={onMoveSelected} onDeleteSelected={onDeleteSelected} onClassifySelected={onClassifySelected} onAddGroup={openGroupDialog} onAddSubcategory={(_, onCreated) => openCustomCategory(onCreated)} onSaveQuantity={(item, quantity) => onSave({ id: item.id, subcategoryId: item.subcategory_id, slotId: item.storage_slot_id, itemName: item.item_name, quantity, bestBefore: item.best_before ?? '', bestBeforeChanged: false, description: item.product_description ?? '', productionDate: item.production_date ?? '', price: item.price ?? '', barcode: item.barcode ?? '' })} />{groupDialog}</>

  if (view === 'custom') return <PageShell className="p5-flow" header={<PageHeader title="新建小类" onBack={backFrom} right={<button className="p5-header-action" onClick={() => { cancelGeneratedIcons(); customCategoryCreatedRef.current = null; setView(customReturnView) }} aria-label="关闭"><span className="header-button-glyph" aria-hidden="true">×</span></button>} />} bodyClassName="p5-scroll p5-custom" footer={<footer className="bottom-action-bar"><button className="p5-add-category" disabled={!customName.trim() || saving || generatingIcons || (iconMode === 'library' ? !customIcon : !selectedCandidateId)} onClick={() => { if (iconMode === 'agnes') { void confirmGeneratedIcon(); return }; void onCreateCategory(activeGroupId, customName, customIcon).then(created => { if (created) completeCustomCategory(created) }) }}>{saving ? '加入中…' : '确认并加入图库'}</button></footer>}>
    <div className="category-pill">所属大类：{parents.find(item => item.id === activeGroupId)?.name}</div>
    <label className="p5-name-input"><span>小类名称</span><input autoFocus value={customName} onChange={event => setCustomName(event.target.value)} placeholder="请输入名称" /></label>
    <section><div className="p5-tabs"><button className={iconMode === 'library' ? 'is-active' : ''} onClick={() => { cancelGeneratedIcons(); setIconMode('library') }}>从图库选择</button><button className={iconMode === 'agnes' ? 'is-active' : ''} onClick={() => setIconMode('agnes')}>Agnes AI 生成</button></div>{iconMode === 'library' ? <div className="p5-icon-grid p5-custom-grid">{icons.map(icon => { const resolved = resolveIconVariant(icon, theme); return <button className={customIcon === icon.key ? 'is-selected' : ''} key={icon.key} onClick={() => setCustomIcon(icon.key)}><span><RuntimeImage className="food-icon" src={resolved.assetUrl} alt="" /></span><b>{icon.label}</b></button> })}</div> : <><button className="p5-generate-icons" type="button" disabled={generatingIcons || !customName.trim()} onClick={() => void generateIcons()}>{generatingIcons ? '生成中…' : '生成 4 个候选'}</button>{generation && <div className="p5-icon-grid p5-custom-grid">{generation.candidates.map(candidate => <button className={selectedCandidateId === candidate.id ? 'is-selected' : ''} key={candidate.id} onClick={() => setSelectedCandidateId(candidate.id)}><span><RuntimeImage className="food-icon" src={candidate.asset_url} alt="" /></span><b>候选</b></button>)}</div>}</>}</section>
    {notice && <p className="p5-inline-notice" role="status">{notice}</p>}
  </PageShell>

  if (view === 'location') return <PageShell className="p5-flow" header={<PageHeader title="确认位置" onBack={backFrom} />} bodyClassName="p5-scroll p5-location" footer={<footer className="bottom-action-bar"><button className="p5-add-location" disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '确认加入'}</button></footer>}>
      <FridgePreviewFrame variant="location" className="p5-location-preview" layout={layout} activeSlotId={draft.slotId} onSelectSlot={slotId => update({ slotId })} />
    <b className="p5-location-label">{selectedSlot ? formatStorageSlotLabel(selectedSlot.zone.label, selectedSlot.key, selectedSlot.custom_name) : '请选择一个分区'}</b><p>点击目标分区或点下面确认按钮</p>
    <div className="p5-food-summary"><span><CategoryIcon iconKey={selectedChild?.icon_key ?? null} icons={icons} label={draft.itemName} /></span><div><strong>{draft.itemName} · {selectedChild?.name}</strong>{draft.bestBefore && <small>BBD {draft.bestBefore}</small>}</div><b className="p5-summary-quantity">×{draft.quantity}</b></div>
    {notice && <p className="p5-inline-notice" role="status">{notice}</p>}
  </PageShell>

  if (view === 'edit') return <PageShell className="p5-flow" header={<PageHeader title="编辑物品" onBack={backFrom} right={<button className="p5-header-action" type="button" onClick={() => void save()} disabled={saving} aria-label="保存物品" title="保存物品"><SaveIcon /></button>} />} bodyClassName="p5-scroll p5-edit">
    <div className="p5-edit-name"><span className="p5-icon-circle"><CategoryIcon iconKey={selectedChild?.icon_key ?? null} icons={icons} label={draft.itemName} /></span><input value={draft.itemName} onChange={event => update({ itemName: event.target.value })} /></div>
    <button ref={element => { catalogElementRef.current = element }} className="p5-row-link p5-subcategory-link" onClick={openCatalog}><span><small>类别</small><b>{selectedChild?.name ?? '请选择'}</b></span><i>›</i></button>
    {catalogPanel}
    {groupDialog}
    <div className="p5-description-price-row"><label className="p5-field p5-description-field"><span>品牌规格备注</span><input value={draft.description} onChange={event => update({ description: event.target.value })} placeholder="例：蒙牛 250ml × 6" /></label><label className="p5-field p5-price-field"><span>价格</span><span className="p5-price-input"><b>¥</b><input type="number" min="0" step="0.01" inputMode="decimal" value={draft.price} onChange={event => update({ price: event.target.value })} placeholder="0.00" aria-label="价格" /></span></label></div>
    <div className="p5-date-row"><label className="p5-field"><span>生产日期</span><input type="date" value={draft.productionDate} onChange={event => update({ productionDate: event.target.value })} /></label><label className="p5-field"><span>保质期至（可选）</span><input type="date" value={draft.bestBefore} onChange={event => { setBestBeforeChanged(true); update({ bestBefore: event.target.value }) }} /></label></div>
    <div className="p5-large-quantity"><span>数量</span><div><button onClick={() => setQuantity(draft.quantity - 1)}>−</button><b>{draft.quantity}</b><button onClick={() => setQuantity(draft.quantity + 1)}>＋</button></div></div>
    <button className="p5-row-link p5-slot-link" onClick={() => setView('location')}><span><small>存放位置</small><b>{selectedSlot ? formatStorageSlotLabel(selectedSlot.zone.label, selectedSlot.key, selectedSlot.custom_name) : '请选择'}</b></span><i>›</i></button>
    <button className="p5-delete" onClick={() => void onDelete(draft.id).then(deleted => { if (deleted) { setView(returnToList ? 'list' : 'add'); setNotice(returnToList ? '' : '物品已删除。') } })}>删除物品</button>
  </PageShell>

  if (view === 'order') return <PageShell className="p5-flow p6-order" header={<PageHeader title="识别订单" onBack={() => { setOrderItems([]); setOrderSelection({}); setOrderCategoryIndex(null); setOrderLocationIndex(null); setView('add') }} />} bodyClassName="p5-scroll p6-order-scroll" footer={<footer className="bottom-action-bar"><button className="p6-add-selected-items" disabled={addingOrder || selectedOrderItems.length === 0} onClick={() => void addSelectedOrderItems()}>{addingOrder ? '添加中…' : `添加${selectedOrderItems.length ? `（${selectedOrderItems.length}）` : ''}`}</button></footer>}>
    <div ref={orderCatalogElementRef} className="p6-order-intro"><span aria-hidden="true">✦</span><p>已识别到订单商品，请逐项确认。未分类商品需先选择分类才能添加。</p></div>
    <OrderRecognitionList
      items={orderItems}
      selection={orderSelection}
      categories={categories}
      onToggle={toggleOrderItem}
      onChooseCategory={openOrderCategory}
      locations={orderLocations}
      onChooseLocation={index => setOrderLocationIndex(index)}
    />
    {orderCatalogPanel}
    {orderLocationIndex !== null && <Dialog title="选择存放位置" onClose={() => setOrderLocationIndex(null)} closeLabel="关闭位置选择" className="p5-location-modal" dialogClassName="p5-location-dialog"><FridgePreviewFrame variant="location" className="p5-location-preview" layout={layout} activeSlotId={orderItems[orderLocationIndex]?.storage_slot_id} onSelectSlot={chooseOrderLocation} /><b className="p5-location-label">{orderLocations.find(location => location.id === orderItems[orderLocationIndex]?.storage_slot_id)?.label ?? '请选择一个分区'}</b><button className="p5-location-submit" type="button" disabled={!orderItems[orderLocationIndex]?.storage_slot_id} onClick={() => setOrderLocationIndex(null)}>确认位置</button></Dialog>}
    {notice && <p className="p5-inline-notice" role="status">{notice}</p>}
  </PageShell>

  if (view === 'recognition') return <PageShell className="p6-recognition" header={<PageHeader title="识别物品" onBack={closeRecognition} />} bodyClassName="p6-recognition-camera">
    <video ref={videoRef} className={`p6-capture-video ${cameraOpen && cameraReady ? 'is-preview' : ''}`} muted playsInline autoPlay aria-hidden="true" />
    {cameraOpen && cameraReady && !recognizing && <><div className="p6-focus-guide" aria-hidden="true"><i /></div><p className="p6-focus-hint">将条码、二维码或物品放入框内，保持稳定后点击下方按钮</p></>}
    {recognizing && <RecognitionProgress message={recognitionStatus} text={recognitionText} textLength={recognitionTextLength} />}
    {!recognizing && (notice || cameraCapturing || (cameraOpen && !cameraReady)) && <p className={`p6-camera-message ${recognitionError ? 'is-error' : ''}`} role="status">{cameraCapturing ? '正在拍照…' : notice || '正在打开相机…'}</p>}
    <input ref={photoInputRef} className="p6-photo-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => void handlePhotoSelected(event.target.files?.[0])} />
    <footer className="p6-recognition-footer">
      {!recognizing && <small>点击按钮后拍照并识别</small>}
      {recognitionError && <button className="p6-recognition-retry" type="button" onClick={retryRecognitionCamera}>重新打开相机</button>}
      <div className="p6-recognition-actions">
        <button type="button" disabled={recognizing || cameraCapturing || !cameraReady} onClick={() => void runBarcodeRecognition()}><svg className="p6-button-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" /><path d="M7 12h10" /></svg>扫码</button>
        <button type="button" disabled={recognizing || cameraCapturing || !cameraReady} onClick={() => void runImageRecognition()}><svg className="p6-button-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m5.5 17 4.5-4.5 3 3 2-2 3.5 3.5M17.5 4v3M16 5.5h3" /></svg>识图</button>
        <button type="button" disabled={recognizing || cameraCapturing} onClick={openPhotoPicker}><svg className="p6-button-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="m5.5 17 4.25-4.25a1.5 1.5 0 0 1 2.12 0L14 14.88l1.13-1.13a1.5 1.5 0 0 1 2.12 0L20.5 17" /><circle cx="8.5" cy="9" r="1.25" /></svg>照片</button>
      </div>
    </footer>
  </PageShell>

  return <PageShell className="p5-flow" header={<PageHeader title="添加物品" onBack={backFrom} right={<button className="p6-scan-button" type="button" onClick={openRecognition} aria-label="打开扫码和物品识别"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" /><path d="M7 12h10" /></svg></button>} />} bodyClassName="p5-scroll p5-add" footer={<footer className="bottom-action-bar"><button className="p5-add-item" onClick={() => void advance()}>加入冰箱</button></footer>}>
    {Object.keys(conflicts).length > 0 && <section className="p6-conflicts" aria-live="polite"><h2>确认识别结果</h2><p>以下字段已有值，本次识别不会自动覆盖。</p>{Object.entries(conflicts).map(([field, value]) => <div key={field}><b>{field === 'itemName' ? '物品名称' : field === 'description' ? '品牌 / 规格 / 备注' : field === 'productionDate' ? '生产日期' : field === 'bestBefore' ? '保质期至' : field === 'barcode' ? '条码' : '小类'}</b><span>当前：{field === 'barcode' ? barcode : String(draft[field as keyof typeof draft])}</span><span>识别：{value.value}（{Math.round(value.confidence * 100)}%）</span><button onClick={() => { if (field === 'barcode') setBarcode(value.value); else update({ [field]: value.value } as Partial<typeof draft>); setConflicts(current => { const next = { ...current }; delete next[field]; return next }) }}>采用识别值</button><button className="p6-keep" onClick={() => setConflicts(current => { const next = { ...current }; delete next[field]; return next })}>保留当前值</button></div>)}</section>}
    {catalogSection}
    {groupDialog}
    <section className="p5-food-name"><span>物品名称</span><div className="p5-food-name-row"><input value={draft.itemName} onChange={event => update({ itemName: event.target.value })} placeholder="请输入物品名称" /><span className="p5-food-quantity-mark" aria-hidden="true">×</span><QuantityArrowControl value={quantityInput} min={draft.id ? 0 : 1} onChange={onQuantityInputChange} onBlur={normalizeQuantityInput} onIncrement={() => { const next = stepQuantity(quantityInput, 1, draft.id ? 0 : 1); setQuantityInput(next); setQuantity(Number(next)); update({ quantity: Number(next) }) }} onDecrement={() => { const next = stepQuantity(quantityInput, -1, draft.id ? 0 : 1); setQuantityInput(next); setQuantity(Number(next)); update({ quantity: Number(next) }) }} ariaLabel="数量" />{selectedChild && <span className="p5-selected-icon"><CategoryIcon iconKey={selectedChild.icon_key} icons={icons} label="" /></span>}</div></section>
    <div className="p5-date-row"><label className="p5-field"><span>生产日期</span><input type="date" value={draft.productionDate} onChange={event => update({ productionDate: event.target.value })} /></label><label className="p5-field"><span>保质期至（可不填）</span><input type="date" value={draft.bestBefore} onChange={event => { setBestBeforeChanged(true); update({ bestBefore: event.target.value }) }} /></label></div>
    <div className="p5-description-price-row"><label className="p5-field p5-description-field"><span>品牌 / 规格 / 备注</span><input value={draft.description} onChange={event => update({ description: event.target.value })} placeholder="例：光明 950ml 有折扣" /></label><label className="p5-field p5-price-field"><span>价格</span><span className="p5-price-input"><b>¥</b><input type="number" min="0" step="0.01" inputMode="decimal" value={draft.price} onChange={event => update({ price: event.target.value })} placeholder="0.00" aria-label="价格" /></span></label></div>
    {locationOpen && <Dialog title="选择存放位置" onClose={() => setLocationOpen(false)} closeLabel="关闭位置选择" closeDisabled={saving || addAnimation || locationSubmitting || slotTransitioning} className="p5-location-modal" dialogClassName={`p5-location-dialog ${addAnimation ? 'is-animating' : ''}`}><FridgePreviewFrame variant="location" className="p5-location-preview" layout={layout} activeSlotId={draft.slotId} onSelectSlot={selectLocationSlot} />{addAnimation && <div className="p5-add-success" role="status"><CategoryIcon iconKey={selectedChild?.icon_key ?? null} icons={icons} label="" /><b>已加入冰箱</b></div>}{notice && <p className="p5-inline-notice" role="status">{notice}</p>}<button className="p5-location-submit" disabled={saving || addAnimation || locationSubmitting || slotTransitioning || !draft.slotId} onClick={() => void saveFromLocation()}>{saving || locationSubmitting ? '添加中…' : selectedSlot ? `添加到 ${formatStorageSlotLabel(selectedSlot.zone.label, selectedSlot.key, selectedSlot.custom_name)}` : '添加到此位置'}</button></Dialog>}
    {errorNotice && <NoticeDialog title="暂时无法继续" message={errorNotice} onClose={() => setErrorNotice('')} />}
  </PageShell>
}
