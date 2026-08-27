import type { ThemeKey } from './theme'

export type IconEditorSourceTab = 'library' | 'local' | 'online' | 'ai'
export const ICON_SOURCE_TABS: IconEditorSourceTab[] = ['library', 'local', 'online', 'ai']

const MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const MAX_ICON_BYTES = 10 * 1024 * 1024

/** 返回主题使用的在线目录；图片类主题共用 Thiings 图库。 */
export function getOnlineProvider(theme: ThemeKey): 'iconify' | 'thiings' {
  return theme === 'ink' ? 'iconify' : 'thiings'
}

/** 本地和 AI 上传共用 MIME 与大小校验。 */
export function isSupportedIconFile(file: Pick<File, 'type' | 'size'>): boolean {
  return MIME_TYPES.has(file.type) && file.size <= MAX_ICON_BYTES
}

/** 新建或编辑草稿至少需要一个主题图标和有效名称。 */
export function canConfirmIconDraft(draft: { variants: object } | null, name: string, pending: boolean): boolean {
  return Boolean(draft && name.trim() && !pending && Object.keys(draft.variants).length > 0)
}

/** 编辑模式用于禁用未发生变化的保存按钮。 */
export function hasIconDraftChanges(initial: { name: string; fallback_theme: ThemeKey; variants: object }, current: { name: string; fallback_theme: ThemeKey; variants: object }): boolean {
  return initial.name !== current.name || initial.fallback_theme !== current.fallback_theme || JSON.stringify(initial.variants) !== JSON.stringify(current.variants)
}

/** 只有请求序号、主题和 provider 都仍然匹配时才能应用搜索结果。 */
export function shouldApplySearchResponse(requestSequence: number, currentSequence: number, requestTheme: ThemeKey, currentTheme: ThemeKey, requestProvider: 'iconify' | 'thiings', currentProvider: 'iconify' | 'thiings' | null): boolean {
  return requestSequence === currentSequence && requestTheme === currentTheme && requestProvider === currentProvider
}

/** 关键词建议不能覆盖用户已改名或手工编辑的搜索框。 */
export function shouldApplyKeywordResponse(requestSequence: number, currentSequence: number, requestName: string, currentName: string, requestQuery: string, currentQuery: string): boolean {
  return requestSequence === currentSequence && requestName === currentName.trim() && requestQuery === currentQuery
}

/** 防止切主题或旧 generation 响应把候选写入错误主题。 */
export function isCurrentIconCandidate(generationId: string, generationTheme: ThemeKey, candidateId: string, currentGenerationId: string | null, currentTheme: ThemeKey, candidateIds: string[]): boolean {
  return generationId === currentGenerationId && generationTheme === currentTheme && candidateIds.includes(candidateId)
}
