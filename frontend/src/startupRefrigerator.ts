/** 在仍可访问的上次冰箱与列表首项之间确定登录后的默认工作区。 */
export function selectStartupRefrigerator<T extends { id: string }>(fridges: T[], lastRefrigeratorId: string | null): T | undefined {
  return fridges.find(fridge => fridge.id === lastRefrigeratorId) ?? fridges[0]
}
