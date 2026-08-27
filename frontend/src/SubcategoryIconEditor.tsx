import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Category, Icon, IconCandidate, IconGeneration } from './appTypes'
import { fetchRuntimeAsset, request, streamRequest } from './appApi'
import { pickNativeImage } from './nativeBridge'
import { appRuntime } from './runtime'
import { resolveIconVariant } from './iconVariants'
import { THEME_REGISTRY, type ThemeKey } from './theme'
import { OptionPickerField, PageHeader, PageShell, RuntimeImage } from './sharedUi'
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
  id: string
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

const THEMES = Object.keys(THEME_REGISTRY) as ThemeKey[]
const LOCAL_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const AI_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
const MAX_ICON_BYTES = 10 * 1024 * 1024
const ONLINE_RESULTS_PER_PAGE = 12

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '操作失败，请重试。'
}

function fileFromDataUrl(data: string, mediaType: string, name: string): File {
  const comma = data.indexOf(',')
  if (comma < 0) throw new Error('原生图片数据无效')
  const bytes = Uint8Array.from(atob(data.slice(comma + 1)), character => character.charCodeAt(0))
  if (bytes.byteLength > MAX_ICON_BYTES) throw new Error('图片超过 10MB 限制')
  if (!LOCAL_MIME_TYPES.has(mediaType)) throw new Error('HEIC/HEIF 需要系统转换后再导入')
  return new File([bytes], name, { type: mediaType })
}

/**
 * 多主题小类图标编辑器。所有来源先写入临时 draft，最终只通过 draft confirm。
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
  const [draft, setDraft] = useState<IconDraft | null>(null)
  const [name, setName] = useState(initialName)
  const [fallbackTheme, setFallbackTheme] = useState<ThemeKey>(initialFallbackTheme ?? theme)
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
  const [generation, setGeneration] = useState<IconGeneration | null>(null)
  const [generationTheme, setGenerationTheme] = useState<ThemeKey | null>(null)
  const [selectedCandidate, setSelectedCandidate] = useState<IconCandidate | null>(null)
  const [models, setModels] = useState<ModelOption[]>([])
  const [model, setModel] = useState('')
  const [modelLoadedTheme, setModelLoadedTheme] = useState<ThemeKey | null>(null)
  const [modelErrorState, setModelErrorState] = useState<{ theme: ThemeKey; message: string } | null>(null)
  const [pendingOnlineVariants, setPendingOnlineVariants] = useState<Partial<Record<ThemeKey, PendingOnlineVariant>>>({})
  const [pendingLocal, setPendingLocal] = useState<Partial<Record<ThemeKey, { file: File; url: string; dimensions: string }>>>({})
  const photoInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const sequenceRef = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)
  const generationControllerRef = useRef<AbortController | null>(null)
  const generationIdRef = useRef<string | null>(null)
  const searchControllerRef = useRef<AbortController | null>(null)
  const searchSequenceRef = useRef(0)
  const keywordControllerRef = useRef<AbortController | null>(null)
  const keywordSequenceRef = useRef(0)
  const keywordCacheRef = useRef(new Map<string, string[]>())
  const activeThemeRef = useRef(activeTheme)
  const nameRef = useRef(initialName)
  const searchQueryRef = useRef('')
  const objectUrlsRef = useRef(new Set<string>())
  const draftRef = useRef<IconDraft | null>(null)
  const initialDraftRef = useRef<IconDraft | null>(null)
  const [initialDraft, setInitialDraft] = useState<IconDraft | null>(null)

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

  const applyDraft = useCallback((value: IconDraft) => {
    draftRef.current = value
    setDraft(value)
    const firstResponse = initialDraftRef.current === null
    if (firstResponse) {
      initialDraftRef.current = value
      setInitialDraft(value)
      setName(initialCategory ? value.name : initialName)
    }
    setFallbackTheme(value.fallback_theme)
  }, [initialCategory, initialName])

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

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
    const controller = new AbortController()
    controllerRef.current = controller
    void request<IconDraft>(`${basePath}/icon-drafts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        parent_id: initialCategory?.parent_id ?? parentId,
        name: initialCategory?.name ?? (initialName || '待命名小类'),
        category_id: initialCategory?.id ?? null,
        fallback_theme: initialCategory?.fallback_theme ?? initialFallbackTheme ?? theme,
        version: initialCategory?.revision ?? 1,
      }),
    }).then(result => {
      if (!controller.signal.aborted) applyDraft(result)
    }).catch(error => {
      if (!controller.signal.aborted) showError(error)
    })
    return () => {
      controller.abort()
      controllerRef.current = null
      for (const url of objectUrls) URL.revokeObjectURL(url)
      objectUrls.clear()
      generationControllerRef.current?.abort()
      const generationId = generationIdRef.current
      generationIdRef.current = null
      if (generationId) void request<void>(`${basePath}/icon-candidates/${generationId}`, { method: 'DELETE' }).catch(() => undefined)
      const draftId = draftRef.current?.id
      draftRef.current = null
      if (draftId) void request<void>(`${basePath}/icon-drafts/${draftId}`, { method: 'DELETE' }).catch(() => undefined)
      searchControllerRef.current?.abort()
      keywordControllerRef.current?.abort()
    }
  }, [applyDraft, basePath, initialCategory, initialFallbackTheme, initialName, parentId, showError, theme])

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

  const writeDraft = useCallback(async (path: string, init: RequestInit) => {
    if (!draft) return null
    const sequence = ++sequenceRef.current
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setPending(true)
    try {
      const response = await request<IconDraft>(path, { ...init, signal: controller.signal })
      if (sequence !== sequenceRef.current || controller.signal.aborted) return null
      applyDraft(response)
      return response
    } catch (error) {
      if (sequence === sequenceRef.current && !controller.signal.aborted) showError(error)
      return null
    } finally {
      if (sequence === sequenceRef.current) setPending(false)
    }
  }, [applyDraft, draft, showError])

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

  const pendingOnlineVariant = pendingOnlineVariants[activeTheme]
  const currentVariant = pendingOnlineVariant?.variant ?? draft?.variants[activeTheme]
  const currentSource = currentVariant?.source_id ?? currentVariant?.source ?? ''
  const onlineProvider = getOnlineProvider(activeTheme)
  const modelLoading = modelLoadedTheme !== activeTheme && modelErrorState?.theme !== activeTheme
  const modelError = modelErrorState?.theme === activeTheme ? modelErrorState.message : ''
  const compatibleModels = useMemo(
    () => models.filter(option => option.capabilities.includes(activeTheme === 'ink' ? 'svg' : 'image')),
    [activeTheme, models],
  )

  const chooseLibraryIcon = (icon: Icon) => {
    if (!draft) return
    showInfo('正在加入当前主题草稿…')
    void writeDraft(`${basePath}/icon-drafts/${draft.id}/variants`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme_key: activeTheme, icon_key: icon.key }),
    }).then(result => { if (result) showInfo('图库图标已加入当前主题草稿。') })
  }

  const chooseOnlineIcon = (result: SearchResult) => {
    if (!onlineProvider || !result.preview_url) return
    setPendingOnlineVariants(current => ({
      ...current,
      [activeTheme]: {
        provider: onlineProvider,
        itemId: result.id,
        variant: {
          asset_url: result.preview_url as string,
          media_type: activeTheme === 'ink' ? 'image/svg+xml' : 'image/png',
          source: onlineProvider,
          source_id: result.id,
          source_url: result.source_url,
          attribution: result.author,
        },
      },
    }))
    showInfo('在线图标已预览，确认后写入草稿。')
  }

  const chooseLocalFile = (file: File | null) => {
    if (!file) return
    if (!isSupportedIconFile(file)) {
      showError(new Error(file.type === 'image/heic' || file.type === 'image/heif' ? 'HEIC/HEIF 需要系统转换后再导入。' : '仅支持 PNG、JPEG 或 WebP 图片。'))
      return
    }
    const url = URL.createObjectURL(file)
    objectUrlsRef.current.add(url)
    setPendingLocal(current => {
      const old = current[activeTheme]
      if (old) { URL.revokeObjectURL(old.url); objectUrlsRef.current.delete(old.url) }
      return { ...current, [activeTheme]: { file, url, dimensions: '' } }
    })
    showInfo('图片已预览，点击“使用此图片”后写入草稿。')
  }

  const chooseNative = async (source: 'photo' | 'file') => {
    if (appRuntime.kind !== 'capacitor') {
      ;(source === 'photo' ? photoInputRef : fileInputRef).current?.click()
      return
    }
    try {
      const selected = await pickNativeImage(source)
      chooseLocalFile(fileFromDataUrl(selected.data, selected.mediaType, selected.name ?? 'icon'))
    } catch (error) {
      const candidate = error as { code?: string }
      if (candidate.code !== 'IMAGE_PICK_CANCELLED') showError(error)
    }
  }

  const useLocalImage = () => {
    const selected = pendingLocal[activeTheme]
    if (!draft || !selected) return
    showInfo('正在上传图片…')
    void writeDraft(`${basePath}/icon-drafts/${draft.id}/variants/upload?theme_key=${activeTheme}`, {
      method: 'POST', headers: { 'Content-Type': selected.file.type }, body: selected.file,
    }).then(result => {
      if (!result) return
      const url = selected.url
      setPendingLocal(current => { const next = { ...current }; delete next[activeTheme]; return next })
      URL.revokeObjectURL(url); objectUrlsRef.current.delete(url)
      showInfo('本地图片已加入当前主题草稿。')
    })
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

  const generateKeywords = useCallback(async () => {
    const requestName = nameRef.current.trim()
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

  useEffect(() => {
    if (sourceTab !== 'online' || !onlineProvider) return
    keywordControllerRef.current?.abort()
    const requestName = name.trim()
    if (!requestName) return
    if (keywordCacheRef.current.has(requestName)) {
      const cachedKeywords = keywordCacheRef.current.get(requestName) ?? []
      setKeywords(cachedKeywords)
      if (!searchQueryRef.current.trim() && cachedKeywords[0]) setSearchQuery(cachedKeywords[0])
      setKeywordGenerating(false)
      return
    }
    setKeywords([])
    setKeywordGenerating(true)
    const timer = window.setTimeout(() => void generateKeywords(), 450)
    return () => {
      window.clearTimeout(timer)
      keywordControllerRef.current?.abort()
      keywordSequenceRef.current += 1
      setKeywordGenerating(false)
    }
  }, [activeTheme, generateKeywords, name, onlineProvider, sourceTab])

  const generateIcons = async () => {
    if (!name.trim() || !model || pending || modelLoading || modelError) return
    if (!await deleteGeneration(generationIdRef.current, true)) return
    setGeneration(null)
    setGenerationTheme(null)
    setSelectedCandidate(null)
    generationControllerRef.current?.abort()
    const controller = new AbortController()
    generationControllerRef.current = controller
    setPending(true); showInfo('正在生成图标候选…')
    try {
      const response = await streamRequest<IconGeneration>(`${basePath}/icon-candidates/stream`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ subcategory_name: name, theme_key: activeTheme, model }),
      }, event => { if (event.type === 'status') showInfo(String(event.data.message ?? '正在生成图标候选…')) })
      if (!controller.signal.aborted) {
        generationIdRef.current = response.id
        setGenerationTheme(activeTheme)
        setGeneration(response)
        setSelectedCandidate(response.candidates[0] ?? null)
        showInfo('请选择候选后点击“使用此候选”。')
      }
    } catch (error) {
      if (!controller.signal.aborted) showError(error)
    } finally { if (!controller.signal.aborted) setPending(false) }
  }

  const applyCandidate = async () => {
    if (!draft || !selectedCandidate || !generation || !generationTheme || !isCurrentIconCandidate(generation.id, generationTheme, selectedCandidate.id, generationIdRef.current, activeTheme, generation.candidates.map(candidate => candidate.id))) {
      showError(new Error('AI 候选已失效，请重新生成。'))
      return
    }
    setPending(true)
    showInfo('正在读取并上传 AI 候选…')
    try {
      const blob = await fetchRuntimeAsset(selectedCandidate.asset_url)
      if (blob.size > MAX_ICON_BYTES) throw new Error('图片超过 10MB 限制')
      const mediaType = blob.type || selectedCandidate.media_type || (activeTheme === 'ink' ? 'image/svg+xml' : 'image/png')
      if (!AI_MIME_TYPES.has(mediaType)) throw new Error('AI 候选格式不受支持')
      if (activeTheme === 'ink' && mediaType !== 'image/svg+xml') throw new Error('水墨主题 AI 候选必须是 SVG')
      if (activeTheme !== 'ink' && mediaType === 'image/svg+xml') throw new Error('当前主题 AI 候选必须是位图')
      const file = new File([blob], `ai-${selectedCandidate.id}.${mediaType === 'image/svg+xml' ? 'svg' : 'png'}`, { type: mediaType })
      const response = await writeDraft(`${basePath}/icon-drafts/${draft.id}/variants/upload?theme_key=${activeTheme}`, {
        method: 'POST', headers: { 'Content-Type': mediaType }, body: file,
      })
      if (response) {
        const generationDeleted = await deleteGeneration(generation.id, true)
        setGeneration(null)
        setGenerationTheme(null)
        setSelectedCandidate(null)
        if (generationDeleted) showInfo('AI 候选已加入当前主题草稿。')
      }
    } catch (error) { showError(error) } finally { setPending(false) }
  }

  const cancel = async () => {
    controllerRef.current?.abort()
    generationControllerRef.current?.abort()
    if (!await deleteGeneration(generationIdRef.current, true)) return
    setGeneration(null)
    setGenerationTheme(null)
    const draftId = draftRef.current?.id ?? draft?.id
    if (draftId) {
      try {
        await request<void>(`${basePath}/icon-drafts/${draftId}`, { method: 'DELETE' })
      } catch (error) {
        showError(error)
        return
      }
    }
    draftRef.current = null
    onCancel()
  }

  const confirm = async () => {
    const currentDraft = draftRef.current ?? draft
    if (!currentDraft || !name.trim() || pending || Object.keys({ ...currentDraft.variants, ...pendingOnlineVariants }).length === 0) return
    setPending(true)
    showInfo('正在保存…')
    try {
      let latestDraft = currentDraft
      for (const [themeKey, selection] of Object.entries(pendingOnlineVariants) as [ThemeKey, PendingOnlineVariant][]) {
        latestDraft = await request<IconDraft>(`${basePath}/icon-drafts/${latestDraft.id}/variants`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ theme_key: themeKey, provider: selection.provider, item_id: selection.itemId }),
        })
        applyDraft(latestDraft)
      }
      const category = await request<Category>(`${basePath}/icon-drafts/${latestDraft.id}/confirm`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_id: latestDraft.parent_id, name: name.trim(), fallback_theme: fallbackTheme, version: latestDraft.version }),
      })
      await deleteGeneration(generationIdRef.current, true)
      setGeneration(null)
      setGenerationTheme(null)
      setPendingOnlineVariants({})
      await onCatalogChanged()
      onComplete(category)
    } catch (error) { showError(error) } finally { setPending(false) }
  }

  const setTheme = (next: ThemeKey) => {
    generationControllerRef.current?.abort()
    void deleteGeneration(generationIdRef.current, true)
    setGeneration(null)
    setGenerationTheme(null)
    setSelectedCandidate(null)
    searchControllerRef.current?.abort()
    searchSequenceRef.current += 1
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
      setSelectedCandidate(null)
    }
    clearNotice()
    setSourceTab(next)
  }
  const local = pendingLocal[activeTheme]
  const isEditing = Boolean(initialCategory)
  const selectedLibraryKey = currentVariant?.source === 'library' ? currentVariant.source_id : undefined
  const licenses = [...new Set(results.map(result => result.license).filter((license): license is string => Boolean(license)))]
  const sourceNote = `来源：${onlineProvider === 'iconify' ? 'Iconify' : 'Thiings'}${licenses.length ? ` · 许可证：${licenses.join('、')}` : ''}`
  const resultPageCount = Math.ceil(results.length / ONLINE_RESULTS_PER_PAGE)
  const visibleResults = results.slice(resultPage * ONLINE_RESULTS_PER_PAGE, (resultPage + 1) * ONLINE_RESULTS_PER_PAGE)
  const effectiveVariants = draft ? { ...draft.variants, ...Object.fromEntries(Object.entries(pendingOnlineVariants).map(([key, selection]) => [key, selection.variant])) } : {}
  const draftForComparison = draft ? { name: name.trim(), fallback_theme: fallbackTheme, variants: effectiveVariants } : null
  const isDirty = !isEditing || !draftForComparison || !initialDraft
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

  return <PageShell className="p5-flow" header={<PageHeader title={isEditing ? '编辑小类' : '新建小类'} onBack={() => void cancel()} right={<button className="p5-header-action" type="button" onClick={() => void cancel()} aria-label="关闭" title="关闭"><span aria-hidden="true">×</span></button>} />} bodyClassName="p5-scroll p5-custom" footer={<footer className="bottom-action-bar"><button className="p5-add-category" disabled={!isDirty || !canConfirmIconDraft(draft ? { variants: effectiveVariants } : null, name, pending)} onClick={() => void confirm()}>{isEditing ? '保存修改' : '确认并创建小类'}</button></footer>}>
    <div className="category-pill">所属大类：{parentLabel}</div>
    <label className="p5-name-input"><span>小类名称</span><input autoFocus value={name} onChange={event => { const value = event.target.value; setName(value); clearNotice(); if (!value.trim()) { setKeywordGenerating(false); setKeywords([]) } }} placeholder="请输入名称" /></label>
    <div className={`p5-segmented-tabs p5-theme-tabs is-index-${THEMES.indexOf(activeTheme)}`} role="tablist" aria-label="图标主题">{THEMES.map(key => <button type="button" role="tab" key={key} aria-selected={activeTheme === key} className={activeTheme === key ? 'is-active' : ''} onClick={() => setTheme(key)}>{THEME_REGISTRY[key].label}</button>)}</div>
    <div className="p5-icon-status"><span className={`p5-icon-status-preview${currentVariant ? '' : ' is-placeholder'}`}>{currentVariant && <RuntimeImage className="food-icon" src={currentVariant.asset_url} alt="" />}</span><div><b>{currentVariant ? `${THEME_REGISTRY[activeTheme].label}图标` : '当前主题未设置'}</b><small>{currentVariant ? `${currentSource || '已保存来源'}${currentVariant.source_url ? ` · ${currentVariant.source_url}` : ''}` : `将借用${THEME_REGISTRY[fallbackTheme].label}图标`}</small></div>{currentVariant && <span className="p5-icon-status-tag">{currentVariant.media_type === 'image/svg+xml' ? 'SVG' : 'PNG'}</span>}</div>
    <section className="p5-editor-sources">
      <div className={`p5-segmented-tabs p5-icon-source-tabs is-index-${ICON_SOURCE_TABS.indexOf(sourceTab)}`} role="tablist" aria-label="图标来源">{ICON_SOURCE_TABS.map(tab => <button type="button" role="tab" key={tab} aria-selected={sourceTab === tab} className={sourceTab === tab ? 'is-active' : ''} onClick={() => selectSourceTab(tab)}>{tab === 'library' ? '图库' : tab === 'local' ? '本地' : tab === 'online' ? '在线' : 'AI'}</button>)}</div>
      <p className={`p5-source-status${statusIsError ? ' is-error' : ''}`} role={statusIsError ? 'alert' : 'status'} aria-live="polite">{statusMessage}</p>
      {sourceTab === 'library' && <div className="p5-icon-grid p5-custom-grid">{icons.map(icon => { const resolved = resolveIconVariant(icon, activeTheme); return <button type="button" key={icon.key} aria-pressed={selectedLibraryKey === icon.key} className={selectedLibraryKey === icon.key ? 'is-selected' : ''} onClick={() => chooseLibraryIcon(icon)}><span><RuntimeImage className="food-icon" src={resolved.assetUrl} alt="" /></span><b>{icon.label}</b></button> })}</div>}
      {sourceTab === 'local' && <div className="p5-local-source"><div className="p5-local-actions"><button className="p7-outline p5-local-action" type="button" onClick={() => void chooseNative('photo')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h4l1.5-2h5L16 7h4v12H4z" /><circle cx="12" cy="13" r="3.5" /></svg>从照片选择</button><button className="p7-outline p5-local-action" type="button" onClick={() => void chooseNative('file')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>从文件选择</button></div><input ref={photoInputRef} className="p5-visually-hidden" type="file" accept="image/*" onChange={event => chooseLocalFile(event.target.files?.[0] ?? null)} /><input ref={fileInputRef} className="p5-visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => chooseLocalFile(event.target.files?.[0] ?? null)} />{local && <div className="p5-local-preview"><img src={local.url} alt="本地图片预览" onLoad={event => setPendingLocal(current => ({ ...current, [activeTheme]: { ...local, dimensions: `${event.currentTarget.naturalWidth} × ${event.currentTarget.naturalHeight}` } }))} /><div><b>当前主题图片</b><small>{local.file.type} · {local.dimensions || '读取尺寸中'}</small><span>预览 48px / 28px</span><button className="p7-primary" type="button" disabled={pending} onClick={useLocalImage}>使用此图片</button></div></div>}</div>}
      {sourceTab === 'online' && <div className="p5-online-source"><form className="p5-search p5-online-search" aria-busy={searching} onSubmit={event => { event.preventDefault(); void searchIcons() }}><button type="submit" className="p5-search-submit" aria-label="搜索在线图标"><svg className="p5-search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg></button><input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="搜索英文关键词" aria-label="在线图标搜索" /></form>{keywords.length > 0 && <div className="p5-keyword-chips" data-edge-swipe-ignore="true" aria-label="英语关键词">{keywords.map(keyword => <button className={searchQuery === keyword ? 'is-active' : ''} type="button" key={keyword} onClick={() => searchKeyword(keyword)}>{keyword}</button>)}</div>}<div className="p5-icon-grid p5-custom-grid">{visibleResults.map(result => <button type="button" key={result.id} aria-pressed={currentVariant?.source_id === result.id && currentVariant.source === onlineProvider} className={currentVariant?.source_id === result.id && currentVariant.source === onlineProvider ? 'is-selected' : ''} onClick={() => chooseOnlineIcon(result)}><span>{result.preview_url && <RuntimeImage className="food-icon" src={result.preview_url} alt="" />}</span><b>{result.label}</b></button>)}</div>{resultPageCount > 1 && <nav className="p5-online-pagination" aria-label="在线图标搜索结果分页"><button className="p9-category-link" type="button" disabled={resultPage === 0} onClick={() => setResultPage(page => Math.max(0, page - 1))}>上一页</button><span aria-live="polite">{resultPage + 1} / {resultPageCount}</span><button className="p9-category-link" type="button" disabled={resultPage >= resultPageCount - 1} onClick={() => setResultPage(page => Math.min(resultPageCount - 1, page + 1))}>下一页</button></nav>}<p className="p5-inline-notice p5-online-source-note">{sourceNote}</p></div>}
      {sourceTab === 'ai' && <div className="p5-ai-controls"><OptionPickerField label="AI 模型" value={model} options={compatibleModels.map(option => ({ value: option.id, label: option.label }))} onChange={setModel} disabled={pending || modelLoading || Boolean(modelError)} /><button className="p5-generate-icons" type="button" disabled={pending || modelLoading || Boolean(modelError) || !model || !name.trim()} onClick={() => void generateIcons()}>开始生成</button>{generation && <div className="p5-icon-grid p5-custom-grid">{generation.candidates.map((candidate, index) => <button type="button" key={candidate.id} aria-label={`AI 候选 ${index + 1}`} aria-pressed={selectedCandidate?.id === candidate.id} className={selectedCandidate?.id === candidate.id ? 'is-selected' : ''} onClick={() => setSelectedCandidate(candidate)}><span><RuntimeImage className="food-icon" src={candidate.asset_url} alt="" /></span><b>候选 {index + 1}</b></button>)}</div>}{selectedCandidate && <button className="p7-primary" type="button" disabled={pending} onClick={() => void applyCandidate()}>使用此候选</button>}</div>}
    </section>
    <div className="p5-fallback-select"><OptionPickerField label="未设置主题时借用" value={fallbackTheme} options={THEMES.map(key => ({ value: key, label: THEME_REGISTRY[key].label }))} onChange={value => setFallbackTheme(value as ThemeKey)} /></div>
    <section className="p5-theme-summary" aria-label="三主题图标汇总"><h2>三主题汇总</h2>{THEMES.map(key => <div key={key}><b>{THEME_REGISTRY[key].label}</b><span>{draft?.variants[key]?.source_id ?? draft?.variants[key]?.source ?? `借用${THEME_REGISTRY[fallbackTheme].label}`}</span></div>)}</section>
  </PageShell>
}
