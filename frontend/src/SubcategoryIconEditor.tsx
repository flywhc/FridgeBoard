import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Category, CategoryRecognitionResult, Icon, IconCandidate, IconGeneration } from './appTypes'
import { fetchRuntimeAsset, request, streamRequest } from './appApi'
import { pickNativeImage } from './nativeBridge'
import { appRuntime } from './runtime'
import { resolveIconVariant } from './iconVariants'
import { prepareIconImage } from './iconImage'
import { THEME_REGISTRY, type ThemeKey } from './theme'
import { Dialog, OptionPickerField, PageHeader, PageShell, RuntimeImage } from './sharedUi'
import { usePageStackActive } from './pageStack'
import { SubcategoryRecognitionDialog } from './SubcategoryRecognitionDialog'
import { canConfirmIconDraft, getOnlineProvider, hasIconDraftChanges, ICON_SOURCE_TABS, isCurrentIconCandidate, isSupportedIconFile, shouldApplyKeywordResponse, shouldApplySearchResponse, type IconEditorSourceTab } from './subcategoryIconEditorLogic'
import { IconPagination, ThemeSlotStatusIcon } from './SubcategoryIconEditorComponents'
import { createInitialDraft, errorMessage, fileFromDataUrl, getThemeSlotState, MAX_ICON_BYTES, preloadOnlineResultAssets, readIconCandidate, type DraftVariant, type IconDraft, type SearchResult } from './subcategoryIconEditorSupport'

type SourceTab = IconEditorSourceTab
type PendingOnlineVariant = {
  provider: 'iconify' | 'thiings'
  itemId: string
  variant: DraftVariant
}
type ModelOption = { id: string; label: string; capabilities: string[] }
type LocalIconCandidate = { id: string; file: File; url: string; dimensions: string; label: '去背景' | '原图'; variant?: DraftVariant }
type PendingLocalFile = { file: File; url: string; dimensions: string }

const THEMES = Object.keys(THEME_REGISTRY) as ThemeKey[]
const AI_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
const ICONS_PER_PAGE = 12
const AI_CANDIDATE_COUNT = 4
const DEFAULT_SUBCATEGORY_NAME = '待命名小类'

/**
 * 多主题小类图标编辑器。编辑期间草稿只保存在前端，确认时才提交服务端。
 */
export function SubcategoryIconEditor({
  refrigeratorId,
  parentId,
  parentName,
  parents = [],
  initialName = '',
  initialCategory,
  recognitionItemName,
  recognitionInventoryBatchId,
  initialFallbackTheme,
  icons,
  theme,
  onCatalogChanged,
  onComplete,
  onDeleted,
  onCancel,
}: {
  refrigeratorId: string
  parentId: string
  parentName?: string | null
  parents?: Category[]
  initialName?: string
  initialCategory?: Category | null
  recognitionItemName?: string
  recognitionInventoryBatchId?: string
  initialFallbackTheme?: ThemeKey
  icons: Icon[]
  theme: ThemeKey
  onCatalogChanged: () => Promise<void>
  onComplete: (category: Category) => void
  onDeleted?: (categoryId: string) => void
  onCancel: () => void
}) {
  const basePath = `/api/owner/refrigerators/${encodeURIComponent(refrigeratorId)}`
  const pageActive = usePageStackActive()
  const initialEditorDraft = createInitialDraft(initialCategory, initialName, parentId, initialFallbackTheme ?? theme, icons)
  const [draft, setDraft] = useState<IconDraft>(initialEditorDraft)
  const [initialDraft] = useState<IconDraft>(initialEditorDraft)
  const [name, setName] = useState(initialEditorDraft.name)
  const [fallbackTheme, setFallbackTheme] = useState<ThemeKey>(initialEditorDraft.fallback_theme)
  const [fallbackDialogOpen, setFallbackDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [recognitionDialogOpen, setRecognitionDialogOpen] = useState(false)
  const [recognitionStatus, setRecognitionStatus] = useState('正在准备分类识别…')
  const [recognitionNames, setRecognitionNames] = useState<string[]>([])
  const [recognitionError, setRecognitionError] = useState('')
  const [recognizedCategory, setRecognizedCategory] = useState<Category | null>(null)
  const [activeTheme, setActiveTheme] = useState<ThemeKey>(theme)
  const [sourceTab, setSourceTab] = useState<SourceTab>('library')
  const [notice, setNotice] = useState('')
  const [noticeIsError, setNoticeIsError] = useState(false)
  const [pending, setPending] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [keywords, setKeywords] = useState<string[]>([])
  const [keywordGenerating, setKeywordGenerating] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [resultPage, setResultPage] = useState(0)
  const [libraryPage, setLibraryPage] = useState(0)
  const [generation, setGeneration] = useState<IconGeneration | null>(null)
  const [generationTheme, setGenerationTheme] = useState<ThemeKey | null>(null)
  const [generationRunning, setGenerationRunning] = useState(false)
  const [generationSlot, setGenerationSlot] = useState<number | null>(null)
  const [generationCompleted, setGenerationCompleted] = useState(0)
  const [models, setModels] = useState<ModelOption[]>([])
  const [model, setModel] = useState('')
  const [modelLoadedTheme, setModelLoadedTheme] = useState<ThemeKey | null>(null)
  const [modelErrorState, setModelErrorState] = useState<{ theme: ThemeKey; message: string } | null>(null)
  const [pendingOnlineVariants, setPendingOnlineVariants] = useState<Partial<Record<ThemeKey, PendingOnlineVariant>>>({})
  const [pendingFiles, setPendingFiles] = useState<Partial<Record<ThemeKey, PendingLocalFile>>>({})
  const [librarySelections, setLibrarySelections] = useState<Partial<Record<ThemeKey, string>>>({})
  const [localCandidates, setLocalCandidates] = useState<Partial<Record<ThemeKey, LocalIconCandidate[]>>>({})
  const [selectedLocalCandidateIds, setSelectedLocalCandidateIds] = useState<Partial<Record<ThemeKey, string>>>({})
  const nameInputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const generationControllerRef = useRef<AbortController | null>(null)
  const generationIdRef = useRef<string | null>(null)
  const searchControllerRef = useRef<AbortController | null>(null)
  const searchSequenceRef = useRef(0)
  const keywordControllerRef = useRef<AbortController | null>(null)
  const keywordSequenceRef = useRef(0)
  const keywordRequestNameRef = useRef('')
  const keywordCacheRef = useRef(new Map<string, string[]>())
  const activeThemeRef = useRef(activeTheme)
  const nameRef = useRef(initialEditorDraft.name)
  const searchQueryRef = useRef('')
  const localSequenceRef = useRef(0)
  const localCandidateSequenceRef = useRef(0)
  const localCandidateSlotRef = useRef<Partial<Record<ThemeKey, number>>>({})
  const objectUrlsRef = useRef(new Set<string>())

  const showInfo = useCallback((message: string) => {
    setNotice(message)
    setNoticeIsError(false)
  }, [])
  const showError = useCallback((error: unknown) => {
    setNotice(errorMessage(error))
    setNoticeIsError(true)
  }, [])
  const clearNotice = useCallback(() => {
    setNotice('')
    setNoticeIsError(false)
  }, [])

  useEffect(() => {
    activeThemeRef.current = activeTheme
  }, [activeTheme])

  useEffect(() => {
    nameRef.current = name
  }, [name])

  useEffect(() => {
    // 等待页面入场结束再聚焦，且禁止浏览器为聚焦控件改变页面滚动位置。
    if (pageActive) nameInputRef.current?.focus({ preventScroll: true })
  }, [pageActive])

  useEffect(() => {
    searchQueryRef.current = searchQuery
  }, [searchQuery])

  useEffect(() => {
    const objectUrls = objectUrlsRef.current
    return () => {
      for (const url of objectUrls) URL.revokeObjectURL(url)
      objectUrls.clear()
      generationControllerRef.current?.abort()
      const generationId = generationIdRef.current
      generationIdRef.current = null
      if (generationId) void request<void>(`${basePath}/icon-candidates/${generationId}`, { method: 'DELETE' }).catch(() => undefined)
      searchControllerRef.current?.abort()
      keywordControllerRef.current?.abort()
      localSequenceRef.current += 1
    }
  }, [basePath])

  useEffect(() => {
    if (!pageActive) return
    const controller = new AbortController()
    void request<ModelOption[]>(`${basePath}/icon-models`, { signal: controller.signal })
      .then(options => {
        if (controller.signal.aborted) return
        setModels(options)
        const compatible = options.find(option => option.capabilities.includes(activeTheme === 'ink' ? 'svg' : 'image'))
        if (compatible) setModel(compatible.id)
        setModelLoadedTheme(activeTheme)
        setModelErrorState(compatible ? null : { theme: activeTheme, message: '当前主题没有可用的 AI 图标模型。' })
      }).catch(error => {
        if (!controller.signal.aborted) setModelErrorState({ theme: activeTheme, message: errorMessage(error) })
      })
    return () => controller.abort()
  }, [activeTheme, basePath, pageActive])

  const deleteGeneration = useCallback(async (generationId = generationIdRef.current, reportError = false) => {
    if (!generationId) return true
    if (generationIdRef.current === generationId) generationIdRef.current = null
    try {
      await request<void>(`${basePath}/icon-candidates/${generationId}`, { method: 'DELETE' })
      return true
    } catch (error) {
      if (generationIdRef.current === null) generationIdRef.current = generationId
      if (reportError) showError(error)
      return false
    }
  }, [basePath, showError])

  useEffect(() => {
    if (pageActive) return
    generationControllerRef.current?.abort()
    searchControllerRef.current?.abort()
    keywordControllerRef.current?.abort()
    localSequenceRef.current += 1
    searchSequenceRef.current += 1
    keywordSequenceRef.current += 1
    const generationId = generationIdRef.current
    generationIdRef.current = null
    if (generationId) void request<void>(`${basePath}/icon-candidates/${generationId}`, { method: 'DELETE' }).catch(() => undefined)
    const resetTimer = window.setTimeout(() => {
      setGenerationRunning(false)
      setSearching(false)
      setKeywordGenerating(false)
    }, 0)
    return () => window.clearTimeout(resetTimer)
  }, [basePath, pageActive])

  const currentVariant = draft.variants[activeTheme]
  const onlineProvider = getOnlineProvider(activeTheme)
  const modelLoading = modelLoadedTheme !== activeTheme && modelErrorState?.theme !== activeTheme
  const modelError = modelErrorState?.theme === activeTheme ? modelErrorState.message : ''
  const compatibleModels = useMemo(
    () => models.filter(option => option.capabilities.includes(activeTheme === 'ink' ? 'svg' : 'image')),
    [activeTheme, models],
  )

  const chooseLibraryIcon = (icon: Icon) => {
    const resolved = resolveIconVariant(icon, activeTheme)
    setDraft(current => ({
      ...current,
      variants: {
        ...current.variants,
        [activeTheme]: {
          asset_url: resolved.assetUrl,
          media_type: resolved.mediaType,
          source: 'library',
          source_id: icon.key,
        },
      },
    }))
    setLibrarySelections(current => ({ ...current, [activeTheme]: icon.key }))
    setPendingOnlineVariants(current => {
      const next = { ...current }
      delete next[activeTheme]
      return next
    })
    setPendingFiles(current => {
      const next = { ...current }
      delete next[activeTheme]
      return next
    })
    setSelectedLocalCandidateIds(current => {
      const next = { ...current }
      delete next[activeTheme]
      return next
    })
    showInfo('图库图标已加入当前主题草稿，确认后提交。')
  }

  const chooseOnlineIcon = (result: SearchResult) => {
    if (!onlineProvider || !result.preview_url) return
    const variant: DraftVariant = {
      asset_url: result.preview_url,
      media_type: activeTheme === 'ink' ? 'image/svg+xml' : 'image/png',
      source: onlineProvider,
      source_id: result.id,
      source_url: result.source_url,
      attribution: result.author,
    }
    setDraft(current => ({ ...current, variants: { ...current.variants, [activeTheme]: variant } }))
    setSelectedLocalCandidateIds(current => {
      const next = { ...current }
      delete next[activeTheme]
      return next
    })
    setPendingOnlineVariants(current => ({
      ...current,
      [activeTheme]: {
        provider: onlineProvider,
        itemId: result.id,
        variant,
      },
    }))
    setLibrarySelections(current => {
      const next = { ...current }
      delete next[activeTheme]
      return next
    })
    setPendingFiles(current => {
      const next = { ...current }
      delete next[activeTheme]
      return next
    })
    showInfo('在线图标已预览，确认后提交。')
  }

  const stageLocalCandidate = (candidate: LocalIconCandidate, themeKey: ThemeKey, message: string) => {
    setSelectedLocalCandidateIds(current => ({ ...current, [themeKey]: candidate.id }))
    setPendingFiles(current => ({ ...current, [themeKey]: candidate }))
    setDraft(current => ({
      ...current,
      variants: { ...current.variants, [themeKey]: { asset_url: candidate.url, media_type: candidate.file.type, source: 'upload' } },
    }))
    setPendingOnlineVariants(current => {
      const next = { ...current }
      delete next[themeKey]
      return next
    })
    setLibrarySelections(current => {
      const next = { ...current }
      delete next[themeKey]
      return next
    })
    showInfo(message)
  }

  const chooseLocalFile = async (file: File | null) => {
    if (!file) return
    if (!isSupportedIconFile(file)) {
      showError(new Error(file.type === 'image/heic' || file.type === 'image/heif' ? 'HEIC/HEIF 需要系统转换后再导入。' : '仅支持 PNG、JPEG 或 WebP 图片。'))
      return
    }
    const sequence = ++localSequenceRef.current
    const requestTheme = activeTheme
    showInfo('正在处理图片…')
    try {
      const prepared = await prepareIconImage(file)
      if (sequence !== localSequenceRef.current || requestTheme !== activeThemeRef.current) return
      const dimensions = `${prepared.width} × ${prepared.height}`
      const processedCandidate = createLocalCandidate(prepared.file, prepared.backgroundRemoved ? '去背景' : '原图', dimensions)
      rememberLocalCandidate(requestTheme, processedCandidate)
      if (prepared.originalFile) {
        rememberLocalCandidate(requestTheme, createLocalCandidate(prepared.originalFile, '原图', dimensions))
      }
      stageLocalCandidate(
        processedCandidate,
        requestTheme,
        prepared.backgroundRemoved ? '图片背景已移除，原图候选已保留。' : '未识别到明确浅色背景，已保留原图。',
      )
    } catch (error) {
      if (sequence === localSequenceRef.current && requestTheme === activeThemeRef.current) showError(error)
    }
  }

  const createLocalCandidate = (file: File, label: LocalIconCandidate['label'], dimensions: string): LocalIconCandidate => {
    const url = URL.createObjectURL(file)
    objectUrlsRef.current.add(url)
    return { id: `local-${++localCandidateSequenceRef.current}`, file, url, dimensions, label }
  }

  const rememberLocalCandidate = (themeKey: ThemeKey, candidate: LocalIconCandidate) => {
    const slotIndex = localCandidateSlotRef.current[themeKey] ?? 0
    localCandidateSlotRef.current[themeKey] = (slotIndex + 1) % AI_CANDIDATE_COUNT
    setLocalCandidates(current => {
      const existing = current[themeKey] ?? []
      const next = [...existing]
      const replaced = next[slotIndex]
      if (replaced && replaced.url !== candidate.url) {
        URL.revokeObjectURL(replaced.url)
        objectUrlsRef.current.delete(replaced.url)
      }
      next[slotIndex] = candidate
      return { ...current, [themeKey]: next }
    })
  }

  const chooseNative = async (source: 'photo' | 'file') => {
    if (appRuntime.kind !== 'capacitor') {
      ;(source === 'photo' ? photoInputRef : fileInputRef).current?.click()
      return
    }
    try {
      const selected = await pickNativeImage(source)
      await chooseLocalFile(fileFromDataUrl(selected.data, selected.mediaType, selected.name ?? 'icon'))
    } catch (error) {
      const candidate = error as { code?: string }
      if (candidate.code !== 'IMAGE_PICK_CANCELLED') showError(error)
    }
  }

  const applyLocalCandidate = (candidate: LocalIconCandidate) => {
    if (pending) return
    stageLocalCandidate(candidate, activeTheme, '本地候选图标已应用。')
  }

  const searchIcons = async (query = searchQueryRef.current) => {
    const normalizedQuery = query.trim()
    if (!onlineProvider || !normalizedQuery) return
    setSearchQuery(normalizedQuery)
    searchQueryRef.current = normalizedQuery
    const sequence = ++searchSequenceRef.current
    const requestTheme = activeTheme
    const requestProvider = onlineProvider
    searchControllerRef.current?.abort()
    const controller = new AbortController()
    searchControllerRef.current = controller
    setResults([])
    setResultPage(0)
    clearNotice()
    setSearching(true)
    try {
      const response = await request<{ results: SearchResult[] }>(`${basePath}/icon-search?provider=${requestProvider}&query=${encodeURIComponent(normalizedQuery)}`, { signal: controller.signal })
      if (controller.signal.aborted || !shouldApplySearchResponse(sequence, searchSequenceRef.current, requestTheme, activeThemeRef.current, requestProvider, getOnlineProvider(activeThemeRef.current))) return
      if (response.results.length > 0) {
        void preloadOnlineResultAssets(response.results, controller.signal)
      }
      setResults(response.results)
      setResultPage(0)
      showInfo(response.results.length ? '请选择一个在线图标。' : '暂无在线结果。')
    } catch (error) {
      if (sequence === searchSequenceRef.current && !controller.signal.aborted) showError(error)
    } finally {
      if (sequence === searchSequenceRef.current) setSearching(false)
    }
  }

  const searchKeyword = (keyword: string) => {
    setSearchQuery(keyword)
    searchQueryRef.current = keyword
    void searchIcons(keyword)
  }

  const generateKeywords = useCallback(async (value = nameRef.current, force = false) => {
    const requestName = value.trim()
    if (!requestName || requestName === DEFAULT_SUBCATEGORY_NAME) return
    if (!force && keywordCacheRef.current.has(requestName)) {
      const cachedKeywords = keywordCacheRef.current.get(requestName) ?? []
      clearNotice()
      setKeywords(cachedKeywords)
      if (!searchQueryRef.current.trim() && cachedKeywords[0]) setSearchQuery(cachedKeywords[0])
      return
    }
    const sequence = ++keywordSequenceRef.current
    const requestQuery = searchQueryRef.current
    keywordControllerRef.current?.abort()
    const controller = new AbortController()
    keywordControllerRef.current = controller
    try {
      const response = await request<{ keywords: string[] }>(`${basePath}/icon-keywords`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ subcategory_name: requestName }),
      })
      if (controller.signal.aborted || sequence !== keywordSequenceRef.current || requestName !== nameRef.current.trim()) return
      const nextKeywords = response.keywords ?? []
      keywordCacheRef.current.set(requestName, nextKeywords)
      clearNotice()
      if (!force && !shouldApplyKeywordResponse(sequence, keywordSequenceRef.current, requestName, nameRef.current, requestQuery, searchQueryRef.current)) return
      setKeywords(nextKeywords)
      if (!searchQueryRef.current.trim() && nextKeywords[0]) setSearchQuery(nextKeywords[0])
    } catch (error) {
      if (!controller.signal.aborted && sequence === keywordSequenceRef.current) showError(error)
    } finally {
      if (sequence === keywordSequenceRef.current) setKeywordGenerating(false)
    }
  }, [basePath, clearNotice, showError])

  const requestKeywords = useCallback((value: string, force = false) => {
    const requestName = value.trim()
    if (!requestName || requestName === DEFAULT_SUBCATEGORY_NAME) {
      keywordControllerRef.current?.abort()
      keywordSequenceRef.current += 1
      keywordRequestNameRef.current = ''
      setKeywordGenerating(false)
      setKeywords([])
      return
    }
    if (!force && requestName === keywordRequestNameRef.current) return
    keywordRequestNameRef.current = requestName
    keywordControllerRef.current?.abort()
    keywordSequenceRef.current += 1
    setKeywords([])
    if (!force && keywordCacheRef.current.has(requestName)) {
      const cachedKeywords = keywordCacheRef.current.get(requestName) ?? []
      setKeywords(cachedKeywords)
      if (!searchQueryRef.current.trim() && cachedKeywords[0]) setSearchQuery(cachedKeywords[0])
      setKeywordGenerating(false)
      return
    }
    setKeywordGenerating(true)
    void generateKeywords(requestName, force)
  }, [generateKeywords])

  useEffect(() => {
    if (!pageActive || sourceTab !== 'online' || !onlineProvider) return
    const requestName = nameRef.current.trim()
    if (requestName && requestName !== DEFAULT_SUBCATEGORY_NAME) {
      requestKeywords(requestName)
    } else {
      keywordRequestNameRef.current = ''
      setKeywords([])
      setKeywordGenerating(false)
    }
    return () => {
      keywordControllerRef.current?.abort()
      keywordSequenceRef.current += 1
      keywordRequestNameRef.current = ''
      setKeywordGenerating(false)
    }
  }, [activeTheme, onlineProvider, pageActive, requestKeywords, sourceTab])

  const stopGeneration = useCallback(() => {
    const controller = generationControllerRef.current
    if (!controller) return
    controller.abort()
    generationControllerRef.current = null
    setGenerationRunning(false)
    setGenerationSlot(null)
    setPending(false)
    showInfo(generation?.candidates.length ? `已停止生成，已保留 ${generation.candidates.length} 张候选。` : '已停止生成。')
  }, [generation, showInfo])

  const generateIcons = async () => {
    if (generationRunning) {
      stopGeneration()
      return
    }
    if (!name.trim() || !model || pending || modelLoading || modelError) return
    if (!await deleteGeneration(generationIdRef.current, true)) return
    setGeneration(null)
    setGenerationTheme(null)
    setGenerationCompleted(0)
    setGenerationSlot(0)
    generationControllerRef.current?.abort()
    const controller = new AbortController()
    generationControllerRef.current = controller
    setGenerationRunning(true)
    setPending(true); showInfo('正在生成图标候选…')
    try {
      const response = await streamRequest<IconGeneration>(`${basePath}/icon-candidates/stream`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ subcategory_name: name, theme_key: activeTheme, model }),
      }, event => {
        if (controller.signal.aborted || activeThemeRef.current !== activeTheme) return
        if (event.type === 'start') {
          const id = typeof event.data.generation_id === 'string' ? event.data.generation_id : null
          if (!id) return
          generationIdRef.current = id
          setGenerationTheme(activeTheme)
          setGeneration({ id, candidates: [] })
          setGenerationCompleted(0)
          setGenerationSlot(0)
          return
        }
        if (event.type === 'status') {
          const candidateIndex = event.data.candidate_index
          if (typeof candidateIndex === 'number') setGenerationSlot(candidateIndex)
          showInfo(String(event.data.message ?? '正在生成图标候选…'))
          return
        }
        if (event.type === 'candidate') {
          const candidate = readIconCandidate(event.data.candidate)
          if (!candidate) return
          const completed = typeof event.data.completed === 'number' ? event.data.completed : generationCompleted + 1
          setGeneration(current => {
            if (!current) return current
            const candidates = current.candidates.some(item => item.id === candidate.id)
              ? current.candidates
              : [...current.candidates, candidate]
            return { ...current, candidates }
          })
          setGenerationCompleted(completed)
          setGenerationSlot(completed < AI_CANDIDATE_COUNT ? completed : null)
          return
        }
        if (event.type === 'error') {
          const id = typeof event.data.generation_id === 'string' ? event.data.generation_id : generationIdRef.current
          const candidates = Array.isArray(event.data.candidates)
            ? event.data.candidates.map(readIconCandidate).filter((item): item is IconCandidate => item !== null)
            : []
          if (id && candidates.length) {
            generationIdRef.current = id
            setGeneration({ id, candidates })
            setGenerationTheme(activeTheme)
            setGenerationCompleted(candidates.length)
            setGenerationSlot(candidates.length < AI_CANDIDATE_COUNT ? candidates.length : null)
          }
        }
      })
      if (!controller.signal.aborted) {
        generationIdRef.current = response.id
        setGenerationTheme(activeTheme)
        setGeneration(response)
        setGenerationCompleted(response.candidates.length)
        setGenerationSlot(null)
        showInfo('点击候选图标即可应用到当前主题。')
      }
    } catch (error) {
      if (!controller.signal.aborted) showError(error)
    } finally {
      if (generationControllerRef.current === controller) {
        generationControllerRef.current = null
        setGenerationRunning(false)
        setGenerationSlot(null)
        setPending(false)
      }
    }
  }

  const applyCandidate = async (candidate: IconCandidate) => {
    if (!generation || !generationTheme || !isCurrentIconCandidate(generation.id, generationTheme, candidate.id, generationIdRef.current, activeTheme, generation.candidates.map(item => item.id))) {
      showError(new Error('AI 候选已失效，请重新生成。'))
      return
    }
    setPending(true)
    showInfo('正在读取 AI 候选…')
    try {
      const blob = await fetchRuntimeAsset(candidate.asset_url)
      if (blob.size > MAX_ICON_BYTES) throw new Error('图片超过 10MB 限制')
      const mediaType = blob.type || candidate.media_type || (activeTheme === 'ink' ? 'image/svg+xml' : 'image/png')
      if (!AI_MIME_TYPES.has(mediaType)) throw new Error('AI 候选格式不受支持')
      if (activeTheme === 'ink' && mediaType !== 'image/svg+xml') throw new Error('水墨主题 AI 候选必须是 SVG')
      if (activeTheme !== 'ink' && mediaType === 'image/svg+xml') throw new Error('当前主题 AI 候选必须是位图')
      const file = new File([blob], `ai-${candidate.id}.${mediaType === 'image/svg+xml' ? 'svg' : 'png'}`, { type: mediaType })
      const url = URL.createObjectURL(file)
      objectUrlsRef.current.add(url)
      const requestTheme = activeTheme
      setPendingFiles(current => ({ ...current, [requestTheme]: { file, url, dimensions: '' } }))
      setDraft(current => ({
        ...current,
        variants: {
          ...current.variants,
          [requestTheme]: { asset_url: url, media_type: mediaType, source: 'agnes', source_id: candidate.id },
        },
      }))
      setPendingOnlineVariants(current => {
        const next = { ...current }
        delete next[requestTheme]
        return next
      })
      setLibrarySelections(current => {
        const next = { ...current }
        delete next[requestTheme]
        return next
      })
      showInfo('AI 候选已应用到当前主题，确认后提交。')
    } catch (error) { showError(error) } finally { setPending(false) }
  }

  const cancel = async () => {
    generationControllerRef.current?.abort()
    if (!await deleteGeneration(generationIdRef.current, true)) return
    setGeneration(null)
    setGenerationTheme(null)
    setGenerationRunning(false)
    setGenerationSlot(null)
    setGenerationCompleted(0)
    onCancel()
  }

  const runRecognition = async (category: Category) => {
    setRecognitionStatus('正在识别此类物品')
    setRecognitionError('')
    try {
      const result = await request<CategoryRecognitionResult>(`${basePath}/categories/${category.id}/recognize-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context_item_name: recognitionItemName?.trim() || undefined, context_inventory_batch_id: recognitionInventoryBatchId || undefined }),
      })
      setRecognitionNames(result.items.map(item => item.item_name))
      setRecognitionStatus('识别完成')
      setRecognizedCategory(category)
    } catch (error) {
      setRecognitionError(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  const confirm = async () => {
    if (!name.trim() || pending || Object.keys(draft.variants).length === 0) return
    setRecognitionDialogOpen(true)
    setRecognitionStatus(isEditing && !isDirty ? '正在识别此类物品' : '正在保存分类')
    setRecognitionNames([])
    setRecognitionError('')
    setRecognizedCategory(null)
    setPending(true)
    let serverDraftId: string | undefined
    try {
      if (isEditing && !isDirty && initialCategory) {
        await runRecognition(initialCategory)
        return
      }
      let latestDraft = await request<IconDraft>(`${basePath}/icon-drafts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parent_id: draft.parent_id,
          name: name.trim(),
          category_id: draft.category_id,
          fallback_theme: fallbackTheme,
          version: draft.version,
        }),
      })
      if (!latestDraft.id) throw new Error('图标草稿创建失败')
      serverDraftId = latestDraft.id
      for (const themeKey of THEMES) {
        const selection = pendingOnlineVariants[themeKey]
        const libraryKey = librarySelections[themeKey]
        const file = pendingFiles[themeKey]
        if (selection) {
          latestDraft = await request<IconDraft>(`${basePath}/icon-drafts/${latestDraft.id}/variants`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ theme_key: themeKey, provider: selection.provider, item_id: selection.itemId }),
          })
        } else if (libraryKey) {
          latestDraft = await request<IconDraft>(`${basePath}/icon-drafts/${latestDraft.id}/variants`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ theme_key: themeKey, icon_key: libraryKey }),
          })
        } else if (file) {
          latestDraft = await request<IconDraft>(`${basePath}/icon-drafts/${latestDraft.id}/variants/upload?theme_key=${themeKey}`, {
            method: 'POST', headers: { 'Content-Type': file.file.type }, body: file.file,
          })
        }
      }
      const category = await request<Category>(`${basePath}/icon-drafts/${latestDraft.id}/confirm`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_id: draft.parent_id, name: name.trim(), fallback_theme: fallbackTheme, version: latestDraft.version }),
      })
      await deleteGeneration(generationIdRef.current, true)
      setGeneration(null)
      setGenerationTheme(null)
      setGenerationRunning(false)
      setGenerationSlot(null)
      setGenerationCompleted(0)
      setPendingOnlineVariants({})
      setPendingFiles({})
      setRecognizedCategory(category)
      await runRecognition(category)
    } catch (error) {
      if (serverDraftId) void request<void>(`${basePath}/icon-drafts/${serverDraftId}`, { method: 'DELETE' }).catch(() => undefined)
      setRecognitionError(errorMessage(error))
      setPending(false)
    }
  }

  const finishRecognition = async () => {
    if (!recognizedCategory || pending) return
    setPending(true)
    setRecognitionError('')
    setRecognitionStatus('正在刷新分类目录…')
    try {
      await onCatalogChanged()
      setRecognitionDialogOpen(false)
      onComplete(recognizedCategory)
    } catch (error) {
      setRecognitionError(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  const deleteCategory = async () => {
    const categoryId = draft.category_id
    if (!categoryId || pending) return
    setDeleteDialogOpen(false)
    setPending(true)
    showInfo('正在删除…')
    try {
      await request<void>(`${basePath}/categories/${categoryId}`, { method: 'DELETE' })
      await onCatalogChanged()
      onDeleted?.(categoryId)
    } catch (error) {
      showError(error)
    } finally {
      setPending(false)
    }
  }

  const setTheme = (next: ThemeKey) => {
    generationControllerRef.current?.abort()
    void deleteGeneration(generationIdRef.current, true)
    setGeneration(null)
    setGenerationTheme(null)
    setGenerationRunning(false)
    setGenerationSlot(null)
    setGenerationCompleted(0)
    searchControllerRef.current?.abort()
    searchSequenceRef.current += 1
    keywordControllerRef.current?.abort()
    keywordSequenceRef.current += 1
    keywordRequestNameRef.current = ''
    setKeywordGenerating(false)
    setKeywords([])
    setActiveTheme(next)
    clearNotice()
    setResults([])
    setResultPage(0)
  }
  const selectSourceTab = (next: SourceTab) => {
    if (next !== 'ai') {
      generationControllerRef.current?.abort()
      void deleteGeneration(generationIdRef.current, true)
      setGeneration(null)
      setGenerationTheme(null)
      setGenerationRunning(false)
      setGenerationSlot(null)
      setGenerationCompleted(0)
    }
    if (sourceTab === 'online' && next !== 'online') {
      keywordControllerRef.current?.abort()
      keywordSequenceRef.current += 1
      keywordRequestNameRef.current = ''
      setKeywordGenerating(false)
      setKeywords([])
    }
    clearNotice()
    setSourceTab(next)
    if (next === 'online') requestKeywords(nameRef.current)
  }
  const localCandidatesForTheme = localCandidates[activeTheme] ?? []
  const selectedLocalCandidateId = selectedLocalCandidateIds[activeTheme]
  const isEditing = Boolean(initialCategory)
  const selectedLibraryKey = currentVariant?.source === 'library' ? currentVariant.source_id : undefined
  const licenses = [...new Set(results.map(result => result.license).filter((license): license is string => Boolean(license)))]
  const sourceNote = `来源：${onlineProvider === 'iconify' ? 'Iconify' : 'Thiings'}${licenses.length ? ` · 许可证：${licenses.join('、')}` : ''}`
  const libraryPageCount = Math.ceil(icons.length / ICONS_PER_PAGE)
  const visibleLibraryIcons = icons.slice(libraryPage * ICONS_PER_PAGE, (libraryPage + 1) * ICONS_PER_PAGE)
  const resultPageCount = Math.ceil(results.length / ICONS_PER_PAGE)
  const visibleResults = results.slice(resultPage * ICONS_PER_PAGE, (resultPage + 1) * ICONS_PER_PAGE)
  const hasOnlineResults = results.length > 0
  const effectiveVariants = draft.variants
  const fallbackThemes = THEMES.filter(key => Boolean(effectiveVariants[key]))
  const draftForComparison = { name: name.trim(), parent_id: draft.parent_id, fallback_theme: fallbackTheme, variants: effectiveVariants }
  const isDirty = !isEditing || !initialDraft
    || hasIconDraftChanges(initialDraft, draftForComparison)
  const parentLabel = parents.find(parent => parent.id === draft.parent_id)?.name.trim() || parentName?.trim() || '未找到大类'
  const parentOptions = parents.map(parent => ({ value: parent.id, label: parent.name }))
  if (draft.parent_id && !parentOptions.some(option => option.value === draft.parent_id)) parentOptions.push({ value: draft.parent_id, label: parentLabel })
  const defaultStatus = sourceTab === 'library'
    ? '从图库选择已有图标'
    : sourceTab === 'local'
      ? '从本地图片导入当前主题图标'
      : sourceTab === 'online'
        ? '输入英文关键词搜索在线图标'
        : '选择 AI 模型生成当前主题图标'
  const statusMessage = notice
    || (sourceTab === 'ai' && modelError ? modelError : '')
    || (sourceTab === 'ai' && modelLoading ? '正在加载 AI 模型…' : '')
    || (sourceTab === 'online' && keywordGenerating ? '正在生成关键词…' : '')
    || (sourceTab === 'online' && searching ? '正在搜索...' : '')
    || defaultStatus
  const statusIsError = noticeIsError || (!notice && sourceTab === 'ai' && Boolean(modelError))
  const generatedCandidates = generation?.candidates ?? []
  const selectFallbackTheme = (next: ThemeKey) => {
    setFallbackTheme(next)
    setFallbackDialogOpen(false)
  }

  return <PageShell className="p5-flow p5-custom-editor" header={<PageHeader title={isEditing ? '编辑小类' : '新建小类'} onBack={() => void cancel()} />} bodyClassName="p5-scroll p5-custom" footer={<footer className={`bottom-action-bar${isEditing ? ' p5-custom-actions' : ''}`}>{isEditing && <button className="p5-selection-delete" type="button" disabled={pending} onClick={() => setDeleteDialogOpen(true)}>删除小类</button>}<button className="p5-add-category" disabled={!canConfirmIconDraft(draft, name, pending)} onClick={() => void confirm()}>{isEditing ? (isDirty ? '保存并更新物品' : '识别此类物品') : '创建并识别此类物品'}</button></footer>}>
    <div className="p5-name-input"><div className="p5-name-heading"><label htmlFor="p5-subcategory-name">小类名称</label><div className="p5-category-picker"><span aria-hidden="true">所属大类：</span><OptionPickerField className="p5-category-picker-field" label="所属大类" value={draft.parent_id} options={parentOptions} onChange={nextParentId => setDraft(current => ({ ...current, parent_id: nextParentId }))} disabled={pending || parentOptions.length === 0} /></div></div><input id="p5-subcategory-name" ref={nameInputRef} value={name} onBlur={() => { if (sourceTab === 'online') requestKeywords(name) }} onChange={event => { const value = event.target.value; setName(value); clearNotice(); if (!value.trim() || value.trim() === DEFAULT_SUBCATEGORY_NAME) { keywordControllerRef.current?.abort(); keywordSequenceRef.current += 1; keywordRequestNameRef.current = ''; setKeywordGenerating(false); setKeywords([]) } }} placeholder="请输入名称" /></div>
    <div className={`p5-segmented-tabs p5-theme-tabs is-index-${THEMES.indexOf(activeTheme)}`} role="tablist" aria-label="图标主题">{THEMES.map(key => <button type="button" role="tab" key={key} aria-selected={activeTheme === key} className={activeTheme === key ? 'is-active' : ''} onClick={() => setTheme(key)}>{THEME_REGISTRY[key].label}</button>)}</div>
    <div className="p5-theme-icon-slots" aria-label="三主题图标状态">{THEMES.map(key => { const slot = getThemeSlotState(key, effectiveVariants, fallbackTheme); const label = THEME_REGISTRY[key].label; const borrowed = Boolean(slot.borrowedFrom); const borrowedLabel = `${label}主题借用${slot.borrowedFrom ? THEME_REGISTRY[slot.borrowedFrom].label : ''}图标`; return <div className={`p5-theme-icon-slot${activeTheme === key ? ' is-active' : ''}${borrowed ? ' is-borrowed' : ''}`} key={key} aria-label={borrowed ? `${borrowedLabel}，待确认` : `${label}主题${slot.variant ? '图标已选择' : '图标占位'}`}><span className={`p5-theme-icon-preview${slot.variant ? '' : ' is-placeholder'}`}>{slot.variant && <RuntimeImage className="food-icon" src={slot.variant.asset_url} alt="" />}{slot.variant && <ThemeSlotStatusIcon borrowed={borrowed} borrowedLabel={borrowedLabel} onBorrowedClick={() => setFallbackDialogOpen(true)} />}</span></div> })}</div>
    <section className="p5-editor-sources">
      <div className={`p5-segmented-tabs p5-icon-source-tabs is-index-${ICON_SOURCE_TABS.indexOf(sourceTab)}`} role="tablist" aria-label="图标来源">{ICON_SOURCE_TABS.map(tab => <button type="button" role="tab" key={tab} aria-selected={sourceTab === tab} className={sourceTab === tab ? 'is-active' : ''} onClick={() => selectSourceTab(tab)}>{tab === 'library' ? '图库' : tab === 'local' ? '本地' : tab === 'online' ? '在线' : 'AI'}</button>)}</div>
      <p className={`p5-source-status${statusIsError ? ' is-error' : ''}`} role={statusIsError ? 'alert' : 'status'} aria-live="polite">{statusMessage}</p>
      {sourceTab === 'library' && <><div className="p5-icon-grid p5-custom-grid">{visibleLibraryIcons.map(icon => { const resolved = resolveIconVariant(icon, activeTheme); return <button type="button" key={icon.key} aria-pressed={selectedLibraryKey === icon.key} className={selectedLibraryKey === icon.key ? 'is-selected' : ''} onClick={() => chooseLibraryIcon(icon)}><span><RuntimeImage className="food-icon" src={resolved.assetUrl} alt="" /></span><b>{icon.label}</b></button> })}</div><IconPagination page={libraryPage} pageCount={libraryPageCount} label="图库图标分页" onChange={setLibraryPage} /></>}
      {sourceTab === 'local' && <div className="p5-local-source"><div className="p5-ai-candidate-grid p5-local-candidate-grid" aria-label="本地图标候选">{Array.from({ length: AI_CANDIDATE_COUNT }, (_, index) => { const candidate = localCandidatesForTheme[index]; const selected = Boolean(candidate && candidate.id === selectedLocalCandidateId); const candidateLabel = candidate ? `${candidate.label} ${index + 1}` : ''; return <button className={`p5-ai-candidate-slot p5-local-candidate-slot${candidate ? ' has-result' : ''}${selected ? ' is-selected' : ''}`} type="button" key={candidate?.id ?? `local-placeholder-${index}`} aria-label={candidate ? `本地${candidateLabel}` : `待选择本地候选 ${index + 1}`} aria-pressed={selected} disabled={!candidate || pending} onClick={() => { if (candidate) void applyLocalCandidate(candidate) }}><span key={candidate?.id ?? `local-placeholder-preview-${index}`} className={candidate ? 'p5-ai-candidate-preview' : 'p5-theme-icon-preview is-placeholder'}>{candidate && <img className="food-icon" src={candidate.url} alt="" />}</span><b>{candidateLabel}</b></button> })}</div><div className="p5-local-actions"><button className="p7-outline p5-local-action" type="button" onClick={() => void chooseNative('photo')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h4l1.5-2h5L16 7h4v12H4z" /><circle cx="12" cy="13" r="3.5" /></svg>相册照片</button><button className="p7-outline p5-local-action" type="button" onClick={() => void chooseNative('file')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>本机文件</button></div><input ref={photoInputRef} className="p5-visually-hidden" type="file" accept="image/*" onChange={event => { void chooseLocalFile(event.target.files?.[0] ?? null) }} /><input ref={fileInputRef} className="p5-visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { void chooseLocalFile(event.target.files?.[0] ?? null) }} /></div>}
      {sourceTab === 'online' && <div className="p5-online-source"><form className="p5-search p5-online-search" aria-busy={searching} onSubmit={event => { event.preventDefault(); void searchIcons() }}><button type="submit" className="p5-search-submit" aria-label="搜索在线图标"><svg className="p5-search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg></button><input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="搜索英文关键词" aria-label="在线图标搜索" /></form>{(keywords.length > 0 || keywordGenerating) && <div className="p5-keyword-chips" data-edge-swipe-ignore="true" aria-label="英语关键词" aria-busy={keywordGenerating}><button className={`p5-keyword-refresh${keywordGenerating ? ' is-loading' : ''}`} type="button" disabled={keywordGenerating || name.trim() === DEFAULT_SUBCATEGORY_NAME || !name.trim()} aria-label="刷新英语关键词" title="刷新英语关键词" aria-busy={keywordGenerating} onClick={() => requestKeywords(nameRef.current, true)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M0 0h20v20H0z" fill="none" /><path fill="currentColor" d="M19.295 12a.704.704 0 0 1 .705.709v3.204a.704.704 0 0 1-.7.709a.704.704 0 0 1-.7-.709v-1.125C16.779 17.844 13.399 20 9.757 20c-4.41 0-8.106-2.721-9.709-6.915a.71.71 0 0 1 .4-.917c.36-.141.766.04.906.405c1.4 3.662 4.588 6.01 8.403 6.01c3.371 0 6.52-2.182 7.987-5.154l-1.471.01a.704.704 0 0 1-.705-.704a.705.705 0 0 1 .695-.714zm-9.05-12c4.408 0 8.105 2.721 9.708 6.915a.71.71 0 0 1-.4.917a.697.697 0 0 1-.906-.405c-1.4-3.662-4.588-6.01-8.403-6.01c-3.371 0-6.52 2.182-7.987 5.154l1.471-.01a.704.704 0 0 1 .705.704a.705.705 0 0 1-.695.714L.705 8A.704.704 0 0 1 0 7.291V4.087c0-.392.313-.709.7-.709s.7.317.7.709v1.125C3.221 2.156 6.601 0 10.243 0Z" /></svg></button>{keywords.map(keyword => <button className={searchQuery === keyword ? 'is-active' : ''} type="button" key={keyword} onClick={() => searchKeyword(keyword)}>{keyword}</button>)}</div>}{hasOnlineResults ? <><div className="p5-icon-grid p5-custom-grid">{visibleResults.map(result => <button type="button" key={result.id} aria-pressed={currentVariant?.source_id === result.id && currentVariant.source === onlineProvider} className={currentVariant?.source_id === result.id && currentVariant.source === onlineProvider ? 'is-selected' : ''} onClick={() => chooseOnlineIcon(result)}><span>{result.preview_url && <RuntimeImage className="food-icon" src={result.preview_url} alt="" />}</span><b>{result.label}</b></button>)}</div><IconPagination page={resultPage} pageCount={resultPageCount} label="在线图标搜索结果分页" onChange={setResultPage} /><p className="p5-inline-notice p5-online-source-note">{sourceNote}</p></> : <div className="p5-ai-candidate-grid" aria-label="在线图标候选占位">{Array.from({ length: AI_CANDIDATE_COUNT }, (_, index) => <div className="p5-ai-candidate-slot" key={`online-placeholder-${index}`} aria-label={`待搜索在线图标 ${index + 1}`}><span className="p5-theme-icon-preview is-placeholder" /><b /></div>)}</div>}</div>}
      {sourceTab === 'ai' && <div className="p5-ai-controls"><OptionPickerField label="AI 模型" value={model} options={compatibleModels.map(option => ({ value: option.id, label: option.label }))} onChange={setModel} disabled={pending || modelLoading || Boolean(modelError)} /><button className="p5-generate-icons" type="button" disabled={generationRunning ? false : pending || modelLoading || Boolean(modelError) || !model || !name.trim()} onClick={() => void generateIcons()}>{generationRunning ? '停止生成' : '开始生成'}</button><div className="p5-ai-candidate-grid" aria-label="AI 图标候选" aria-busy={generationRunning}>{Array.from({ length: AI_CANDIDATE_COUNT }, (_, index) => { const candidate = generatedCandidates[index]; const active = generationRunning && generationSlot === index; const previewKey = candidate?.id ?? (active ? `generating-${index}` : `placeholder-${index}`); const className = `p5-ai-candidate-slot${active ? ' is-generating' : ''}${candidate ? ' has-result' : ''}`; const content = <>{candidate || active ? <span key={previewKey} className="p5-ai-candidate-preview">{candidate && <RuntimeImage className="food-icon" src={candidate.asset_url} alt="" />}{active && !candidate && <span className="p5-loading-ring" aria-hidden="true" />}</span> : <span key={previewKey} className="p5-theme-icon-preview is-placeholder" />}<b>{candidate ? `候选 ${index + 1}` : active ? `生成中 ${index + 1}/${AI_CANDIDATE_COUNT}` : ''}</b></>; return candidate ? <button className={className} type="button" key={candidate.id} aria-label={`AI 候选 ${index + 1}`} aria-pressed={currentVariant?.source === 'agnes' && currentVariant.source_id === candidate.id} disabled={pending} onClick={() => void applyCandidate(candidate)}>{content}</button> : <div className={className} key={`placeholder-${index}`} aria-label={active ? `正在生成第 ${index + 1} 张，共 ${AI_CANDIDATE_COUNT} 张` : `待生成第 ${index + 1} 张`}>{content}</div> })}</div></div>}
    </section>
    {fallbackDialogOpen && <Dialog title="使用其他主题图标" onClose={() => setFallbackDialogOpen(false)} closeLabel="关闭使用其他主题图标选择"><div className="p9-option-picker-options" role="listbox" aria-label="使用其他主题图标">{fallbackThemes.map(key => <button key={key} type="button" role="option" aria-selected={fallbackTheme === key} className={fallbackTheme === key ? 'is-selected' : ''} onClick={() => selectFallbackTheme(key)}><span>{THEME_REGISTRY[key].label}</span>{fallbackTheme === key && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>}</button>)}</div></Dialog>}
    {deleteDialogOpen && <Dialog title="确认删除小类" onClose={() => { if (!pending) setDeleteDialogOpen(false) }} closeLabel="关闭删除小类确认" closeDisabled={pending}><p>删除后“{name.trim()}”将从当前冰箱的分类选择器中移除。</p><div className="modal-actions"><button className="modal-danger" type="button" disabled={pending} onClick={() => void deleteCategory()}>{pending ? '删除中…' : '确认删除'}</button><button className="modal-secondary" type="button" disabled={pending} onClick={() => setDeleteDialogOpen(false)}>取消</button></div></Dialog>}
    {recognitionDialogOpen && <SubcategoryRecognitionDialog status={recognitionStatus} names={recognitionNames} busy={pending} error={recognitionError} onRetry={() => { if (recognizedCategory) void runRecognition(recognizedCategory); else void confirm() }} onConfirm={() => void finishRecognition()} />}
  </PageShell>
}
