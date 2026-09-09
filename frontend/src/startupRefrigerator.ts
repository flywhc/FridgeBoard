/** 在仍可访问的上次冰箱与列表首项之间确定登录后的默认工作区。 */
export function selectStartupRefrigerator<T extends { id: string }>(fridges: T[], lastRefrigeratorId: string | null): T | undefined {
  return fridges.find(fridge => fridge.id === lastRefrigeratorId) ?? fridges[0]
}

/**
 * 确定所有者初始化请求失败时是否可以继续显示工作区。
 *
 * 认证状态尚未确认且没有任何本地冰箱缓存时，不能把空工作区误当成已登录状态。
 * 已有缓存或认证请求已经成功返回时，保留工作区以支持离线启动和数据请求失败后的重试。
 */
export function getOwnerLoadFailureState(authenticationResolved: boolean, cachedRefrigeratorCount: number): 'signed-in' | 'signed-out' {
  return !authenticationResolved && cachedRefrigeratorCount === 0 ? 'signed-out' : 'signed-in'
}
