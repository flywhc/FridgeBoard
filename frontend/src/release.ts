/** 当前构建的发布标识；正式发布时由部署或移动发布流程注入。 */
const configuredRelease = import.meta.env.VITE_APP_RELEASE
export const isAppRelease = (value: unknown): value is string => typeof value === 'string' && /^\d{12}$/.test(value)

export const APP_RELEASE = isAppRelease(configuredRelease)
  ? configuredRelease
  : 'dev'
