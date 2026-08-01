"""通用物品分类、图标资产和最近选择接口测试。"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, timedelta
from io import BytesIO
from pathlib import Path

from fastapi.testclient import TestClient
from fridgeboard.auth import AccessService
from fridgeboard.icon_service import IconService
from fridgeboard.main import create_app
from fridgeboard.persistence.database import (
    create_database_engine,
    create_session_factory,
    transaction,
)
from fridgeboard.persistence.models import Base, IconAsset, Refrigerator
from PIL import Image


def _transparent_png(color: tuple[int, int, int, int]) -> bytes:
    """生成供图标候选测试使用的透明 PNG。"""
    output = BytesIO()
    Image.new("RGBA", (64, 64), color).save(output, format="PNG")
    return output.getvalue()


def make_client(
    database_path: Path,
    *,
    persistent_assets: Path,
    temporary_assets: Path,
    generated_images: list[bytes] | None = None,
) -> TestClient:
    """创建带隔离资产目录和可选图标生成器的测试应用。"""
    database_url = f"sqlite:///{database_path}"
    Base.metadata.create_all(create_database_engine(database_url))
    provider = None
    if generated_images is not None:
        def provider(_name: str, _count: int) -> list[bytes]:
            """返回测试预置的四个 PNG。"""
            return generated_images
    return TestClient(
        create_app(
            database_url=database_url,
            development_owner_user_id="owner",
            icon_generation_provider=provider,
            persistent_icon_dir=persistent_assets,
            temporary_icon_dir=temporary_assets,
        )
    )


def _create_refrigerator(client: TestClient) -> tuple[str, str]:
    """创建测试冰箱并返回冰箱与首个格位 ID。"""
    client.post("/api/auth/development-login")
    refrigerator = client.post(
        "/api/owner/refrigerators", json={"name": "厨房冰箱", "template_key": "mini"}
    ).json()
    layout = client.get(f"/api/owner/refrigerators/{refrigerator['id']}/layout").json()
    return refrigerator["id"], layout["zones"][0]["slots"][0]["id"]


def test_catalog_groups_are_navigation_only_and_inventory_saves_subcategory(
    tmp_path: Path,
) -> None:
    """内置导航大类无图标，库存写入不再接收或返回大类字段。"""
    client = make_client(
        tmp_path / "catalog.db",
        persistent_assets=tmp_path / "persistent",
        temporary_assets=tmp_path / "temporary",
    )
    refrigerator_id, slot_id = _create_refrigerator(client)

    categories = client.get(
        f"/api/owner/refrigerators/{refrigerator_id}/categories"
    ).json()
    groups = [item for item in categories if item["parent_id"] is None]
    assert [item["name"] for item in groups] == [
        "肉蛋水产",
        "水果蔬菜",
        "熟食主食",
        "粮油酱料",
        "酒水饮料",
        "点心奶品",
        "个护美妆",
    ]
    assert all(item["icon_key"] is None for item in groups)
    egg = next(item for item in categories if item["name"] == "蛋类")

    created = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/inventory",
        json={
            "subcategory_id": egg["id"],
            "storage_slot_id": slot_id,
            "item_name": "土鸡蛋",
            "quantity": 6,
        },
    )

    assert created.status_code == 201
    assert created.json()["subcategory_id"] == egg["id"]
    assert created.json()["subcategory_name"] == "蛋类"
    assert created.json()["item_name"] == "土鸡蛋"
    assert "category_id" not in created.json()
    assert "category_name" not in created.json()


def test_recent_subcategories_are_unique_and_production_date_defaults_to_entry_date(
    tmp_path: Path,
) -> None:
    """最近小类按成功新增去重，空生产日期使用录入日期。"""
    client = make_client(
        tmp_path / "recent.db",
        persistent_assets=tmp_path / "persistent",
        temporary_assets=tmp_path / "temporary",
    )
    refrigerator_id, slot_id = _create_refrigerator(client)
    categories = client.get(
        f"/api/owner/refrigerators/{refrigerator_id}/categories"
    ).json()
    egg = next(item for item in categories if item["name"] == "蛋类")
    milk = next(item for item in categories if item["name"] == "奶品")

    defaults = client.get(
        f"/api/owner/refrigerators/{refrigerator_id}/categories/recent"
    ).json()
    assert len(defaults) == 16
    assert len({item["icon_key"] for item in defaults}) == 16

    for subcategory, name in ((egg, "鸡蛋"), (milk, "鲜奶"), (egg, "土鸡蛋")):
        response = client.post(
            f"/api/owner/refrigerators/{refrigerator_id}/inventory",
            json={
                "subcategory_id": subcategory["id"],
                "storage_slot_id": slot_id,
                "item_name": name,
                "quantity": 1,
                "best_before": "2026-08-20",
            },
        )
        assert response.status_code == 201
        assert response.json()["production_date"] == date.today().isoformat()

    recent = client.get(
        f"/api/owner/refrigerators/{refrigerator_id}/categories/recent"
    ).json()
    assert [item["id"] for item in recent[:2]] == [egg["id"], milk["id"]]
    assert len({item["id"] for item in recent}) == len(recent)


def test_icon_library_serves_svg_and_confirmed_ai_png(tmp_path: Path) -> None:
    """图标库按资产媒体类型返回内置 SVG 和确认后的透明 PNG。"""
    generated = [
        _transparent_png((20 * index, 20 * index, 20 * index, 120 + index))
        for index in range(4)
    ]
    persistent_assets = tmp_path / "persistent"
    temporary_assets = tmp_path / "temporary"
    client = make_client(
        tmp_path / "icons.db",
        persistent_assets=persistent_assets,
        temporary_assets=temporary_assets,
        generated_images=generated,
    )
    refrigerator_id, _ = _create_refrigerator(client)
    categories = client.get(
        f"/api/owner/refrigerators/{refrigerator_id}/categories"
    ).json()
    group = next(item for item in categories if item["name"] == "点心奶品")

    icons = client.get(f"/api/owner/refrigerators/{refrigerator_id}/icons")
    assert icons.status_code == 200
    assert all(icon["media_type"] in {"image/svg+xml", "image/png"} for icon in icons.json())
    builtin = icons.json()[0]
    builtin_asset = client.get(builtin["asset_url"])
    assert builtin_asset.status_code == 200
    assert builtin_asset.headers["content-type"].startswith("image/svg+xml")

    generated_response = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/icon-candidates",
        json={"subcategory_name": "洗发水"},
    )
    assert generated_response.status_code == 201
    candidates = generated_response.json()["candidates"]
    assert len(candidates) == 4
    assert all(client.get(candidate["asset_url"]).status_code == 200 for candidate in candidates)

    confirmed = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/icon-candidates/"
        f"{generated_response.json()['id']}/confirm",
        json={
            "candidate_id": candidates[2]["id"],
            "parent_id": group["id"],
            "subcategory_name": "洗发水",
        },
    )
    assert confirmed.status_code == 201
    assert confirmed.json()["name"] == "洗发水"
    assert confirmed.json()["icon_key"]

    refreshed_icons = client.get(
        f"/api/owner/refrigerators/{refrigerator_id}/icons"
    ).json()
    custom_icon = next(
        icon for icon in refreshed_icons if icon["key"] == confirmed.json()["icon_key"]
    )
    assert custom_icon["media_type"] == "image/png"
    assert client.get(custom_icon["asset_url"]).headers["content-type"].startswith("image/png")
    assert len(list(persistent_assets.glob("*.png"))) == 1
    assert not list(temporary_assets.rglob("*.png"))


def test_parallel_catalog_and_icon_reads_initialize_builtin_assets_once(tmp_path: Path) -> None:
    """分类与图标并行首读不会因重复导入内置资产而失败。"""
    client = make_client(
        tmp_path / "parallel-catalog.db",
        persistent_assets=tmp_path / "persistent",
        temporary_assets=tmp_path / "temporary",
    )
    refrigerator_id, _ = _create_refrigerator(client)
    urls = [
        f"/api/owner/refrigerators/{refrigerator_id}/categories",
        f"/api/owner/refrigerators/{refrigerator_id}/icons",
    ]

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(client.get, urls))

    assert [response.status_code for response in responses] == [200, 200]


def test_custom_subcategory_can_use_builtin_icon_before_catalog_read(tmp_path: Path) -> None:
    """首次请求直接新建小类时也应先初始化内置图标目录。"""
    client = make_client(
        tmp_path / "direct-category.db",
        persistent_assets=tmp_path / "persistent",
        temporary_assets=tmp_path / "temporary",
    )
    refrigerator_id, _ = _create_refrigerator(client)

    response = client.post(
        f"/api/owner/refrigerators/{refrigerator_id}/categories",
        json={
            "parent_id": "builtin-group-meat-protein",
            "name": "鹌鹑蛋",
            "icon_key": "egg",
        },
    )

    assert response.status_code == 201
    assert response.json()["icon_key"] == "egg"


def test_confirmed_icon_file_follows_database_rollback(tmp_path: Path) -> None:
    """确认候选所在事务回滚时保留候选并删除尚未提交的持久文件。"""
    database_url = f"sqlite:///{tmp_path / 'rollback.db'}"
    engine = create_database_engine(database_url)
    Base.metadata.create_all(engine)
    session_factory = create_session_factory(engine)
    persistent_assets = tmp_path / "persistent"
    temporary_assets = tmp_path / "temporary"
    generated = [_transparent_png((0, 0, 0, 255)) for _ in range(4)]

    with transaction(session_factory) as session:
        refrigerator = Refrigerator(owner_user_id="owner", name="厨房", template_key="mini")
        session.add(refrigerator)
        session.flush()
        refrigerator_id = refrigerator.id
    with transaction(session_factory) as session:
        service = IconService(
            session,
            persistent_assets,
            temporary_assets,
            lambda _name, _count: generated,
        )
        generation = service.generate(refrigerator_id, "洗发水")
        candidate = service.candidates(generation.id)[0]
        generation_id = generation.id
        candidate_id = candidate.id
    with session_factory() as session:
        service = IconService(session, persistent_assets, temporary_assets, None)
        service.confirm(
            refrigerator_id,
            generation_id,
            candidate_id,
            "builtin-group-snacks",
            "洗发水",
        )
        session.rollback()

    assert not list(persistent_assets.glob("*.png"))
    assert len(list(temporary_assets.rglob("*.png"))) == 4


def test_purge_expired_refrigerator_removes_custom_icon_files_after_commit(
    tmp_path: Path,
) -> None:
    """柜体永久删除提交后同步清理其持久图标和临时候选目录。"""
    database_url = f"sqlite:///{tmp_path / 'purge.db'}"
    engine = create_database_engine(database_url)
    Base.metadata.create_all(engine)
    session_factory = create_session_factory(engine)
    persistent_assets = tmp_path / "persistent"
    temporary_assets = tmp_path / "temporary"
    persistent_assets.mkdir()
    temporary_assets.mkdir()
    icon_path = persistent_assets / "custom.png"
    icon_path.write_bytes(_transparent_png((0, 0, 0, 255)))

    client = TestClient(
        create_app(
            database_url=database_url,
            development_owner_user_id="owner",
            persistent_icon_dir=persistent_assets,
            temporary_icon_dir=temporary_assets,
        )
    )
    refrigerator_id, _ = _create_refrigerator(client)
    with transaction(session_factory) as session:
        refrigerator = session.get(Refrigerator, refrigerator_id)
        assert refrigerator is not None
        refrigerator.deleted_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=31)
        session.add(
            IconAsset(
                key="custom-purge",
                refrigerator_id=refrigerator_id,
                label="待清理",
                media_type="image/png",
                storage_path=icon_path.name,
                source="agnes",
            )
        )

    with transaction(session_factory) as session:
        assert AccessService(session).purge_expired_refrigerators(
            persistent_icon_dir=persistent_assets,
            temporary_icon_dir=temporary_assets,
        ) == 1

    assert not icon_path.exists()
