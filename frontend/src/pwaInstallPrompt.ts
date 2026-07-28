export type PwaInstallPromptMode = 'install' | 'apple-guide' | 'android-guide'

/** 根据浏览器可用能力选择安装操作或稳定可见的平台安装引导。 */
export function getPwaInstallPromptMode({
  isAppleMobile,
  hasInstallEvent,
}: {
  isAppleMobile: boolean
  hasInstallEvent: boolean
}): PwaInstallPromptMode {
  if (hasInstallEvent) return 'install'
  return isAppleMobile ? 'apple-guide' : 'android-guide'
}
