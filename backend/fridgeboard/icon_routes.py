"""图标资产、草稿和候选图标 HTTP 路由。"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import TYPE_CHECKING
from urllib.parse import quote

import anyio
from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fridgeboard.api_models import (
    FoodCategoryResponse,
    IconCandidateConfirmRequest,
    IconCandidateCreateRequest,
    IconCandidateResponse,
    IconDraftConfirmRequest,
    IconDraftCreateRequest,
    IconDraftResponse,
    IconDraftVariantRequest,
    IconGenerationResponse,
    IconImportRequest,
    IconKeywordRequest,
    IconKeywordResponse,
    IconModelResponse,
    IconResponse,
    IconSearchResponse,
    IconVariantResponse,
)
from fridgeboard.http_support import category_response_for
from fridgeboard.icon_generation_stream import stream_icon_generation
from fridgeboard.icon_route_helpers import read_icon_upload
from fridgeboard.icon_service import (
    IconService,
    generate_icon_images,
    provider_item_metadata,
    search_online_icons,
)
from fridgeboard.icon_service import (
    download_provider_item as icon_service_download,
)
from fridgeboard.inventory_service import CategoryOwnershipError
from fridgeboard.item_catalog import (
    PUBLIC_ICON_CACHE_HEADERS,
    asset_revision,
    builtin_icon_variant_urls,
    builtin_icon_variants,
)
from fridgeboard.persistence.database import database_pool_snapshot
from fridgeboard.persistence.models import (
    DeviceCredential,
    FoodCategory,
    IconAsset,
    IconDraft,
    IconDraftVariant,
)
from fridgeboard.route_auth import (
    require_active_device_refrigerator as _require_active_device_refrigerator,
)
from fridgeboard.route_auth import (
    require_owned_refrigerator as _require_owned_refrigerator,
)
from fridgeboard.sse import sse_event

if TYPE_CHECKING:
    from fridgeboard.inventory_routes import InventoryRouteContext

logger = logging.getLogger(__name__)


def _log_icon_exception(
    operation: str,
    method: str,
    path: str,
    status_code: int,
    exc: Exception,
) -> None:
    """记录图标操作异常的完整服务端上下文，同时限制异常摘要长度。

    Args:
        operation: 发生异常的业务操作名。
        method: 对外 HTTP 方法。
        path: 不含查询参数的请求路径。
        status_code: 将返回给客户端的 HTTP 状态码。
        exc: 原始异常；`logger.exception` 会保留完整异常链和堆栈。
    """
    detail = getattr(exc, "detail", str(exc))
    logger.exception(
        "图标操作异常 method=%s path=%s status=%s operation=%s exception=%s detail=%s",
        method,
        path,
        status_code,
        operation,
        type(exc).__name__,
        str(detail)[:500],
    )


async def _icon_generation_sse(
    operation: Callable[[], Awaitable[object]],
    request_path: str,
    pool_snapshot: Callable[[], object] | None = None,
) -> AsyncIterator[str]:
    """以 SSE 保持异步图标生成请求可见，并在长耗时期间发送状态心跳。"""
    task = asyncio.create_task(operation())
    started_at = time.monotonic()
    yield sse_event("status", {"message": "正在生成图标候选…", "text_length": 0})
    try:
        while not task.done():
            try:
                await asyncio.wait_for(asyncio.shield(task), timeout=10)
            except TimeoutError:
                yield sse_event("status", {"message": "图标仍在生成，请稍候…", "text_length": 0})
        result = task.result()
        payload = result.model_dump(mode="json", exclude_none=False)
        yield sse_event("result", payload)
        yield sse_event("done", {"text_length": 0})
        logger.info(
            "图标生成 SSE 完成 operation=icon_generation elapsed_ms=%.1f",
            (time.monotonic() - started_at) * 1000,
        )
    except asyncio.CancelledError:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError, Exception):
            await task
        raise
    except Exception as exc:
        status_code = exc.status_code if isinstance(exc, HTTPException) else 500
        _log_icon_exception(
            "icon_generation_sse",
            "POST",
            request_path,
            status_code,
            exc,
        )
        logger.error(
            "图标生成 SSE 失败 operation=icon_generation elapsed_ms=%.1f pool=%s",
            (time.monotonic() - started_at) * 1000,
            pool_snapshot() if pool_snapshot is not None else None,
        )
        message = (
            str(exc)
            if isinstance(exc, (HTTPException, ValueError, RuntimeError))
            else "图标生成暂时不可用，请稍后重试。"
        )
        if isinstance(exc, HTTPException):
            message = str(exc.detail)
        yield sse_event("error", {"message": message})


async def _icon_response(
    item: IconAsset, service: IconService, refrigerator_id: str, base_url: str
) -> IconResponse | None:
    """构造包含主题变体和媒体修订号的图标响应。"""
    try:
        path, _, _, _ = await service.asset_variant_path(
            refrigerator_id, item.key, item.fallback_theme
        )
    except ValueError:
        logger.warning("图标资源缺失，跳过损坏记录 operation=icon_catalog icon_key=%s", item.key)
        return None
    variants: dict[str, object] = {}
    if item.source == "builtin":
        variants = builtin_icon_variant_urls(item.key, base_url)
    else:
        for variant in await service.variant_records(item.key):
            variant_path = service._safe_path(service._persistent_dir, variant.storage_path)
            if not await anyio.Path(variant_path).is_file():
                continue
            variants[variant.theme_key] = {
                "asset_url": f"{base_url}?theme={variant.theme_key}&v={variant.revision}",
                "media_type": variant.media_type,
                "source": variant.source,
                "source_url": variant.source_url,
                "attribution": variant.attribution,
            }
    return IconResponse(
        key=item.key,
        label=item.label,
        asset_url=(
            f"{base_url}.svg?v={asset_revision(path)}"
            if item.source == "builtin"
            else f"{base_url}?v={asset_revision(path)}"
        ),
        media_type=item.media_type,
        variants=variants,
        fallback_theme=item.fallback_theme,
    )


async def _draft_response(draft: IconDraft, service: IconService) -> IconDraftResponse:
    """构造草稿状态响应，避免暴露临时文件路径。"""
    variants: dict[str, IconVariantResponse] = {}
    for variant in await service._session.scalars(
        select(IconDraftVariant).where(IconDraftVariant.draft_id == draft.id)
    ):
        variants[variant.theme_key] = IconVariantResponse(
            asset_url=f"/api/owner/refrigerators/{draft.refrigerator_id}/icon-drafts/{draft.id}/variants/{variant.theme_key}",
            media_type=variant.media_type,
            source=variant.source,
            source_id=variant.source_id,
            source_url=variant.source_url,
            attribution=variant.attribution,
        )
    return IconDraftResponse(
        id=draft.id,
        category_id=draft.category_id,
        parent_id=draft.parent_id,
        name=draft.name,
        fallback_theme=draft.fallback_theme,
        version=draft.base_version,
        variants=variants,
    )


def register_icon_routes(application: FastAPI, context: InventoryRouteContext) -> None:
    """向应用注册图标资产、草稿和候选图标路由。

    Args:
        application: 要追加路由的 FastAPI 应用实例。
        context: 路由运行所需的会话、事务和图标服务依赖。
    """

    def icon_service(session: AsyncSession) -> IconService:
        """构造共享当前路由配置的图标服务。"""
        return IconService(
            session,
            context.persistent_icon_dir,
            context.temporary_icon_dir,
        )

    thiings_catalog_cache_path = context.persistent_icon_dir / "thiings-catalog-cache.json"

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/icons",
        response_model=list[IconResponse],
    )
    async def icons(
        refrigerator_id: str, current_owner: str = Depends(context.owner_id)
    ) -> list[IconResponse]:
        """返回内置 SVG 和当前柜体已确认的透明 PNG 图标。"""
        async with context.transaction(context.session_factory) as session:
            await _require_owned_refrigerator(session, refrigerator_id, current_owner)
            service = icon_service(session)
            responses = []
            for item in await service.assets(refrigerator_id):
                base_url = (
                    f"/api/icon-library/{item.key}"
                    if item.source == "builtin"
                    else f"/api/owner/refrigerators/{refrigerator_id}/icons/{item.key}"
                )
                response = await _icon_response(item, service, refrigerator_id, base_url)
                if response is not None:
                    responses.append(response)
            return responses

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/icons/{icon_key}",
        response_class=FileResponse,
    )
    async def scoped_icon_asset(
        refrigerator_id: str,
        icon_key: str,
        theme: str = Query(default="ink"),
        current_owner: str = Depends(context.owner_id),
    ) -> FileResponse:
        """按资产记录媒体类型返回当前柜体可访问的图标文件。"""
        try:
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(session, refrigerator_id, current_owner)
                variant = builtin_icon_variants(icon_key).get(theme)
                if variant is not None:
                    path, media_type = variant
                    return FileResponse(
                        path,
                        media_type=media_type,
                        headers=PUBLIC_ICON_CACHE_HEADERS,
                    )
                path, media_type, _, _ = await icon_service(session).asset_variant_path(
                    refrigerator_id, icon_key, theme
                )
                return FileResponse(path, media_type=media_type)
        except ValueError as exc:
            _log_icon_exception(
                "icon_asset_read",
                "GET",
                f"/api/owner/refrigerators/{refrigerator_id}/icons/{icon_key}",
                404,
                exc,
            )
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/icon-search",
        response_model=IconSearchResponse,
    )
    async def icon_search(
        refrigerator_id: str,
        provider: str = Query(pattern="^(iconify|thiings)$"),
        query: str = Query(min_length=1, max_length=120),
        current_owner: str = Depends(context.owner_id),
    ) -> IconSearchResponse:
        """搜索指定主题的公开图标目录。"""
        async with context.transaction(context.session_factory) as session:
            await _require_owned_refrigerator(session, refrigerator_id, current_owner)
        try:
            search_kwargs = (
                {"cache_path": thiings_catalog_cache_path} if provider == "thiings" else {}
            )
            results = await search_online_icons(provider, query, **search_kwargs)
            preview_base = (
                f"/api/owner/refrigerators/{refrigerator_id}/icon-preview"
                f"?provider={provider}&item_id="
            )
            for result in results:
                item_id = result.get("id")
                if isinstance(item_id, str):
                    result["preview_url"] = f"{preview_base}{quote(item_id, safe='')}"
            return IconSearchResponse(
                provider=provider,
                results=results,
            )
        except ValueError as exc:
            _log_icon_exception(
                "icon_search",
                "GET",
                f"/api/owner/refrigerators/{refrigerator_id}/icon-search",
                400,
                exc,
            )
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            _log_icon_exception(
                "icon_search",
                "GET",
                f"/api/owner/refrigerators/{refrigerator_id}/icon-search",
                503,
                exc,
            )
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/icon-preview",
        response_class=Response,
    )
    async def icon_preview(
        refrigerator_id: str,
        provider: str = Query(pattern="^(iconify|thiings)$"),
        item_id: str = Query(min_length=1, max_length=200),
        current_owner: str = Depends(context.owner_id),
    ) -> Response:
        """返回经 provider 校验和清洗的同源在线图标预览。"""
        try:
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(session, refrigerator_id, current_owner)
            download_kwargs = (
                {"cache_path": thiings_catalog_cache_path} if provider == "thiings" else {}
            )
            content, media_type, _ = await icon_service_download(
                provider, item_id, **download_kwargs
            )
            return Response(
                content=content,
                media_type=media_type,
                headers={"Cache-Control": "private, max-age=300"},
            )
        except ValueError as exc:
            _log_icon_exception(
                "icon_preview",
                "GET",
                f"/api/owner/refrigerators/{refrigerator_id}/icon-preview",
                400,
                exc,
            )
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            _log_icon_exception(
                "icon_preview",
                "GET",
                f"/api/owner/refrigerators/{refrigerator_id}/icon-preview",
                503,
                exc,
            )
            raise HTTPException(status_code=503, detail="在线图标预览暂时不可用") from exc

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/icon-keywords",
        response_model=IconKeywordResponse,
    )
    async def icon_keywords(
        refrigerator_id: str,
        payload: IconKeywordRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> IconKeywordResponse:
        """返回可编辑的英文图标搜索关键词。"""
        async with context.transaction(context.session_factory) as session:
            await _require_owned_refrigerator(session, refrigerator_id, current_owner)
        if context.icon_keyword_provider is not None:
            try:
                keywords = await context.icon_keyword_provider(payload.subcategory_name.strip())
                return IconKeywordResponse(keywords=keywords[:6])
            except Exception as exc:
                _log_icon_exception(
                    "icon_keywords",
                    "POST",
                    f"/api/owner/refrigerators/{refrigerator_id}/icon-keywords",
                    503,
                    exc,
                )
                raise HTTPException(
                    status_code=503, detail="图标关键词生成暂时不可用，请稍后重试"
                ) from exc
        common = {
            "牛奶": ["milk", "dairy", "milk carton"],
            "鸡蛋": ["egg", "eggs", "egg carton"],
            "苹果": ["apple", "fruit", "red apple"],
            "蔬菜": ["vegetable", "fresh produce", "greens"],
        }
        keywords = common.get(payload.subcategory_name.strip(), [])
        return IconKeywordResponse(keywords=[item for item in keywords if item][:6])

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/icon-models",
        response_model=list[IconModelResponse],
    )
    async def icon_models(
        refrigerator_id: str,
        current_owner: str = Depends(context.owner_id),
    ) -> list[IconModelResponse]:
        """返回当前部署可用的图标模型及其输出能力。"""
        async with context.transaction(context.session_factory) as session:
            await _require_owned_refrigerator(session, refrigerator_id, current_owner)
        models: list[IconModelResponse] = []
        if context.ink_icon_generation_provider is not None:
            models.append(IconModelResponse(id="agnes", label="Agnes AI", capabilities=["svg"]))
        if context.icon_generation_provider is not None:
            existing = next((item for item in models if item.id == "agnes"), None)
            if existing is not None:
                existing.capabilities.append("image")
            else:
                models.append(
                    IconModelResponse(id="agnes", label="Agnes AI", capabilities=["image"])
                )
        return models

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/categories/{category_id}/icon-variants/import",
        response_model=IconVariantResponse,
    )
    async def import_icon_variant(
        refrigerator_id: str,
        category_id: str,
        payload: IconImportRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> IconVariantResponse:
        """通过可信 provider item ID 导入一个主题图标。"""
        try:
            async with context.session_factory() as session:
                await _require_owned_refrigerator(session, refrigerator_id, current_owner, 400)
                category = await session.get(FoodCategory, category_id)
                if (
                    category is None
                    or category.refrigerator_id != refrigerator_id
                    or not category.is_custom
                ):
                    raise ValueError("系统小类不可修改")
                if category.created_by_user_id != current_owner:
                    raise CategoryOwnershipError("只有小类创建者可以编辑或删除该小类")
                expected_revision = category.revision
            download_kwargs = (
                {"cache_path": thiings_catalog_cache_path} if payload.provider == "thiings" else {}
            )
            content, media_type, source_url = await icon_service_download(
                payload.provider, payload.item_id, **download_kwargs
            )
            metadata = provider_item_metadata(payload.provider, payload.item_id)
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(session, refrigerator_id, current_owner, 400)
                category = await session.get(FoodCategory, category_id)
                if category is None or category.revision != expected_revision:
                    raise ValueError("小类已被其他请求修改，请重新打开编辑页")
                if category.created_by_user_id != current_owner:
                    raise CategoryOwnershipError("只有小类创建者可以编辑或删除该小类")
                service = icon_service(session)
                private_key = await service.copy_on_write(refrigerator_id, category_id)
                category.icon_key = private_key
                variant = await service.add_variant(
                    refrigerator_id,
                    private_key,
                    payload.theme_key,
                    content,
                    media_type,
                    payload.provider,
                    source_id=payload.item_id,
                    source_url=source_url,
                    license_spdx=metadata["license_spdx"],
                    license_url=metadata["license_url"],
                    attribution=metadata["attribution"],
                )
                return IconVariantResponse(
                    asset_url=(
                        f"/api/owner/refrigerators/{refrigerator_id}/icons/{private_key}"
                        f"?theme={payload.theme_key}&v={variant.revision}"
                    ),
                    media_type=variant.media_type,
                    source=variant.source,
                    source_id=variant.source_id,
                    source_url=variant.source_url,
                )
        except CategoryOwnershipError as exc:
            _log_icon_exception(
                "icon_variant_import",
                "POST",
                f"/api/owner/refrigerators/{refrigerator_id}/categories/{category_id}/icon-variants/import",
                403,
                exc,
            )
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        except ValueError as exc:
            _log_icon_exception(
                "icon_variant_import",
                "POST",
                f"/api/owner/refrigerators/{refrigerator_id}/categories/{category_id}/icon-variants/import",
                400,
                exc,
            )
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/categories/{category_id}/icon-variants",
        response_model=IconVariantResponse,
    )
    async def upload_icon_variant(
        refrigerator_id: str,
        category_id: str,
        request: Request,
        theme_key: str = Query(pattern="^(ink|skeuomorphic|cartoon)$"),
        current_owner: str = Depends(context.owner_id),
    ) -> IconVariantResponse:
        """上传一个自定义小类的主题图标，系统小类不会暴露替换入口。"""
        try:
            async with context.session_factory() as session:
                await _require_owned_refrigerator(session, refrigerator_id, current_owner, 400)
                category = await session.get(FoodCategory, category_id)
                if (
                    category is None
                    or category.refrigerator_id != refrigerator_id
                    or not category.is_custom
                ):
                    raise ValueError("系统小类不可修改")
                if category.created_by_user_id != current_owner:
                    raise CategoryOwnershipError("只有小类创建者可以编辑或删除该小类")
                expected_revision = category.revision
            content = await read_icon_upload(request)
            media_type = request.headers.get("content-type", "").split(";", 1)[0].lower()
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(session, refrigerator_id, current_owner, 400)
                category = await session.get(FoodCategory, category_id)
                if category is None or category.revision != expected_revision:
                    raise ValueError("小类已被其他请求修改，请重新打开编辑页")
                if category.created_by_user_id != current_owner:
                    raise CategoryOwnershipError("只有小类创建者可以编辑或删除该小类")
                service = icon_service(session)
                private_key = await service.copy_on_write(refrigerator_id, category_id)
                category.icon_key = private_key
                variant = await service.add_variant(
                    refrigerator_id, private_key, theme_key, content, media_type
                )
                return IconVariantResponse(
                    asset_url=(
                        f"/api/owner/refrigerators/{refrigerator_id}/icons/{private_key}"
                        f"?theme={theme_key}&v={variant.revision}"
                    ),
                    media_type=variant.media_type,
                    source=variant.source,
                    source_id=variant.source_id,
                    source_url=variant.source_url,
                )
        except CategoryOwnershipError as exc:
            _log_icon_exception(
                "icon_variant_upload",
                "POST",
                f"/api/owner/refrigerators/{refrigerator_id}/categories/{category_id}/icon-variants",
                403,
                exc,
            )
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        except ValueError as exc:
            _log_icon_exception(
                "icon_variant_upload",
                "POST",
                f"/api/owner/refrigerators/{refrigerator_id}/categories/{category_id}/icon-variants",
                400,
                exc,
            )
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/icon-drafts",
        response_model=IconDraftResponse,
        status_code=201,
    )
    async def create_icon_draft(
        refrigerator_id: str,
        payload: IconDraftCreateRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> IconDraftResponse:
        """创建新建或编辑小类的原子图标草稿，并预载已有主题变体。"""
        try:
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                category = None
                if payload.category_id:
                    category = await session.get(FoodCategory, payload.category_id)
                    if (
                        category is None
                        or category.refrigerator_id != refrigerator_id
                        or not category.is_custom
                    ):
                        raise ValueError("系统小类不可修改")
                    if category.created_by_user_id != current_owner:
                        raise CategoryOwnershipError("只有小类创建者可以编辑或删除该小类")
                    parent_id = category.parent_id or payload.parent_id
                    name = category.name
                    version = category.revision
                else:
                    parent_id = payload.parent_id
                    name = payload.name
                    version = payload.version
                service = icon_service(session)
                draft = await service.create_draft(
                    refrigerator_id,
                    parent_id,
                    name,
                    payload.category_id,
                    payload.fallback_theme,
                    version,
                )
                if category is not None and category.icon_key:
                    for variant in await service.variant_records(category.icon_key):
                        path, media_type, _, _ = await service.asset_variant_path(
                            refrigerator_id, category.icon_key, variant.theme_key
                        )
                        await service.save_draft_variant(
                            refrigerator_id,
                            draft.id,
                            variant.theme_key,
                            await anyio.Path(path).read_bytes(),
                            media_type,
                            "library",
                            source_id=category.icon_key,
                            source_url=variant.source_url,
                            license_spdx=variant.license_spdx,
                            license_url=variant.license_url,
                            attribution=variant.attribution,
                        )
                return await _draft_response(draft, service)
        except CategoryOwnershipError as exc:
            _log_icon_exception(
                "icon_draft_create",
                "POST",
                f"/api/owner/refrigerators/{refrigerator_id}/icon-drafts",
                403,
                exc,
            )
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        except ValueError as exc:
            _log_icon_exception(
                "icon_draft_create",
                "POST",
                f"/api/owner/refrigerators/{refrigerator_id}/icon-drafts",
                400,
                exc,
            )
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/icon-drafts/{draft_id}/variants",
        response_model=IconDraftResponse,
    )
    async def set_icon_draft_variant(
        refrigerator_id: str,
        draft_id: str,
        payload: IconDraftVariantRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> IconDraftResponse:
        """向草稿写入图库或可信在线 provider 的主题变体。"""
        try:
            remote_content: tuple[bytes, str, str] | None = None
            if payload.provider:
                if not payload.item_id:
                    raise ValueError("在线图标 item id 缺失")
                async with context.session_factory() as session:
                    await _require_owned_refrigerator(session, refrigerator_id, current_owner, 400)
                    await icon_service(session).require_draft(refrigerator_id, draft_id)
                download_kwargs = (
                    {"cache_path": thiings_catalog_cache_path}
                    if payload.provider == "thiings"
                    else {}
                )
                remote_content = await icon_service_download(
                    payload.provider, payload.item_id, **download_kwargs
                )
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                service = icon_service(session)
                if payload.provider:
                    assert remote_content is not None
                    content, media_type, source_url = remote_content
                    metadata = provider_item_metadata(payload.provider, payload.item_id or "")
                    await service.save_draft_variant(
                        refrigerator_id,
                        draft_id,
                        payload.theme_key,
                        content,
                        media_type,
                        payload.provider,
                        source_id=payload.item_id,
                        source_url=source_url,
                        license_spdx=metadata["license_spdx"],
                        license_url=metadata["license_url"],
                        attribution=metadata["attribution"],
                    )
                elif payload.icon_key:
                    path, media_type, _, _ = await service.asset_variant_path(
                        refrigerator_id, payload.icon_key, payload.theme_key
                    )
                    await service.save_draft_variant(
                        refrigerator_id,
                        draft_id,
                        payload.theme_key,
                        await anyio.Path(path).read_bytes(),
                        media_type,
                        "library",
                        source_id=payload.icon_key,
                    )
                else:
                    raise ValueError("图标变体内容缺失")
                return await _draft_response(
                    await service.require_draft(refrigerator_id, draft_id), service
                )
        except ValueError as exc:
            _log_icon_exception(
                "icon_draft_variant",
                "POST",
                f"/api/owner/refrigerators/{refrigerator_id}/icon-drafts/{draft_id}/variants",
                400,
                exc,
            )
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/icon-drafts/{draft_id}/variants/{theme_key}",
        response_class=FileResponse,
    )
    async def draft_icon_variant(
        refrigerator_id: str,
        draft_id: str,
        theme_key: str,
        current_owner: str = Depends(context.owner_id),
    ) -> FileResponse:
        """读取当前用户草稿中的预览变体。"""
        try:
            async with context.session_factory() as session:
                await _require_owned_refrigerator(session, refrigerator_id, current_owner)
                service = icon_service(session)
                draft = await service.require_draft(refrigerator_id, draft_id)
                variant = await session.get(IconDraftVariant, (draft.id, theme_key))
                if variant is None:
                    raise ValueError("图标草稿变体不存在")
                path = service._safe_path(service._temporary_dir, variant.storage_path)
                if not await anyio.Path(path).is_file():
                    raise ValueError("图标草稿文件不存在")
                return FileResponse(path, media_type=variant.media_type)
        except ValueError as exc:
            _log_icon_exception(
                "icon_draft_variant_read",
                "GET",
                f"/api/owner/refrigerators/{refrigerator_id}/icon-drafts/{draft_id}/variants/{theme_key}",
                404,
                exc,
            )
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/icon-drafts/{draft_id}/variants/upload",
        response_model=IconDraftResponse,
    )
    async def upload_icon_draft_variant(
        refrigerator_id: str,
        draft_id: str,
        request: Request,
        theme_key: str = Query(pattern="^(ink|skeuomorphic|cartoon)$"),
        current_owner: str = Depends(context.owner_id),
    ) -> IconDraftResponse:
        """把本地图片写入草稿，只有确认草稿时才写入持久目录。"""
        try:
            # The body can be a slow client stream. Keep the initial check read-only so
            # an upload cannot hold SQLite's write lock while bytes arrive.
            async with context.session_factory() as session:
                await _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                await icon_service(session).require_draft(refrigerator_id, draft_id)
            content = await read_icon_upload(request)
            media_type = request.headers.get("content-type", "").split(";", 1)[0].lower()
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                service = icon_service(session)
                await service.save_draft_variant(
                    refrigerator_id, draft_id, theme_key, content, media_type
                )
                return await _draft_response(
                    await service.require_draft(refrigerator_id, draft_id), service
                )
        except ValueError as exc:
            _log_icon_exception(
                "icon_draft_variant_upload",
                "POST",
                f"/api/owner/refrigerators/{refrigerator_id}/icon-drafts/{draft_id}/variants/upload",
                400,
                exc,
            )
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/icon-drafts/{draft_id}/confirm",
        response_model=FoodCategoryResponse,
        status_code=201,
    )
    async def confirm_icon_draft(
        refrigerator_id: str,
        draft_id: str,
        payload: IconDraftConfirmRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> FoodCategoryResponse:
        """原子确认完整图标草稿，失败时不创建或修改分类。"""
        try:
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                category = await icon_service(session).confirm_draft(
                    refrigerator_id,
                    draft_id,
                    payload.parent_id,
                    payload.name,
                    payload.fallback_theme,
                    payload.version,
                    current_owner,
                )
                return await category_response_for(category, session, current_owner)
        except CategoryOwnershipError as exc:
            _log_icon_exception(
                "icon_draft_confirm",
                "POST",
                f"/api/owner/refrigerators/{refrigerator_id}/icon-drafts/{draft_id}/confirm",
                403,
                exc,
            )
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        except ValueError as exc:
            status_code = 409 if "修改" in str(exc) else 400
            _log_icon_exception(
                "icon_draft_confirm",
                "POST",
                f"/api/owner/refrigerators/{refrigerator_id}/icon-drafts/{draft_id}/confirm",
                status_code,
                exc,
            )
            raise HTTPException(status_code=status_code, detail=str(exc)) from exc

    @application.delete(
        "/api/owner/refrigerators/{refrigerator_id}/icon-drafts/{draft_id}",
        status_code=204,
    )
    async def delete_icon_draft(
        refrigerator_id: str,
        draft_id: str,
        current_owner: str = Depends(context.owner_id),
    ) -> Response:
        """取消图标草稿并清理其临时文件。"""
        try:
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(session, refrigerator_id, current_owner)
                service = icon_service(session)
                await service._delete_draft(await service.require_draft(refrigerator_id, draft_id))
            return Response(status_code=204)
        except ValueError as exc:
            _log_icon_exception(
                "icon_draft_delete",
                "DELETE",
                f"/api/owner/refrigerators/{refrigerator_id}/icon-drafts/{draft_id}",
                404,
                exc,
            )
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @application.get("/api/devices/current/icons", response_model=list[IconResponse])
    async def device_icons(
        current_device: DeviceCredential = Depends(context.device),
    ) -> list[IconResponse]:
        """返回显示设备所属柜体可见的内置和自定义图标。"""
        async with context.transaction(context.session_factory) as session:
            refrigerator = await _require_active_device_refrigerator(session, current_device)
            service = icon_service(session)
            responses = []
            for item in await service.assets(refrigerator.id):
                base_url = (
                    f"/api/icon-library/{item.key}"
                    if item.source == "builtin"
                    else f"/api/devices/current/icons/{item.key}"
                )
                response = await _icon_response(item, service, refrigerator.id, base_url)
                if response is not None:
                    responses.append(response)
            return responses

    @application.get("/api/devices/current/icons/{icon_key}", response_class=FileResponse)
    async def device_icon_asset(
        icon_key: str,
        theme: str = Query(default="ink"),
        current_device: DeviceCredential = Depends(context.device),
    ) -> FileResponse:
        """返回显示设备所属柜体可访问的一个 SVG 或透明 PNG 图标。"""
        try:
            async with context.transaction(context.session_factory) as session:
                refrigerator = await _require_active_device_refrigerator(session, current_device)
                variant = builtin_icon_variants(icon_key).get(theme)
                if variant is not None:
                    path, media_type = variant
                    return FileResponse(path, media_type=media_type)
                path, media_type, _, _ = await icon_service(session).asset_variant_path(
                    refrigerator.id, icon_key, theme
                )
                return FileResponse(path, media_type=media_type)
        except ValueError as exc:
            _log_icon_exception(
                "device_icon_asset", "GET", f"/api/devices/current/icons/{icon_key}", 404, exc
            )
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/icon-candidates",
        response_model=IconGenerationResponse,
        status_code=201,
        deprecated=True,
    )
    async def generate_icon_candidates(
        refrigerator_id: str,
        payload: IconCandidateCreateRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> IconGenerationResponse:
        """通过 Agnes text2image 生成四个临时图标候选。"""
        try:
            if payload.model != "agnes":
                raise ValueError("图标模型不可用")
            generation_provider = (
                context.ink_icon_generation_provider
                if payload.theme_key == "ink"
                else context.icon_generation_provider
            )
            if generation_provider is None:
                raise RuntimeError("当前主题没有可用的 Agnes 图标模型")
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
            logger.info(
                "图标生成授权完成 operation=icon_generation refrigerator_context=true pool=%s",
                database_pool_snapshot(application.state.database_engine),
            )
            normalized_name, images = await generate_icon_images(
                generation_provider,
                payload.subcategory_name,
                theme_key=payload.theme_key,
            )
            logger.info(
                "图标生成模型完成 operation=icon_generation candidate_count=%s pool=%s",
                len(images),
                database_pool_snapshot(application.state.database_engine),
            )
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                service = icon_service(session)
                generation = await service.persist_generation(
                    refrigerator_id, normalized_name, images
                )
                logger.info(
                    "图标候选持久化完成 operation=icon_generation candidate_count=%s pool=%s",
                    len(images),
                    database_pool_snapshot(application.state.database_engine),
                )
                return IconGenerationResponse(
                    id=generation.id,
                    candidates=[
                        IconCandidateResponse(
                            id=item.id,
                            media_type=item.media_type,
                            asset_url=(
                                f"/api/owner/refrigerators/{refrigerator_id}/"
                                f"icon-candidates/{generation.id}/{item.id}"
                            ),
                        )
                        for item in await service.candidates(generation.id)
                    ],
                )
        except ValueError as exc:
            _log_icon_exception(
                "icon_generation",
                "POST",
                f"/api/owner/refrigerators/{refrigerator_id}/icon-candidates",
                400,
                exc,
            )
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            _log_icon_exception(
                "icon_generation",
                "POST",
                f"/api/owner/refrigerators/{refrigerator_id}/icon-candidates",
                503,
                exc,
            )
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/icon-candidates/stream",
        response_class=StreamingResponse,
    )
    async def generate_icon_candidates_stream(
        refrigerator_id: str,
        payload: IconCandidateCreateRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> StreamingResponse:
        """以 SSE 逐张返回图标生成结果，并支持客户端断开取消。"""
        provider = (
            context.ink_icon_generation_provider
            if payload.theme_key == "ink"
            else context.icon_generation_provider
        )
        logger.info(
            "图标生成请求接收 method=POST path=/api/owner/refrigerators/%s/"
            "icon-candidates/stream operation=icon_generation theme_key=%s model=%s "
            "provider_configured=%s name_length=%s",
            refrigerator_id,
            payload.theme_key,
            payload.model,
            provider is not None,
            len(payload.subcategory_name.strip()),
        )
        return StreamingResponse(
            stream_icon_generation(
                context,
                refrigerator_id,
                payload,
                current_owner,
                _require_owned_refrigerator,
            ),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/icon-candidates/{generation_id}/{candidate_id}",
        response_class=FileResponse,
    )
    async def icon_candidate_asset(
        refrigerator_id: str,
        generation_id: str,
        candidate_id: str,
        current_owner: str = Depends(context.owner_id),
    ) -> FileResponse:
        """读取当前柜体仍有效的一个临时 PNG 候选。"""
        try:
            async with context.session_factory() as session:
                await _require_owned_refrigerator(session, refrigerator_id, current_owner)
                path = await icon_service(session).candidate_path(
                    refrigerator_id, generation_id, candidate_id
                )
                media_type = await icon_service(session).candidate_media_type(candidate_id)
                return FileResponse(path, media_type=media_type)
        except ValueError as exc:
            _log_icon_exception(
                "icon_candidate_asset",
                "GET",
                f"/api/owner/refrigerators/{refrigerator_id}/icon-candidates/{generation_id}/{candidate_id}",
                404,
                exc,
            )
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/icon-candidates/{generation_id}/confirm",
        response_model=FoodCategoryResponse,
        status_code=201,
    )
    async def confirm_icon_candidate(
        refrigerator_id: str,
        generation_id: str,
        payload: IconCandidateConfirmRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> FoodCategoryResponse:
        """确认一个 Agnes 候选并原子创建对应小类。"""
        try:
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                category = await icon_service(session).confirm(
                    refrigerator_id,
                    generation_id,
                    payload.candidate_id,
                    payload.parent_id,
                    payload.subcategory_name,
                    current_owner,
                )
                return await category_response_for(category, session, current_owner)
        except ValueError as exc:
            _log_icon_exception(
                "icon_candidate_confirm",
                "POST",
                f"/api/owner/refrigerators/{refrigerator_id}/icon-candidates/{generation_id}/confirm",
                400,
                exc,
            )
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.delete(
        "/api/owner/refrigerators/{refrigerator_id}/icon-candidates/{generation_id}",
        status_code=204,
    )
    async def cancel_icon_candidates(
        refrigerator_id: str,
        generation_id: str,
        current_owner: str = Depends(context.owner_id),
    ) -> Response:
        """取消生成并删除整组候选临时文件。"""
        try:
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(session, refrigerator_id, current_owner)
                await icon_service(session).cancel(refrigerator_id, generation_id)
            return Response(status_code=204)
        except ValueError as exc:
            _log_icon_exception(
                "icon_candidate_cancel",
                "DELETE",
                f"/api/owner/refrigerators/{refrigerator_id}/icon-candidates/{generation_id}",
                404,
                exc,
            )
            raise HTTPException(status_code=404, detail=str(exc)) from exc
