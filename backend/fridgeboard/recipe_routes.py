"""食谱与动态补货 HTTP 路由。

本模块只负责食谱相关请求的认证、事务边界和响应类型声明；食谱解析、库存扣减及
缺货计算仍由 ``RecipeService`` 负责。应用创建模块通过 ``RecipeRouteContext`` 显式
注入数据库会话、事务管理器、所有者依赖和服务工厂，避免路由模块反向依赖应用入口。
"""

from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from datetime import date, timedelta

from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from fridgeboard.api_models import (
    CategoryMatchRequest,
    CategoryMatchResponse,
    CustomShoppingItemInput,
    CustomShoppingItemResponse,
    CustomShoppingItemsRequest,
    RecipeCopyRequest,
    RecipeDayResponse,
    RecipeEntryResponse,
    RecipeEntryWriteRequest,
    RecipeHistoryWeekResponse,
    RecipeImportRequest,
    RestockEntryResponse,
)
from fridgeboard.category_match_routes import (
    OwnerCategoryMatchContext,
    _MatchState,
    _run_ai,
    deterministic_category_match,
)
from fridgeboard.persistence.models import CustomShoppingItem
from fridgeboard.recipe_service import RecipeService
from fridgeboard.recognition import CategoryRecognitionProvider
from fridgeboard.route_auth import require_owned_refrigerator as _require_owned_refrigerator

SessionFactory = Callable[[], AsyncSession]
TransactionFactory = Callable[[SessionFactory], AbstractAsyncContextManager[AsyncSession]]
OwnerDependency = Callable[..., str]
RecipeServiceFactory = Callable[[AsyncSession], RecipeService]


@dataclass(frozen=True)
class RecipeRouteContext:
    """食谱路由需要的应用级依赖集合。"""

    session_factory: SessionFactory
    transaction: TransactionFactory
    owner_id: OwnerDependency
    recipe_service_factory: RecipeServiceFactory
    category_provider: CategoryRecognitionProvider | None = None
    category_model_name: str | None = None


async def _match_custom_shopping_item(
    refrigerator_id: str,
    item_name: str,
    owner: str,
    context: RecipeRouteContext,
    category_context: OwnerCategoryMatchContext,
    match_state: _MatchState,
) -> str | None:
    """按确定性规则匹配购物项，未命中时使用已配置的 AI 兜底。"""
    async with context.session_factory() as session:
        result = await deterministic_category_match(session, refrigerator_id, item_name)
    if result is not None:
        return result.subcategory_id
    if context.category_provider is None:
        return None
    response: CategoryMatchResponse = await _run_ai(
        refrigerator_id,
        CategoryMatchRequest(item_name=item_name),
        owner,
        category_context,
        match_state,
    )
    return response.subcategory_id if response.status == "matched" else None


def _normalized_week_start(value: date) -> date:
    """将任意日期归一化为所在自然周的周一。"""
    return value - timedelta(days=value.weekday())


def register_recipe_routes(application: FastAPI, context: RecipeRouteContext) -> None:
    """向应用注册食谱和动态补货路由。

    Args:
        application: 要追加路由的 FastAPI 应用实例。
        context: 路由运行所需的会话、事务、认证依赖和服务工厂。
    """

    match_state = _MatchState()
    category_context = OwnerCategoryMatchContext(
        session_factory=context.session_factory,
        transaction=context.transaction,
        owner_id=context.owner_id,
        category_provider=context.category_provider,
        category_model_name=context.category_model_name,
    )

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/recipes",
        response_model=list[RecipeDayResponse],
    )
    async def recipe_week(
        refrigerator_id: str, week_start: date, current_owner: str = Depends(context.owner_id)
    ) -> list[RecipeDayResponse]:
        """返回指定周固定七天的食谱，并即时计算未完成菜的缺货。"""
        normalized_week_start = week_start - timedelta(days=week_start.weekday())
        async with context.session_factory() as session:
            await _require_owned_refrigerator(session, refrigerator_id, current_owner)
            return await context.recipe_service_factory(session).list_week(
                refrigerator_id, normalized_week_start
            )

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/recipes/import",
        response_model=list[RecipeEntryResponse],
        status_code=201,
    )
    async def import_recipes(
        refrigerator_id: str,
        payload: RecipeImportRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> list[RecipeEntryResponse]:
        """解析并导入多行食谱；未知小类要求用户在编辑页精确改正。"""
        try:
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                week_start = payload.week_start - timedelta(days=payload.week_start.weekday())
                return await context.recipe_service_factory(session).import_text(
                    refrigerator_id, week_start, payload.text, overwrite=payload.mode == "overwrite"
                )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/recipes/history",
        response_model=list[RecipeHistoryWeekResponse],
    )
    async def recipe_history(
        refrigerator_id: str,
        week_start: date | None = None,
        current_owner: str = Depends(context.owner_id),
    ) -> list[RecipeHistoryWeekResponse]:
        """返回不含本周和下周的最近八周菜单摘要。"""
        normalized_week_start = _normalized_week_start(week_start or date.today())
        async with context.session_factory() as session:
            await _require_owned_refrigerator(session, refrigerator_id, current_owner)
            return await context.recipe_service_factory(session).list_history(
                refrigerator_id, normalized_week_start
            )

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/recipes/copy",
        response_model=list[RecipeDayResponse],
    )
    async def copy_recipe_history(
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
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                current_week_start = _normalized_week_start(week_start or date.today())
                source_week_start = _normalized_week_start(payload.source_week_start)
                target_week_start = _normalized_week_start(payload.target_week_start)
                return await context.recipe_service_factory(session).copy_history_week(
                    refrigerator_id, current_week_start, source_week_start, target_week_start
                )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.put(
        "/api/owner/refrigerators/{refrigerator_id}/recipes/{entry_id}",
        response_model=RecipeEntryResponse,
    )
    async def update_recipe(
        refrigerator_id: str,
        entry_id: str,
        payload: RecipeEntryWriteRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> RecipeEntryResponse:
        """编辑食谱；完成食谱仅接受做法和备注变化，未完成食谱接受完整编辑。"""
        try:
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                return await context.recipe_service_factory(session).update_entry(
                    refrigerator_id,
                    entry_id,
                    payload.weekday,
                    payload.dish_name,
                    payload.method,
                    payload.note,
                    [ingredient.model_dump() for ingredient in payload.ingredients],
                )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.delete(
        "/api/owner/refrigerators/{refrigerator_id}/recipes/{entry_id}",
        status_code=204,
    )
    async def delete_recipe(
        refrigerator_id: str,
        entry_id: str,
        current_owner: str = Depends(context.owner_id),
    ) -> None:
        """删除一条食谱及其关联数据。"""
        try:
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                await context.recipe_service_factory(session).delete_entry(
                    refrigerator_id, entry_id
                )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/recipes",
        response_model=RecipeEntryResponse,
        status_code=201,
    )
    async def create_recipe(
        refrigerator_id: str,
        week_start: date,
        payload: RecipeEntryWriteRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> RecipeEntryResponse:
        """在指定周新增一道未完成食谱。"""
        try:
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                normalized_week_start = week_start - timedelta(days=week_start.weekday())
                return await context.recipe_service_factory(session).create_entry(
                    refrigerator_id,
                    normalized_week_start,
                    payload.weekday,
                    payload.dish_name,
                    payload.method,
                    payload.note,
                    [ingredient.model_dump() for ingredient in payload.ingredients],
                )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/recipes/{entry_id}/complete",
        response_model=RecipeEntryResponse,
    )
    async def complete_recipe_entry(
        refrigerator_id: str, entry_id: str, current_owner: str = Depends(context.owner_id)
    ) -> RecipeEntryResponse:
        """原子扣减最早 BBD 批次并记录可逆的逐批次消费审计。"""
        try:
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                return await context.recipe_service_factory(session).complete(
                    refrigerator_id, entry_id
                )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/recipes/{entry_id}/undo",
        response_model=RecipeEntryResponse,
    )
    async def undo_recipe_entry(
        refrigerator_id: str, entry_id: str, current_owner: str = Depends(context.owner_id)
    ) -> RecipeEntryResponse:
        """原子恢复该完成动作所有原批次的实际扣减数量。"""
        try:
            async with context.transaction(context.session_factory) as session:
                await _require_owned_refrigerator(
                    session, refrigerator_id, current_owner, failure_status=400
                )
                return await context.recipe_service_factory(session).undo(refrigerator_id, entry_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/restock",
        response_model=list[RestockEntryResponse],
    )
    async def restock_list(
        refrigerator_id: str, week_start: date, current_owner: str = Depends(context.owner_id)
    ) -> list[RestockEntryResponse]:
        """读取本周和下周未完成食谱中按菜名分组的动态缺货清单。"""
        async with context.session_factory() as session:
            await _require_owned_refrigerator(session, refrigerator_id, current_owner)
            normalized_week_start = week_start - timedelta(days=week_start.weekday())
            return await context.recipe_service_factory(session).restock(
                refrigerator_id, normalized_week_start
            )

    @application.get(
        "/api/owner/refrigerators/{refrigerator_id}/custom-shopping-items",
        response_model=list[CustomShoppingItemResponse],
    )
    async def custom_shopping_items(
        refrigerator_id: str, current_owner: str = Depends(context.owner_id)
    ) -> list[CustomShoppingItemResponse]:
        """读取当前所有者冰箱中的自定义购物清单项。"""
        async with context.session_factory() as session:
            await _require_owned_refrigerator(session, refrigerator_id, current_owner)
            items = await session.scalars(
                select(CustomShoppingItem)
                .where(CustomShoppingItem.refrigerator_id == refrigerator_id)
                .order_by(CustomShoppingItem.display_order, CustomShoppingItem.created_at)
            )
            return [
                CustomShoppingItemResponse.model_validate(item, from_attributes=True)
                for item in items
            ]

    @application.post(
        "/api/owner/refrigerators/{refrigerator_id}/custom-shopping-items",
        response_model=list[CustomShoppingItemResponse],
        status_code=201,
    )
    async def add_custom_shopping_items(
        refrigerator_id: str,
        payload: CustomShoppingItemsRequest,
        current_owner: str = Depends(context.owner_id),
    ) -> list[CustomShoppingItemResponse]:
        """将一批手工购物项追加到当前所有者的冰箱清单。"""
        async with context.session_factory() as session:
            await _require_owned_refrigerator(
                session, refrigerator_id, current_owner, failure_status=400
            )
        subcategory_ids = [
            await _match_custom_shopping_item(
                refrigerator_id,
                item.item_name,
                current_owner,
                context,
                category_context,
                match_state,
            )
            for item in payload.items
        ]
        async with context.transaction(context.session_factory) as session:
            await _require_owned_refrigerator(
                session, refrigerator_id, current_owner, failure_status=400
            )
            next_order = await session.scalar(
                select(func.coalesce(func.max(CustomShoppingItem.display_order), -1) + 1).where(
                    CustomShoppingItem.refrigerator_id == refrigerator_id
                )
            )
            created = [
                CustomShoppingItem(
                    refrigerator_id=refrigerator_id,
                    item_name=item.item_name,
                    quantity=item.quantity,
                    subcategory_id=subcategory_ids[index],
                    display_order=int(next_order) + index,
                )
                for index, item in enumerate(payload.items)
            ]
            session.add_all(created)
            await session.flush()
            return [
                CustomShoppingItemResponse.model_validate(item, from_attributes=True)
                for item in created
            ]

    @application.put(
        "/api/owner/refrigerators/{refrigerator_id}/custom-shopping-items/{item_id}",
        response_model=CustomShoppingItemResponse,
    )
    async def update_custom_shopping_item(
        refrigerator_id: str,
        item_id: str,
        payload: CustomShoppingItemInput,
        current_owner: str = Depends(context.owner_id),
    ) -> CustomShoppingItemResponse:
        """更新当前所有者冰箱中的一项自定义购物项。"""
        async with context.session_factory() as session:
            await _require_owned_refrigerator(
                session, refrigerator_id, current_owner, failure_status=400
            )
            item = await session.get(CustomShoppingItem, item_id)
            if item is None or item.refrigerator_id != refrigerator_id:
                raise HTTPException(status_code=400, detail="自定义购物项不存在")
        subcategory_id = await _match_custom_shopping_item(
            refrigerator_id,
            payload.item_name,
            current_owner,
            context,
            category_context,
            match_state,
        )
        async with context.transaction(context.session_factory) as session:
            await _require_owned_refrigerator(
                session, refrigerator_id, current_owner, failure_status=400
            )
            item = await session.get(CustomShoppingItem, item_id)
            if item is None or item.refrigerator_id != refrigerator_id:
                raise HTTPException(status_code=400, detail="自定义购物项不存在")
            item.item_name = payload.item_name
            item.quantity = payload.quantity
            item.subcategory_id = subcategory_id
            await session.flush()
            return CustomShoppingItemResponse.model_validate(item, from_attributes=True)

    @application.delete(
        "/api/owner/refrigerators/{refrigerator_id}/custom-shopping-items/{item_id}",
        status_code=204,
    )
    async def delete_custom_shopping_item(
        refrigerator_id: str,
        item_id: str,
        current_owner: str = Depends(context.owner_id),
    ) -> None:
        """删除当前所有者冰箱中的一项自定义购物项。"""
        async with context.transaction(context.session_factory) as session:
            await _require_owned_refrigerator(
                session, refrigerator_id, current_owner, failure_status=400
            )
            item = await session.get(CustomShoppingItem, item_id)
            if item is None or item.refrigerator_id != refrigerator_id:
                raise HTTPException(status_code=400, detail="自定义购物项不存在")
            await session.delete(item)
