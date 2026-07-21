"""P4 模板、布局持久化和设备位置选择器契约测试。"""

from pathlib import Path

from fastapi.testclient import TestClient
from fridgeboard.main import create_app
from fridgeboard.persistence.database import create_database_engine
from fridgeboard.persistence.models import (
    Base,
    FoodCategory,
    InventoryBatchModel,
    StorageSlot,
    StorageZone,
)


def make_client(database_path: Path) -> TestClient:
    """创建带本地所有者登录的隔离应用。"""
    database_url = f"sqlite:///{database_path}"
    Base.metadata.create_all(create_database_engine(database_url))
    return TestClient(create_app(database_url=database_url, development_owner_user_id="owner"))


def test_templates_create_edit_and_device_layout_are_consistent(tmp_path: Path) -> None:
    """七种模板可选，保存后所有展示端读取相同的有效位置。"""
    client = make_client(tmp_path / "p4.db")
    client.post("/api/auth/development-login")

    templates = client.get("/api/refrigerator-templates").json()
    assert len(templates) == 7
    assert {template["key"] for template in templates} >= {"three_door", "dual_middle"}

    dual = client.post(
        "/api/owner/refrigerators", json={"name": "双功能冰箱", "template_key": "dual_middle"}
    ).json()
    dual_layout = client.get(f"/api/owner/refrigerators/{dual['id']}/layout").json()
    assert [zone["key"] for zone in dual_layout["zones"]] == [
        "refrigerator",
        "middle",
        "freezer",
        "door",
    ]
    assert len(dual_layout["zones"][1]["slots"]) == 2
    assert dual_layout["zones"][1]["geometry"]["layout_kind"] == "vertical"

    refrigerator = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "three_door"}
    ).json()
    layout_url = f"/api/owner/refrigerators/{refrigerator['id']}/layout"
    layout = client.get(layout_url).json()
    assert [zone["key"] for zone in layout["zones"]] == [
        "refrigerator",
        "convertible",
        "freezer",
        "door",
    ]
    assert len(layout["zones"][0]["slots"]) == 3
    assert layout["zones"][1]["geometry"]["layout_kind"] == "single_row"

    updated = client.put(
        layout_url,
        json=[
            {"zone_key": "refrigerator", "temperature_mode": "cold", "slot_count": 6},
            {"zone_key": "convertible", "temperature_mode": "frozen", "slot_count": 3},
            {"zone_key": "freezer", "temperature_mode": "frozen", "slot_count": 1},
            {"zone_key": "door", "temperature_mode": "cold", "slot_count": 5},
        ],
    )
    assert updated.status_code == 200
    assert [len(zone["slots"]) for zone in updated.json()["zones"]] == [6, 3, 1, 5]

    invalid = client.put(
        layout_url,
        json=[
            {"zone_key": "refrigerator", "temperature_mode": "cold", "slot_count": 1},
            {"zone_key": "convertible", "temperature_mode": "cold", "slot_count": 4},
            {"zone_key": "freezer", "temperature_mode": "frozen", "slot_count": 1},
            {"zone_key": "door", "temperature_mode": "cold", "slot_count": 5},
        ],
    )
    assert invalid.status_code == 400
    assert "一格、左右两格或左中右三格" in invalid.json()["detail"]

    passcode = client.post(
        "/api/owner/kindle-passcodes", json={"refrigerator_id": refrigerator["id"]}
    ).json()["passcode"]
    kindle = make_client(tmp_path / "p4.db")
    assert kindle.post("/api/kindle/bind", json={"passcode": passcode}).status_code == 201
    device_layout = kindle.get("/api/devices/current/layout")
    assert device_layout.status_code == 200
    assert device_layout.json() == updated.json()


def test_create_refrigerator_persists_confirmed_layout_atomically(tmp_path: Path) -> None:
    """创建请求携带布局时，返回的冰箱立即拥有确认后的分格。"""
    client = make_client(tmp_path / "atomic-create.db")
    client.post("/api/auth/development-login")

    created = client.post(
        "/api/owner/refrigerators",
        json={
            "name": "厨房冰箱",
            "template_key": "three_door",
            "layout": [
                {"zone_key": "refrigerator", "temperature_mode": "cold", "slot_count": 5},
                {"zone_key": "convertible", "temperature_mode": "frozen", "slot_count": 2},
                {"zone_key": "freezer", "temperature_mode": "frozen", "slot_count": 4},
                {"zone_key": "door", "temperature_mode": "cold", "slot_count": 5},
            ],
        },
    )
    assert created.status_code == 201
    layout = client.get(f"/api/owner/refrigerators/{created.json()['id']}/layout").json()
    assert [len(zone["slots"]) for zone in layout["zones"]] == [5, 2, 4, 5]

    invalid = client.post(
        "/api/owner/refrigerators",
        json={
            "name": "无效冰箱",
            "template_key": "mini",
                "layout": [
                    {"zone_key": "freezer", "temperature_mode": "frozen", "slot_count": 1},
                    {"zone_key": "door", "temperature_mode": "cold", "slot_count": 5},
                ],
        },
    )
    assert invalid.status_code == 400
    assert len(client.get("/api/owner/refrigerators").json()) == 1


def test_layout_edit_preserves_occupied_positions_and_rejects_their_removal(tmp_path: Path) -> None:
    """有食品时仍可编辑未删除的位置，但不能缩减掉其所属位置。"""
    client = make_client(tmp_path / "occupied-layout.db")
    client.post("/api/auth/development-login")
    refrigerator = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()
    layout_url = f"/api/owner/refrigerators/{refrigerator['id']}/layout"
    database_url = f"sqlite:///{tmp_path / 'occupied-layout.db'}"
    engine = create_database_engine(database_url)
    with engine.begin() as connection:
        connection.execute(
            FoodCategory.__table__.insert(),
            [
                {"id": "category", "name": "蛋", "is_custom": False},
                {
                    "id": "subcategory",
                    "parent_id": "category",
                    "name": "鸡蛋",
                    "is_custom": False,
                },
            ],
        )
        zone_id = connection.execute(
            StorageZone.__table__.select()
            .with_only_columns(StorageZone.id)
            .where(
                StorageZone.refrigerator_id == refrigerator["id"],
                StorageZone.zone_key == "refrigerator",
            )
        ).scalar_one()
        slot_id = connection.execute(
            StorageSlot.__table__.select()
            .with_only_columns(StorageSlot.id)
            .where(StorageSlot.zone_id == zone_id, StorageSlot.display_order == 1)
        ).scalar_one()
        connection.execute(
            InventoryBatchModel.__table__.insert().values(
                refrigerator_id=refrigerator["id"],
                category_id="category",
                subcategory_id="subcategory",
                storage_slot_id=slot_id,
                food_name="鸡蛋",
                quantity=1,
            )
        )

    preserved = client.put(
        layout_url,
        json=[
            {"zone_key": "freezer", "temperature_mode": "frozen", "slot_count": 1},
            {"zone_key": "refrigerator", "temperature_mode": "cold", "slot_count": 3},
            {"zone_key": "door", "temperature_mode": "cold", "slot_count": 5},
        ],
    )
    assert preserved.status_code == 200
    removed = client.put(
        layout_url,
        json=[
            {"zone_key": "freezer", "temperature_mode": "frozen", "slot_count": 1},
            {"zone_key": "refrigerator", "temperature_mode": "cold", "slot_count": 1},
            {"zone_key": "door", "temperature_mode": "cold", "slot_count": 5},
        ],
    )
    assert removed.status_code == 400
    assert "已有食品" in removed.json()["detail"]
