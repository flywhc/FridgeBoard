import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Category, Icon, IconCandidate, IconGeneration } from './appTypes'
import { fetchRuntimeAsset, request, streamRequest } from './appApi'
import { pickNativeImage } from './nativeBridge'
import { appRuntime } from './runtime'
import { getCachedRuntimeAssetUrl } from './runtimeAssetCache'
import { resolveIconVariant } from './iconVariants'
import { prepareIconImage } from './iconImage'
import { THEME_REGISTRY, type ThemeKey } from './theme'
import { Dialog, OptionPickerField, PageHeader, PageShell, RuntimeImage } from './sharedUi'
import { canConfirmIconDraft, getOnlineProvider, hasIconDraftChanges, ICON_SOURCE_TABS, isCurrentIconCandidate, isSupportedIconFile, shouldApplyKeywordResponse, shouldApplySearchResponse, type IconEditorSourceTab } from './subcategoryIconEditorLogic'

type SourceTab = IconEditorSourceTab
type DraftVariant = {
  asset_url: string
  media_type: string
  source?: string | null
  source_id?: string | null
  source_url?: string | null
  attribution?: string | null
  license?: string | null
}
type IconDraft = {
  id?: string
  category_id: string | null
  parent_id: string
  name: string
  fallback_theme: ThemeKey
  version: number
  variants: Partial<Record<ThemeKey, DraftVariant>>
}
type SearchResult = {
  id: string
  label: string
  preview_url?: string | null
  source_url?: string | null
  license?: string | null
  author?: string | null
}
type PendingOnlineVariant = {
  provider: 'iconify' | 'thiings'
  itemId: string
  variant: DraftVariant
}
type ModelOption = { id: string; label: string; capabilities: string[] }
type ThemeSlotState = { variant?: DraftVariant; borrowedFrom?: ThemeKey }
type LocalIconCandidate = { id: string; file: File; url: string; dimensions: string; variant?: DraftVariant }
type PendingLocalFile = { file: File; url: string; dimensions: string }

const THEMES = Object.keys(THEME_REGISTRY) as ThemeKey[]
const LOCAL_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const AI_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
const MAX_ICON_BYTES = 10 * 1024 * 1024
const ICONS_PER_PAGE = 12
const AI_CANDIDATE_COUNT = 4

async function preloadOnlineResultAssets(results: SearchResult[], signal: AbortSignal): Promise<void> {
  const previews = results
    .slice(0, ICONS_PER_PAGE)
    .map(result => result.preview_url)
    .filter((url): url is string => Boolean(url))
  await Promise.allSettled(
    previews.map(url => getCachedRuntimeAssetUrl(url, () => fetchRuntimeAsset(url, signal))),
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '操作失败，请重试。'
}

function readIconCandidate(value: unknown): IconCandidate | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<IconCandidate>
  if (typeof candidate.id !== 'string' || typeof candidate.asset_url !== 'string') return null
  if (candidate.media_type !== 'image/svg+xml' && candidate.media_type !== 'image/png') return null
  return { id: candidate.id, asset_url: candidate.asset_url, media_type: candidate.media_type }
}

function fileFromDataUrl(data: string, mediaType: string, name: string): File {
  const comma = data.indexOf(',')
  if (comma < 0) throw new Error('原生图片数据无效')
  const bytes = Uint8Array.from(atob(data.slice(comma + 1)), character => character.charCodeAt(0))
  if (bytes.byteLength > MAX_ICON_BYTES) throw new Error('图片超过 10MB 限制')
  if (!LOCAL_MIME_TYPES.has(mediaType)) throw new Error('HEIC/HEIF 需要系统转换后再导入')
  return new File([bytes], name, { type: mediaType })
}

function getThemeSlotState(theme: ThemeKey, variants: Partial<Record<ThemeKey, DraftVariant>>, fallbackTheme: ThemeKey): ThemeSlotState {
  const variant = variants[theme]
  if (variant) return { variant }
  const borrowFrom = [fallbackTheme, ...THEMES].find(key => key !== theme && variants[key])
  return borrowFrom ? { variant: variants[borrowFrom], borrowedFrom: borrowFrom } : {}
}

function createInitialDraft(initialCategory: Category | null | undefined, initialName: string, parentId: string, fallbackTheme: ThemeKey, icons: Icon[]): IconDraft {
  const icon = initialCategory?.icon_key ? icons.find(candidate => candidate.key === initialCategory.icon_key) : undefined
  const variants = icon?.variants ? Object.fromEntries(Object.entries(icon.variants).map(([key, variant]) => [key, { ...variant }])) as Partial<Record<ThemeKey, DraftVariant>> : {}
  if (icon && Object.keys(variants).length === 0) {
    variants[fallbackTheme] = { asset_url: icon.asset_url, media_type: icon.media_type ?? 'image/svg+xml', source: 'library', source_id: icon.key }
  }
  return {
    category_id: initialCategory?.id ?? null,
    parent_id: initialCategory?.parent_id ?? parentId,
    name: initialCategory?.name ?? (initialName || '待命名小类'),
    fallback_theme: initialCategory?.fallback_theme ?? fallbackTheme,
    version: initialCategory?.revision ?? 1,
    variants,
  }
}

function ThemeSlotStatusIcon({ borrowed, onBorrowedClick, borrowedLabel }: { borrowed: boolean; onBorrowedClick: () => void; borrowedLabel: string }) {
  const className = `p5-theme-icon-status${borrowed ? ' is-borrowed' : ''}`
  if (borrowed) return <button className={className} type="button" onClick={onBorrowedClick} aria-label={`${borrowedLabel}，选择借用主题`} title="选择借用主题">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d={borrowed ? 'M9.3 9a3 3 0 1 1 5.7 1.5c0 2-2.5 2.1-2.5 4M12.5 18h.01' : 'm5 12 4 4L19 6'} /></svg>
  </button>
  return <span className={className} aria-label="已选择">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
  </span>
}

function IconPagination({ page, pageCount, label, onChange }: { page: number; pageCount: number; label: string; onChange: (page: number) => void }) {
  if (pageCount <= 1) return null
  return <nav className="p5-online-pagination" aria-label={label}>
    <button className="p9-category-link" type="button" disabled={page === 0} onClick={() => onChange(Math.max(0, page - 1))}>上一页</button>
    <span aria-live="polite">{page + 1} / {pageCount}</span>
    <button className="p9-category-link" type="button" disabled={page >= pageCount - 1} onClick={() => onChange(Math.min(pageCount - 1, page + 1))}>下一页</button>
  </nav>
}

/**
 * 多主题小类图标编辑器。编辑期间草稿只保存在前端，确认时才提交服务端。
 */
export function SubcategoryIconEditor({
  refrigeratorId,
  parentId,
  parentName,
  initialName = '',
  initialCategory,
  initialFallbackTheme,
  icons,
  theme,
  onCatalogChanged,
  onComplete,
  onCancel,
}: {
  refrigeratorId: string
  parentId: string
  parentName?: string | null
  initialName?: string
  initialCategory?: Category | null
  initialFallbackTheme?: ThemeKey
  icons: Icon[]
  theme: ThemeKey
  onCatalogChanged: () => Promise<void>
  onComplete: (category: Category) => void
  onCancel: () => void
}) {
  const basePath = `/api/owner/refrigerators/${encodeURIComponent(refrigeratorId)}`
  const initialEditorDraft = createInitialDraft(initialCategory, initialName, parentId, initialFallbackTheme ?? theme, icons)
  const [draft, setDraft] = useState<IconDraft>(initialEditorDraft)
  const [initialDraft] = useState<IconDraft>(initialEditorDraft)
  const [name, setName] = useState(initialEditorDraft.name)
  const [fallbackTheme, setFallbackTheme] = useState<ThemeKey>(initialEditorDraft.fallback_theme)
  const [fallbackDialogOpen, setFallbackDialogOpen] = useState(false)
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
  const [selectedCandidate, setSelectedCandidate] = useState<IconCandidate | null>(null)
  const [models, setModels] = useState<ModelOption[]>([])
  const [model, setModel] = useState('')
  const [modelLoadedTheme, setModelLoadedTheme] = useState<ThemeKey | null>(null)
  const [modelErrorState, setModelErrorState] = useState<{ theme: ThemeKey; message: string } | null>(null)
  const [pendingOnlineVariants, setPendingOnlineVariants] = useState<Partial<Record<ThemeKey, PendingOnlineVariant>>>({})
  const [pendingLocal, setPendingLocal] = useState<Partial<Record<ThemeKey, { file: File; url: string; dimensions: string }>>>({})
  const [pendingFiles, setPendingFiles] = useState<Partial<Record<ThemeKey, PendingLocalFile>>>({})
  const [librarySelections, setLibrarySelections] = useState<Partial<Record<ThemeKey, string>>>({})
  const [localCandidates, setLocalCandidates] = useState<Partial<Record<ThemeKey, LocalIconCandidate[]>>>({})
  const [selectedLocalCandidateIds, setSelectedLocalCandidateIds] = useState<Partial<Record<ThemeKey, string>>>({})
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
  }, [activeTheme, basePath])

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
      const url = URL.createObjectURL(prepared.file)
      objectUrlsRef.current.add(url)
      setPendingLocal(current => {
        const old = current[requestTheme]
        if (old) { URL.revokeObjectURL(old.url); objectUrlsRef.current.delete(old.url) }
        return { ...current, [requestTheme]: { file: prepared.file, url, dimensions: `${prepared.width} × ${prepared.height}` } }
      })
      showInfo('图片已按图标尺寸处理，点击“使用此图片”后写入草稿。')
    } catch (error) {
      if (sequence === localSequenceRef.current && requestTheme === activeThemeRef.current) showError(error)
    }
  }

  const rememberLocalCandidate = (themeKey: ThemeKey, candidate: LocalIconCandidate) => {
    setLocalCandidates(current => {
      const existing = current[themeKey] ?? []
      const next = [...existing]
      const slotIndex = next.length % AI_CANDIDATE_COUNT
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

  const useLocalImage = () => {
    const selected = pendingLocal[activeTheme]
    if (!selected) return
    const requestTheme = activeTheme
    const candidate: LocalIconCandidate = {
      id: `local-${++localCandidateSequenceRef.current}`,
      file: selected.file,
      url: selected.url,
      dimensions: selected.dimensions,
    }
    rememberLocalCandidate(requestTheme, candidate)
    setSelectedLocalCandidateIds(current => ({ ...current, [requestTheme]: candidate.id }))
    setPendingFiles(current => ({ ...current, [requestTheme]: selected }))
    setDraft(current => ({
      ...current,
      variants: {
        ...current.variants,
        [requestTheme]: { asset_url: selected.url, media_type: selected.file.type, source: 'upload' },
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
    setPendingLocal(current => { const next = { ...current }; delete next[requestTheme]; return next })
    showInfo('本地图片已加入当前主题草稿，确认后提交。')
  }

  const applyLocalCandidate = (candidate: LocalIconCandidate) => {
    if (pending) return
    setSelectedLocalCandidateIds(current => ({ ...current, [activeTheme]: candidate.id }))
    setPendingFiles(current => ({ ...current, [activeTheme]: candidate }))
    setDraft(current => ({
      ...current,
      variants: {
        ...current.variants,
        [activeTheme]: { asset_url: candidate.url, media_type: candidate.file.type, source: 'upload' },
      },
    }))
    setPendingOnlineVariants(current => {
      const next = { ...current }
      delete next[activeTheme]
      return next
    })
    setLibrarySelections(current => {
      const next = { ...current }
      delete next[activeTheme]
      return next
    })
    showInfo('本地候选图标已应用，确认后提交。')
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

  const generateKeywords = useCallback(async (value = nameRef.current) => {
    const requestName = value.trim()
    if (!requestName) return
    if (keywordCacheRef.current.has(requestName)) {
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
      if (!shouldApplyKeywordResponse(sequence, keywordSequenceRef.current, requestName, nameRef.current, requestQuery, searchQueryRef.current)) return
      setKeywords(nextKeywords)
      if (!searchQueryRef.current.trim() && nextKeywords[0]) setSearchQuery(nextKeywords[0])
    } catch (error) {
      if (!controller.signal.aborted && sequence === keywordSequenceRef.current) showError(error)
    } finally {
      if (sequence === keywordSequenceRef.current) setKeywordGenerating(false)
    }
  }, [basePath, clearNotice, showError])

  const requestKeywords = useCallback((value: string) => {
    const requestName = value.trim()
    if (!requestName || requestName === keywordRequestNameRef.current) return
    keywordRequestNameRef.current = requestName
    keywordControllerRef.current?.abort()
    keywordSequenceRef.current += 1
    setKeywords([])
    if (keywordCacheRef.current.has(requestName)) {
      const cachedKeywords = keywordCacheRef.current.get(requestName) ?? []
      setKeywords(cachedKeywords)
      if (!searchQueryRef.current.trim() && cachedKeywords[0]) setSearchQuery(cachedKeywords[0])
      setKeywordGenerating(false)
      return
    }
    setKeywordGenerating(true)
    void generateKeywords(requestName)
  }, [generateKeywords])

  useEffect(() => {
    if (sourceTab !== 'online' || !onlineProvider) return
    const requestName = nameRef.current.trim()
    if (requestName) {
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
  }, [activeTheme, onlineProvider, requestKeywords, sourceTab])

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
    setSelectedCandidate(null)
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
          setSelectedCandidate(current => current ?? candidate)
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
            setSelectedCandidate(current => current ?? candidates[0])
          }
        }
      })
      if (!controller.signal.aborted) {
        generationIdRef.current = response.id
        setGenerationTheme(activeTheme)
        setGeneration(response)
        setGenerationCompleted(response.candidates.length)
        setGenerationSlot(null)
        setSelectedCandidate(response.candidates[0] ?? null)
        showInfo('请选择候选后点击“使用此候选”。')
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

  const applyCandidate = async () => {
    if (!selectedCandidate || !generation || !generationTheme || !isCurrentIconCandidate(generation.id, generationTheme, selectedCandidate.id, generationIdRef.current, activeTheme, generation.candidates.map(candidate => candidate.id))) {
      showError(new Error('AI 候选已失效，请重新生成。'))
      return
    }
    setPending(true)
    showInfo('正在读取 AI 候选…')
    try {
      const blob = await fetchRuntimeAsset(selectedCandidate.asset_url)
      if (blob.size > MAX_ICON_BYTES) throw new Error('图片超过 10MB 限制')
      const mediaType = blob.type || selectedCandidate.media_type || (activeTheme === 'ink' ? 'image/svg+xml' : 'image/png')
      if (!AI_MIME_TYPES.has(mediaType)) throw new Error('AI 候选格式不受支持')
      if (activeTheme === 'ink' && mediaType !== 'image/svg+xml') throw new Error('水墨主题 AI 候选必须是 SVG')
      if (activeTheme !== 'ink' && mediaType === 'image/svg+xml') throw new Error('当前主题 AI 候选必须是位图')
      const file = new File([blob], `ai-${selectedCandidate.id}.${mediaType === 'image/svg+xml' ? 'svg' : 'png'}`, { type: mediaType })
      const url = URL.createObjectURL(file)
      objectUrlsRef.current.add(url)
      const requestTheme = activeTheme
      setPendingFiles(current => ({ ...current, [requestTheme]: { file, url, dimensions: '' } }))
      setDraft(current => ({
        ...current,
        variants: {
          ...current.variants,
          [requestTheme]: { asset_url: url, media_type: mediaType, source: 'agnes', source_id: selectedCandidate.id },
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
      const generationDeleted = await deleteGeneration(generation.id, true)
      setGeneration(null)
      setGenerationTheme(null)
      setSelectedCandidate(null)
      if (generationDeleted) showInfo('AI 候选已加入当前主题草稿，确认后提交。')
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

  const confirm = async () => {
    if (!name.trim() || pending || Object.keys(draft.variants).length === 0) return
    setPending(true)
    showInfo('正在保存…')
    let serverDraftId: string | undefined
    try {
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
        body: JSON.stringify({ parent_id: latestDraft.parent_id, name: name.trim(), fallback_theme: fallbackTheme, version: latestDraft.version }),
      })
      await deleteGeneration(generationIdRef.current, true)
      setGeneration(null)
      setGenerationTheme(null)
      setGenerationRunning(false)
      setGenerationSlot(null)
      setGenerationCompleted(0)
      setPendingOnlineVariants({})
      setPendingFiles({})
      await onCatalogChanged()
      onComplete(category)
    } catch (error) {
      if (serverDraftId) void request<void>(`${basePath}/icon-drafts/${serverDraftId}`, { method: 'DELETE' }).catch(() => undefined)
      showError(error)
    } finally { setPending(false) }
  }

  const setTheme = (next: ThemeKey) => {
    generationControllerRef.current?.abort()
    void deleteGeneration(generationIdRef.current, true)
    setGeneration(null)
    setGenerationTheme(null)
    setGenerationRunning(false)
    setGenerationSlot(null)
    setGenerationCompleted(0)
    setSelectedCandidate(null)
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
    setSourceTab('library')
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
      setSelectedCandidate(null)
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
  const local = pendingLocal[activeTheme]
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
  const draftForComparison = { name: name.trim(), fallback_theme: fallbackTheme, variants: effectiveVariants }
  const isDirty = !isEditing || !initialDraft
    || hasIconDraftChanges(initialDraft, draftForComparison)
  const parentLabel = parentName?.trim() || '未找到大类'
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

  return <PageShell className="p5-flow" header={<PageHeader title={isEditing ? '编辑小类' : '新建小类'} onBack={() => void cancel()} right={<button className="p5-header-action" type="button" onClick={() => void cancel()} aria-label="关闭" title="关闭"><span aria-hidden="true">×</span></button>} />} bodyClassName="p5-scroll p5-custom" footer={<footer className="bottom-action-bar"><button className="p5-add-category" disabled={!isDirty || !canConfirmIconDraft(draft, name, pending)} onClick={() => void confirm()}>{isEditing ? '保存修改' : '确认并创建小类'}</button></footer>}>
    <label className="p5-name-input"><span className="p5-name-heading"><span>小类名称</span><span className="category-pill">所属大类：{parentLabel}</span></span><input autoFocus value={name} onBlur={() => { if (sourceTab === 'online') requestKeywords(name) }} onChange={event => { const value = event.target.value; setName(value); clearNotice(); if (!value.trim()) { keywordControllerRef.current?.abort(); keywordSequenceRef.current += 1; keywordRequestNameRef.current = ''; setKeywordGenerating(false); setKeywords([]) } }} placeholder="请输入名称" /></label>
    <div className={`p5-segmented-tabs p5-theme-tabs is-index-${THEMES.indexOf(activeTheme)}`} role="tablist" aria-label="图标主题">{THEMES.map(key => <button type="button" role="tab" key={key} aria-selected={activeTheme === key} className={activeTheme === key ? 'is-active' : ''} onClick={() => setTheme(key)}>{THEME_REGISTRY[key].label}</button>)}</div>
    <div className="p5-theme-icon-slots" aria-label="三主题图标状态">{THEMES.map(key => { const slot = getThemeSlotState(key, effectiveVariants, fallbackTheme); const label = THEME_REGISTRY[key].label; const borrowed = Boolean(slot.borrowedFrom); const borrowedLabel = `${label}主题借用${slot.borrowedFrom ? THEME_REGISTRY[slot.borrowedFrom].label : ''}图标`; return <div className={`p5-theme-icon-slot${activeTheme === key ? ' is-active' : ''}${borrowed ? ' is-borrowed' : ''}`} key={key} aria-label={borrowed ? `${borrowedLabel}，待确认` : `${label}主题${slot.variant ? '图标已选择' : '图标占位'}`}><span className={`p5-theme-icon-preview${slot.variant ? '' : ' is-placeholder'}`}>{slot.variant && <RuntimeImage className="food-icon" src={slot.variant.asset_url} alt="" />}{slot.variant && <ThemeSlotStatusIcon borrowed={borrowed} borrowedLabel={borrowedLabel} onBorrowedClick={() => setFallbackDialogOpen(true)} />}</span></div> })}</div>
    <section className="p5-editor-sources">
      <div className={`p5-segmented-tabs p5-icon-source-tabs is-index-${ICON_SOURCE_TABS.indexOf(sourceTab)}`} role="tablist" aria-label="图标来源">{ICON_SOURCE_TABS.map(tab => <button type="button" role="tab" key={tab} aria-selected={sourceTab === tab} className={sourceTab === tab ? 'is-active' : ''} onClick={() => selectSourceTab(tab)}>{tab === 'library' ? '图库' : tab === 'local' ? '本地' : tab === 'online' ? '在线' : 'AI'}</button>)}</div>
      <p className={`p5-source-status${statusIsError ? ' is-error' : ''}`} role={statusIsError ? 'alert' : 'status'} aria-live="polite">{statusMessage}</p>
      {sourceTab === 'library' && <><div className="p5-icon-grid p5-custom-grid">{visibleLibraryIcons.map(icon => { const resolved = resolveIconVariant(icon, activeTheme); return <button type="button" key={icon.key} aria-pressed={selectedLibraryKey === icon.key} className={selectedLibraryKey === icon.key ? 'is-selected' : ''} onClick={() => chooseLibraryIcon(icon)}><span><RuntimeImage className="food-icon" src={resolved.assetUrl} alt="" /></span><b>{icon.label}</b></button> })}</div><IconPagination page={libraryPage} pageCount={libraryPageCount} label="图库图标分页" onChange={setLibraryPage} /></>}
      {sourceTab === 'local' && <div className="p5-local-source"><div className="p5-ai-candidate-grid p5-local-candidate-grid" aria-label="本地图标候选">{Array.from({ length: AI_CANDIDATE_COUNT }, (_, index) => { const candidate = localCandidatesForTheme[index]; const selected = Boolean(candidate && candidate.id === selectedLocalCandidateId); return <button className={`p5-ai-candidate-slot p5-local-candidate-slot${candidate ? ' has-result' : ''}${selected ? ' is-selected' : ''}`} type="button" key={candidate?.id ?? `local-placeholder-${index}`} aria-label={candidate ? `本地候选 ${index + 1}` : `待选择本地候选 ${index + 1}`} aria-pressed={selected} disabled={!candidate || pending} onClick={() => { if (candidate) void applyLocalCandidate(candidate) }}><span key={candidate?.id ?? `local-placeholder-preview-${index}`} className={candidate ? 'p5-ai-candidate-preview' : 'p5-theme-icon-preview is-placeholder'}>{candidate && <img className="food-icon" src={candidate.url} alt="" />}</span><b>{candidate ? `候选 ${index + 1}` : ''}</b></button> })}</div><div className="p5-local-actions"><button className="p7-outline p5-local-action" type="button" onClick={() => void chooseNative('photo')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h4l1.5-2h5L16 7h4v12H4z" /><circle cx="12" cy="13" r="3.5" /></svg>相册照片</button><button className="p7-outline p5-local-action" type="button" onClick={() => void chooseNative('file')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>本机文件</button></div><input ref={photoInputRef} className="p5-visually-hidden" type="file" accept="image/*" onChange={event => { void chooseLocalFile(event.target.files?.[0] ?? null) }} /><input ref={fileInputRef} className="p5-visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { void chooseLocalFile(event.target.files?.[0] ?? null) }} />{local && <div className="p5-local-preview"><img src={local.url} alt="本地图片预览" /><div><b>当前主题图片</b><small>{local.file.type} · {local.dimensions}</small><span>预览 48px / 28px</span><button className="p7-primary" type="button" disabled={pending} onClick={useLocalImage}>使用此图片</button></div></div>}</div>}
      {sourceTab === 'online' && <div className="p5-online-source"><form className="p5-search p5-online-search" aria-busy={searching} onSubmit={event => { event.preventDefault(); void searchIcons() }}><button type="submit" className="p5-search-submit" aria-label="搜索在线图标"><svg className="p5-search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg></button><input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="搜索英文关键词" aria-label="在线图标搜索" /></form>{keywords.length > 0 && <div className="p5-keyword-chips" data-edge-swipe-ignore="true" aria-label="英语关键词">{keywords.map(keyword => <button className={searchQuery === keyword ? 'is-active' : ''} type="button" key={keyword} onClick={() => searchKeyword(keyword)}>{keyword}</button>)}</div>}{hasOnlineResults ? <><div className="p5-icon-grid p5-custom-grid">{visibleResults.map(result => <button type="button" key={result.id} aria-pressed={currentVariant?.source_id === result.id && currentVariant.source === onlineProvider} className={currentVariant?.source_id === result.id && currentVariant.source === onlineProvider ? 'is-selected' : ''} onClick={() => chooseOnlineIcon(result)}><span>{result.preview_url && <RuntimeImage className="food-icon" src={result.preview_url} alt="" />}</span><b>{result.label}</b></button>)}</div><IconPagination page={resultPage} pageCount={resultPageCount} label="在线图标搜索结果分页" onChange={setResultPage} /><p className="p5-inline-notice p5-online-source-note">{sourceNote}</p></> : <div className="p5-ai-candidate-grid" aria-label="在线图标候选占位">{Array.from({ length: AI_CANDIDATE_COUNT }, (_, index) => <div className="p5-ai-candidate-slot" key={`online-placeholder-${index}`} aria-label={`待搜索在线图标 ${index + 1}`}><span className="p5-theme-icon-preview is-placeholder" /><b /></div>)}</div>}</div>}
      {sourceTab === 'ai' && <div className="p5-ai-controls"><OptionPickerField label="AI 模型" value={model} options={compatibleModels.map(option => ({ value: option.id, label: option.label }))} onChange={setModel} disabled={pending || modelLoading || Boolean(modelError)} /><button className="p5-generate-icons" type="button" disabled={generationRunning ? false : pending || modelLoading || Boolean(modelError) || !model || !name.trim()} onClick={() => void generateIcons()}>{generationRunning ? '停止生成' : '开始生成'}</button><div className="p5-ai-candidate-grid" aria-label="AI 图标候选" aria-busy={generationRunning}>{Array.from({ length: AI_CANDIDATE_COUNT }, (_, index) => { const candidate = generatedCandidates[index]; const active = generationRunning && generationSlot === index; const previewKey = candidate?.id ?? (active ? `generating-${index}` : `placeholder-${index}`); return <div className={`p5-ai-candidate-slot${active ? ' is-generating' : ''}${candidate ? ' has-result' : ''}`} key={candidate?.id ?? `placeholder-${index}`} aria-label={candidate ? `AI 候选 ${index + 1}` : active ? `正在生成第 ${index + 1} 张，共 ${AI_CANDIDATE_COUNT} 张` : `待生成第 ${index + 1} 张`}>{candidate || active ? <span key={previewKey} className="p5-ai-candidate-preview">{candidate && <RuntimeImage className="food-icon" src={candidate.asset_url} alt="" />}{active && !candidate && <span className="p5-loading-ring" aria-hidden="true" />}</span> : <span key={previewKey} className="p5-theme-icon-preview is-placeholder" />}<b>{candidate ? `候选 ${index + 1}` : active ? `生成中 ${index + 1}/${AI_CANDIDATE_COUNT}` : ''}</b></div> })}</div>{selectedCandidate && <button className="p7-primary" type="button" disabled={pending} onClick={() => void applyCandidate()}>使用此候选</button>}</div>}
    </section>
    {fallbackDialogOpen && <Dialog title="使用其他主题图标" onClose={() => setFallbackDialogOpen(false)} closeLabel="关闭使用其他主题图标选择"><div className="p9-option-picker-options" role="listbox" aria-label="使用其他主题图标">{fallbackThemes.map(key => <button key={key} type="button" role="option" aria-selected={fallbackTheme === key} className={fallbackTheme === key ? 'is-selected' : ''} onClick={() => selectFallbackTheme(key)}><span>{THEME_REGISTRY[key].label}</span>{fallbackTheme === key && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>}</button>)}</div></Dialog>}
  </PageShell>
}
