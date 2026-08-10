"""P6 相机识别、临时媒体和条码复用的契约测试。"""

import asyncio
import base64
import json
import logging
from decimal import Decimal
from pathlib import Path

import fridgeboard.product_lookup as product_lookup_module
import fridgeboard.recognition as recognition_module
import pytest
from fastapi.testclient import TestClient
from fridgeboard.icon_service import agnes_icon_provider_from_environment
from fridgeboard.main import create_app
from fridgeboard.persistence.database import create_database_engine
from fridgeboard.persistence.models import Base
from fridgeboard.recognition import (
    agnes_category_provider_from_environment,
    agnes_provider_from_environment,
    normalize_order_item_name,
    parse_order_item_price,
)
from support import start_test_client


class _FakeAgnesResponse:
    """为识别适配器测试提供最小的 HTTP 响应上下文。"""

    def __init__(self, body: bytes | None = None, status: int = 200) -> None:
        self.body = body or json.dumps(
            {"choices": [{"message": {"content": '```json\n{"kind": "unknown"}\n```'}}]}
        ).encode()
        self.status = status
        self.headers = {"content-type": "application/json"}

    def __enter__(self) -> "_FakeAgnesResponse":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self) -> bytes:
        return self.body


def test_agnes_providers_share_the_same_configured_api_token() -> None:
    """识别和图像模型都通过同一配置读取器读取共享 Agnes key。"""
    requested: list[str] = []

    def env_value(name: str, default: str | None = None) -> str | None:
        requested.append(name)
        return {"FRIDGEBOARD_AGNES_API_TOKEN": "shared-agnes-key"}.get(name, default)

    assert agnes_provider_from_environment(env_value) is not None
    assert agnes_icon_provider_from_environment(env_value) is not None
    assert requested.count("FRIDGEBOARD_AGNES_API_TOKEN") == 2


def test_agnes_provider_uses_bounded_new_default_model_request(
    monkeypatch, tmp_path: Path
) -> None:
    """默认识别请求使用 2.5 模型并限制推理响应时长和长度。"""
    observed: dict[str, object] = {}

    def env_value(name: str, default: str | None = None) -> str | None:
        return {"FRIDGEBOARD_AGNES_API_TOKEN": "shared-agnes-key"}.get(name, default)

    def fake_urlopen(request, timeout: int):
        observed["request"] = request
        observed["timeout"] = timeout
        return _FakeAgnesResponse()

    monkeypatch.setattr(recognition_module, "urlopen", fake_urlopen)
    provider = agnes_provider_from_environment(env_value)
    assert provider is not None

    image_path = tmp_path / "capture.png"
    image_path.write_bytes(b"image")
    assert provider(image_path, "image/png") == {"kind": "unknown"}

    request = observed["request"]
    payload = json.loads(request.data)
    assert payload["model"] == "agnes-2.5-flash"
    assert payload["max_tokens"] == 2048
    assert observed["timeout"] == 60


def test_agnes_provider_logs_parse_context_for_truncated_response(
    monkeypatch, tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    """截断 JSON 必须记录模型、响应元信息和安全正文摘要。"""
    body = json.dumps(
        {
            "choices": [
                {
                    "finish_reason": "length",
                    "message": {"content": '{"kind":"order","order_items":['},
                }
            ]
        }
    ).encode()

    def env_value(name: str, default: str | None = None) -> str | None:
        return {"FRIDGEBOARD_AGNES_API_TOKEN": "secret-token"}.get(name, default)

    monkeypatch.setattr(
        recognition_module,
        "urlopen",
        lambda *_args, **_kwargs: _FakeAgnesResponse(body),
    )
    provider = agnes_provider_from_environment(env_value)
    assert provider is not None

    image_path = tmp_path / "capture.png"
    image_path.write_bytes(b"image")
    with caplog.at_level(logging.ERROR, logger="fridgeboard.recognition"):
        with pytest.raises(RuntimeError, match="Agnes 返回格式无效"):
            provider(image_path, "image/png")

    assert "Agnes 响应契约解析失败" in caplog.text
    assert "model=agnes-2.5-flash" in caplog.text
    assert "status=200" in caplog.text
    assert "finish_reason=length" in caplog.text
    assert "secret-token" not in caplog.text
    assert "order_items" in caplog.text


def test_agnes_category_provider_closes_http_client_when_cancelled(monkeypatch) -> None:
    """取消分类协程时应退出 HTTP 客户端上下文并中断本地网络等待。"""
    started: asyncio.Event
    closed: asyncio.Event

    class BlockingAsyncClient:
        """模拟一直等待响应、只能通过任务取消退出的 HTTP 客户端。"""

        def __init__(self, *, timeout: int) -> None:
            assert timeout == 15

        async def __aenter__(self) -> "BlockingAsyncClient":
            return self

        async def __aexit__(self, *_args: object) -> None:
            closed.set()

        async def post(self, *_args: object, **_kwargs: object) -> None:
            started.set()
            await asyncio.Event().wait()

    async def scenario() -> None:
        nonlocal started, closed
        started = asyncio.Event()
        closed = asyncio.Event()
        monkeypatch.setattr(recognition_module.httpx, "AsyncClient", BlockingAsyncClient)
        provider = agnes_category_provider_from_environment(
            lambda name, default=None: {
                "FRIDGEBOARD_AGNES_API_TOKEN": "test-key",
            }.get(name, default)
        )
        assert provider is not None
        task = asyncio.create_task(provider("待分类商品", []))
        await asyncio.wait_for(started.wait(), timeout=1)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert closed.is_set()

    asyncio.run(scenario())


def test_recognize_image_passes_candidates_to_arbitrary_three_argument_provider() -> None:
    """图片识别 provider 的第三个参数不要求使用固定参数名。"""
    observed: list[list[dict[str, str]]] = []

    def provider(
        _image_path: Path,
        _content_type: str,
        candidates: list[dict[str, str]],
    ) -> dict[str, object]:
        observed.append(candidates)
        return {}

    result = recognition_module.recognize_image(
        base64.b64encode(b"photo").decode(),
        "image/jpeg",
        provider,
        [{"id": "category-1", "name": "分类"}],
    )

    assert result == {}
    assert observed == [[{"id": "category-1", "name": "分类"}]]


def test_recognition_deletes_temporary_image_and_returns_incremental_fields(tmp_path: Path) -> None:
    """识别只返回本次字段，适配器完成后临时图片不残留。"""
    observed: list[Path] = []

    def provider(image_path: Path, content_type: str) -> dict[str, object]:
        assert content_type == "image/jpeg"
        assert image_path.read_bytes() == b"photo"
        observed.append(image_path)
        return {"item_name": {"value": "鲜牛奶", "confidence": 0.96}, "unknown": "ignored"}

    database_url = f"sqlite:///{tmp_path / 'recognition.db'}"
    Base.metadata.create_all(create_database_engine(database_url))
    client = start_test_client(
        create_app(
            database_url=database_url,
            development_owner_user_id="owner",
            recognition_provider=provider,
        )
    )
    client.post("/api/auth/development-login")
    response = client.post(
        "/api/recognition",
        json={
            "image_base64": base64.b64encode(b"photo").decode(),
            "content_type": "image/jpeg",
        },
    )
    assert response.status_code == 200
    assert response.json() == {
        "kind": "item",
        "fields": {"item_name": {"value": "鲜牛奶", "confidence": 0.96}},
        "order_items": [],
    }
    assert observed and not observed[0].exists()


def test_recognition_keeps_name_only_category_without_refrigerator_context(
    tmp_path: Path,
) -> None:
    """没有冰箱上下文时保留分类名称，但不信任模型返回的分类 ID。"""
    database_url = f"sqlite:///{tmp_path / 'recognition-category-without-fridge.db'}"
    Base.metadata.create_all(create_database_engine(database_url))
    client = start_test_client(
        create_app(
            database_url=database_url,
            development_owner_user_id="owner",
            recognition_provider=lambda _path, _content_type: {
                "kind": "item",
                "item_name": {"value": "鲜牛奶", "confidence": 0.96},
                "subcategory_id": {"value": "model-category", "confidence": 0.9},
                "subcategory_name": {"value": "奶品", "confidence": 0.9},
            },
        )
    )
    client.post("/api/auth/development-login")

    response = client.post(
        "/api/recognition",
        json={
            "image_base64": base64.b64encode(b"photo").decode(),
            "content_type": "image/jpeg",
        },
    )

    assert response.status_code == 200
    fields = response.json()["fields"]
    assert fields["subcategory_name"]["value"] == "奶品"
    assert "subcategory_id" not in fields


def test_barcode_lookup_reuses_confirmed_food_information(tmp_path: Path) -> None:
    """条码复用只返回名称、分类和描述，不包含批次位置、数量或 BBD。"""
    database_url = f"sqlite:///{tmp_path / 'barcode.db'}"
    Base.metadata.create_all(create_database_engine(database_url))
    client = start_test_client(
        create_app(database_url=database_url, development_owner_user_id="owner")
    )
    client.post("/api/auth/development-login")
    refrigerator = client.post(
        "/api/owner/refrigerators", json={"name": "厨房", "template_key": "mini"}
    ).json()
    layout = client.get(f"/api/owner/refrigerators/{refrigerator['id']}/layout").json()
    categories = client.get(f"/api/owner/refrigerators/{refrigerator['id']}/categories").json()
    egg = next(item for item in categories if item["name"] == "蛋类")
    client.post(
        f"/api/owner/refrigerators/{refrigerator['id']}/inventory",
        json={
            "subcategory_id": egg["id"],
            "storage_slot_id": layout["zones"][0]["slots"][0]["id"],
            "item_name": "土鸡蛋",
            "quantity": 6,
            "product_description": "30 枚",
            "barcode": "6901234567890",
        },
    )
    response = client.get(f"/api/owner/refrigerators/{refrigerator['id']}/barcode/6901234567890")
    assert response.status_code == 200
    assert response.json() == {
        "item_name": "土鸡蛋",
        "subcategory_id": egg["id"],
        "product_description": "30 枚",
        "barcode": "6901234567890",
    }


def test_public_product_lookup_does_not_require_existing_inventory(
    monkeypatch, tmp_path: Path
) -> None:
    """首次扫码可直接查询公开商品库，不依赖当前冰箱已保存过该条码。"""
    class _Response:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def read(self):
            return json.dumps(
                {
                    "status": 1,
                    "product": {
                        "product_name_zh": "测试饼干",
                        "brands": "测试品牌",
                        "quantity": "100 g",
                    },
                }
            ).encode()

    monkeypatch.setattr(product_lookup_module, "urlopen", lambda *_args, **_kwargs: _Response())
    database_url = f"sqlite:///{tmp_path / 'product-lookup.db'}"
    Base.metadata.create_all(create_database_engine(database_url))
    client = start_test_client(
        create_app(database_url=database_url, development_owner_user_id="owner")
    )
    client.post("/api/auth/development-login")

    response = client.get("/api/owner/product-lookup/barcode/3017620422003")

    assert response.status_code == 200
    assert response.json() == {
        "found": True,
        "item_name": "测试饼干",
        "product_description": "测试品牌 100 g",
        "barcode": "3017620422003",
        "source": "Open Food Facts",
    }


def test_public_product_lookup_truncates_name_and_uses_thirty_second_timeout(
    monkeypatch, tmp_path: Path
) -> None:
    """公开商品名超过库存限制时自动截断，并将单个供应商超时设为 30 秒。"""
    observed: dict[str, int] = {}

    class _Response:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def read(self):
            return json.dumps(
                {"status": 1, "product": {"product_name": "商品" * 100}}
            ).encode()

    def fake_urlopen(_request, timeout):
        observed["timeout"] = timeout
        return _Response()

    monkeypatch.setattr(product_lookup_module, "urlopen", fake_urlopen)
    result = product_lookup_module.lookup_product_by_barcode("3017620422003")

    assert result is not None
    assert len(result.item_name) == 160
    assert 0 < observed["timeout"] <= 30


def test_qr_lookup_uses_text_provider_and_returns_structured_fields(tmp_path: Path) -> None:
    """二维码接口将原始文本交给大模型适配器，而不是查询商品条码库。"""
    database_url = f"sqlite:///{tmp_path / 'qr-lookup.db'}"
    Base.metadata.create_all(create_database_engine(database_url))
    client = start_test_client(
        create_app(
            database_url=database_url,
            development_owner_user_id="owner",
            qr_recognition_provider=lambda payload: {
                "kind": "item",
                "item_name": {"value": "测试洗衣液", "confidence": 0.9},
                "product_description": {"value": "1L", "confidence": 0.8},
                "barcode": {"value": payload, "confidence": 1},
            },
        )
    )
    client.post("/api/auth/development-login")

    response = client.post(
        "/api/owner/product-lookup/qr", json={"payload": "https://example.com/product"}
    )

    assert response.status_code == 200
    assert response.json() == {
        "kind": "item",
        "payload": "https://example.com/product",
        "fields": {
            "item_name": {"value": "测试洗衣液", "confidence": 0.9},
            "product_description": {"value": "1L", "confidence": 0.8},
            "barcode": {"value": "https://example.com/product", "confidence": 1.0},
        },
    }


def test_recognition_translates_invalid_agnes_fields_to_recoverable_error(tmp_path: Path) -> None:
    """上游字段格式不合法时不向客户端暴露内部验证异常。"""
    database_url = f"sqlite:///{tmp_path / 'invalid-agnes.db'}"
    Base.metadata.create_all(create_database_engine(database_url))
    client = TestClient(
        create_app(
            database_url=database_url,
            development_owner_user_id="owner",
            recognition_provider=lambda _path, _content_type: {"item_name": {"value": "牛奶"}},
        )
    )
    client.post("/api/auth/development-login")
    response = client.post(
        "/api/recognition",
        json={
            "image_base64": base64.b64encode(b"photo").decode(),
            "content_type": "image/jpeg",
        },
    )
    assert response.status_code == 503
    assert response.json()["detail"] == "Agnes 返回格式无效"


def test_recognition_returns_order_items_for_order_screenshot(tmp_path: Path) -> None:
    """订单截图只返回商品核心名称、规格和数量，不把店家行误当作商品。"""
    database_url = f"sqlite:///{tmp_path / 'order-recognition.db'}"
    Base.metadata.create_all(create_database_engine(database_url))
    client = TestClient(
        create_app(
            database_url=database_url,
            development_owner_user_id="owner",
            recognition_provider=lambda _path, _content_type: {
                "kind": "order",
                "order_items": [
                    {"item_name": "亮碟洗碗粉", "specification": "洗碗粉660g", "quantity": 2},
                    {"item_name": "店家名称", "specification": "", "quantity": 1},
                ],
            },
        )
    )
    client.post("/api/auth/development-login")
    response = client.post(
        "/api/recognition",
        json={"image_base64": base64.b64encode(b"order").decode(), "content_type": "image/jpeg"},
    )
    assert response.status_code == 200
    assert response.json()["kind"] == "order"
    assert response.json()["order_items"] == [
        {"item_name": "亮碟洗碗粉", "specification": "洗碗粉660g", "quantity": 2},
        {"item_name": "店家名称", "specification": "", "quantity": 1},
    ]


def test_order_item_name_removes_promotion_brand_specification_and_parentheses() -> None:
    """订单商品名清洗只保留可用于库存匹配的核心名称。"""
    assert normalize_order_item_name("【超值】象大厨皮蛋猪肉小馄炖124.5g") == "皮蛋猪肉小馄炖"
    assert normalize_order_item_name("葱姜蒜组合50g(小葱+姜+蒜）") == "葱姜蒜"


def test_order_item_price_prefers_paid_amount_over_list_prices() -> None:
    """订单价格只接受实付金额，不误用单价和原价。"""
    assert parse_order_item_price(
        {"price": "单价¥12.00 原价¥30.00 实付¥20.99"}
    ) == Decimal("20.99")
    assert parse_order_item_price({"price": "单价¥12.00 原价¥30.00"}) is None


def test_recognition_normalizes_order_item_name_and_returns_paid_price(tmp_path: Path) -> None:
    """识别接口将脏订单名清洗后返回实付金额。"""
    database_url = f"sqlite:///{tmp_path / 'order-price.db'}"
    Base.metadata.create_all(create_database_engine(database_url))
    client = TestClient(
        create_app(
            database_url=database_url,
            development_owner_user_id="owner",
            recognition_provider=lambda _path, _content_type: {
                "kind": "order",
                "order_items": [
                    {
                        "item_name": "【超值】象大厨皮蛋猪肉小馄炖124.5g",
                        "quantity": 1,
                        "price": "单价¥12.00 原价¥30.00 实付¥20.99",
                    }
                ],
            },
        )
    )
    client.post("/api/auth/development-login")
    response = client.post(
        "/api/recognition",
        json={"image_base64": base64.b64encode(b"order").decode(), "content_type": "image/jpeg"},
    )
    assert response.status_code == 200
    assert response.json()["order_items"] == [
        {"item_name": "皮蛋猪肉小馄炖", "specification": "", "quantity": 1, "price": "20.99"}
    ]


def test_recognition_filters_category_ids_to_current_refrigerator(tmp_path: Path) -> None:
    """相机和订单识别返回的分类 ID 必须属于当前冰箱的小类候选。"""
    database_url = f"sqlite:///{tmp_path / 'category-recognition.db'}"
    Base.metadata.create_all(create_database_engine(database_url))
    client = TestClient(
        create_app(
            database_url=database_url,
            development_owner_user_id="owner",
            recognition_provider=lambda _path, _content_type: {
                "kind": "order",
                "subcategory_id": {"value": "not-a-category", "confidence": 0.99},
                "subcategory_name": {"value": "蛋类", "confidence": 0.8},
                "order_items": [
                    {
                        "item_name": "鸡蛋",
                        "subcategory_id": "not-a-category",
                        "subcategory_name": "蛋类",
                    },
                    {"item_name": "未知商品", "subcategory_id": "not-a-category"},
                ],
            },
        )
    )
    client.post("/api/auth/development-login")
    refrigerator = client.post(
        "/api/owner/refrigerators", json={"name": "厨房", "template_key": "mini"}
    ).json()
    response = client.post(
        "/api/recognition",
        json={
            "image_base64": base64.b64encode(b"order").decode(),
            "content_type": "image/jpeg",
            "refrigerator_id": refrigerator["id"],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["fields"]["subcategory_id"]["value"] == "builtin-category-egg"
    assert body["order_items"][0]["subcategory_id"] == "builtin-category-egg"
    assert body["order_items"][0]["subcategory_name"] == "蛋类"
    assert "subcategory_id" not in body["order_items"][1]


def test_recognition_passes_current_refrigerator_custom_categories_to_provider(
    tmp_path: Path,
) -> None:
    """图片模型只接收当前冰箱可用小类，并按白名单 ID 返回规范名称。"""
    observed_candidates: list[list[dict[str, str]]] = []
    selected_category_id: list[str] = []

    def provider(
        _path: Path,
        _content_type: str,
        category_candidates: list[dict[str, str]],
    ) -> dict[str, object]:
        observed_candidates.append(category_candidates)
        return {
            "kind": "item",
            "subcategory_id": {"value": selected_category_id[0], "confidence": 0.96},
            "subcategory_name": {"value": "模型伪造名称", "confidence": 0.96},
        }

    database_url = f"sqlite:///{tmp_path / 'custom-category-recognition.db'}"
    Base.metadata.create_all(create_database_engine(database_url))
    client = TestClient(
        create_app(
            database_url=database_url,
            development_owner_user_id="owner",
            recognition_provider=provider,
        )
    )
    client.post("/api/auth/development-login")
    first = client.post(
        "/api/owner/refrigerators", json={"name": "一号", "template_key": "mini"}
    ).json()
    second = client.post(
        "/api/owner/refrigerators", json={"name": "二号", "template_key": "mini"}
    ).json()
    first_custom = client.post(
        f"/api/owner/refrigerators/{first['id']}/categories",
        json={
            "parent_id": "builtin-group-meat-protein",
            "name": "一号特供蛋",
            "icon_key": "egg",
        },
    ).json()
    second_custom = client.post(
        f"/api/owner/refrigerators/{second['id']}/categories",
        json={
            "parent_id": "builtin-group-meat-protein",
            "name": "二号特供蛋",
            "icon_key": "egg",
        },
    ).json()
    selected_category_id.append(first_custom["id"])

    response = client.post(
        "/api/recognition",
        json={
            "image_base64": base64.b64encode(b"photo").decode(),
            "content_type": "image/jpeg",
            "refrigerator_id": first["id"],
        },
    )

    assert response.status_code == 200
    candidate_ids = {item["id"] for item in observed_candidates[0]}
    assert first_custom["id"] in candidate_ids
    assert second_custom["id"] not in candidate_ids
    assert response.json()["fields"]["subcategory_id"]["value"] == first_custom["id"]
    assert response.json()["fields"]["subcategory_name"]["value"] == "一号特供蛋"


def test_paired_phone_can_call_recognition_without_owner_session(tmp_path: Path) -> None:
    """已配对 PWA 使用设备凭证即可调用日常识别入口。"""
    database_url = f"sqlite:///{tmp_path / 'paired-recognition.db'}"
    Base.metadata.create_all(create_database_engine(database_url))
    def provider(_path: Path, _content_type: str) -> dict[str, object]:
        return {"item_name": {"value": "牛奶", "confidence": 0.9}}
    app_options = {
        "database_url": database_url,
        "development_owner_user_id": "owner",
        "recognition_provider": provider,
    }
    owner = TestClient(create_app(**app_options))
    owner.post("/api/auth/development-login")
    passcode = owner.post(
        "/api/owner/kindle-passcodes",
        json={"new_refrigerator_name": "厨房", "new_template_key": "mini"},
    ).json()["passcode"]
    kindle = TestClient(create_app(**app_options))
    assert kindle.post("/api/kindle/bind", json={"passcode": passcode}).status_code == 201
    pairing_token = kindle.post("/api/kindle/pairing-sessions").json()["pairing_token"]
    phone = TestClient(create_app(**app_options))
    assert phone.post(
        "/api/pairings/consume",
        json={"pairing_token": pairing_token, "standalone": True},
    ).status_code == 201
    response = phone.post(
        "/api/recognition",
        json={
            "image_base64": base64.b64encode(b"photo").decode(),
            "content_type": "image/jpeg",
        },
    )
    assert response.status_code == 200
