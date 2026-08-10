"""自动物品分类匹配服务测试。"""

import asyncio
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

import pytest
from fridgeboard.api_models import CategoryMatchRequest
from fridgeboard.category_match_routes import _MatchState
from fridgeboard.category_matching import MatchResult, match_item_name, normalize_item_name
from fridgeboard.main import create_app
from fridgeboard.persistence.database import (
    create_database_engine,
    create_session_factory,
    transaction,
)
from fridgeboard.persistence.models import Base, ItemCategoryMapping
from pydantic import ValidationError
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


def test_category_match_api_uses_builtin_alias_and_ai_whitelist(tmp_path) -> None:
    """快速接口命中别名，AI 只能返回当前冰箱候选小类。"""
    database_url = f"sqlite:///{tmp_path / 'category-match.db'}"
    Base.metadata.create_all(create_database_engine(database_url))
    calls: list[list[dict[str, object]]] = []

    def provider(
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
    Base.metadata.create_all(create_database_engine(database_url))
    calls: list[str] = []

    def provider(name: str, _candidates: list[dict[str, object]]) -> dict[str, object]:
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


def test_category_match_cleanup_never_removes_confirmed_mapping(tmp_path) -> None:
    """请求式清理只删除过期临时记录，确认映射即使带旧过期值也须保留。"""
    database_url = f"sqlite:///{tmp_path / 'category-match-cleanup.db'}"
    Base.metadata.create_all(create_database_engine(database_url))
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
    Base.metadata.create_all(create_database_engine(database_url))

    def provider(_name: str, _candidates: list[dict[str, object]]) -> dict[str, object]:
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
    Base.metadata.create_all(create_database_engine(database_url))
    started = threading.Event()
    cancelled = threading.Event()

    async def provider(
        _name: str, _candidates: list[dict[str, object]]
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
    with create_session_factory(create_database_engine(database_url))() as session:
        assert session.query(ItemCategoryMapping).count() == 0
