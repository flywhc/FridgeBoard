"""回填历史食谱食材和自定义购物项的小类归属。"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
from dataclasses import dataclass

from sqlalchemy import select

from fridgeboard.api_models import CategoryMatchRequest
from fridgeboard.category_match_routes import (
    OwnerCategoryMatchContext,
    _MatchState,
    _run_ai,
    deterministic_category_match,
)
from fridgeboard.persistence.database import (
    SessionFactory,
    create_database_engine,
    create_session_factory,
)
from fridgeboard.persistence.models import (
    CustomShoppingItem,
    RecipeEntry,
    RecipeIngredientModel,
    RecipePlan,
    Refrigerator,
)
from fridgeboard.recognition import (
    CategoryRecognitionProvider,
    agnes_category_provider_from_environment,
)

logger = logging.getLogger(__name__)


@dataclass
class CategoryBackfillSummary:
    """一次历史分类回填的结果统计。"""

    deterministic: int = 0
    ai: int = 0
    unresolved: int = 0
    failed: int = 0


@dataclass(frozen=True)
class _BackfillTarget:
    """一个待回填的历史来源记录。"""

    kind: str
    item_id: str
    refrigerator_id: str
    item_name: str
    owner_user_id: str


async def _targets(session_factory: SessionFactory) -> list[_BackfillTarget]:
    """读取所有未分类且属于活跃冰箱的历史来源记录。"""
    async with session_factory() as session:
        refrigerators = {
            refrigerator.id: refrigerator.owner_user_id
            for refrigerator in await session.scalars(
                select(Refrigerator).where(Refrigerator.deleted_at.is_(None))
            )
        }
        targets: list[_BackfillTarget] = []
        for item in await session.scalars(
            select(CustomShoppingItem).where(CustomShoppingItem.subcategory_id.is_(None))
        ):
            owner = refrigerators.get(item.refrigerator_id)
            if owner is not None:
                targets.append(
                    _BackfillTarget(
                        "shopping", item.id, item.refrigerator_id, item.item_name, owner
                    )
                )
        recipe_rows = await session.execute(
            select(RecipeIngredientModel, RecipePlan.refrigerator_id, Refrigerator.owner_user_id)
            .join(RecipeEntry, RecipeEntry.id == RecipeIngredientModel.recipe_entry_id)
            .join(RecipePlan, RecipePlan.id == RecipeEntry.recipe_plan_id)
            .join(Refrigerator, Refrigerator.id == RecipePlan.refrigerator_id)
            .where(
                RecipeIngredientModel.subcategory_id.is_(None),
                Refrigerator.deleted_at.is_(None),
            )
        )
        for ingredient, refrigerator_id, owner in recipe_rows:
            targets.append(
                _BackfillTarget(
                    "recipe", ingredient.id, refrigerator_id, ingredient.raw_name, owner
                )
            )
        return targets


async def _update_target(
    session_factory: SessionFactory, target: _BackfillTarget, category_id: str
) -> bool:
    """在记录仍为空时写入回填分类，避免覆盖并发中的用户选择。"""
    async with session_factory() as session:
        async with session.begin():
            model = (
                await session.get(CustomShoppingItem, target.item_id)
                if target.kind == "shopping"
                else await session.get(RecipeIngredientModel, target.item_id)
            )
            if model is None or model.subcategory_id is not None:
                return False
            model.subcategory_id = category_id
            return True


async def backfill_missing_category_ids(
    database_url: str,
    provider: CategoryRecognitionProvider | None,
    model_name: str | None,
    *,
    dry_run: bool = False,
) -> CategoryBackfillSummary:
    """回填目标数据库中缺失的小类 ID。

    Args:
        database_url: 要实际操作的 SQLite 数据库 URL。
        provider: 未命中确定性规则时使用的分类模型；为空时只执行确定性回填。
        model_name: 分类模型版本标识。
        dry_run: 只统计确定性可回填项，不写库且不调用外部模型。

    Returns:
        记录确定性、AI、未解决和失败数量的统计对象。
    """
    engine = create_database_engine(database_url)
    session_factory = create_session_factory(engine)
    summary = CategoryBackfillSummary()
    match_state = _MatchState()
    try:
        for target in await _targets(session_factory):
            try:
                async with session_factory() as session:
                    match = await deterministic_category_match(
                        session, target.refrigerator_id, target.item_name
                    )
                if match is not None:
                    if dry_run or await _update_target(
                        session_factory, target, match.subcategory_id
                    ):
                        summary.deterministic += 1
                    continue
                if dry_run or provider is None:
                    summary.unresolved += 1
                    continue
                category_context = OwnerCategoryMatchContext(
                    session_factory=session_factory,
                    transaction=lambda factory: factory.begin(),
                    owner_id=lambda: target.owner_user_id,
                    category_provider=provider,
                    category_model_name=model_name,
                )
                response = await _run_ai(
                    target.refrigerator_id,
                    CategoryMatchRequest(item_name=target.item_name),
                    target.owner_user_id,
                    category_context,
                    match_state,
                )
                if response.status != "matched" or not response.subcategory_id:
                    summary.unresolved += 1
                elif await _update_target(
                    session_factory, target, response.subcategory_id
                ):
                    summary.ai += 1
            except Exception:
                summary.failed += 1
                logger.exception(
                    "历史分类回填失败 kind=%s item_id=%s refrigerator_id=%s",
                    target.kind,
                    target.item_id,
                    target.refrigerator_id,
                )
    finally:
        await engine.dispose()
    return summary


def _parse_args() -> argparse.Namespace:
    """解析历史分类回填命令行参数。"""
    parser = argparse.ArgumentParser(description="回填历史食谱食材和购物项分类")
    parser.add_argument(
        "--database-url",
        default=os.environ.get("FRIDGEBOARD_DATABASE_URL", "sqlite:///./fridgeboard.db"),
    )
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def main() -> None:
    """使用部署环境配置执行历史分类回填。"""
    args = _parse_args()
    provider = agnes_category_provider_from_environment()
    summary = asyncio.run(
        backfill_missing_category_ids(
            args.database_url,
            provider,
            os.environ.get("FRIDGEBOARD_AGNES_MODEL"),
            dry_run=args.dry_run,
        )
    )
    print(
        "分类回填完成："
        f"deterministic={summary.deterministic} "
        f"ai={summary.ai} unresolved={summary.unresolved} failed={summary.failed}"
    )


if __name__ == "__main__":
    main()
