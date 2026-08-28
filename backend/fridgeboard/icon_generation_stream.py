"""按候选图增量推送 AI 图标生成结果。"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import TYPE_CHECKING

from fastapi import HTTPException

from fridgeboard.api_models import (
    IconCandidateCreateRequest,
    IconCandidateResponse,
    IconGenerationResponse,
)
from fridgeboard.icon_service import IconService, generate_icon_images
from fridgeboard.persistence.models import IconGenerationCandidate
from fridgeboard.sse import sse_event

if TYPE_CHECKING:
    from fridgeboard.inventory_routes import InventoryRouteContext

logger = logging.getLogger(__name__)


def _candidate_response(
    refrigerator_id: str, generation_id: str, candidate: IconGenerationCandidate
) -> IconCandidateResponse:
    """将数据库候选转换为可由当前所有者读取的响应。"""
    return IconCandidateResponse(
        id=candidate.id,
        media_type=candidate.media_type,
        asset_url=(
            f"/api/owner/refrigerators/{refrigerator_id}/"
            f"icon-candidates/{generation_id}/{candidate.id}"
        ),
    )


async def _generation_response(
    context: InventoryRouteContext, refrigerator_id: str, generation_id: str
) -> IconGenerationResponse:
    """读取当前已落盘的候选，允许生成会话只有部分结果。"""
    async with context.transaction(context.session_factory) as session:
        candidates = await IconService(
            session, context.persistent_icon_dir, context.temporary_icon_dir
        ).candidates(generation_id)
        return IconGenerationResponse(
            id=generation_id,
            candidates=[
                _candidate_response(refrigerator_id, generation_id, candidate)
                for candidate in candidates
            ],
        )


async def stream_icon_generation(
    context: InventoryRouteContext,
    refrigerator_id: str,
    payload: IconCandidateCreateRequest,
    current_owner: str,
    require_owned_refrigerator: Callable[..., Awaitable[object]],
) -> AsyncIterator[str]:
    """逐张生成并推送图标候选，断开连接时取消当前上游请求。

    Args:
        context: 图标路由依赖和数据库/资产配置。
        refrigerator_id: 当前冰箱 ID。
        payload: 小类名称、主题和模型请求参数。
        current_owner: 当前所有者 ID。
        require_owned_refrigerator: 路由层所有者校验函数。
    """
    started_at = time.monotonic()
    generation_id: str | None = None
    task: asyncio.Task[tuple[str, list[bytes]]] | None = None
    queue: asyncio.Queue[tuple[str, object]] = asyncio.Queue()
    completed = 0
    total = 4

    try:
        if payload.model != "agnes":
            raise ValueError("图标模型不可用")
        provider = (
            context.ink_icon_generation_provider
            if payload.theme_key == "ink"
            else context.icon_generation_provider
        )
        logger.info(
            "图标生成 SSE 请求开始 method=POST path=/api/owner/refrigerators/%s/"
            "icon-candidates/stream operation=icon_generation theme_key=%s model=%s "
            "provider_configured=%s name_length=%s",
            refrigerator_id,
            payload.theme_key,
            payload.model,
            provider is not None,
            len(payload.subcategory_name.strip()),
        )
        if provider is None:
            raise RuntimeError("当前主题没有可用的 Agnes 图标模型")
        async with context.transaction(context.session_factory) as session:
            await require_owned_refrigerator(
                session, refrigerator_id, current_owner, failure_status=400
            )
            generation = await IconService(
                session, context.persistent_icon_dir, context.temporary_icon_dir
            ).create_generation_session(refrigerator_id, payload.subcategory_name)
            generation_id = generation.id

        async def on_image(index: int, image_bytes: bytes) -> None:
            """把一张模型结果写入短事务，再交给 SSE 消费循环。"""
            if generation_id is None:
                raise RuntimeError("图标生成会话未创建")
            async with context.transaction(context.session_factory) as session:
                candidate = await IconService(
                    session, context.persistent_icon_dir, context.temporary_icon_dir
                ).persist_generation_candidate(
                    refrigerator_id, generation_id, index, image_bytes
                )
                response = _candidate_response(refrigerator_id, generation_id, candidate)
            logger.info(
                "图标候选持久化完成 operation=icon_generation generation_id=%s "
                "candidate_index=%s",
                generation_id,
                index,
            )
            await queue.put(("candidate", response))

        task = asyncio.create_task(
            generate_icon_images(
                provider,
                payload.subcategory_name,
                count=total,
                theme_key=payload.theme_key,
                on_image=on_image,
            )
        )
        yield sse_event(
            "start",
            {"generation_id": generation_id, "total": total, "completed": 0},
        )
        yield sse_event(
            "status",
            {"message": "正在生成第 1/4 张图标…", "total": total, "completed": 0},
        )

        while True:
            if task.done() and queue.empty():
                task.result()
                result = await _generation_response(context, refrigerator_id, generation_id)
                logger.info(
                    "图标生成模型完成 operation=icon_generation candidate_count=%s "
                    "pool=per_candidate_transaction database_connections_held=0",
                    len(result.candidates),
                )
                yield sse_event("result", result.model_dump(mode="json", exclude_none=False))
                yield sse_event(
                    "done", {"total": total, "completed": len(result.candidates)}
                )
                logger.info(
                    "图标生成 SSE 完成 operation=icon_generation refrigerator_id=%s "
                    "generation_id=%s candidate_count=%s elapsed_ms=%.1f",
                    refrigerator_id,
                    generation_id,
                    len(result.candidates),
                    (time.monotonic() - started_at) * 1000,
                )
                return
            try:
                kind, value = await asyncio.wait_for(queue.get(), timeout=10)
            except TimeoutError:
                yield sse_event(
                    "status",
                    {
                        "message": f"正在生成第 {min(completed + 1, total)}/{total} 张图标…",
                        "total": total,
                        "completed": completed,
                    },
                )
                continue
            if kind == "candidate":
                completed += 1
                candidate = value
                yield sse_event(
                    "candidate",
                    {
                        "candidate": candidate.model_dump(mode="json", exclude_none=False),
                        "candidate_index": completed - 1,
                        "total": total,
                        "completed": completed,
                    },
                )
                if completed < total:
                    yield sse_event(
                        "status",
                        {
                            "message": f"正在生成第 {completed + 1}/{total} 张图标…",
                            "total": total,
                            "completed": completed,
                        },
                    )
    except asyncio.CancelledError:
        if task is not None:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await task
        logger.info(
            "图标生成 SSE 取消 operation=icon_generation refrigerator_id=%s "
            "generation_id=%s completed=%s elapsed_ms=%.1f outcome=cancelled",
            refrigerator_id,
            generation_id,
            completed,
            (time.monotonic() - started_at) * 1000,
        )
        raise
    except Exception as exc:
        if task is not None and not task.done():
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await task
        partial = (
            await _generation_response(context, refrigerator_id, generation_id)
            if generation_id is not None
            else None
        )
        logger.exception(
            "图标生成增量 SSE 失败 method=POST path=/api/owner/refrigerators/%s/"
            "icon-candidates/stream status=%s operation=icon_generation "
            "generation_id=%s completed=%s total=%s elapsed_ms=%.1f outcome=error",
            refrigerator_id,
            exc.status_code if isinstance(exc, HTTPException) else 500,
            generation_id,
            len(partial.candidates) if partial else completed,
            total,
            (time.monotonic() - started_at) * 1000,
        )
        message = (
            str(exc.detail)
            if isinstance(exc, HTTPException)
            else str(exc)
            if isinstance(exc, (ValueError, RuntimeError))
            else "图标生成暂时不可用，请稍后重试。"
        )
        yield sse_event(
            "error",
            {
                "message": message,
                "generation_id": generation_id,
                "total": total,
                "completed": len(partial.candidates) if partial else completed,
                "candidates": (
                    partial.model_dump(mode="json", exclude_none=False)["candidates"]
                    if partial
                    else []
                ),
            },
        )
