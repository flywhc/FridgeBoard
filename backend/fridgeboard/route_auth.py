"""HTTP 路由共用的冰箱访问校验。

本模块只负责把数据库记录转换为统一的 HTTP 权限错误；调用方仍负责注入会话、
事务和具体认证依赖。这里不处理所有者会话或设备凭证本身的签发与撤销。
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from fridgeboard.persistence.models import DeviceCredential, Refrigerator


async def require_owned_refrigerator(
    session: AsyncSession,
    refrigerator_id: str,
    current_owner: str,
    failure_status: int = 404,
) -> Refrigerator:
    """返回当前所有者拥有的活跃冰箱。

    Args:
        session: 当前请求使用的数据库会话。
        refrigerator_id: 路径中的冰箱 ID。
        current_owner: 已认证的所有者 ID。
        failure_status: 目标不可访问时的响应状态码。

    Returns:
        当前所有者可访问的活跃冰箱记录。

    Raises:
        HTTPException: 目标不存在、已删除或不属于当前所有者时抛出。
    """
    refrigerator = await session.get(Refrigerator, refrigerator_id)
    if (
        refrigerator is None
        or refrigerator.owner_user_id != current_owner
        or refrigerator.deleted_at is not None
    ):
        raise HTTPException(status_code=failure_status, detail="冰箱不存在或无权访问")
    return refrigerator


async def require_active_device_refrigerator(
    session: AsyncSession, device: DeviceCredential
) -> Refrigerator:
    """返回设备所属的活跃冰箱，删除后统一返回 401。"""
    refrigerator = await session.get(Refrigerator, device.refrigerator_id)
    if refrigerator is None or refrigerator.deleted_at is not None:
        raise HTTPException(status_code=401, detail="设备访问已移除或需要重新配对")
    return refrigerator
