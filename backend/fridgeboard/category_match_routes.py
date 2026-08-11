"""手工物品名称自动分类路由。

确定性匹配在短数据库读取中完成；大模型匹配不持有数据库事务，结果只在候选
小类校验通过后写入临时学习缓存。分类请求被取消后，晚到的模型结果不会写入缓存。
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import time
import uuid
from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from functools import lru_cache

from fastapi import Depends, FastAPI, HTTPException, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from fridgeboard.api_models import CategoryMatchRequest, CategoryMatchResponse
from fridgeboard.category_matching import MatchResult, match_item_name, normalize_item_name
from fridgeboard.persistence.models import (
    DeviceCredential,
    FoodCategory,
    ItemCategoryMapping,
    Refrigerator,
)
from fridgeboard.recognition import CategoryRecognitionProvider, ProgressCallback
from fridgeboard.sse import sse_event

logger = logging.getLogger(__name__)

SessionFactory = Callable[[], AsyncSession]
TransactionFactory = Callable[[SessionFactory], AbstractAsyncContextManager[AsyncSession]]
OwnerDependency = Callable[..., str]
DeviceDependency = Callable[..., DeviceCredential]


@dataclass
class _MatchState:
    """单进程内短期取消状态和活动任务；不包含物品名称等用户数据。"""

    cancelled: dict[str, float] = field(default_factory=dict)
    active_tasks: dict[str, asyncio.Task[CategoryMatchResponse]] = field(default_factory=dict)
    ttl_seconds: float = 300.0

    def _purge(self, now: float) -> None:
        """删除超过保留时间的取消标记。"""
        expired = [
            request_id
            for request_id, marked_at in self.cancelled.items()
            if now - marked_at >= self.ttl_seconds
        ]
        for request_id in expired:
            self.cancelled.pop(request_id, None)

    def mark_cancelled(self, request_id: str, *, now: float | None = None) -> None:
        """记录取消标记，并中断已登记的异步模型请求。"""
        current = time.monotonic() if now is None else now
        self._purge(current)
        self.cancelled[request_id] = current
        task = self.active_tasks.get(request_id)
        if task is not None:
            task.cancel()

    def consume_if_cancelled(self, request_id: str, *, now: float | None = None) -> bool:
        """检查并消费取消标记，避免已完成请求长期占用内存。"""
        current = time.monotonic() if now is None else now
        self._purge(current)
        return self.cancelled.pop(request_id, None) is not None

    def register(self, request_id: str, task: asyncio.Task[CategoryMatchResponse]) -> bool:
        """登记活动任务；请求已预先取消时拒绝启动模型调用。"""
        current = time.monotonic()
        self._purge(current)
        if self.cancelled.pop(request_id, None) is not None:
            return False
        self.active_tasks[request_id] = task
        return True

    def unregister(self, request_id: str, task: asyncio.Task[CategoryMatchResponse]) -> None:
        """仅在登记项仍指向当前任务时移除活动任务。"""
        if self.active_tasks.get(request_id) is task:
            self.active_tasks.pop(request_id, None)


@dataclass(frozen=True)
class OwnerCategoryMatchContext:
    """所有者分类匹配路由依赖。"""

    session_factory: SessionFactory
    transaction: TransactionFactory
    owner_id: OwnerDependency
    category_provider: CategoryRecognitionProvider | None
    category_model_name: str | None


@dataclass(frozen=True)
class DailyCategoryMatchContext:
    """日常访问分类匹配路由依赖。"""

    session_factory: SessionFactory
    transaction: TransactionFactory
    device: DeviceDependency
    category_provider: CategoryRecognitionProvider | None
    category_model_name: str | None


@lru_cache(maxsize=1)
def _load_aliases() -> dict[str, list[str]]:
    """读取数据驱动的内置分类别名清单。"""
    from fridgeboard.item_catalog import CATALOG_ROOT

    path = CATALOG_ROOT / "classification_aliases.json"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError("分类别名清单无法读取") from exc
    return {
        str(key): [str(value) for value in values if str(value).strip()]
        for key, values in payload.items()
        if isinstance(values, list)
    }


async def _candidate_payload(
    session: AsyncSession, refrigerator_id: str
) -> list[dict[str, object]]:
    """构造当前冰箱可用的小类候选，不暴露大类节点给模型。"""
    aliases = _load_aliases()
    categories = await session.scalars(
        select(FoodCategory)
        .where(
            FoodCategory.parent_id.is_not(None),
            (FoodCategory.refrigerator_id.is_(None))
            | (FoodCategory.refrigerator_id == refrigerator_id),
        )
        .order_by(FoodCategory.display_order, FoodCategory.name, FoodCategory.id)
    )
    return [
        {
            "id": category.id,
            "name": category.name,
            "aliases": aliases.get(category.id, []),
        }
        for category in categories
    ]


def _as_match_result(mapping: ItemCategoryMapping, category: FoodCategory) -> MatchResult:
    """把数据库缓存映射转换为统一匹配结果。"""
    return MatchResult(
        category.id,
        category.name,
        "cache",
        min(max(mapping.confidence, 0.0), 1.0),
    )


async def _deterministic_match(
    session: AsyncSession, refrigerator_id: str, item_name: str
) -> MatchResult | None:
    """优先查询当前冰箱缓存，再执行内置别名匹配。"""
    now = datetime.now(UTC)
    await _purge_expired_ai_mappings(session, now=now)
    normalized = normalize_item_name(item_name)
    mapping = await session.get(
        ItemCategoryMapping,
        {"refrigerator_id": refrigerator_id, "normalized_item_name": normalized},
    )
    if mapping is not None and (
        mapping.confirmed
        or (
            (mapping.expires_at is None or _as_utc(mapping.expires_at) > now)
            and mapping.confidence >= 0.85
        )
    ):
        category = await session.get(FoodCategory, mapping.subcategory_id)
        if (
            category is not None
            and category.parent_id is not None
            and category.refrigerator_id
            in {
                None,
                refrigerator_id,
            }
        ):
            return _as_match_result(mapping, category)

    candidates = await _candidate_payload(session, refrigerator_id)
    result = match_item_name(item_name, candidates)
    return result


async def deterministic_category_match(
    session: AsyncSession, refrigerator_id: str, item_name: str
) -> MatchResult | None:
    """返回食谱等非 HTTP 流程可复用的快速分类结果。

    Args:
        session: 当前事务会话。
        refrigerator_id: 分类候选所属冰箱。
        item_name: 待匹配的物品或食材名称。

    Returns:
        当前冰箱缓存或内置别名能够保守确定的分类；否则返回 ``None``。
    """
    return await _deterministic_match(session, refrigerator_id, item_name)


def _response(
    result: MatchResult | None, *, request_id: str | None = None
) -> CategoryMatchResponse:
    """生成分类匹配响应。"""
    if result is None:
        return CategoryMatchResponse(status="not_found", request_id=request_id)
    return CategoryMatchResponse(
        status="matched",
        subcategory_id=result.subcategory_id,
        subcategory_name=result.subcategory_name,
        source=result.source if result.source in {"builtin", "cache", "ai"} else "builtin",
        confidence=result.confidence,
        request_id=request_id,
    )


def register_category_match_routes(
    application: FastAPI,
    *,
    owner_context: OwnerCategoryMatchContext,
    daily_context: DailyCategoryMatchContext,
) -> None:
    """向应用注册所有者和 PWA 日常访问的自动分类路由。"""
    state = _MatchState()

    # 依赖函数需要保留当前所有者，因此在闭包中分别声明路由而不是共享伪依赖。
    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/category-match",
        response_model=CategoryMatchResponse,
    )
    async def owner_category_match(
        refrigerator_id: str,
        payload: CategoryMatchRequest,
        current_owner: str = Depends(owner_context.owner_id),
    ) -> CategoryMatchResponse:
        """执行所有者范围内的快速分类匹配。"""
        async with owner_context.transaction(owner_context.session_factory) as session:
            refrigerator = await session.get(Refrigerator, refrigerator_id)
            if (
                refrigerator is None
                or refrigerator.owner_user_id != current_owner
                or refrigerator.deleted_at
            ):
                raise HTTPException(status_code=404, detail="冰箱不存在或无权访问")
            result = await _deterministic_match(session, refrigerator_id, payload.item_name)
            if result is not None:
                return _response(result)
        request_id = uuid.uuid4().hex
        return CategoryMatchResponse(
            status="needs_ai" if owner_context.category_provider else "not_found",
            request_id=request_id if owner_context.category_provider else None,
        )

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/category-match/ai",
        response_model=CategoryMatchResponse,
        deprecated=True,
    )
    async def owner_category_match_ai(
        refrigerator_id: str,
        payload: CategoryMatchRequest,
        current_owner: str = Depends(owner_context.owner_id),
    ) -> CategoryMatchResponse:
        """执行所有者范围内的大模型分类匹配。"""
        return await _run_ai(refrigerator_id, payload, current_owner, owner_context, state)

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/category-match/ai/stream",
        response_class=StreamingResponse,
    )
    async def owner_category_match_ai_stream(
        refrigerator_id: str,
        payload: CategoryMatchRequest,
        current_owner: str = Depends(owner_context.owner_id),
    ) -> StreamingResponse:
        """以 SSE 返回分类状态、模型文字增量和最终分类结果。"""
        return StreamingResponse(
            _category_match_sse(refrigerator_id, payload, current_owner, owner_context, state),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @application.delete(
        "/api/owner/refrigerators/{refrigerator_id}/category-match/{request_id}",
        status_code=204,
    )
    async def owner_cancel_category_match(
        refrigerator_id: str,
        request_id: str,
        current_owner: str = Depends(owner_context.owner_id),
    ) -> Response:
        """取消所有者范围内的分类请求。"""
        async with owner_context.session_factory() as session:
            refrigerator = await session.get(Refrigerator, refrigerator_id)
            if (
                refrigerator is None
                or refrigerator.owner_user_id != current_owner
                or refrigerator.deleted_at
            ):
                raise HTTPException(status_code=404, detail="冰箱不存在或无权访问")
        state.mark_cancelled(request_id)
        return Response(status_code=204)

    @application.post(
        "/api/daily/refrigerators/{refrigerator_id}/category-match",
        response_model=CategoryMatchResponse,
    )
    async def daily_category_match(
        refrigerator_id: str,
        payload: CategoryMatchRequest,
        current_device: DeviceCredential = Depends(daily_context.device),
    ) -> CategoryMatchResponse:
        """执行 PWA 日常访问范围内的快速分类匹配。"""
        await _authorize_daily(daily_context.session_factory, refrigerator_id, current_device)
        async with daily_context.transaction(daily_context.session_factory) as session:
            result = await _deterministic_match(session, refrigerator_id, payload.item_name)
        request_id = uuid.uuid4().hex
        if result is not None:
            return _response(result, request_id=request_id)
        return CategoryMatchResponse(
            status="needs_ai" if daily_context.category_provider else "not_found",
            request_id=request_id if daily_context.category_provider else None,
        )

    @application.post(
        "/api/daily/refrigerators/{refrigerator_id}/category-match/ai",
        response_model=CategoryMatchResponse,
        deprecated=True,
    )
    async def daily_category_match_ai(
        refrigerator_id: str,
        payload: CategoryMatchRequest,
        current_device: DeviceCredential = Depends(daily_context.device),
    ) -> CategoryMatchResponse:
        """执行 PWA 日常访问范围内的大模型分类匹配。"""
        await _authorize_daily(daily_context.session_factory, refrigerator_id, current_device)
        return await _run_ai(refrigerator_id, payload, current_device, daily_context, state)

    @application.post(
        "/api/daily/refrigerators/{refrigerator_id}/category-match/ai/stream",
        response_class=StreamingResponse,
    )
    async def daily_category_match_ai_stream(
        refrigerator_id: str,
        payload: CategoryMatchRequest,
        current_device: DeviceCredential = Depends(daily_context.device),
    ) -> StreamingResponse:
        """以 SSE 返回日常访问范围内的分类状态和最终结果。"""
        await _authorize_daily(daily_context.session_factory, refrigerator_id, current_device)
        return StreamingResponse(
            _category_match_sse(refrigerator_id, payload, current_device, daily_context, state),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @application.delete(
        "/api/daily/refrigerators/{refrigerator_id}/category-match/{request_id}",
        status_code=204,
    )
    async def daily_cancel_category_match(
        refrigerator_id: str,
        request_id: str,
        current_device: DeviceCredential = Depends(daily_context.device),
    ) -> Response:
        """取消 PWA 日常访问范围内的分类请求。"""
        await _authorize_daily(daily_context.session_factory, refrigerator_id, current_device)
        state.mark_cancelled(request_id)
        return Response(status_code=204)


async def _authorize_daily(
    session_factory: SessionFactory, refrigerator_id: str, device: DeviceCredential
) -> None:
    """验证 PWA 凭证与目标冰箱一致。"""
    if device.device_kind != "pwa" or device.refrigerator_id != refrigerator_id:
        raise HTTPException(status_code=403, detail="该设备无权访问目标冰箱")
    async with session_factory() as session:
        refrigerator = await session.get(Refrigerator, refrigerator_id)
        if refrigerator is None or refrigerator.deleted_at:
            raise HTTPException(status_code=401, detail="设备访问已移除或需要重新配对")


async def _run_ai(
    refrigerator_id: str,
    payload: CategoryMatchRequest,
    actor: str | DeviceCredential,
    context: OwnerCategoryMatchContext | DailyCategoryMatchContext,
    state: _MatchState,
    on_progress: ProgressCallback | None = None,
) -> CategoryMatchResponse:
    """执行候选加载、可取消模型调用、结果白名单校验和临时缓存。"""
    provider = context.category_provider
    if provider is None:
        return CategoryMatchResponse(status="not_found")
    request_id = payload.request_id or uuid.uuid4().hex
    async with context.transaction(context.session_factory) as session:
        if isinstance(actor, str):
            refrigerator = await session.get(Refrigerator, refrigerator_id)
            if (
                refrigerator is None
                or refrigerator.owner_user_id != actor
                or refrigerator.deleted_at
            ):
                raise HTTPException(status_code=404, detail="冰箱不存在或无权访问")
        else:
            await _authorize_daily(context.session_factory, refrigerator_id, actor)
        candidates = await _candidate_payload(session, refrigerator_id)
    current_task = asyncio.current_task()
    if current_task is None or not state.register(request_id, current_task):
        return CategoryMatchResponse(status="not_found", request_id=request_id)
    try:
        raw_result = await _invoke_provider(provider, payload.item_name, candidates, on_progress)
    except asyncio.CancelledError:
        if state.consume_if_cancelled(request_id):
            return CategoryMatchResponse(status="not_found", request_id=request_id)
        raise
    except RuntimeError:
        return CategoryMatchResponse(status="not_found", request_id=request_id)
    finally:
        state.unregister(request_id, current_task)
    if state.consume_if_cancelled(request_id):
        return CategoryMatchResponse(status="not_found", request_id=request_id)
    field = raw_result.get("subcategory_id")
    if not isinstance(field, dict) or not field.get("value"):
        return CategoryMatchResponse(status="not_found", request_id=request_id)
    candidate = next((item for item in candidates if item["id"] == str(field["value"])), None)
    if candidate is None:
        return CategoryMatchResponse(status="not_found", request_id=request_id)
    try:
        confidence = min(max(float(field.get("confidence", 0.5)), 0.0), 1.0)
    except (TypeError, ValueError):
        confidence = 0.5
    async with context.transaction(context.session_factory) as session:
        await _purge_expired_ai_mappings(session)
        normalized_name = normalize_item_name(payload.item_name)
        mapping = await session.get(
            ItemCategoryMapping,
            {
                "refrigerator_id": refrigerator_id,
                "normalized_item_name": normalized_name,
            },
        )
        if mapping is None:
            session.add(
                ItemCategoryMapping(
                    refrigerator_id=refrigerator_id,
                    normalized_item_name=normalized_name,
                    display_item_name=payload.item_name.strip(),
                    subcategory_id=candidate["id"],
                    source="ai",
                    confidence=confidence,
                    confirmed=False,
                    model_name=context.category_model_name,
                    expires_at=_expiry_time(),
                )
            )
        elif mapping.confirmed:
            confirmed_category = await session.get(FoodCategory, mapping.subcategory_id)
            if confirmed_category is not None:
                return _response(
                    _as_match_result(mapping, confirmed_category), request_id=request_id
                )
        else:
            mapping.display_item_name = payload.item_name.strip()
            mapping.subcategory_id = candidate["id"]
            mapping.source = "ai"
            mapping.confidence = confidence
            mapping.confirmed = False
            mapping.model_name = context.category_model_name
            mapping.expires_at = _expiry_time()
    return CategoryMatchResponse(
        status="matched",
        subcategory_id=candidate["id"],
        subcategory_name=candidate["name"],
        source="ai",
        confidence=confidence,
        request_id=request_id,
    )


async def _invoke_provider(
    provider: CategoryRecognitionProvider,
    item_name: str,
    candidates: list[dict[str, object]],
    on_progress: ProgressCallback | None = None,
) -> dict[str, object]:
    """调用异步 provider，并让取消沿当前 HTTP 请求传播到上游。"""
    return await provider(item_name, candidates, on_progress=on_progress)


async def _category_match_sse(
    refrigerator_id: str,
    payload: CategoryMatchRequest,
    actor: str | DeviceCredential,
    context: OwnerCategoryMatchContext | DailyCategoryMatchContext,
    state: _MatchState,
) -> AsyncIterator[str]:
    """包装分类任务为 SSE，避免前端在模型等待期间失去可见反馈。"""
    queue: asyncio.Queue[tuple[str, object]] = asyncio.Queue()
    text_length = 0
    received_token = False

    def on_progress(text: str) -> None:
        """把模型增量安全地转发到当前事件循环。"""
        queue.put_nowait(("token", text))

    task = asyncio.create_task(
        _run_ai(
            refrigerator_id,
            payload,
            actor,
            context,
            state,
            on_progress=on_progress,
        )
    )
    yield sse_event("status", {"message": "正在请求自动分类…", "text_length": 0})
    try:
        while True:
            if task.done() and queue.empty():
                yield sse_event(
                    "status",
                    {"message": "模型输出已接收，正在整理分类…", "text_length": text_length},
                )
                result = task.result()
                yield sse_event(
                    "result",
                    result.model_dump(mode="json", exclude_none=False),
                )
                yield sse_event("done", {"text_length": text_length})
                return
            try:
                kind, value = await asyncio.wait_for(queue.get(), timeout=8)
            except TimeoutError:
                yield sse_event(
                    "status", {"message": "正在等待自动分类模型响应…", "text_length": text_length}
                )
                continue
            if kind == "token":
                text = str(value)
                if not received_token:
                    received_token = True
                    yield sse_event(
                        "status",
                        {"message": "正在接收模型输出…", "text_length": text_length},
                    )
                text_length += len(text)
                yield sse_event("token", {"text": text, "text_length": text_length})
    except asyncio.CancelledError:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError, Exception):
            await task
        raise
    except Exception as exc:
        logger.exception(
            "分类 SSE 调用失败 operation=category_match refrigerator_id=%s "
            "request_id=%s exception=%s",
            refrigerator_id,
            payload.request_id,
            type(exc).__name__,
        )
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError, Exception):
            await task
        yield sse_event("error", {"message": "自动分类暂时不可用，请手动选择分类。"})


def _as_utc(value: datetime) -> datetime:
    """将 SQLite 返回的无时区时间解释为 UTC。"""
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _expiry_time() -> datetime:
    """返回 AI 分类缓存的默认有效期结束时间。"""
    return datetime.now(UTC) + timedelta(days=90)


async def _purge_expired_ai_mappings(session: AsyncSession, *, now: datetime | None = None) -> int:
    """清理已过期且未经用户确认的临时分类映射。

    已确认映射不受 ``expires_at`` 历史脏值影响；它们只能由用户后续保存覆盖，
    不允许被请求式清理删除。

    Args:
        session: 当前事务会话，调用方负责提交或回滚。
        now: 可选 UTC 当前时间，主要用于确定性测试。

    Returns:
        本次删除的临时映射数量。
    """
    cutoff = now or datetime.now(UTC)
    expired_filter = (
        ItemCategoryMapping.confirmed.is_(False),
        ItemCategoryMapping.expires_at.is_not(None),
        ItemCategoryMapping.expires_at <= cutoff,
    )
    expired_exists = await session.scalar(
        select(ItemCategoryMapping.refrigerator_id).where(*expired_filter).limit(1)
    )
    if expired_exists is None:
        return 0
    result = await session.execute(delete(ItemCategoryMapping).where(*expired_filter))
    return result.rowcount or 0
