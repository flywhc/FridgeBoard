"""FridgeBoard 的 HTTP 入口与 P3 访问控制路由。

路由层负责 Cookie、SSO 回跳和请求校验；短效口令、设备凭证和
授权判断均委托给 ``AccessService``。应用使用同域 HttpOnly Cookie
保存不透明会话。避免把访问机密暴露给 PWA JavaScript。
本模块不创建数据库表，生产启动前必须执行 Alembic。
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import secrets
from collections.abc import AsyncIterator, Awaitable, Callable, Generator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from hashlib import sha256
from pathlib import Path
from typing import Annotated, Literal
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request as UrlRequest
from urllib.request import urlopen

from fastapi import Cookie, Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.exception_handlers import (
    http_exception_handler,
    request_validation_exception_handler,
)
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import JSONResponse

from fridgeboard.api_models import AuthenticationModeResponse, HealthResponse, OwnerLoginResponse
from fridgeboard.auth import AccessService
from fridgeboard.daily_access_routes import (
    DailyAccessRouteContext,
    register_daily_access_routes,
)
from fridgeboard.device_routes import DeviceRouteContext, register_device_routes
from fridgeboard.http_support import tokens_from_cookie
from fridgeboard.icon_service import (
    IconGenerationProvider,
    IconService,
    agnes_icon_provider_from_environment,
)
from fridgeboard.inventory_routes import InventoryRouteContext, register_inventory_routes
from fridgeboard.item_catalog import ensure_builtin_catalog
from fridgeboard.logging_support import configure_logging
from fridgeboard.owner_routes import OwnerRouteContext, register_owner_routes
from fridgeboard.persistence.database import (
    create_database_engine,
    create_session_factory,
    transaction,
)
from fridgeboard.persistence.models import DeviceCredential
from fridgeboard.recipe_routes import RecipeRouteContext, register_recipe_routes
from fridgeboard.recipe_service import RecipeService
from fridgeboard.recognition import (
    QrRecognitionProvider,
    RecognitionProvider,
    agnes_provider_from_environment,
    agnes_qr_provider_from_environment,
)

OWNER_COOKIE = "fb_owner_session"
DEVICE_COOKIE = "fb_device_credentials"
REMINDER_RECIPIENT_COOKIE = "fb_reminder_recipient"
logger = logging.getLogger(__name__)


def _load_local_env() -> dict[str, str]:
    """在直接本地启动时读取项目根目录 ``.env``，不覆盖已有进程环境变量。

    """
    env_file = Path(__file__).resolve().parents[2] / ".env"
    if not env_file.is_file():
        return {}
    values: dict[str, str] = {}
    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip()
        if key:
            values[key] = value.strip("\"'")
    return values



def create_app(
    frontend_dist: Path | None = None,
    database_url: str | None = None,
    development_owner_user_id: str | None = None,
    public_base_url: str | None = None,
    flycn_authorize_url: str | None = None,
    flycn_exchange_url: str | None = None,
    flycn_client_secret: str | None = None,
    local_owner_user_id: str | None = None,
    recognition_provider: RecognitionProvider | None = None,
    qr_recognition_provider: QrRecognitionProvider | None = None,
    icon_generation_provider: IconGenerationProvider | None = None,
    persistent_icon_dir: Path | None = None,
    temporary_icon_dir: Path | None = None,
    clock: Callable[[], datetime] | None = None,
    load_local_env: bool = False,
) -> FastAPI:
    """创建 FridgeBoard HTTP 应用。

    ``development_owner_user_id`` 只用于本地和测试，生产环境不得设置。flycn URL
    同时配置时，登录入口会生成含回跳地址的授权请求，
    回调通过服务端请求交换一次性授权码。

    Args:
        frontend_dist: 可选 PWA 构建目录。
        database_url: 可选 SQLAlchemy URL，测试可传入临时 SQLite 文件。
        development_owner_user_id: 显式允许的本地所有者 ID。
        public_base_url: 对外 FridgeBoard 根地址，用于二维码及 SSO 回跳。
        flycn_authorize_url: flycn 授权页面 URL。
        flycn_exchange_url: flycn Docker 私网授权码兑换 URL。
        flycn_client_secret: 与 flycn 共享的服务间兑换密钥。
        local_owner_user_id: 私有局域网部署使用的免登录所有者 ID。
        recognition_provider: 可注入的 Agnes 识别适配器；默认从部署环境构造。
        qr_recognition_provider: 可注入的二维码文本解析适配器；默认从部署环境构造。
        icon_generation_provider: 可注入的 Agnes text2image 适配器。
        persistent_icon_dir: 已确认透明 PNG 的持久目录。
        temporary_icon_dir: 未确认图标候选的临时目录。
        clock: P10 提醒调度使用的本地时钟；测试可注入模拟时间。
        load_local_env: 是否读取项目根目录本地 ``.env``；测试和嵌入式调用默认
            关闭。
    """
    configure_logging()
    local_env = _load_local_env() if load_local_env else {}

    def env_value(name: str, default: str | None = None) -> str | None:
        """读取进程环境变量，并在本地启动时回退到项目 ``.env``。"""
        return os.environ.get(name, local_env.get(name, default))

    configured_database_url = database_url or env_value(
        "FRIDGEBOARD_DATABASE_URL", "sqlite:///./fridgeboard.db"
    )
    configured_base_url = (public_base_url or env_value("FRIDGEBOARD_PUBLIC_BASE_URL", "")).rstrip(
        "/"
    )
    configured_development_owner = development_owner_user_id or env_value(
        "FRIDGEBOARD_DEVELOPMENT_OWNER_USER_ID"
    )
    configured_authorize_url = flycn_authorize_url or env_value("FRIDGEBOARD_FLYCN_AUTHORIZE_URL")
    configured_exchange_url = flycn_exchange_url or env_value("FRIDGEBOARD_FLYCN_EXCHANGE_URL")
    configured_secret = flycn_client_secret or env_value("FRIDGEBOARD_FLYCN_CLIENT_SECRET")
    configured_local_owner = local_owner_user_id or env_value("FRIDGEBOARD_LOCAL_OWNER_USER_ID")
    configured_recognition_provider = recognition_provider or agnes_provider_from_environment(
        env_value
    )
    configured_qr_recognition_provider = (
        qr_recognition_provider or agnes_qr_provider_from_environment(env_value)
    )
    configured_icon_provider = (
        icon_generation_provider or agnes_icon_provider_from_environment(env_value)
    )
    configured_persistent_icon_dir = persistent_icon_dir or Path(
        env_value("FRIDGEBOARD_ICON_ASSET_DIR", "/data/fridgeboard-icons")
        or "/data/fridgeboard-icons"
    )
    configured_temporary_icon_dir = temporary_icon_dir or Path(
        env_value("FRIDGEBOARD_ICON_TEMP_DIR", "/tmp/fridgeboard-icon-candidates")
        or "/tmp/fridgeboard-icon-candidates"
    )
    configured_clock = clock or (lambda: datetime.now(UTC).astimezone().replace(tzinfo=None))

    def public_request_base_url(request: Request) -> str:
        """返回当前请求可访问的根地址，供本地二维码和回调使用。

        本地开发时不应把 ``0.0.0.0`` 放进二维码；它只是监听通配地址，
        手机必须使用浏览器实际访问的局域网主机名或 IP。
        生产环境仍优先使用显式配置的公网地址。
        """
        if configured_base_url and not any(
            marker in configured_base_url for marker in ("0.0.0.0", "[::]")
        ):
            return configured_base_url
        return str(request.base_url).rstrip("/")

    engine = create_database_engine(configured_database_url)
    session_factory = create_session_factory(engine)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        """在接收请求前同步目录，并在单个进程中每天清理过期数据。"""
        # Alembic 已在生产入口完成表结构迁移；把目录同步放在应用生命周期内，
        # 避免仅导入模块或装配应用时访问尚未初始化的数据库。
        try:
            with transaction(session_factory) as session:
                ensure_builtin_catalog(session)
        except Exception:
            logger.exception("应用启动初始化失败")
            raise

        async def clean_daily() -> None:
            while True:
                try:
                    with transaction(session_factory) as session:
                        AccessService(session).purge_expired_refrigerators(
                            configured_clock(),
                            persistent_icon_dir=configured_persistent_icon_dir,
                            temporary_icon_dir=configured_temporary_icon_dir,
                        )
                        IconService(
                            session,
                            configured_persistent_icon_dir,
                            configured_temporary_icon_dir,
                            configured_icon_provider,
                        ).cleanup_expired(configured_clock())
                except Exception:
                    logger.exception("清理超过恢复期的冰箱失败；将在下一轮重试")
                await asyncio.sleep(24 * 60 * 60)

        cleanup_task = asyncio.create_task(clean_daily())
        try:
            yield
        finally:
            cleanup_task.cancel()
            try:
                await cleanup_task
            except asyncio.CancelledError:
                pass

    application = FastAPI(
        title="FridgeBoard API",
        version="0.3.0",
        description="FridgeBoard 的同域 API、PWA 静态资源与无账号设备配对入口。",
        lifespan=lifespan,
    )

    @application.exception_handler(StarletteHTTPException)
    async def log_http_exception(
        request: Request, exc: StarletteHTTPException
    ) -> Response:
        """记录所有 HTTP 错误响应，并复用 FastAPI 的原始响应处理。"""
        logger.error(
            "HTTP 错误 method=%s path=%s status=%s exception=%s",
            request.method,
            request.url.path,
            exc.status_code,
            type(exc).__name__,
        )
        return await http_exception_handler(request, exc)

    @application.exception_handler(RequestValidationError)
    async def log_request_validation_error(
        request: Request, exc: RequestValidationError
    ) -> Response:
        """记录请求参数校验失败，不把校验详情或请求体写入日志。"""
        logger.error(
            "请求校验错误 method=%s path=%s status=422 exception=%s errors=%s",
            request.method,
            request.url.path,
            type(exc).__name__,
            len(exc.errors()),
        )
        return await request_validation_exception_handler(request, exc)

    @application.exception_handler(Exception)
    async def log_unhandled_exception(request: Request, exc: Exception) -> JSONResponse:
        """记录未处理异常及堆栈，并返回不暴露内部细节的 500 响应。"""
        logger.exception(
            "未处理后端异常 method=%s path=%s status=500 exception=%s",
            request.method,
            request.url.path,
            type(exc).__name__,
        )
        return JSONResponse(status_code=500, content={"detail": "内部服务器错误"})

    def get_session() -> Generator[Session, None, None]:
        """为只读和依赖认证请求提供自动关闭的数据库会话。"""
        with session_factory() as session:
            yield session

    def owner_id(
        owner_session: Annotated[str | None, Cookie(alias=OWNER_COOKIE)] = None,
        session: Session = Depends(get_session),
    ) -> str:
        """解析并要求有效所有者管理会话。"""
        owner = AccessService(session).owner_for_session(owner_session)
        if owner is not None:
            return owner
        if configured_local_owner:
            return configured_local_owner
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="需要所有者登录"
        )

    def bearer_or_cookie_tokens(request: Request) -> list[str]:
        """读取 Bearer（自动化/Kindle）或浏览器 HttpOnly Cookie 中的设备凭证。"""
        scheme, _, bearer = request.headers.get("authorization", "").partition(" ")
        if scheme.lower() == "bearer" and bearer:
            return [bearer]
        return tokens_from_cookie(request.cookies.get(DEVICE_COOKIE))

    def device(
        request: Request,
        session: Session = Depends(get_session),
    ) -> DeviceCredential:
        """解析任一有效设备凭证，拒绝被移除或不存在的设备。"""
        service = AccessService(session)
        for token in bearer_or_cookie_tokens(request):
            resolved = service.device_for_token(token)
            if resolved is not None:
                session.commit()
                return resolved
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="设备访问已移除或需要重新配对",
        )

    def daily_device(
        refrigerator_id: str,
        request: Request,
        session: Session = Depends(get_session),
    ) -> DeviceCredential:
        """按目标冰箱选择当前 PWA 的凭证，支持同一浏览器保存多台冰箱访问权。"""
        service = AccessService(session)
        has_valid_device = False
        for token in bearer_or_cookie_tokens(request):
            resolved = service.device_for_token(token, kind="pwa")
            if resolved is None:
                continue
            has_valid_device = True
            if resolved.refrigerator_id == refrigerator_id:
                session.commit()
                return resolved
        if has_valid_device:
            raise HTTPException(status_code=403, detail="该设备无权访问目标冰箱")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="设备访问已移除或需要重新配对",
        )

    def owner_or_device(
        request: Request,
        owner_session: Annotated[str | None, Cookie(alias=OWNER_COOKIE)] = None,
        session: Session = Depends(get_session),
    ) -> tuple[Literal["owner", "device"], str | DeviceCredential]:
        """解析 P6 日常录入可用的所有者或已配对设备身份。"""
        service = AccessService(session)
        owner = service.owner_for_session(owner_session) or configured_local_owner
        if owner is not None:
            return "owner", owner
        for token in bearer_or_cookie_tokens(request):
            paired_device = service.device_for_token(token)
            if paired_device is not None:
                session.commit()
                return "device", paired_device
        raise HTTPException(status_code=401, detail="需要所有者登录或已配对设备凭证")

    def reminder_recipient_key(
        request: Request,
        response: Response,
        session: Session = Depends(get_session),
    ) -> str:
        """Return a stable per-PWA reminder recipient key without persisting credentials.

        A paired PWA uses its device ID. Owner-only browser sessions use a digest of the
        HttpOnly session token; local development without such a session receives a new
        opaque HttpOnly browser key.
        """
        service = AccessService(session)
        for token in bearer_or_cookie_tokens(request):
            current = service.device_for_token(token)
            if current is not None:
                session.commit()
                return f"device:{current.id}"
        owner_token = request.cookies.get(OWNER_COOKIE)
        if owner_token:
            return f"owner:{sha256(owner_token.encode('utf-8')).hexdigest()}"
        local_key = request.cookies.get(REMINDER_RECIPIENT_COOKIE)
        if local_key:
            return f"local:{local_key}"
        local_key = secrets.token_urlsafe(24)
        response.set_cookie(
            REMINDER_RECIPIENT_COOKIE,
            local_key,
            httponly=True,
            secure=request.url.scheme == "https",
            samesite="lax",
            max_age=60 * 60 * 24 * 365,
        )
        return f"local:{local_key}"

    register_recipe_routes(
        application,
        RecipeRouteContext(
            session_factory=session_factory,
            transaction=transaction,
            owner_id=owner_id,
            recipe_service_factory=RecipeService,
        ),
    )

    register_owner_routes(
        application,
        OwnerRouteContext(
            session_factory=session_factory,
            transaction=transaction,
            owner_id=owner_id,
            owner_or_device=owner_or_device,
            recognition_provider=configured_recognition_provider,
            qr_recognition_provider=configured_qr_recognition_provider,
        ),
    )
    register_inventory_routes(
        application,
        InventoryRouteContext(
            session_factory=session_factory,
            transaction=transaction,
            owner_id=owner_id,
            device=device,
            icon_generation_provider=configured_icon_provider,
            persistent_icon_dir=configured_persistent_icon_dir,
            temporary_icon_dir=configured_temporary_icon_dir,
        ),
    )
    register_daily_access_routes(
        application,
        DailyAccessRouteContext(
            session_factory=session_factory,
            transaction=transaction,
            device=daily_device,
            icon_generation_provider=configured_icon_provider,
            persistent_icon_dir=configured_persistent_icon_dir,
            temporary_icon_dir=configured_temporary_icon_dir,
        ),
    )
    register_device_routes(
        application,
        DeviceRouteContext(
            session_factory=session_factory,
            transaction=transaction,
            owner_id=owner_id,
            device=device,
            bearer_or_cookie_tokens=bearer_or_cookie_tokens,
            reminder_recipient_key=reminder_recipient_key,
            public_request_base_url=public_request_base_url,
            clock=configured_clock,
        ),
    )

    @application.get(
        "/healthz",
        response_model=HealthResponse,
        summary="读取应用健康状态",
        responses={200: {"content": {"application/json": {"example": {"status": "ok"}}}}},
    )
    def healthz() -> HealthResponse:
        """返回不依赖数据库的固定进程存活响应。"""
        return HealthResponse(status="ok")

    @application.get("/api/auth/mode", response_model=AuthenticationModeResponse)
    def authentication_mode() -> AuthenticationModeResponse:
        """告诉 PWA 当前部署是否允许私有局域网免登录管理。"""
        return AuthenticationModeResponse(mode="local" if configured_local_owner else "sso")

    @application.post(
        "/api/auth/development-login",
        response_model=OwnerLoginResponse,
        summary="创建本地开发所有者会话",
        responses={200: {"content": {"application/json": {"example": {"owner_user_id": "42"}}}}},
    )
    def development_login(request: Request) -> Response:
        """仅在显式配置时创建开发会话，避免把模拟登录带入生产。"""
        if not configured_development_owner:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="本地登录未启用"
            )
        with transaction(session_factory) as session:
            token = AccessService(session).create_owner_session(configured_development_owner)
        response = Response(
            content=OwnerLoginResponse(
                owner_user_id=configured_development_owner
            ).model_dump_json(),
            media_type="application/json",
        )
        response.set_cookie(
            OWNER_COOKIE,
            token,
            httponly=True,
            secure=request.url.scheme == "https",
            samesite="lax",
            max_age=60 * 60 * 24 * 30,
        )
        return response

    @application.get("/api/auth/login", summary="跳转到 flycn 登录授权")
    def login(request: Request) -> RedirectResponse:
        """开始 flycn SSO 授权，并保存同源的扫码领取回跳地址。"""
        callback_base_url = public_request_base_url(request)
        if not configured_authorize_url or not callback_base_url:
            raise HTTPException(status_code=503, detail="flycn SSO 尚未配置")
        callback_url = f"{callback_base_url}/api/auth/callback"
        state = secrets.token_urlsafe(24)
        query = urlencode({"redirect_uri": callback_url, "state": state})
        response = RedirectResponse(f"{configured_authorize_url}?{query}")
        response.set_cookie(
            "fb_sso_state",
            state,
            httponly=True,
            secure=request.url.scheme == "https",
            samesite="lax",
            max_age=300,
        )
        return_to = request.query_params.get("return_to", "/")
        if return_to.startswith("/") and not return_to.startswith("//"):
            response.set_cookie(
                "fb_sso_return_to",
                return_to,
                httponly=True,
                secure=request.url.scheme == "https",
                samesite="lax",
                max_age=300,
            )
        return response

    @application.get("/api/auth/callback", summary="消费 flycn 单次授权码")
    def login_callback(code: str, state: str, request: Request) -> RedirectResponse:
        """通过 Docker 私网兑换 flycn 授权码并签发本地所有者会话。"""
        if not configured_exchange_url or not configured_secret:
            raise HTTPException(status_code=503, detail="flycn 授权码兑换未配置")
        if not secrets.compare_digest(state, request.cookies.get("fb_sso_state", "")):
            raise HTTPException(status_code=400, detail="flycn 授权状态不匹配")
        payload = json.dumps({"code": code}).encode("utf-8")
        exchange_request = UrlRequest(
            configured_exchange_url,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {configured_secret}",
            },
            method="POST",
        )
        try:
            with urlopen(exchange_request, timeout=5) as exchange_response:  # noqa: S310
                owner_user_id = str(json.loads(exchange_response.read())["user_id"])
        except HTTPError as exc:
            if exc.code == 401:
                raise HTTPException(
                    status_code=401, detail="flycn 授权码无效、过期或已使用"
                ) from exc
            raise HTTPException(status_code=502, detail="flycn SSO 服务暂时不可用") from exc
        except (KeyError, OSError, ValueError) as exc:
            raise HTTPException(status_code=401, detail="flycn 授权码无效") from exc
        with transaction(session_factory) as session:
            token = AccessService(session).create_owner_session(owner_user_id)
        return_to = request.cookies.get("fb_sso_return_to", "/")
        if not return_to.startswith("/") or return_to.startswith("//"):
            return_to = "/"
        response = RedirectResponse(return_to, status_code=status.HTTP_303_SEE_OTHER)
        response.set_cookie(
            OWNER_COOKIE,
            token,
            httponly=True,
            secure=request.url.scheme == "https",
            samesite="lax",
            max_age=60 * 60 * 24 * 30,
        )
        response.delete_cookie("fb_sso_state")
        response.delete_cookie("fb_sso_return_to")
        return response


    dist = frontend_dist or Path(__file__).resolve().parents[2] / "frontend" / "dist"
    assets = dist / "assets"
    if not dist.is_dir():
        return application
    if assets.is_dir():
        application.mount("/assets", StaticFiles(directory=assets), name="assets")

    @application.get("/fridge", include_in_schema=False)
    @application.get("/fridge/{page:path}", include_in_schema=False)
    @application.get("/k", include_in_schema=False)
    def kindle_qr_page(page: str = "") -> FileResponse:
        """提供所有 Kindle 页面共用的不依赖现代 JavaScript 的静态页面。"""
        return FileResponse(
            dist / "kindle.html",
            headers={"Cache-Control": "no-store, max-age=0"},
        )

    @application.middleware("http")
    async def pwa_fallback(
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        """将未知页面回退到 PWA，同时始终保留 API 的 JSON 404 语义。"""
        response = await call_next(request)
        if (
            response.status_code != 404
            or request.method not in {"GET", "HEAD"}
            or request.url.path.startswith("/api/")
        ):
            return response
        requested_file = (dist / request.url.path.lstrip("/")).resolve()
        if requested_file.is_relative_to(dist.resolve()) and requested_file.is_file():
            return FileResponse(requested_file)
        return FileResponse(dist / "index.html")

    return application


app = create_app(load_local_env=True)
