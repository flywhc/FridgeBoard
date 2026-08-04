"""P6 相机识别、临时媒体和条码复用的契约测试。"""

import base64
import json
from pathlib import Path

import fridgeboard.product_lookup as product_lookup_module
import fridgeboard.recognition as recognition_module
from fastapi.testclient import TestClient
from fridgeboard.icon_service import agnes_icon_provider_from_environment
from fridgeboard.main import create_app
from fridgeboard.persistence.database import create_database_engine
from fridgeboard.persistence.models import Base
from fridgeboard.recognition import agnes_provider_from_environment
from support import start_test_client


class _FakeAgnesResponse:
    """为识别适配器测试提供最小的 HTTP 响应上下文。"""

    def __enter__(self) -> "_FakeAgnesResponse":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self) -> bytes:
        return json.dumps(
            {"choices": [{"message": {"content": '```json\n{"kind": "unknown"}\n```'}}]}
        ).encode()


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
    assert payload["max_tokens"] == 1024
    assert observed["timeout"] == 60


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
    """订单截图只返回商品名称、规格和数量，不把店家行误当作商品。"""
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
