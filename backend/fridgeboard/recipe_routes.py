"""食谱与动态补货 HTTP 路由。

本模块只负责食谱相关请求的认证、事务边界和响应类型声明；食谱解析、库存扣减及
缺货计算仍由 ``RecipeService`` 负责。应用创建模块通过 ``RecipeRouteContext`` 显式
注入数据库会话、事务管理器、所有者依赖和服务工厂，避免路由模块反向依赖应用入口。
"""

from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractContextManager
from dataclasses import dataclass
from datetime import date, timedelta

from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy.orm import Session

from fridgeboard.api_models import (
    RecipeCopyRequest,
    RecipeDayResponse,
    RecipeEntryResponse,
    RecipeEntryWriteRequest,
    RecipeHistoryWeekResponse,
    RecipeImportRequest,
    RestockEntryResponse,
)
from fridgeboard.persistence.models import Refrigerator
from fridgeboard.recipe_service import RecipeService

SessionFactory = Callable[[], Session]
TransactionFactory = Callable[[SessionFactory], AbstractContextManager[Session]]
OwnerDependency = Callable[..., str]
RecipeServiceFactory = Callable[[Session], RecipeService]


@dataclass(frozen=True)
class RecipeRouteContext:
    """食谱路由需要的应用级依赖集合。"""

    session_factory: SessionFactory
    transaction: TransactionFactory
    owner_id: OwnerDependency
    recipe_service_factory: RecipeServiceFactory


def _require_owned_refrigerator(
    session: Session, refrigerator_id: str, current_owner: str, failure_status: int = 404
) -> Refrigerator:
    """返回当前所有者拥有的冰箱，并保留调用接口的既有失败状态码。"""
    refrigerator = session.get(Refrigerator, refrigerator_id)
    if (
        refrigerator is None
        or refrigerator.owner_user_id != current_owner
        or refrigerator.deleted_at is not None
    ):
        raise HTTPException(status_code=failure_status, detail="冰箱不存在或无权访问")
    return refrigerator


def _normalized_week_start(value: date) -> date:
    """将任意日期归一化为所在自然周的周一。"""
    return value - timedelta(days=value.weekday())


def register_recipe_routes(application: FastAPI, context: RecipeRouteContext) -> None:
    """向应用注册食谱和动态补货路由。

    Args:
        application: 要追加路由的 FastAPI 应用实例。
        context: 路由运行所需的会话、事务、认证依赖和服务工厂。
    """

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/recipes",
        response_model=list[RecipeDayResponse],
    )
    def recipe_week(
        refrigerator_id: str, week_start: date, current_owner: str = Depends(context.owner_id)
    ) -> list[RecipeDayResponse]:
        """返回指定周固定七天的食谱，并即时计算未完成菜的缺货。"""
        normalized_week_start = week_start - timedelta(days=week_start.weekday())
        with context.session_factory() as session:
            _require_owned_refrigerator(session, refrigerator_id, current_owner)
            return context.recipe_service_factory(session).list_week(
                refrigerator_id, normalized_week_start
            )

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/recipes/import",
        response_model=list[RecipeEntryResponse],
        status_code=201,
    )
    def import_recipes(
        refrigerator_id: str,
        payload: RecipeImportRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> list[RecipeEntryResponse]:
        """解析并导入多行食谱；未知小类要求用户在编辑页精确改正。"""
        try:
            with context.transaction(context.session_factory) as session:
                _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                week_start = payload.week_start - timedelta(days=payload.week_start.weekday())
                return context.recipe_service_factory(session).import_text(
                    refrigerator_id, week_start, payload.text
                )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/recipes/history",
        response_model=list[RecipeHistoryWeekResponse],
    )
    def recipe_history(
        refrigerator_id: str,
        week_start: date | None = None,
        current_owner: str = Depends(context.owner_id),
    ) -> list[RecipeHistoryWeekResponse]:
        """返回不含本周和下周的最近八周菜单摘要。"""
        normalized_week_start = _normalized_week_start(week_start or date.today())
        with context.session_factory() as session:
            _require_owned_refrigerator(session, refrigerator_id, current_owner)
            return context.recipe_service_factory(session).list_history(
                refrigerator_id, normalized_week_start
            )

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/recipes/copy",
        response_model=list[RecipeDayResponse],
    )
    def copy_recipe_history(
        refrigerator_id: str,
        payload: RecipeCopyRequest,
        week_start: date | None = None,
        current_owner: str = Depends(context.owner_id),
    ) -> list[RecipeDayResponse]:
        """将最近八周的一周菜单完整覆盖复制到本周或下周。

        ``week_start`` 与历史列表共用，允许客户端在服务端跨周前后保持同一周锚点；
        未提供时维持原有的服务端当前周语义。
        """
        try:
            with context.transaction(context.session_factory) as session:
                _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                current_week_start = _normalized_week_start(week_start or date.today())
                source_week_start = _normalized_week_start(payload.source_week_start)
                target_week_start = _normalized_week_start(payload.target_week_start)
                return context.recipe_service_factory(session).copy_history_week(
                    refrigerator_id, current_week_start, source_week_start, target_week_start
                )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.put(
        "/api/owner/refrigerators/{refrigerator_id}/recipes/{entry_id}",
        response_model=RecipeEntryResponse,
    )
    def update_recipe(
        refrigerator_id: str,
        entry_id: str,
        payload: RecipeEntryWriteRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> RecipeEntryResponse:
        """编辑食谱；完成食谱仅接受备注变化，未完成食谱接受完整编辑。"""
        try:
            with context.transaction(context.session_factory) as session:
                _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                return context.recipe_service_factory(session).update_entry(
                    refrigerator_id,
                    entry_id,
                    payload.weekday,
                    payload.dish_name,
                    payload.note,
                    [ingredient.model_dump() for ingredient in payload.ingredients],
                )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/recipes",
        response_model=RecipeEntryResponse,
        status_code=201,
    )
    def create_recipe(
        refrigerator_id: str,
        week_start: date,
        payload: RecipeEntryWriteRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> RecipeEntryResponse:
        """在指定周新增一道未完成食谱。"""
        try:
            with context.transaction(context.session_factory) as session:
                _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                normalized_week_start = week_start - timedelta(days=week_start.weekday())
                return context.recipe_service_factory(session).create_entry(
                    refrigerator_id,
                    normalized_week_start,
                    payload.weekday,
                    payload.dish_name,
                    payload.note,
                    [ingredient.model_dump() for ingredient in payload.ingredients],
                )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/recipes/{entry_id}/complete",
        response_model=RecipeEntryResponse,
    )
    def complete_recipe_entry(
        refrigerator_id: str, entry_id: str, current_owner: str = Depends(context.owner_id)
    ) -> RecipeEntryResponse:
        """原子扣减最早 BBD 批次并记录可逆的逐批次消费审计。"""
        try:
            with context.transaction(context.session_factory) as session:
                _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                return context.recipe_service_factory(session).complete(refrigerator_id, entry_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/recipes/{entry_id}/undo",
        response_model=RecipeEntryResponse,
    )
    def undo_recipe_entry(
        refrigerator_id: str, entry_id: str, current_owner: str = Depends(context.owner_id)
    ) -> RecipeEntryResponse:
        """原子恢复该完成动作所有原批次的实际扣减数量。"""
        try:
            with context.transaction(context.session_factory) as session:
                _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                return context.recipe_service_factory(session).undo(refrigerator_id, entry_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/restock",
        response_model=list[RestockEntryResponse],
    )
    def restock_list(
        refrigerator_id: str, week_start: date, current_owner: str = Depends(context.owner_id)
    ) -> list[RestockEntryResponse]:
        """读取本周和下周未完成食谱中按菜名分组的动态缺货清单。"""
        with context.session_factory() as session:
            _require_owned_refrigerator(session, refrigerator_id, current_owner)
            normalized_week_start = week_start - timedelta(days=week_start.weekday())
            return context.recipe_service_factory(session).restock(
                refrigerator_id, normalized_week_start
            )
