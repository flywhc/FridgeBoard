"""FridgeBoard 的 HTTP 入口与 P3 访问控制路由。

路由层负责 Cookie、SSO 回跳和请求校验；短效口令、设备凭证和
授权判断均委托给 ``AccessService``。应用使用同域 HttpOnly Cookie
保存不透明会话。避免把访问机密暴露给 PWA JavaScript。
本模块不创建数据库表，生产启动前必须执行 Alembic。
"""

from __future__ import annotations

import asyncio
import html
import json
import logging
import os
import re
import secrets
import time
from collections.abc import AsyncGenerator, AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from hashlib import sha256
from pathlib import Path
from typing import Annotated, Literal
from urllib.parse import urlencode, urlsplit, urlunsplit

import httpx
from fastapi import Cookie, Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.exception_handlers import (
    http_exception_handler,
    request_validation_exception_handler,
)
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import JSONResponse

from fridgeboard.api_models import (
    AuthenticationModeResponse,
    AuthenticationStatusResponse,
    HealthResponse,
    MobileAuthExchangeRequest,
    MobileRefreshRequest,
    MobileSessionResponse,
    OwnerLoginResponse,
)
from fridgeboard.auth import AccessService
from fridgeboard.category_match_routes import (
    DailyCategoryMatchContext,
    OwnerCategoryMatchContext,
    register_category_match_routes,
)
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
    CategoryRecognitionProvider,
    QrRecognitionProvider,
    RecognitionProvider,
    agnes_category_provider_from_environment,
    agnes_provider_from_environment,
    agnes_qr_provider_from_environment,
)

OWNER_COOKIE = "fb_owner_session"
DEVICE_COOKIE = "fb_device_credentials"
REMINDER_RECIPIENT_COOKIE = "fb_reminder_recipient"
logger = logging.getLogger(__name__)


def normalize_flycn_authorize_url(value: str | None) -> str | None:
    """Force the production flycn SSO entrypoint onto its public canonical host.

    The portal is also reachable through ``www.flycn.fyi`` and ``app.flycn.fyi``,
    but mobile SSO must start at ``flycn.fyi`` so the browser never presents a
    different portal host between the caller and the callback.
    """
    if not value:
        return value
    parsed = urlsplit(value)
    if parsed.hostname and parsed.hostname.lower().rstrip(".") in {
        "www.flycn.fyi",
        "app.flycn.fyi",
    }:
        return urlunsplit((parsed.scheme, "flycn.fyi", parsed.path, parsed.query, parsed.fragment))
    return value

_LOG_DETAIL_LIMIT = 2048
_SENSITIVE_LOG_VALUE = re.compile(
    r"(?i)(authorization|cookie|token|secret|password|api[_-]?key)\s*[:=]\s*([^\s,;]+)"
)


def _safe_log_detail(detail: object) -> str:
    """把 HTTP 错误详情限制长度并脱敏后写入日志。"""
    if isinstance(detail, (dict, list, tuple)):
        text = json.dumps(detail, ensure_ascii=False, default=str)
    else:
        text = str(detail)
    redacted = _SENSITIVE_LOG_VALUE.sub(r"\1=<redacted>", text)
    if len(redacted) > _LOG_DETAIL_LIMIT:
        return f"{redacted[:_LOG_DETAIL_LIMIT]}...[truncated]"
    return redacted


def _log_fingerprint(value: str | None) -> str:
    """Return a short stable fingerprint for correlating sensitive auth values."""
    if not value:
        return "-"
    return sha256(value.encode("utf-8")).hexdigest()[:12]


def _log_url(value: str | None) -> str:
    """Return a URL's scheme, host, and path without query parameters."""
    if not value:
        return "-"
    parsed = urlsplit(value)
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, "", ""))


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
    category_provider: CategoryRecognitionProvider | None = None,
    category_model_name: str | None = None,
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
        category_provider: 可注入的文本分类适配器；默认从部署环境构造。
        category_model_name: 注入文本分类适配器时对应的模型版本标识；使用默认
            Agnes 适配器时自动读取部署模型配置。
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
    configured_android_fingerprints = tuple(
        fingerprint.strip().upper()
        for fingerprint in (
            env_value("FRIDGEBOARD_ANDROID_SHA256_CERT_FINGERPRINTS", "") or ""
        ).split(",")
        if re.fullmatch(
            r"(?:[0-9A-F]{2}:){31}[0-9A-F]{2}", fingerprint.strip().upper()
        )
    )
    configured_ios_team_id = (env_value("FRIDGEBOARD_IOS_TEAM_ID", "") or "").strip()
    configured_development_owner = development_owner_user_id or env_value(
        "FRIDGEBOARD_DEVELOPMENT_OWNER_USER_ID"
    )
    configured_authorize_url = normalize_flycn_authorize_url(
        flycn_authorize_url or env_value("FRIDGEBOARD_FLYCN_AUTHORIZE_URL")
    )
    configured_exchange_url = flycn_exchange_url or env_value("FRIDGEBOARD_FLYCN_EXCHANGE_URL")
    configured_secret = flycn_client_secret or env_value("FRIDGEBOARD_FLYCN_CLIENT_SECRET")
    configured_local_owner = (
        local_owner_user_id or env_value("FRIDGEBOARD_LOCAL_OWNER_USER_ID") or ""
    ).strip() or None
    configured_recognition_provider = recognition_provider or agnes_provider_from_environment(
        env_value
    )
    configured_category_provider = category_provider or agnes_category_provider_from_environment(
        env_value
    )
    configured_category_model_name = category_model_name
    if (
        configured_category_model_name is None
        and category_provider is None
        and configured_category_provider is not None
    ):
        configured_category_model_name = env_value(
            "FRIDGEBOARD_AGNES_MODEL", "agnes-2.5-flash"
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

    def browser_auth_error_response(
        status_code: int,
        title: str,
        message: str,
    ) -> HTMLResponse:
        """为浏览器登录流程返回可操作的 HTML 错误页，而不是 JSON 源码。"""
        safe_title = html.escape(title)
        safe_message = html.escape(message)
        return HTMLResponse(
            content=f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{safe_title} - 家常食橱</title>
  <style>
    :root {{ color-scheme: light; font-family: Arial, "Helvetica Neue", sans-serif; }}
    body {{
      min-height: 100vh;
      box-sizing: border-box;
      margin: 0;
      display: grid;
      place-items: center;
      padding: 24px;
      background: #F2F2EE;
      color: #111111;
    }}
    main {{
      width: min(100%, 358px);
      box-sizing: border-box;
      padding: 32px 24px 24px;
      border: 2px solid #111111;
      border-radius: 10px;
      background: #FFFFFF;
    }}
    .brand {{
      margin: 0 0 24px;
      color: #777777;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: .16em;
    }}
    h1 {{ margin: 0 0 12px; font-size: 24px; }}
    p {{ margin: 0; font-size: 16px; line-height: 1.5; }}
    a {{
      min-height: 52px;
      box-sizing: border-box;
      display: grid;
      place-items: center;
      margin-top: 24px;
      border: 2px solid #111111;
      border-radius: 10px;
      background: #111111;
      color: #FFFFFF;
      font-size: 16px;
      font-weight: 700;
      text-decoration: none;
    }}
  </style>
</head>
<body>
  <main>
    <p class="brand">家常食橱</p>
    <h1>{safe_title}</h1>
    <p>{safe_message}</p>
    <a href="/">返回家常食橱</a>
  </main>
</body>
</html>""",
            status_code=status_code,
            headers={"Cache-Control": "no-store"},
        )

    engine = create_database_engine(configured_database_url)
    session_factory = create_session_factory(engine)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        """在接收请求前同步目录，并在单个进程中每天清理过期数据。"""
        # Alembic 已在生产入口完成表结构迁移；把目录同步放在应用生命周期内，
        # 避免仅导入模块或装配应用时访问尚未初始化的数据库。
        try:
            async with transaction(session_factory) as session:
                await ensure_builtin_catalog(session)
        except Exception:
            logger.exception("应用启动初始化失败")
            raise

        async def clean_daily() -> None:
            while True:
                try:
                    async with transaction(session_factory) as session:
                        await AccessService(session).purge_expired_refrigerators(
                            configured_clock(),
                            persistent_icon_dir=configured_persistent_icon_dir,
                            temporary_icon_dir=configured_temporary_icon_dir,
                        )
                        await IconService(
                            session,
                            configured_persistent_icon_dir,
                            configured_temporary_icon_dir,
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
            await engine.dispose()

    application = FastAPI(
        title="FridgeBoard API",
        version="0.3.0",
        description="FridgeBoard 的同域 API、PWA 静态资源与无账号设备配对入口。",
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["https://localhost", "capacitor://localhost"],
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With"],
        expose_headers=["Content-Type"],
    )
    application.state.database_engine = engine

    @application.exception_handler(StarletteHTTPException)
    async def log_http_exception(
        request: Request, exc: StarletteHTTPException
    ) -> Response:
        """记录所有 HTTP 错误响应，并复用 FastAPI 的原始响应处理。"""
        logger.error(
            "HTTP 错误 method=%s path=%s status=%s exception=%s detail=%r",
            request.method,
            request.url.path,
            exc.status_code,
            type(exc).__name__,
            _safe_log_detail(exc.detail),
        )
        if request.method == "GET" and request.url.path in {
            "/api/auth/login", "/api/auth/callback"
        }:
            return browser_auth_error_response(
                exc.status_code,
                "登录未完成",
                "登录链接已失效或登录服务暂时不可用，请返回家常食橱后重新登录。",
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
        if request.method == "GET" and request.url.path in {
            "/api/auth/login", "/api/auth/callback"
        }:
            return browser_auth_error_response(
                422,
                "登录请求无效",
                "登录请求不完整，请返回家常食橱后重新登录。",
            )
        return await request_validation_exception_handler(request, exc)

    @application.exception_handler(Exception)
    async def log_unhandled_exception(request: Request, exc: Exception) -> Response:
        """记录未处理异常及堆栈，并返回不暴露内部细节的 500 响应。"""
        logger.exception(
            "未处理后端异常 method=%s path=%s status=500 exception=%s",
            request.method,
            request.url.path,
            type(exc).__name__,
        )
        if request.method == "GET" and request.url.path in {
            "/api/auth/login", "/api/auth/callback"
        }:
            return browser_auth_error_response(
                500,
                "登录暂时不可用",
                "登录服务暂时不可用，请稍后返回家常食橱重试。",
            )
        return JSONResponse(status_code=500, content={"detail": "内部服务器错误"})

    @application.middleware("http")
    async def request_logging(
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        """记录请求方法、路径、状态和耗时，不把查询参数写入日志。"""
        started_at = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            logger.exception(
                "http_request_failed method=%s path=%s status=500 elapsed_ms=%.1f",
                request.method,
                request.url.path,
                (time.perf_counter() - started_at) * 1000,
            )
            raise
        logger.info(
            "http_request method=%s path=%s status=%s elapsed_ms=%.1f",
            request.method,
            request.url.path,
            response.status_code,
            (time.perf_counter() - started_at) * 1000,
        )
        return response

    async def get_session() -> AsyncGenerator[AsyncSession, None]:
        """为只读和依赖认证请求提供自动关闭的数据库会话。"""
        async with session_factory() as session:
            yield session

    async def owner_id(
        request: Request,
        owner_session: Annotated[str | None, Cookie(alias=OWNER_COOKIE)] = None,
        session: AsyncSession = Depends(get_session),
    ) -> str:
        """解析并要求有效所有者管理会话。"""
        owner = await AccessService(session).owner_for_session(owner_session)
        await session.rollback()
        if owner is not None:
            return owner
        scheme, _, bearer = request.headers.get("authorization", "").partition(" ")
        if scheme.lower() == "bearer" and bearer:
            owner = await AccessService(session).owner_for_mobile_access(bearer)
            await session.commit()
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

    def bearer_token(request: Request) -> str | None:
        """读取请求中的单个 App Bearer 令牌，不回退到 Cookie。"""
        scheme, _, bearer = request.headers.get("authorization", "").partition(" ")
        return bearer if scheme.lower() == "bearer" and bearer else None

    async def device(
        request: Request,
        session: AsyncSession = Depends(get_session),
    ) -> DeviceCredential:
        """解析任一有效设备凭证，拒绝被移除或不存在的设备。"""
        service = AccessService(session)
        for token in bearer_or_cookie_tokens(request):
            resolved = await service.device_for_token(token)
            if resolved is not None:
                await session.commit()
                return resolved
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="设备访问已移除或需要重新配对",
        )

    async def daily_device(
        refrigerator_id: str,
        request: Request,
        session: AsyncSession = Depends(get_session),
    ) -> DeviceCredential:
        """按目标冰箱选择当前 PWA 的凭证，支持同一浏览器保存多台冰箱访问权。"""
        service = AccessService(session)
        has_valid_device = False
        for token in bearer_or_cookie_tokens(request):
            resolved = await service.device_for_token(token, kind="pwa")
            if resolved is None:
                continue
            has_valid_device = True
            if resolved.refrigerator_id == refrigerator_id:
                await session.commit()
                return resolved
        if has_valid_device:
            raise HTTPException(status_code=403, detail="该设备无权访问目标冰箱")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="设备访问已移除或需要重新配对",
        )

    async def owner_or_device(
        request: Request,
        owner_session: Annotated[str | None, Cookie(alias=OWNER_COOKIE)] = None,
        session: AsyncSession = Depends(get_session),
    ) -> tuple[Literal["owner", "device"], str | DeviceCredential]:
        """解析 P6 日常录入可用的所有者或已配对设备身份。"""
        service = AccessService(session)
        owner = await service.owner_for_session(owner_session) or configured_local_owner
        if owner is not None:
            await session.rollback()
            return "owner", owner
        scheme, _, bearer = request.headers.get("authorization", "").partition(" ")
        if scheme.lower() == "bearer" and bearer:
            owner = await service.owner_for_mobile_access(bearer)
            if owner is not None:
                await session.commit()
                return "owner", owner
        for token in bearer_or_cookie_tokens(request):
            paired_device = await service.device_for_token(token)
            if paired_device is not None:
                await session.commit()
                return "device", paired_device
        raise HTTPException(status_code=401, detail="需要所有者登录或已配对设备凭证")

    async def reminder_recipient_key(
        request: Request,
        response: Response,
        session: AsyncSession = Depends(get_session),
    ) -> str:
        """Return a stable per-PWA reminder recipient key without persisting credentials.

        A paired PWA uses its device ID. Owner-only browser sessions use a digest of the
        HttpOnly session token; local development without such a session receives a new
        opaque HttpOnly browser key.
        """
        service = AccessService(session)
        for token in bearer_or_cookie_tokens(request):
            current = await service.device_for_token(token)
            if current is not None:
                await session.commit()
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
    register_category_match_routes(
        application,
        owner_context=OwnerCategoryMatchContext(
            session_factory=session_factory,
            transaction=transaction,
            owner_id=owner_id,
            category_provider=configured_category_provider,
            category_model_name=configured_category_model_name,
        ),
        daily_context=DailyCategoryMatchContext(
            session_factory=session_factory,
            transaction=transaction,
            device=daily_device,
            category_provider=configured_category_provider,
            category_model_name=configured_category_model_name,
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

    @application.get("/.well-known/assetlinks.json", include_in_schema=False)
    def android_app_links() -> JSONResponse:
        """返回 Android App Links 关联信息，不在未配置正式指纹时伪造签名关系。"""
        statements = (
            [{
                "relation": ["delegate_permission/common.handle_all_urls"],
                "target": {
                    "namespace": "android_app",
                    "package_name": "com.fridgeboard.app",
                    "sha256_cert_fingerprints": list(configured_android_fingerprints),
                },
            }]
            if configured_android_fingerprints
            else []
        )
        return JSONResponse(statements, headers={"Cache-Control": "public, max-age=300"})

    @application.get("/.well-known/apple-app-site-association", include_in_schema=False)
    def apple_universal_links() -> JSONResponse:
        """返回 iOS Universal Links 关联信息，Team ID 由部署环境注入。"""
        details = (
            [{
                "appIDs": [f"{configured_ios_team_id}.com.fridgeboard.app"],
                "components": [
                    {"/": "/pair"},
                ],
            }]
            if re.fullmatch(r"[A-Z0-9]{10}", configured_ios_team_id)
            else []
        )
        return JSONResponse(
            {"applinks": {"details": details}},
            headers={"Cache-Control": "public, max-age=300"},
        )

    @application.get("/api/auth/mode", response_model=AuthenticationModeResponse)
    def authentication_mode() -> AuthenticationModeResponse:
        """告诉 PWA 当前部署是否允许私有局域网免登录管理。"""
        return AuthenticationModeResponse(mode="local" if configured_local_owner else "sso")

    @application.get("/api/auth/status", response_model=AuthenticationStatusResponse)
    async def authentication_status(
        request: Request,
        owner_session: Annotated[str | None, Cookie(alias=OWNER_COOKIE)] = None,
        session: AsyncSession = Depends(get_session),
    ) -> AuthenticationStatusResponse:
        """返回当前请求是否已建立所有者会话，允许前端区分未登录空列表。"""
        service = AccessService(session)
        owner = await service.owner_for_session(owner_session)
        await session.rollback()
        if owner is None:
            scheme, _, bearer = request.headers.get("authorization", "").partition(" ")
            if scheme.lower() == "bearer" and bearer:
                owner = await service.owner_for_mobile_access(bearer)
                await session.commit()
                if owner is None and configured_local_owner is None:
                    raise HTTPException(status_code=401, detail="移动访问令牌已失效")
        return AuthenticationStatusResponse(
            authenticated=owner is not None or configured_local_owner is not None
        )

    def mobile_redirect_uri_is_allowed(request: Request, redirect_uri: str) -> bool:
        """只允许固定的 App 回调或当前公开站点回调，阻止开放重定向。"""
        expected = f"{public_request_base_url(request)}/mobile/auth/callback"
        parsed = urlsplit(redirect_uri)
        return (
            not parsed.query
            and not parsed.fragment
            and (
                redirect_uri == "fridgeboard://mobile/auth/callback"
                or (parsed.scheme == "https" and redirect_uri == expected)
            )
        )

    def mobile_callback_response(
        redirect_uri: str,
        mobile_code: str,
        mobile_state: str,
    ) -> RedirectResponse:
        """构造移动登录回调并清理浏览器侧临时 SSO Cookie。"""
        response = RedirectResponse(
            f"{redirect_uri}?{urlencode({'code': mobile_code, 'state': mobile_state})}",
            status_code=status.HTTP_303_SEE_OTHER,
        )
        response.delete_cookie("fb_sso_state")
        response.delete_cookie("fb_mobile_redirect_uri")
        response.delete_cookie("fb_mobile_state")
        response.delete_cookie("fb_mobile_code_challenge")
        return response

    @application.post(
        "/api/auth/development-login",
        response_model=OwnerLoginResponse,
        summary="创建本地开发所有者会话",
        responses={200: {"content": {"application/json": {"example": {"owner_user_id": "42"}}}}},
    )
    async def development_login(request: Request) -> Response:
        """仅在显式配置时创建开发会话，避免把模拟登录带入生产。"""
        if not configured_development_owner:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="本地登录未启用"
            )
        async with transaction(session_factory) as session:
            token = await AccessService(session).create_owner_session(
                configured_development_owner
            )
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
    def login(
        request: Request,
        client: str | None = None,
        redirect_uri: str | None = None,
        state: str | None = None,
        code_challenge: str | None = None,
        prompt: str | None = None,
    ) -> Response:
        """开始 PWA 或 Capacitor App 的 flycn SSO 授权。"""
        callback_base_url = public_request_base_url(request)
        if not configured_authorize_url or not callback_base_url:
            return browser_auth_error_response(
                503,
                "登录暂时不可用",
                "登录服务尚未准备好，请稍后重试。",
            )
        mobile_login = client == "mobile"
        if (prompt is not None and (not mobile_login or prompt != "login")) or (mobile_login and (
            redirect_uri is None
            or state is None
            or code_challenge is None
            or len(state) < 16
            or len(state) > 256
            or len(code_challenge) < 43
            or len(code_challenge) > 128
            or not mobile_redirect_uri_is_allowed(request, redirect_uri)
        )):
            logger.warning(
                "auth_sso_start_rejected method=%s path=%s flow=%s prompt=%s redirect=%s state=%s",
                request.method,
                request.url.path,
                "mobile" if mobile_login else "browser",
                prompt or "-",
                _log_url(redirect_uri),
                _log_fingerprint(state),
            )
            return browser_auth_error_response(
                400,
                "登录请求无效",
                "这次登录请求已失效，请返回家常食橱后重新登录。",
            )
        callback_url = f"{callback_base_url}/api/auth/callback"
        sso_state = secrets.token_urlsafe(24)
        logger.info(
            "auth_sso_start method=%s path=%s flow=%s prompt=%s authorize=%s callback=%s "
            "app_state=%s sso_state=%s",
            request.method,
            request.url.path,
            "mobile" if mobile_login else "browser",
            prompt or "-",
            _log_url(configured_authorize_url),
            _log_url(callback_url),
            _log_fingerprint(state),
            _log_fingerprint(sso_state),
        )
        authorize_query = {"redirect_uri": callback_url, "state": sso_state}
        if prompt == "login":
            authorize_query["prompt"] = prompt
        query = urlencode(authorize_query)
        response = RedirectResponse(f"{configured_authorize_url}?{query}")
        response.set_cookie(
            "fb_sso_state",
            sso_state,
            httponly=True,
            secure=request.url.scheme == "https",
            samesite="lax",
            max_age=300,
        )
        if mobile_login:
            response.set_cookie(
                "fb_mobile_redirect_uri",
                redirect_uri,
                httponly=True,
                secure=request.url.scheme == "https",
                samesite="lax",
                max_age=300,
            )
            response.set_cookie(
                "fb_mobile_state",
                state,
                httponly=True,
                secure=request.url.scheme == "https",
                samesite="lax",
                max_age=300,
            )
            response.set_cookie(
                "fb_mobile_code_challenge",
                code_challenge,
                httponly=True,
                secure=request.url.scheme == "https",
                samesite="lax",
                max_age=300,
            )
            return response
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
    async def login_callback(code: str, state: str, request: Request) -> Response:
        """异步通过 Docker 私网兑换 flycn 授权码并签发本地所有者会话。"""
        started_at = time.perf_counter()
        expected_state = request.cookies.get("fb_sso_state", "")
        logger.info(
            "auth_sso_callback_start method=%s path=%s code=%s state=%s "
            "expected_state=%s mobile_cookie=%s",
            request.method,
            request.url.path,
            _log_fingerprint(code),
            _log_fingerprint(state),
            _log_fingerprint(expected_state),
            bool(request.cookies.get("fb_mobile_state")),
        )
        async with transaction(session_factory) as session:
            replay = await AccessService(session).find_mobile_sso_replay(code, state)
        if replay is not None:
            async with transaction(session_factory) as session:
                mobile_code = await AccessService(session).create_mobile_authorization_code(
                    replay.owner_user_id,
                    replay.redirect_uri,
                    replay.code_challenge,
                    mobile_state=replay.mobile_state,
                )
            logger.info(
                "auth_sso_callback_replay code=%s app_state=%s redirect=%s elapsed_ms=%.1f",
                _log_fingerprint(code),
                _log_fingerprint(replay.mobile_state),
                _log_url(replay.redirect_uri),
                (time.perf_counter() - started_at) * 1000,
            )
            return mobile_callback_response(
                replay.redirect_uri,
                mobile_code,
                replay.mobile_state or state,
            )
        if not configured_exchange_url or not configured_secret:
            return browser_auth_error_response(
                503,
                "登录暂时不可用",
                "登录服务尚未准备好，请稍后重试。",
            )
        if not secrets.compare_digest(state, expected_state):
            logger.warning(
                "auth_sso_callback_state_mismatch code=%s state=%s expected_state=%s "
                "elapsed_ms=%.1f",
                _log_fingerprint(code),
                _log_fingerprint(state),
                _log_fingerprint(expected_state),
                (time.perf_counter() - started_at) * 1000,
            )
            return browser_auth_error_response(
                400,
                "登录请求已失效",
                "登录请求与当前会话不匹配，请返回家常食橱后重新登录。",
            )
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                exchange_response = await client.post(
                    configured_exchange_url,
                    json={"code": code},
                    headers={"Authorization": f"Bearer {configured_secret}"},
                )
                exchange_response.raise_for_status()
                owner_user_id = str(exchange_response.json()["user_id"])
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 401:
                logger.exception(
                    "auth_sso_callback_exchange_rejected code=%s upstream=%s status=%s "
                    "content_type=%s content_length=%s elapsed_ms=%.1f",
                    _log_fingerprint(code),
                    _log_url(configured_exchange_url),
                    exc.response.status_code,
                    exc.response.headers.get("content-type", "-"),
                    len(exc.response.content),
                    (time.perf_counter() - started_at) * 1000,
                )
                return browser_auth_error_response(
                    401,
                    "登录未完成",
                    "登录链接已失效或已被重复使用，请返回家常食橱后重新登录。",
                )
            logger.exception(
                "auth_sso_callback_exchange_http_error code=%s upstream=%s status=%s "
                "content_type=%s content_length=%s elapsed_ms=%.1f",
                _log_fingerprint(code),
                _log_url(configured_exchange_url),
                exc.response.status_code,
                exc.response.headers.get("content-type", "-"),
                len(exc.response.content),
                (time.perf_counter() - started_at) * 1000,
            )
            return browser_auth_error_response(
                502,
                "登录暂时不可用",
                "登录服务暂时不可用，请稍后重试。",
            )
        except httpx.HTTPError as exc:
            logger.exception(
                "auth_sso_callback_exchange_network_error code=%s upstream=%s exception=%s "
                "elapsed_ms=%.1f",
                _log_fingerprint(code),
                _log_url(configured_exchange_url),
                type(exc).__name__,
                (time.perf_counter() - started_at) * 1000,
            )
            return browser_auth_error_response(
                502,
                "登录暂时不可用",
                "登录服务暂时不可用，请检查网络后重试。",
            )
        except (KeyError, ValueError) as exc:
            logger.exception(
                "auth_sso_callback_exchange_parse_error code=%s upstream=%s exception=%s "
                "elapsed_ms=%.1f",
                _log_fingerprint(code),
                _log_url(configured_exchange_url),
                type(exc).__name__,
                (time.perf_counter() - started_at) * 1000,
            )
            return browser_auth_error_response(
                401,
                "登录未完成",
                "登录服务返回了无效结果，请返回家常食橱后重新登录。",
            )
        async with transaction(session_factory) as session:
            mobile_redirect_uri = request.cookies.get("fb_mobile_redirect_uri")
            mobile_state = request.cookies.get("fb_mobile_state")
            mobile_challenge = request.cookies.get("fb_mobile_code_challenge")
            if (
                mobile_redirect_uri
                and mobile_state
                and mobile_challenge
                and mobile_redirect_uri_is_allowed(request, mobile_redirect_uri)
            ):
                mobile_code = await AccessService(session).create_mobile_authorization_code(
                    owner_user_id,
                    mobile_redirect_uri,
                    mobile_challenge,
                    sso_code=code,
                    sso_state=state,
                    mobile_state=mobile_state,
                )
            else:
                mobile_code = None
            token = (
                None
                if mobile_code is not None
                else await AccessService(session).create_owner_session(owner_user_id)
            )
        if mobile_redirect_uri and mobile_state and mobile_code:
            logger.info(
                "auth_sso_callback_success flow=mobile code=%s app_state=%s mobile_code=%s "
                "redirect=%s elapsed_ms=%.1f",
                _log_fingerprint(code),
                _log_fingerprint(mobile_state),
                _log_fingerprint(mobile_code),
                _log_url(mobile_redirect_uri),
                (time.perf_counter() - started_at) * 1000,
            )
            return mobile_callback_response(mobile_redirect_uri, mobile_code, mobile_state)
        return_to = request.cookies.get("fb_sso_return_to", "/")
        if not return_to.startswith("/") or return_to.startswith("//"):
            return_to = "/"
        logger.info(
            "auth_sso_callback_success flow=browser code=%s redirect=%s elapsed_ms=%.1f",
            _log_fingerprint(code),
            _log_url(return_to),
            (time.perf_counter() - started_at) * 1000,
        )
        response = RedirectResponse(return_to, status_code=status.HTTP_303_SEE_OTHER)
        assert token is not None
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

    @application.post(
        "/api/auth/mobile/exchange",
        response_model=MobileSessionResponse,
        summary="交换 Capacitor App 一次性授权码",
    )
    async def mobile_exchange(payload: MobileAuthExchangeRequest) -> MobileSessionResponse:
        """验证 PKCE 并消费一次性移动授权码。"""
        started_at = time.perf_counter()
        async with transaction(session_factory) as session:
            tokens = await AccessService(session).exchange_mobile_authorization_code(
                payload.code,
                payload.code_verifier,
                payload.redirect_uri,
            )
            if tokens is None:
                logger.warning(
                    "auth_mobile_exchange_rejected code=%s redirect=%s elapsed_ms=%.1f",
                    _log_fingerprint(payload.code),
                    _log_url(payload.redirect_uri),
                    (time.perf_counter() - started_at) * 1000,
                )
                raise HTTPException(status_code=400, detail="移动授权码无效、过期或已使用")
        access_token, refresh_token = tokens
        logger.info(
            "auth_mobile_exchange_success code=%s redirect=%s elapsed_ms=%.1f",
            _log_fingerprint(payload.code),
            _log_url(payload.redirect_uri),
            (time.perf_counter() - started_at) * 1000,
        )
        return MobileSessionResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=15 * 60,
        )

    @application.post(
        "/api/auth/mobile/refresh",
        response_model=MobileSessionResponse,
        summary="轮换 Capacitor App 刷新令牌",
    )
    async def mobile_refresh(payload: MobileRefreshRequest) -> MobileSessionResponse:
        """单次消费刷新令牌并签发新访问/刷新令牌。"""
        started_at = time.perf_counter()
        async with transaction(session_factory) as session:
            tokens = await AccessService(session).rotate_mobile_refresh_token(
                payload.refresh_token
            )
            if tokens is None:
                logger.warning(
                    "auth_mobile_refresh_rejected refresh=%s elapsed_ms=%.1f",
                    _log_fingerprint(payload.refresh_token),
                    (time.perf_counter() - started_at) * 1000,
                )
                raise HTTPException(status_code=401, detail="移动会话已失效，请重新登录")
        access_token, refresh_token = tokens
        logger.info(
            "auth_mobile_refresh_success refresh=%s elapsed_ms=%.1f",
            _log_fingerprint(payload.refresh_token),
            (time.perf_counter() - started_at) * 1000,
        )
        return MobileSessionResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=15 * 60,
        )

    @application.post(
        "/api/auth/mobile/logout",
        status_code=status.HTTP_204_NO_CONTENT,
        summary="撤销当前 Capacitor App 会话",
    )
    async def mobile_logout(request: Request) -> Response:
        """撤销当前 App Bearer 会话，令牌本身不写入日志或响应。"""
        token = bearer_token(request)
        async with transaction(session_factory) as session:
            await AccessService(session).revoke_mobile_access(token)
        return Response(status_code=status.HTTP_204_NO_CONTENT)


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
            headers = (
                {"Cache-Control": "no-store, max-age=0"}
                if requested_file.name in {"index.html", "sw.js"}
                else None
            )
            return FileResponse(requested_file, headers=headers)
        return FileResponse(
            dist / "index.html",
            headers={"Cache-Control": "no-store, max-age=0"},
        )

    return application


app = create_app(load_local_env=True)
