"""P6 相机识别、临时媒体和条码复用的契约测试。"""

import base64
from pathlib import Path

from fastapi.testclient import TestClient
from fridgeboard.main import create_app
from fridgeboard.persistence.database import create_database_engine
from fridgeboard.persistence.models import Base


def test_recognition_deletes_temporary_image_and_returns_incremental_fields(tmp_path: Path) -> None:
    """识别只返回本次字段，适配器完成后临时图片不残留。"""
    observed: list[Path] = []

    def provider(image_path: Path, content_type: str) -> dict[str, object]:
        assert content_type == "image/jpeg"
        assert image_path.read_bytes() == b"photo"
        observed.append(image_path)
        return {"food_name": {"value": "鲜牛奶", "confidence": 0.96}, "unknown": "ignored"}

    database_url = f"sqlite:///{tmp_path / 'recognition.db'}"
    Base.metadata.create_all(create_database_engine(database_url))
    client = TestClient(
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
    assert response.json() == {"fields": {"food_name": {"value": "鲜牛奶", "confidence": 0.96}}}
    assert observed and not observed[0].exists()


def test_barcode_lookup_reuses_confirmed_food_information(tmp_path: Path) -> None:
    """条码复用只返回名称、分类和描述，不包含批次位置、数量或 BBD。"""
    database_url = f"sqlite:///{tmp_path / 'barcode.db'}"
    Base.metadata.create_all(create_database_engine(database_url))
    client = TestClient(create_app(database_url=database_url, development_owner_user_id="owner"))
    client.post("/api/auth/development-login")
    refrigerator = client.post(
        "/api/owner/refrigerators", json={"name": "厨房", "template_key": "mini"}
    ).json()
    layout = client.get(f"/api/owner/refrigerators/{refrigerator['id']}/layout").json()
    categories = client.get(f"/api/owner/refrigerators/{refrigerator['id']}/categories").json()
    egg = next(item for item in categories if item["name"] == "鸡蛋")
    client.post(
        f"/api/owner/refrigerators/{refrigerator['id']}/inventory",
        json={
            "category_id": egg["parent_id"],
            "subcategory_id": egg["id"],
            "storage_slot_id": layout["zones"][0]["slots"][0]["id"],
            "food_name": "土鸡蛋",
            "quantity": 6,
            "product_description": "30 枚",
            "barcode": "6901234567890",
        },
    )
    response = client.get(f"/api/owner/refrigerators/{refrigerator['id']}/barcode/6901234567890")
    assert response.status_code == 200
    assert response.json() == {
        "food_name": "土鸡蛋",
        "category_id": egg["parent_id"],
        "subcategory_id": egg["id"],
        "product_description": "30 枚",
        "barcode": "6901234567890",
    }


def test_recognition_translates_invalid_agnes_fields_to_recoverable_error(tmp_path: Path) -> None:
    """上游字段格式不合法时不向客户端暴露内部验证异常。"""
    database_url = f"sqlite:///{tmp_path / 'invalid-agnes.db'}"
    Base.metadata.create_all(create_database_engine(database_url))
    client = TestClient(
        create_app(
            database_url=database_url,
            development_owner_user_id="owner",
            recognition_provider=lambda _path, _content_type: {"food_name": {"value": "牛奶"}},
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


def test_paired_phone_can_call_recognition_without_owner_session(tmp_path: Path) -> None:
    """已配对 PWA 使用设备凭证即可调用日常识别入口。"""
    database_url = f"sqlite:///{tmp_path / 'paired-recognition.db'}"
    Base.metadata.create_all(create_database_engine(database_url))
    def provider(_path: Path, _content_type: str) -> dict[str, object]:
        return {"food_name": {"value": "牛奶", "confidence": 0.9}}
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
