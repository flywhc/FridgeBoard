"""设备配对、设备管理和提醒设置 HTTP 路由。"""

from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from io import BytesIO
from typing import Annotated
from urllib.parse import urlencode

from fastapi import Cookie, Depends, FastAPI, HTTPException, Request, Response, status
from qrcode import QRCode
from qrcode.constants import ERROR_CORRECT_M
from sqlalchemy.ext.asyncio import AsyncSession

from fridgeboard.api_models import (
    DeviceRenameRequest,
    DeviceResponse,
    DeviceSyncStatusResponse,
    DueNotificationResponse,
    ExpirySettingsRequest,
    ExpirySettingsResponse,
    FirstBootPairingClaimRequest,
    FirstBootPairingCreateResponse,
    FirstBootPairingStatusResponse,
    KindleBindRequest,
    KindlePageStateResponse,
    NotificationSettingsRequest,
    NotificationSettingsResponse,
    PairingConsumeRequest,
    PairingConsumeResponse,
    PairingCreateResponse,
    PairingSessionStatusResponse,
    PasscodeRequest,
    PasscodeResponse,
    RecipeReadDayResponse,
    RecipeReadRestockEntryResponse,
    RefrigeratorResponse,
)
from fridgeboard.auth import AccessService, DisplayDeviceConflictError
from fridgeboard.http_support import (
    refrigerator_response,
    set_device_cookie,
)
from fridgeboard.persistence.models import (
    DeviceCredential,
    ExpirySettings,
    NotificationSettings,
    Refrigerator,
)
from fridgeboard.recipe_service import RecipeService
from fridgeboard.reminder_service import ReminderService

OWNER_COOKIE = "fb_owner_session"
DEVICE_COOKIE = "fb_device_credentials"
KINDLE_FIRST_BOOT_COOKIE = "fb_kindle_first_boot"
REMINDER_RECIPIENT_COOKIE = "fb_reminder_recipient"

SessionFactory = Callable[[], AsyncSession]
TransactionFactory = Callable[[SessionFactory], AbstractAsyncContextManager[AsyncSession]]
OwnerDependency = Callable[..., str]
DeviceDependency = Callable[..., DeviceCredential]
TokenDependency = Callable[[Request], list[str]]
ReminderRecipientDependency = Callable[..., str]
Clock = Callable[[], datetime]
PublicBaseUrl = Callable[[Request], str]


@dataclass(frozen=True)
class DeviceRouteContext:
    """设备路由需要的数据库、认证、时间和 URL 依赖。"""

    session_factory: SessionFactory
    transaction: TransactionFactory
    owner_id: OwnerDependency
    device: DeviceDependency
    bearer_or_cookie_tokens: TokenDependency
    reminder_recipient_key: ReminderRecipientDependency
    public_request_base_url: PublicBaseUrl
    clock: Clock


async def _require_owned_refrigerator(
    session: AsyncSession, refrigerator_id: str, current_owner: str
) -> Refrigerator:
    """验证当前所有者可访问冰箱，否则返回原 API 使用的 404。"""
    refrigerator = await session.get(Refrigerator, refrigerator_id)
    if (
        refrigerator is None
        or refrigerator.owner_user_id != current_owner
        or refrigerator.deleted_at is not None
    ):
        raise HTTPException(status_code=404, detail="冰箱不存在或无权访问")
    return refrigerator


async def _active_device_refrigerator(
    session: AsyncSession, device: DeviceCredential
) -> Refrigerator:
    """返回设备所属活跃冰箱，删除或撤销后统一返回 401。"""
    refrigerator = await session.get(Refrigerator, device.refrigerator_id)
    if refrigerator is None or refrigerator.deleted_at is not None:
        raise HTTPException(status_code=401, detail="设备访问已移除或需要重新配对")
    return refrigerator


def _pairing_qr_png_response(pairing_url: str) -> Response:
    """生成不缓存的同域二维码 PNG，兼容不能可靠渲染 SVG 的旧 Kindle。"""
    qr_code = QRCode(error_correction=ERROR_CORRECT_M, box_size=20, border=2)
    qr_code.add_data(pairing_url)
    qr_code.make(fit=True)
    image = qr_code.make_image().convert("1")
    output = BytesIO()
    image.save(output, format="PNG", optimize=True)
    return Response(
        content=output.getvalue(),
        media_type="image/png",
        headers={"Cache-Control": "no-store, max-age=0"},
    )


def register_device_routes(application: FastAPI, context: DeviceRouteContext) -> None:
    """向应用注册设备配对、设备管理和提醒设置路由。

    Args:
        application: 要追加路由的 FastAPI 应用实例。
        context: 路由运行所需的数据库、认证、时钟和 URL 依赖。
    """

    @application.post(
        "/api/devices/current/sync-status",
        status_code=status.HTTP_204_NO_CONTENT,
        summary="记录冰箱端已完成一次完整同步",
        responses={204: {"description": "同步时间已记录"}},
    )
    async def report_display_sync(
        current_device: DeviceCredential = Depends(context.device),
    ) -> Response:
        """只接受 Kindle 在获取布局和库存均成功后上报的同步完成状态。"""
        if current_device.device_kind != "kindle":
            raise HTTPException(status_code=403, detail="只有冰箱端可以上报同步状态")
        async with context.transaction(context.session_factory) as session:
            current = await session.get(DeviceCredential, current_device.id)
            if current is None or current.revoked_at is not None:
                raise HTTPException(status_code=401, detail="设备访问已移除或需要重新配对")
            current.last_successful_sync_at = context.clock()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @application.get("/api/devices/current/sync-status", response_model=DeviceSyncStatusResponse)
    async def current_display_sync_status(
        current_device: DeviceCredential = Depends(context.device),
    ) -> DeviceSyncStatusResponse:
        """读取当前 Kindle 最近一次完整同步成功的时间。"""
        if current_device.device_kind != "kindle":
            raise HTTPException(status_code=403, detail="只有冰箱端可以读取同步状态")
        async with context.session_factory() as session:
            current = await session.get(DeviceCredential, current_device.id)
            if current is None or current.revoked_at is not None:
                raise HTTPException(status_code=401, detail="设备访问已移除或需要重新配对")
            return DeviceSyncStatusResponse(
                last_successful_sync_at=(
                    current.last_successful_sync_at.isoformat()
                    if current.last_successful_sync_at
                    else None
                )
            )

    @application.post(
        "/api/owner/kindle-passcodes", response_model=PasscodeResponse, status_code=201
    )
    async def create_kindle_passcode(
        payload: PasscodeRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> PasscodeResponse:
        """为已有冰箱或新冰箱生成仅一次可用的六位冰箱端兼容绑定码。"""
        try:
            async with context.transaction(context.session_factory) as session:
                code = await AccessService(session).create_passcode(
                    current_owner,
                    payload.refrigerator_id,
                    payload.new_refrigerator_name,
                    payload.new_template_key,
                    payload.purpose,
                )
        except DisplayDeviceConflictError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return PasscodeResponse(passcode=code, expires_in_seconds=300)

    @application.post("/api/kindle/bind", response_model=RefrigeratorResponse, status_code=201)
    async def bind_kindle(payload: KindleBindRequest, request: Request) -> Response:
        """消费兼容绑定码并把独立冰箱端凭证写入 HttpOnly Cookie。"""
        try:
            async with context.transaction(context.session_factory) as session:
                device_record, token = await AccessService(session).consume_passcode(
                    payload.passcode, payload.label
                )
                refrigerator = await session.get(Refrigerator, device_record.refrigerator_id)
                assert refrigerator is not None
                body = (
                    await refrigerator_response(refrigerator, session, access_role="daily_access")
                ).model_dump_json()
        except DisplayDeviceConflictError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        response = Response(content=body, media_type="application/json", status_code=201)
        set_device_cookie(response, request, token)
        return response

    @application.post(
        "/api/kindle/first-boot-sessions",
        response_model=FirstBootPairingCreateResponse,
        status_code=201,
    )
    async def create_first_boot_pairing_session(request: Request) -> Response:
        """让未绑定 Kindle 创建仅供手机扫码领取的十分钟首次开机会话。"""
        async with context.transaction(context.session_factory) as session:
            _, mobile_token, kindle_token = await AccessService(
                session
            ).create_first_boot_pairing_session()
        base_url = context.public_request_base_url(request)
        body = FirstBootPairingCreateResponse(
            pairing_token=mobile_token,
            pairing_url=f"{base_url}/pair?{urlencode({'bootstrap': mobile_token})}",
            expires_in_seconds=600,
            purpose="bind_display_device",
        ).model_dump_json()
        response = Response(content=body, media_type="application/json", status_code=201)
        response.set_cookie(
            KINDLE_FIRST_BOOT_COOKIE,
            kindle_token,
            httponly=True,
            secure=request.url.scheme == "https",
            samesite="lax",
            max_age=600,
        )
        return response

    @application.get("/api/kindle/first-boot-sessions/qr", include_in_schema=False)
    def first_boot_pairing_qr(token: str, request: Request) -> Response:
        """为首次配对令牌生成同域 PNG 二维码，供老 Kindle 直接显示。"""
        if len(token) < 20 or len(token) > 128:
            raise HTTPException(status_code=400, detail="首次配对令牌格式无效")
        pairing_url = (
            f"{context.public_request_base_url(request)}/pair?{urlencode({'bootstrap': token})}"
        )
        return _pairing_qr_png_response(pairing_url)

    @application.post(
        "/api/first-boot-pairings/claim",
        response_model=PairingConsumeResponse,
        response_model_exclude_none=True,
        status_code=201,
    )
    async def claim_first_boot_pairing(
        payload: FirstBootPairingClaimRequest,
        request: Request,
        current_owner: str = Depends(context.owner_id),
    ) -> Response:
        """由已登录 PWA 领取首次二维码，绑定冰箱并获得本机设备凭证。"""
        try:
            async with context.transaction(context.session_factory) as session:
                device_record, token = await AccessService(session).claim_first_boot_pairing(
                    payload.pairing_token,
                    current_owner,
                    payload.label,
                    payload.refrigerator_id,
                    payload.new_refrigerator_name,
                    payload.new_template_key,
                    payload.purpose,
                )
                refrigerator = await session.get(Refrigerator, device_record.refrigerator_id)
                assert refrigerator is not None
                body = PairingConsumeResponse(
                    **(await refrigerator_response(refrigerator, session)).model_dump(),
                    device_token=token if payload.client == "mobile" else None,
                ).model_dump_json(exclude_none=True)
        except DisplayDeviceConflictError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        response = Response(content=body, media_type="application/json", status_code=201)
        set_device_cookie(response, request, token)
        return response

    @application.get(
        "/api/kindle/first-boot-sessions/current",
        response_model=FirstBootPairingStatusResponse,
    )
    async def current_first_boot_pairing(
        request: Request,
        kindle_token: Annotated[str | None, Cookie(alias=KINDLE_FIRST_BOOT_COOKIE)] = None,
    ) -> Response:
        """让 Kindle 轮询手机是否已完成领取，并在完成时一次性签发 Kindle 凭证。"""
        if not kindle_token:
            raise HTTPException(status_code=404, detail="没有进行中的首次配对会话")
        try:
            async with context.transaction(context.session_factory) as session:
                result = await AccessService(session).bind_first_boot_kindle(
                    kindle_token, "厨房 Kindle"
                )
                if result is None:
                    return Response(
                        content=FirstBootPairingStatusResponse(state="pending").model_dump_json(),
                        media_type="application/json",
                    )
                device_record, token = result
                refrigerator = await session.get(Refrigerator, device_record.refrigerator_id)
                assert refrigerator is not None
                body = FirstBootPairingStatusResponse(
                    state="bound",
                    refrigerator=await refrigerator_response(
                        refrigerator, session, access_role="daily_access"
                    ),
                ).model_dump_json()
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        response = Response(content=body, media_type="application/json")
        set_device_cookie(response, request, token)
        response.delete_cookie(KINDLE_FIRST_BOOT_COOKIE)
        return response

    @application.get("/api/kindle/page-state", response_model=KindlePageStateResponse)
    async def kindle_page_state(request: Request) -> KindlePageStateResponse:
        """显式区分 Kindle 的首次启动、已配置和凭证已撤销页面状态。"""
        tokens = context.bearer_or_cookie_tokens(request)
        if not tokens:
            return KindlePageStateResponse(state="unconfigured")
        async with context.transaction(context.session_factory) as session:
            service = AccessService(session)
            for token in tokens:
                device = await service.device_for_token(token, kind="kindle")
                if device is not None:
                    return KindlePageStateResponse(state="configured")
        return KindlePageStateResponse(state="revoked")

    @application.post(
        "/api/kindle/pairing-sessions", response_model=PairingCreateResponse, status_code=201
    )
    async def create_pairing_session(
        request: Request, current_device: DeviceCredential = Depends(context.device)
    ) -> PairingCreateResponse:
        """由 Kindle 创建单次二维码会话；手机扫码后无需 Kindle 二次确认。"""
        if current_device.device_kind != "kindle":
            raise HTTPException(status_code=403, detail="只有 Kindle 可以发起手机配对")
        async with context.transaction(context.session_factory) as session:
            current = await session.get(DeviceCredential, current_device.id)
            assert current is not None
            _, pairing_token = await AccessService(session).create_pairing_session(current)
        base_url = context.public_request_base_url(request)
        return PairingCreateResponse(
            pairing_token=pairing_token,
            pairing_url=f"{base_url}/pair?{urlencode({'token': pairing_token})}",
            expires_in_seconds=600,
            purpose="grant_pwa_access",
        )

    @application.get("/api/kindle/pairing-sessions/qr", include_in_schema=False)
    def pairing_session_qr(token: str, request: Request) -> Response:
        """为已配置冰箱端的“添加手机”会话生成同域 PNG 二维码。"""
        if len(token) < 20 or len(token) > 128:
            raise HTTPException(status_code=400, detail="配对令牌格式无效")
        pairing_url = (
            f"{context.public_request_base_url(request)}/pair?{urlencode({'token': token})}"
        )
        return _pairing_qr_png_response(pairing_url)

    @application.get(
        "/api/kindle/pairing-sessions/current", response_model=PairingSessionStatusResponse
    )
    async def current_pairing_session(
        current_device: DeviceCredential = Depends(context.device),
    ) -> PairingSessionStatusResponse:
        """读取当前 Kindle 最新“添加手机”二维码，供页面显示已领取或已过期状态。"""
        if current_device.device_kind != "kindle":
            raise HTTPException(status_code=403, detail="只有冰箱端可以读取配对二维码状态")
        async with context.session_factory() as session:
            state, expires_in_seconds = await AccessService(session).pairing_session_status(
                current_device.id
            )
            return PairingSessionStatusResponse(state=state, expires_in_seconds=expires_in_seconds)

    @application.post(
        "/api/pairings/consume",
        response_model=PairingConsumeResponse,
        response_model_exclude_none=True,
        status_code=201,
    )
    async def consume_pairing(payload: PairingConsumeRequest, request: Request) -> Response:
        """仅由 PWA 提交的二维码消费请求，为当前安装实例颁发新凭证。"""
        try:
            async with context.transaction(context.session_factory) as session:
                service = AccessService(session)
                device_record, token = await service.consume_pairing(
                    payload.pairing_token,
                    payload.label,
                    context.bearer_or_cookie_tokens(request),
                )
                refrigerator = await session.get(Refrigerator, device_record.refrigerator_id)
                assert refrigerator is not None
                body = PairingConsumeResponse(
                    **(
                        await refrigerator_response(
                            refrigerator, session, access_role="daily_access"
                        )
                    ).model_dump(),
                    device_token=token if payload.client == "mobile" else None,
                ).model_dump_json(exclude_none=True)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        response = Response(content=body, media_type="application/json", status_code=201)
        if token is not None:
            set_device_cookie(response, request, token)
        return response

    @application.get("/api/devices/refrigerators", response_model=list[RefrigeratorResponse])
    async def device_refrigerators(request: Request) -> list[RefrigeratorResponse]:
        """列出本浏览器/PWA 安装实例仍可访问的所有冰箱，并自动过滤已撤销项。"""
        refrigerators: dict[str, RefrigeratorResponse] = {}
        async with context.transaction(context.session_factory) as session:
            service = AccessService(session)
            for token in context.bearer_or_cookie_tokens(request):
                current = await service.device_for_token(token)
                if current is None:
                    continue
                refrigerator = await session.get(Refrigerator, current.refrigerator_id)
                if refrigerator and refrigerator.deleted_at is None:
                    refrigerators[refrigerator.id] = await refrigerator_response(
                        refrigerator, session, access_role="daily_access"
                    )
        return list(refrigerators.values())

    @application.get("/api/devices/current", response_model=RefrigeratorResponse)
    async def current_device_refrigerator(
        current_device: DeviceCredential = Depends(context.device),
    ) -> RefrigeratorResponse:
        """读取当前设备的冰箱，用于在撤销后验证访问已被立即拒绝。"""
        async with context.session_factory() as session:
            return await refrigerator_response(
                await _active_device_refrigerator(session, current_device),
                session,
                access_role="daily_access",
            )

    @application.get(
        "/api/devices/current/restock", response_model=list[RecipeReadRestockEntryResponse]
    )
    async def current_device_restock(
        week_start: date,
        current_device: DeviceCredential = Depends(context.device),
    ) -> list[RecipeReadRestockEntryResponse]:
        """读取当前 Kindle 所属冰箱本周和下周的只读动态补货清单。"""
        if current_device.device_kind != "kindle":
            raise HTTPException(status_code=403, detail="只有冰箱端可以读取补货清单")
        async with context.session_factory() as session:
            refrigerator = await _active_device_refrigerator(session, current_device)
            normalized_week_start = week_start - timedelta(days=week_start.weekday())
            return await RecipeService(session).restock(refrigerator.id, normalized_week_start)

    @application.get("/api/devices/current/recipes", response_model=list[RecipeReadDayResponse])
    async def current_device_recipes(
        week_start: date,
        current_device: DeviceCredential = Depends(context.device),
    ) -> list[RecipeReadDayResponse]:
        """读取当前 Kindle 所属冰箱指定周的只读食谱。"""
        if current_device.device_kind != "kindle":
            raise HTTPException(status_code=403, detail="只有冰箱端可以读取食谱")
        async with context.session_factory() as session:
            refrigerator = await _active_device_refrigerator(session, current_device)
            normalized_week_start = week_start - timedelta(days=week_start.weekday())
            return await RecipeService(session).list_week(refrigerator.id, normalized_week_start)

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/expiry-settings",
        response_model=ExpirySettingsResponse,
    )
    async def get_expiry_settings(
        refrigerator_id: str, current_owner: str = Depends(context.owner_id)
    ) -> ExpirySettingsResponse:
        """读取冰箱临期规则；未保存时返回产品默认值。"""
        try:
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(session, refrigerator_id, current_owner)
                settings = await session.get(ExpirySettings, refrigerator_id)
                if settings is None:
                    return ExpirySettingsResponse(ratio_percent=20, minimum_days=1, maximum_days=14)
                return ExpirySettingsResponse(
                    ratio_percent=settings.ratio_percent,
                    minimum_days=settings.minimum_days,
                    maximum_days=settings.maximum_days,
                )
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @application.put(
        "/api/owner/refrigerators/{refrigerator_id}/expiry-settings",
        response_model=ExpirySettingsResponse,
    )
    async def update_expiry_settings(
        refrigerator_id: str,
        payload: ExpirySettingsRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> ExpirySettingsResponse:
        """保存临期百分比及最短、最长提前天数。"""
        if payload.maximum_days < payload.minimum_days:
            raise HTTPException(status_code=422, detail="最多提前天数不能小于最少提前天数")
        try:
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(session, refrigerator_id, current_owner)
                settings = await session.get(ExpirySettings, refrigerator_id)
                if settings is None:
                    settings = ExpirySettings(refrigerator_id=refrigerator_id)
                    session.add(settings)
                settings.ratio_percent = payload.ratio_percent
                settings.minimum_days = payload.minimum_days
                settings.maximum_days = payload.maximum_days
                await session.flush()
                return ExpirySettingsResponse(**payload.model_dump())
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/notification-settings",
        response_model=NotificationSettingsResponse,
    )
    async def get_notification_settings(
        refrigerator_id: str,
        current_owner: str = Depends(context.owner_id),
        recipient_key: str = Depends(context.reminder_recipient_key),
    ) -> NotificationSettingsResponse:
        """读取提醒设置；首次访问使用每日 20:00 和两类提醒均开启的默认值。"""
        try:
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(session, refrigerator_id, current_owner)
                settings = await ReminderService(session, context.clock()).settings(
                    refrigerator_id, recipient_key
                )
                return NotificationSettingsResponse(
                    daily_reminder_enabled=settings.daily_reminder_enabled,
                    reminder_time=settings.reminder_time,
                    device_health_enabled=settings.device_health_enabled,
                )
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @application.put(
        "/api/owner/refrigerators/{refrigerator_id}/notification-settings",
        response_model=NotificationSettingsResponse,
    )
    async def update_notification_settings(
        refrigerator_id: str,
        payload: NotificationSettingsRequest,
        current_owner: str = Depends(context.owner_id),
        recipient_key: str = Depends(context.reminder_recipient_key),
    ) -> NotificationSettingsResponse:
        """保存每日提醒开关、时间和显示设备健康提醒开关。"""
        try:
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(session, refrigerator_id, current_owner)
                settings = await session.get(NotificationSettings, (refrigerator_id, recipient_key))
                if settings is None:
                    settings = NotificationSettings(
                        refrigerator_id=refrigerator_id, recipient_key=recipient_key
                    )
                    session.add(settings)
                settings.daily_reminder_enabled = payload.daily_reminder_enabled
                settings.reminder_time = payload.reminder_time
                settings.device_health_enabled = payload.device_health_enabled
                return NotificationSettingsResponse(**payload.model_dump())
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/notifications/due",
        response_model=list[DueNotificationResponse],
    )
    async def collect_due_notifications(
        refrigerator_id: str,
        current_owner: str = Depends(context.owner_id),
        recipient_key: str = Depends(context.reminder_recipient_key),
    ) -> list[DueNotificationResponse]:
        """取走当前时间首次出现的应用内提醒，并记录每日去重审计。"""
        try:
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(session, refrigerator_id, current_owner)
                due = await ReminderService(session, context.clock()).due(
                    refrigerator_id, recipient_key
                )
                return [
                    DueNotificationResponse(kind=item.kind, title=item.title, body=item.body)
                    for item in due
                ]
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/devices",
        response_model=list[DeviceResponse],
    )
    async def owner_devices(
        refrigerator_id: str,
        request: Request,
        current_owner: str = Depends(context.owner_id),
    ) -> list[DeviceResponse]:
        """读取所有者冰箱的所有设备及其最近访问时间。"""
        try:
            async with context.session_factory() as session:
                service = AccessService(session)
                devices = await service.list_devices(current_owner, refrigerator_id)
                current_device_ids = await service.device_ids_for_tokens(
                    context.bearer_or_cookie_tokens(request), refrigerator_id
                )
                from fridgeboard.http_support import device_response

                return [
                    device_response(item, is_current=item.id in current_device_ids)
                    for item in devices
                ]
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @application.put(
        "/api/owner/refrigerators/{refrigerator_id}/devices/{device_id}",
        response_model=DeviceResponse,
    )
    async def rename_device(
        refrigerator_id: str,
        device_id: str,
        payload: DeviceRenameRequest,
        request: Request,
        current_owner: str = Depends(context.owner_id),
    ) -> DeviceResponse:
        """重命名仍有效的 PWA 或冰箱端设备。"""
        label = payload.label.strip()
        if not label:
            raise HTTPException(status_code=422, detail="设备名称不能为空")
        try:
            async with context.transaction(context.session_factory) as session:
                device = await AccessService(session).rename_device(
                    current_owner, refrigerator_id, device_id, label
                )
                await session.flush()
                current_ids = await AccessService(session).device_ids_for_tokens(
                    context.bearer_or_cookie_tokens(request), refrigerator_id
                )
                from fridgeboard.http_support import device_response

                return device_response(device, is_current=device.id in current_ids)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @application.delete(
        "/api/owner/refrigerators/{refrigerator_id}/devices/{device_id}", status_code=204
    )
    async def remove_device(
        refrigerator_id: str,
        device_id: str,
        current_owner: str = Depends(context.owner_id),
    ) -> Response:
        """立即撤销一个 PWA 或 Kindle 凭证；已移除设备随后访问会得到 401。"""
        try:
            async with context.transaction(context.session_factory) as session:
                await AccessService(session).revoke_device(
                    current_owner, refrigerator_id, device_id
                )
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        return Response(status_code=204)
