"""自动物品分类匹配服务测试。"""

import asyncio
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from fridgeboard.api_models import CategoryMatchRequest
from fridgeboard.category_match_routes import _MatchState
from fridgeboard.category_matching import (
    MatchResult,
    match_confirmed_item_name,
    match_exact_category_name,
    match_item_name,
    normalize_item_name,
)
from fridgeboard.main import create_app
from fridgeboard.persistence.database import (
    create_database_engine,
    create_database_schema,
    create_session_factory,
    sync_session,
    transaction,
)
from fridgeboard.persistence.models import InventoryBatchModel, ItemCategoryMapping
from pydantic import ValidationError
from sqlalchemy import select
from support import start_test_client


def test_category_match_request_rejects_whitespace_only_item_name() -> None:
    """空白物品名不能进入分类匹配或缓存流程。"""
    with pytest.raises(ValidationError):
        CategoryMatchRequest(item_name="   ")


def test_normalize_item_name_collapses_compatibility_variants() -> None:
    """标准化应合并全角字符、大小写和多余空白。"""
    assert normalize_item_name("  ＡＢＣ　牛奶  ") == "abc 牛奶"


def test_match_item_name_prefers_exact_alias_over_fuzzy_candidate() -> None:
    """预定义别名精确命中时，不应被相似但错误的分类抢走。"""
    result = match_item_name(
        "蒙牛纯牛奶",
        [
            {"id": "dairy", "name": "奶品", "aliases": ["牛奶", "纯牛奶"]},
            {"id": "dessert", "name": "甜点", "aliases": ["奶油"]},
        ],
    )
    assert result == MatchResult("dairy", "奶品", "builtin", 0.94)


def test_match_item_name_leaves_ambiguous_name_unmatched() -> None:
    """无法拉开候选差距时必须交给大模型或用户确认。"""
    result = match_item_name(
        "奶油",
        [
            {"id": "dairy", "name": "奶品", "aliases": ["奶"]},
            {"id": "dessert", "name": "甜点", "aliases": ["奶"]},
        ],
    )
    assert result is None


def test_exact_category_name_is_explicit_and_does_not_use_aliases() -> None:
    """分类名称精确匹配应独立于别名和相似度规则。"""
    candidates = [
        {"id": "pork", "name": "猪肉", "aliases": ["排骨"]},
        {"id": "staple", "name": "主食", "aliases": ["水饺"]},
    ]
    assert match_exact_category_name("猪肉", candidates) == MatchResult(
        "pork", "猪肉", "builtin", 0.99
    )
    assert match_exact_category_name("水饺", candidates) is None


def test_confirmed_mapping_prefers_compound_suffix_and_rejects_prefix() -> None:
    """用户确认的“水饺”应命中“猪肉水饺”，而不是前缀“猪肉”。"""
    candidates = [
        {"item_name": "猪肉", "id": "pork", "name": "猪肉"},
        {"item_name": "水饺", "id": "staple", "name": "主食"},
    ]
    assert match_confirmed_item_name("猪肉水饺", candidates) == MatchResult(
        "staple", "主食", "cache", 0.96
    )
    assert match_confirmed_item_name("水饺猪肉", candidates) == MatchResult(
        "pork", "猪肉", "cache", 0.96
    )
    assert match_confirmed_item_name(
        "牛奶巧克力", [{"item_name": "牛奶", "id": "dairy", "name": "奶品"}]
    ) is None


def test_category_match_prioritizes_user_mapping_and_category_name_over_ai_cache(
    tmp_path,
) -> None:
    """用户映射和精确分类名称均不得被未确认 AI 缓存覆盖。"""
    database_url = f"sqlite:///{tmp_path / 'category-match-priority.db'}"
    create_database_schema(database_url)
    client = start_test_client(
        create_app(database_url=database_url, development_owner_user_id="owner")
    )
    client.post("/api/auth/development-login")
    refrigerator_id = client.post(
        "/api/owner/refrigerators", json={"name": "厨房", "template_key": "mini"}
    ).json()["id"]
    session_factory = create_session_factory(create_database_engine(database_url))
    with transaction(session_factory) as session:
        session.add_all(
            [
                ItemCategoryMapping(
                    refrigerator_id=refrigerator_id,
                    normalized_item_name="用户商品",
                    display_item_name="用户商品",
                    subcategory_id="builtin-category-beef",
                    source="user",
                    confidence=1.0,
                    confirmed=True,
                    expires_at=None,
                ),
                ItemCategoryMapping(
                    refrigerator_id=refrigerator_id,
                    normalized_item_name="猪肉",
                    display_item_name="猪肉",
                    subcategory_id="builtin-category-beef",
                    source="ai",
                    confidence=0.99,
                    confirmed=False,
                    expires_at=datetime.now(UTC) + timedelta(days=1),
                ),
            ]
        )

    user_result = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/category-match",
        json={"item_name": "用户商品"},
    )
    assert user_result.json()["subcategory_id"] == "builtin-category-beef"
    assert user_result.json()["source"] == "cache"

    exact_category_result = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/category-match",
        json={"item_name": "猪肉"},
    )
    assert exact_category_result.json()["subcategory_id"] == "builtin-category-pork"
    assert exact_category_result.json()["source"] == "builtin"


def test_category_match_uses_explicit_inventory_category_when_mapping_cache_is_missing(
    tmp_path,
) -> None:
    """库存已有用户明确选择时，即使临时缓存缺失也不得退回大模型。"""
    database_url = f"sqlite:///{tmp_path / 'category-match-inventory-fallback.db'}"
    create_database_schema(database_url)
    client = start_test_client(
        create_app(database_url=database_url, development_owner_user_id="owner")
    )
    client.post("/api/auth/development-login")
    refrigerator_id = client.post(
        "/api/owner/refrigerators", json={"name": "厨房", "template_key": "mini"}
    ).json()["id"]
    slot_id = client.get(f"/api/owner/refrigerators/{refrigerator_id}/layout").json()[
        "zones"
    ][0]["slots"][0]["id"]
    session_factory = create_session_factory(create_database_engine(database_url))
    with transaction(session_factory) as session:
        session.add(
            InventoryBatchModel(
                refrigerator_id=refrigerator_id,
                subcategory_id="builtin-category-beef",
                storage_slot_id=slot_id,
                item_name="牛仔骨",
                quantity=Decimal("1"),
            )
        )

    response = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/category-match",
        json={"item_name": "牛仔骨"},
    )
    assert response.json()["subcategory_id"] == "builtin-category-beef"
    assert response.json()["source"] == "cache"


def test_category_match_api_uses_builtin_alias_and_ai_whitelist(tmp_path) -> None:
    """快速接口命中别名，AI 只能返回当前冰箱候选小类。"""
    database_url = f"sqlite:///{tmp_path / 'category-match.db'}"
    create_database_schema(database_url)
    calls: list[list[dict[str, object]]] = []

    async def provider(
        _name: str,
        candidates: list[dict[str, object]],
        on_progress=None,
    ) -> dict[str, object]:
        calls.append(candidates)
        if on_progress is not None:
            on_progress('{"subcategory_id":')
            on_progress('"builtin-category-egg"}')
        return {"subcategory_id": {"value": "builtin-category-egg", "confidence": 0.91}}

    client = start_test_client(
        create_app(
            database_url=database_url,
            development_owner_user_id="owner",
            category_provider=provider,
            category_model_name="test-category-model-v3",
        )
    )
    client.post("/api/auth/development-login")
    refrigerator = client.post(
        "/api/owner/refrigerators", json={"name": "厨房", "template_key": "mini"}
    ).json()
    refrigerator_id = refrigerator["id"]

    fast = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/category-match",
        json={"item_name": "蒙牛纯牛奶"},
    )
    assert fast.status_code == 200
    assert fast.json()["subcategory_name"] == "奶品"
    assert fast.json()["source"] == "builtin"
    assert calls == []

    pending = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/category-match",
        json={"item_name": "神秘商品"},
    ).json()
    assert pending["status"] == "needs_ai"
    ai = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/category-match/ai",
        json={"item_name": "神秘商品", "request_id": pending["request_id"]},
    )
    assert ai.status_code == 200
    assert ai.json()["subcategory_id"] == "builtin-category-egg"
    assert calls and isinstance(calls[0][0]["aliases"], list)
    stream_pending = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/category-match",
        json={"item_name": "另一个神秘商品"},
    ).json()
    stream = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/category-match/ai/stream",
        json={"item_name": "另一个神秘商品", "request_id": stream_pending["request_id"]},
    )
    assert stream.status_code == 200
    assert '"message": "正在接收模型输出…"' in stream.text
    assert stream.text.count("event: token") == 2
    assert '"text_length": 41' in stream.text
    assert '"subcategory_id": "builtin-category-egg"' in stream.text
    cached = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/category-match",
        json={"item_name": "神秘商品"},
    )
    assert cached.json()["source"] == "cache"

    layout = client.get(f"/api/owner/refrigerators/{refrigerator_id}/layout").json()
    categories = client.get(f"/api/owner/refrigerators/{refrigerator_id}/categories").json()
    dairy = next(item for item in categories if item["name"] == "奶品")
    client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory",
        json={
            "subcategory_id": dairy["id"],
            "storage_slot_id": layout["zones"][0]["slots"][0]["id"],
            "item_name": "神秘商品",
            "quantity": 1,
        },
    )
    corrected = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/category-match",
        json={"item_name": "神秘商品"},
    )
    assert corrected.json()["subcategory_id"] == dairy["id"]
    assert corrected.json()["source"] == "cache"


def test_category_match_ignores_expired_ai_cache(tmp_path) -> None:
    """过期的 AI 映射不能继续阻塞后台重新分类。"""
    database_path = tmp_path / "expired-category-match.db"
    database_url = f"sqlite:///{database_path}"
    create_database_schema(database_url)
    calls: list[str] = []

    async def provider(
        name: str,
        _candidates: list[dict[str, object]],
        on_progress=None,
    ) -> dict[str, object]:
        calls.append(name)
        return {"subcategory_id": {"value": "builtin-category-egg", "confidence": 0.9}}

    client = start_test_client(
        create_app(
            database_url=database_url,
            development_owner_user_id="owner",
            category_provider=provider,
            category_model_name="test-category-model-v3",
        )
    )
    client.post("/api/auth/development-login")
    refrigerator = client.post(
        "/api/owner/refrigerators", json={"name": "厨房", "template_key": "mini"}
    ).json()
    refrigerator_id = refrigerator["id"]
    with transaction(create_session_factory(create_database_engine(database_url))) as session:
        session.add(
            ItemCategoryMapping(
                refrigerator_id=refrigerator_id,
                normalized_item_name="神秘商品",
                display_item_name="神秘商品",
                subcategory_id="builtin-category-egg",
                source="ai",
                confidence=0.95,
                confirmed=False,
                expires_at=datetime.now(UTC) - timedelta(days=1),
            )
        )

    response = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/category-match",
        json={"item_name": "神秘商品"},
    )
    assert response.json()["status"] == "needs_ai"
    ai = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/category-match/ai",
        json={"item_name": "神秘商品"},
    )
    assert ai.json()["source"] == "ai"
    assert calls == ["神秘商品"]

    with transaction(create_session_factory(create_database_engine(database_url))) as session:
        refreshed = session.get(
            ItemCategoryMapping,
            {
                "refrigerator_id": refrigerator_id,
                "normalized_item_name": "神秘商品",
            },
        )
        assert refreshed is not None
        assert refreshed.model_name == "test-category-model-v3"
        assert refreshed.expires_at is not None


def test_category_match_stream_logs_unexpected_provider_error(tmp_path, caplog) -> None:
    """分类 SSE 将非预期 provider 异常记录完整堆栈后返回可恢复错误。"""
    database_url = f"sqlite:///{tmp_path / 'category-match-stream-error.db'}"
    create_database_schema(database_url)

    async def provider(_name: str, _candidates: list[dict[str, object]], on_progress=None):
        del on_progress
        raise ValueError("provider contract mismatch")

    client = start_test_client(
        create_app(
            database_url=database_url,
            development_owner_user_id="owner",
            category_provider=provider,
        )
    )
    client.post("/api/auth/development-login")
    refrigerator = client.post(
        "/api/owner/refrigerators", json={"name": "厨房", "template_key": "mini"}
    ).json()
    path = f"/api/owner/refrigerators/{refrigerator['id']}/category-match/ai/stream"

    with caplog.at_level("ERROR", logger="fridgeboard.category_match_routes"):
        response = client.post(path, json={"item_name": "神秘商品"})

    assert response.status_code == 200
    assert 'event: error' in response.text
    assert "分类 SSE 调用失败" in caplog.text
    assert "provider contract mismatch" not in response.text


def test_category_match_cleanup_never_removes_confirmed_mapping(tmp_path) -> None:
    """请求式清理只删除过期临时记录，确认映射即使带旧过期值也须保留。"""
    database_url = f"sqlite:///{tmp_path / 'category-match-cleanup.db'}"
    create_database_schema(database_url)
    client = start_test_client(
        create_app(database_url=database_url, development_owner_user_id="owner")
    )
    client.post("/api/auth/development-login")
    refrigerator_id = client.post(
        "/api/owner/refrigerators", json={"name": "厨房", "template_key": "mini"}
    ).json()["id"]
    session_factory = create_session_factory(create_database_engine(database_url))
    expired_at = datetime.now(UTC) - timedelta(days=1)
    with transaction(session_factory) as session:
        session.add_all(
            [
                ItemCategoryMapping(
                    refrigerator_id=refrigerator_id,
                    normalized_item_name="过期临时商品",
                    display_item_name="过期临时商品",
                    subcategory_id="builtin-category-egg",
                    source="ai",
                    confidence=0.95,
                    confirmed=False,
                    model_name="old-model",
                    expires_at=expired_at,
                ),
                ItemCategoryMapping(
                    refrigerator_id=refrigerator_id,
                    normalized_item_name="用户确认商品",
                    display_item_name="用户确认商品",
                    subcategory_id="builtin-category-egg",
                    source="user",
                    confidence=1.0,
                    confirmed=True,
                    expires_at=expired_at,
                ),
            ]
        )

    response = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/category-match",
        json={"item_name": "用户确认商品"},
    )
    assert response.json()["source"] == "cache"
    with transaction(session_factory) as session:
        assert session.get(
            ItemCategoryMapping,
            {
                "refrigerator_id": refrigerator_id,
                "normalized_item_name": "过期临时商品",
            },
        ) is None
        assert session.get(
            ItemCategoryMapping,
            {
                "refrigerator_id": refrigerator_id,
                "normalized_item_name": "用户确认商品",
            },
        ) is not None


def test_ai_result_does_not_downgrade_confirmed_mapping(tmp_path) -> None:
    """晚到的 AI 结果不得把已经确认的用户映射改回临时状态。"""
    database_url = f"sqlite:///{tmp_path / 'confirmed-category-match.db'}"
    create_database_schema(database_url)

    async def provider(
        _name: str,
        _candidates: list[dict[str, object]],
        on_progress=None,
    ) -> dict[str, object]:
        return {"subcategory_id": {"value": "builtin-category-egg", "confidence": 0.93}}

    client = start_test_client(
        create_app(
            database_url=database_url,
            development_owner_user_id="owner",
            category_provider=provider,
            category_model_name="test-category-model-v3",
        )
    )
    client.post("/api/auth/development-login")
    refrigerator_id = client.post(
        "/api/owner/refrigerators", json={"name": "厨房", "template_key": "mini"}
    ).json()["id"]
    session_factory = create_session_factory(create_database_engine(database_url))
    with transaction(session_factory) as session:
        session.add(
            ItemCategoryMapping(
                refrigerator_id=refrigerator_id,
                normalized_item_name="竞态商品",
                display_item_name="竞态商品",
                subcategory_id="builtin-category-dairy",
                source="user",
                confidence=1.0,
                confirmed=True,
                expires_at=None,
            )
        )

    response = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/category-match/ai",
        json={"item_name": "竞态商品", "request_id": "late-request"},
    )
    assert response.status_code == 200
    with transaction(session_factory) as session:
        mapping = session.get(
            ItemCategoryMapping,
            {
                "refrigerator_id": refrigerator_id,
                "normalized_item_name": "竞态商品",
            },
        )
        assert mapping is not None
        assert mapping.confirmed
        assert mapping.source == "user"
        assert mapping.subcategory_id == "builtin-category-dairy"
        assert mapping.expires_at is None


def test_cancelled_match_state_is_bounded_and_consumed() -> None:
    """取消状态只短暂保留，并在消费后删除。"""
    state = _MatchState(ttl_seconds=10)
    state.mark_cancelled("request-1", now=100.0)
    assert state.consume_if_cancelled("request-1", now=105.0)
    assert not state.consume_if_cancelled("request-1", now=105.0)
    state.mark_cancelled("request-2", now=100.0)
    assert not state.consume_if_cancelled("request-2", now=111.0)


def test_category_match_cancel_interrupts_running_async_provider(tmp_path) -> None:
    """取消接口应中断正在等待的异步模型调用，且不写入分类缓存。"""
    database_url = f"sqlite:///{tmp_path / 'cancel-category-match.db'}"
    create_database_schema(database_url)
    started = threading.Event()
    cancelled = threading.Event()

    async def provider(
        _name: str, _candidates: list[dict[str, object]], on_progress=None
    ) -> dict[str, object]:
        started.set()
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            cancelled.set()
            raise

    client = start_test_client(
        create_app(
            database_url=database_url,
            development_owner_user_id="owner",
            category_provider=provider,
        )
    )
    client.post("/api/auth/development-login")
    refrigerator_id = client.post(
        "/api/owner/refrigerators", json={"name": "厨房", "template_key": "mini"}
    ).json()["id"]
    pending = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/category-match",
        json={"item_name": "待取消商品"},
    ).json()

    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(
            client.post,
            f"/api/owner/refrigerators/{refrigerator_id}/category-match/ai",
            json={"item_name": "待取消商品", "request_id": pending["request_id"]},
        )
        assert started.wait(timeout=2)
        response = client.delete(
            f"/api/owner/refrigerators/{refrigerator_id}/category-match/"
            f"{pending['request_id']}"
        )
        ai_response = future.result(timeout=2)

    assert response.status_code == 204
    assert cancelled.wait(timeout=1)
    assert ai_response.status_code == 200
    assert ai_response.json()["status"] == "not_found"
    session_factory = create_session_factory(create_database_engine(database_url))
    with sync_session(session_factory) as session:
        assert session.scalar(
            select(ItemCategoryMapping.subcategory_id).limit(1)
        ) is None
