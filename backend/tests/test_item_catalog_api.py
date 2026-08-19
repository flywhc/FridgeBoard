"""通用物品分类、图标资产和最近选择接口测试。"""

from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, timedelta
from io import BytesIO
from pathlib import Path
from urllib.parse import quote

from fastapi.testclient import TestClient
from fridgeboard.auth import AccessService
from fridgeboard.icon_service import IconService, generate_icon_images
from fridgeboard.inventory_service import InventoryService
from fridgeboard.item_catalog import CATALOG_ROOT, ensure_builtin_catalog, load_catalog
from fridgeboard.main import create_app
from fridgeboard.persistence.database import (
    create_database_engine,
    create_database_schema,
    create_session_factory,
    sync_session,
    transaction,
)
from fridgeboard.persistence.models import (
    FoodCategory,
    IconAsset,
    InventoryBatchModel,
    ItemCategoryMapping,
    RecentSubcategoryUsage,
    Refrigerator,
)
from PIL import Image
from sqlalchemy import event, select
from support import start_test_client


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
    create_database_schema(database_url)
    provider = None
    if generated_images is not None:
        async def provider(_name: str, _count: int) -> list[bytes]:
            """返回测试预置的四个 PNG。"""
            return generated_images
    return start_test_client(
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


def _sync_catalog(database_path: Path) -> None:
    """模拟下一次应用启动时执行一次内置目录同步。"""
    engine = create_database_engine(f"sqlite:///{database_path}")
    session_factory = create_session_factory(engine)

    async def sync() -> None:
        async with transaction(session_factory) as session:
            await ensure_builtin_catalog(session)

    try:
        asyncio.run(sync())
    finally:
        asyncio.run(engine.dispose())


def test_catalog_declared_builtin_icon_assets_exist() -> None:
    """内置目录声明的每个图标文件都必须随源码存在。"""
    missing = [
        item["path"]
        for item in load_catalog()["icons"]
        if not (CATALOG_ROOT / item["path"]).is_file()
    ]
    assert missing == []


def test_builtin_catalog_sync_runs_once_per_session(tmp_path: Path) -> None:
    """同一请求会话内重复读取图标时不重复执行目录同步。"""
    database_path = tmp_path / "catalog-sync.db"
    engine = create_database_engine(f"sqlite:///{database_path}")
    create_database_schema(engine)
    statements: list[str] = []

    def record_statement(_conn, _cursor, statement, _parameters, _context, _executemany) -> None:
        statements.append(statement)

    event.listen(engine.sync_engine, "before_cursor_execute", record_statement)
    session_factory = create_session_factory(engine)
    async def sync() -> None:
        async with transaction(session_factory) as session:
            await ensure_builtin_catalog(session)
            first_sync_statement_count = len(statements)
            await ensure_builtin_catalog(session)
            assert len(statements) == first_sync_statement_count

    try:
        asyncio.run(sync())
    finally:
        event.remove(engine.sync_engine, "before_cursor_execute", record_statement)


def test_app_lifespan_syncs_catalog_before_read_services(tmp_path: Path) -> None:
    """应用启动后，分类和图标读取服务可以直接使用已同步目录。"""
    database_path = tmp_path / "startup-catalog.db"
    database_url = f"sqlite:///{database_path}"
    engine = create_database_engine(database_url)
    create_database_schema(engine)
    asyncio.run(engine.dispose())

    application = create_app(database_url=database_url, development_owner_user_id="owner")

    verification_engine = create_database_engine(database_url)
    session_factory = create_session_factory(verification_engine)
    with transaction(session_factory) as session:
        assert session.get(FoodCategory, "builtin-group-meat-protein") is None
        assert session.get(IconAsset, "egg") is None
    asyncio.run(verification_engine.dispose())

    with TestClient(application):
        pass

    verification_engine = create_database_engine(database_url)
    session_factory = create_session_factory(verification_engine)
    try:
        with transaction(session_factory) as session:
            assert session.get(FoodCategory, "builtin-group-meat-protein") is not None
            assert session.get(IconAsset, "egg") is not None
    finally:
        asyncio.run(verification_engine.dispose())


def test_catalog_read_services_do_not_write_after_startup(tmp_path: Path) -> None:
    """目录同步完成后，分类和图标读取只执行查询。"""
    database_path = tmp_path / "read-only-catalog.db"
    database_url = f"sqlite:///{database_path}"
    engine = create_database_engine(database_url)
    create_database_schema(engine)
    create_app(database_url=database_url, development_owner_user_id="owner")
    statements: list[str] = []

    def record_statement(_conn, _cursor, statement, _parameters, _context, _executemany) -> None:
        statements.append(statement.lstrip().upper())

    event.listen(engine.sync_engine, "before_cursor_execute", record_statement)
    session_factory = create_session_factory(engine)
    async def read_services() -> None:
        async with transaction(session_factory) as session:
            await InventoryService(session).categories("refrigerator-id")
            await IconService(
                session, tmp_path / "persistent", tmp_path / "temporary"
            ).assets("refrigerator-id")

    try:
        asyncio.run(read_services())
    finally:
        event.remove(engine.sync_engine, "before_cursor_execute", record_statement)
        asyncio.run(engine.dispose())

    assert not any(
        statement.startswith(("INSERT", "UPDATE", "DELETE", "REPLACE"))
        for statement in statements
    )


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
        "日化清洁",
    ]
    assert all(item["icon_key"] is None for item in groups)
    egg = next(item for item in categories if item["name"] == "蛋类")
    assert next(item for item in categories if item["name"] == "香辛")["icon_key"] == (
        "scallion-ginger"
    )
    assert all(item["name"] != "面条" for item in categories)
    root_vegetable = next(item for item in categories if item["id"] == "builtin-category-vegetable")
    assert root_vegetable["name"] == "根茎"
    assert root_vegetable["icon_key"] == "vegetable"
    mushroom = next(item for item in categories if item["name"] == "菌菇")
    assert mushroom["parent_id"] == "builtin-group-produce"
    assert mushroom["icon_key"] == "mingcute:mushroom-line"
    assert next(item for item in categories if item["name"] == "酒类")["icon_key"] == (
        "lucide:wine"
    )
    assert next(item for item in categories if item["name"] == "茶咖")["icon_key"] == (
        "mdi:coffee-outline"
    )
    expected_outlook_categories = {
        "洁面": ("builtin-group-personal-care", "outlook-洁面"),
        "洗剂": ("builtin-group-household-cleaning", "lucide-lab:bottle-spray"),
        "洗浴": ("builtin-group-household-cleaning", "lucide-lab:shower"),
        "眼部": ("builtin-group-personal-care", "ph:eye-bold"),
        "眼妆": ("builtin-group-personal-care", "pepicons-pop:paint-pallet-circle"),
        "精华": ("builtin-group-personal-care", "outlook-精华"),
        "纸品": ("builtin-group-household-cleaning", "hugeicons:tissue-paper"),
        "扫拖": ("builtin-group-household-cleaning", "solar:smart-vacuum-cleaner-linear"),
        "洁牙": ("builtin-group-household-cleaning", "personal-hygiene-clean-toothpaste"),
        "洗碗": ("builtin-group-household-cleaning", "dishwasher"),
        "洗衣": ("builtin-group-household-cleaning", "washing-machine"),
        "酱菜": ("builtin-group-pantry", "flowbite:jar-wheat-outline"),
        "面部": (
            "builtin-group-personal-care",
            "covid:personal-hygiene-hand-sanitizer-spray",
        ),
        "面妆": ("builtin-group-personal-care", "makeup-base"),
        "速食": ("builtin-group-prepared-staples", "boxicons:bowl-noodles"),
    }
    for name, (parent_id, icon_key) in expected_outlook_categories.items():
        category = next(item for item in categories if item["name"] == name)
        assert category["parent_id"] == parent_id
        assert category["icon_key"] == icon_key
    seasoning = next(item for item in categories if item["name"] == "调料")
    assert seasoning["icon_key"] == "condiment"

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


def test_catalog_sync_removes_unreferenced_obsolete_builtin_subcategory(tmp_path: Path) -> None:
    """目录删除的小类会从已有数据库清除，避免继续出现在分类选择器。"""
    database_path = tmp_path / "obsolete-category.db"
    client = make_client(
        database_path,
        persistent_assets=tmp_path / "persistent",
        temporary_assets=tmp_path / "temporary",
    )
    refrigerator_id, _ = _create_refrigerator(client)
    client.get(f"/api/owner/refrigerators/{refrigerator_id}/categories")
    session_factory = create_session_factory(
        create_database_engine(f"sqlite:///{database_path}")
    )
    with transaction(session_factory) as session:
        session.add(
            IconAsset(
                key="rice",
                refrigerator_id=None,
                label="主食",
                media_type="image/svg+xml",
                storage_path="icons/rice.svg",
                source="builtin",
            )
        )
        session.add(
            FoodCategory(
                id="builtin-noodle",
                refrigerator_id=None,
                parent_id="builtin-group-prepared-staples",
                name="面条",
                icon_key="rice",
                is_custom=False,
                display_order=99,
            )
        )
        session.add(
            ItemCategoryMapping(
                refrigerator_id=refrigerator_id,
                normalized_item_name="面条商品",
                display_item_name="面条商品",
                subcategory_id="builtin-noodle",
                source="ai",
                confidence=0.9,
            )
        )

    _sync_catalog(database_path)
    categories = client.get(
        f"/api/owner/refrigerators/{refrigerator_id}/categories"
    ).json()
    removed_names = {"鱼", "苹果", "橘子", "生菜", "其他", "果汁", "牛奶", "鸡蛋"}
    assert removed_names.isdisjoint({item["name"] for item in categories})
    assert {"水产", "水果", "饮料", "奶品", "蛋类", "调料"}.issubset(
        {item["name"] for item in categories}
    )
    assert all(item["name"] != "面条" for item in categories)
    icons = client.get(f"/api/owner/refrigerators/{refrigerator_id}/icons").json()
    assert all(item["key"] != "rice" for item in icons)
    assert client.get("/api/icon-library/rice.svg").status_code == 404
    with transaction(session_factory) as session:
        assert session.scalars(
            select(ItemCategoryMapping).where(
                ItemCategoryMapping.subcategory_id == "builtin-noodle"
            )
        ).first() is None


def test_catalog_sync_removes_obsolete_group_after_moving_children(tmp_path: Path) -> None:
    """迁移内置小类后会清理不再存在且已为空的旧大类。"""
    database_path = tmp_path / "obsolete-group.db"
    client = make_client(
        database_path,
        persistent_assets=tmp_path / "persistent",
        temporary_assets=tmp_path / "temporary",
    )
    refrigerator_id, _ = _create_refrigerator(client)
    session_factory = create_session_factory(
        create_database_engine(f"sqlite:///{database_path}")
    )
    with transaction(session_factory) as session:
        session.add(
            FoodCategory(
                id="builtin-group-cleaning",
                refrigerator_id=None,
                parent_id=None,
                name="家庭清洁",
                icon_key=None,
                is_custom=False,
                display_order=7,
            )
        )
        session.add(
            FoodCategory(
                id="builtin-legacy-cleaning-item",
                refrigerator_id=None,
                parent_id="builtin-group-cleaning",
                name="历史清洁用品",
                icon_key=None,
                is_custom=False,
                display_order=99,
            )
        )

    _sync_catalog(database_path)
    categories = client.get(
        f"/api/owner/refrigerators/{refrigerator_id}/categories"
    ).json()
    assert "家庭清洁" not in {item["name"] for item in categories}
    assert "日化清洁" in {item["name"] for item in categories}


def test_catalog_sync_removes_requested_custom_categories_and_icons(tmp_path: Path) -> None:
    """指定名称的既有自定义小类和未再被引用的图标也会被清理。"""
    database_path = tmp_path / "requested-category-removal.db"
    client = make_client(
        database_path,
        persistent_assets=tmp_path / "persistent",
        temporary_assets=tmp_path / "temporary",
    )
    refrigerator_id, _ = _create_refrigerator(client)
    client.get(f"/api/owner/refrigerators/{refrigerator_id}/categories")
    session_factory = create_session_factory(
        create_database_engine(f"sqlite:///{database_path}")
    )
    with transaction(session_factory) as session:
        for name, icon_key in (("风干肠", "custom-sausage"), ("其他", "custom-other")):
            session.add(
                IconAsset(
                    key=icon_key,
                    refrigerator_id=refrigerator_id,
                    label=name,
                    media_type="image/png",
                    storage_path=f"{icon_key}.png",
                    source="agnes",
                )
            )
            session.add(
                FoodCategory(
                    refrigerator_id=refrigerator_id,
                    parent_id="builtin-group-pantry",
                    name=name,
                    icon_key=icon_key,
                    is_custom=True,
                    display_order=90,
                )
            )

    _sync_catalog(database_path)
    categories = client.get(
        f"/api/owner/refrigerators/{refrigerator_id}/categories"
    ).json()
    assert all(item["name"] not in {"风干肠", "其他"} for item in categories)
    icons = client.get(f"/api/owner/refrigerators/{refrigerator_id}/icons").json()
    assert all(item["key"] not in {"custom-sausage", "custom-other"} for item in icons)


def test_catalog_sync_hides_referenced_obsolete_builtin_subcategory(tmp_path: Path) -> None:
    """仍被历史库存引用的旧小类保留历史记录，但不得返回给分类选择器。"""
    database_path = tmp_path / "referenced-obsolete-category.db"
    client = make_client(
        database_path,
        persistent_assets=tmp_path / "persistent",
        temporary_assets=tmp_path / "temporary",
    )
    refrigerator_id, slot_id = _create_refrigerator(client)
    client.get(f"/api/owner/refrigerators/{refrigerator_id}/categories")
    session_factory = create_session_factory(
        create_database_engine(f"sqlite:///{database_path}")
    )
    with transaction(session_factory) as session:
        session.add(
            IconAsset(
                key="rice",
                refrigerator_id=None,
                label="主食",
                media_type="image/svg+xml",
                storage_path="icons/rice.svg",
                source="builtin",
            )
        )
        session.add(
            FoodCategory(
                id="builtin-noodle",
                refrigerator_id=None,
                parent_id="builtin-group-prepared-staples",
                name="面条",
                icon_key="rice",
                is_custom=False,
                display_order=99,
            )
        )
        session.add(
            InventoryBatchModel(
                refrigerator_id=refrigerator_id,
                subcategory_id="builtin-noodle",
                storage_slot_id=slot_id,
                item_name="历史面条",
                quantity=1,
            )
        )

    _sync_catalog(database_path)
    categories = client.get(
        f"/api/owner/refrigerators/{refrigerator_id}/categories"
    ).json()
    assert all(item["name"] != "面条" for item in categories)
    icons = client.get(f"/api/owner/refrigerators/{refrigerator_id}/icons").json()
    assert all(item["key"] != "rice" for item in icons)
    with transaction(session_factory) as session:
        legacy_category = session.get(FoodCategory, "builtin-noodle")
        assert legacy_category is not None
        assert legacy_category.icon_key is None


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
    engine = create_database_engine(f"sqlite:///{tmp_path / 'recent.db'}")
    session_factory = create_session_factory(engine)
    with transaction(session_factory) as session:
        bootstrap_rows = list(
            session.scalars(
                select(RecentSubcategoryUsage).where(
                    RecentSubcategoryUsage.refrigerator_id == refrigerator_id
                )
            )
        )
        assert len(bootstrap_rows) == 16
        assert all(item.is_bootstrap for item in bootstrap_rows)
        bootstrap_timestamps = {
            item.subcategory_id: item.last_added_at for item in bootstrap_rows
        }
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
    with transaction(session_factory) as session:
        unchanged_rows = list(
            session.scalars(
                select(RecentSubcategoryUsage).where(
                    RecentSubcategoryUsage.refrigerator_id == refrigerator_id
                )
            )
        )
        assert {
            item.subcategory_id: item.last_added_at for item in unchanged_rows
        } == bootstrap_timestamps

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
    assert len(recent) == 16
    assert len({item["id"] for item in recent}) == 16
    assert len({item["icon_key"] for item in recent}) == 16

    persisted = client.get(
        f"/api/owner/refrigerators/{refrigerator_id}/categories/recent"
    ).json()
    assert [item["id"] for item in persisted] == [item["id"] for item in recent]


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
    assert "?v=" in builtin["asset_url"]
    builtin_asset = client.get(builtin["asset_url"])
    assert builtin_asset.status_code == 200
    assert builtin_asset.headers["content-type"].startswith("image/svg+xml")
    assert builtin["variants"]["skeuomorphic"]["media_type"] == "image/png"
    skeuomorphic_asset = client.get(builtin["variants"]["skeuomorphic"]["asset_url"])
    assert skeuomorphic_asset.status_code == 200
    assert skeuomorphic_asset.headers["content-type"].startswith("image/png")
    requested_variant_keys = {
        "beef",
        "lamb",
        "pork",
        "steamed-bun",
        "condiment",
        "mingcute:mushroom-line",
        "drink",
        "outlook-精华",
    }
    for icon in icons.json():
        if icon["key"] in requested_variant_keys:
            assert icon["variants"]["skeuomorphic"]["media_type"] == "image/png"
            assert client.get(icon["variants"]["skeuomorphic"]["asset_url"]).status_code == 200
    dishwasher = next(icon for icon in icons.json() if icon["key"] == "dishwasher")
    assert "skeuomorphic" not in dishwasher["variants"]
    for icon_key in {
        "personal-hygiene-clean-toothpaste",
        "shampoo",
        "perfume-outline",
        "mask-one",
        "dishwasher",
        "washing-machine",
        "outlook-洁面",
        "lucide-lab:bottle-spray",
        "lucide-lab:shower",
        "ph:eye-bold",
        "pepicons-pop:paint-pallet-circle",
        "outlook-精华",
        "hugeicons:tissue-paper",
        "solar:smart-vacuum-cleaner-linear",
        "flowbite:jar-wheat-outline",
        "covid:personal-hygiene-hand-sanitizer-spray",
        "makeup-base",
        "boxicons:bowl-noodles",
    }:
        response = client.get(f"/api/icon-library/{quote(icon_key, safe='')}.svg")
        assert response.status_code == 200
        assert "<svg" in response.text
        if icon_key.startswith("outlook-"):
            assert "<image" not in response.text
            assert 'width="1em" height="1em"' in response.text
            assert 'fill="currentColor"' in response.text
            assert 'fill-rule="evenodd"' in response.text
        if icon_key == "lucide-lab:bottle-spray":
            assert "<image" not in response.text
            assert 'width="1em" height="1em"' in response.text
            assert 'stroke="currentColor"' in response.text

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


def test_icon_generation_model_wait_does_not_hold_database_connections(
    tmp_path: Path, caplog,
) -> None:
    """图标模型等待和文件生成阶段不应持有数据库连接。"""
    database_path = tmp_path / "icon-generation-pool.db"
    persistent_assets = tmp_path / "persistent"
    temporary_assets = tmp_path / "temporary"
    generated_images = [_transparent_png((0, 0, 0, 255)) for _ in range(4)]
    create_database_schema(f"sqlite:///{database_path}")
    observed: dict[str, int] = {}
    application = None

    async def provider(_name: str, _count: int) -> list[bytes]:
        assert application is not None
        pool = application.state.database_engine.sync_engine.pool
        observed["during_model_wait"] = pool.checkedout()
        await asyncio.sleep(0.05)
        return generated_images

    application = create_app(
        database_url=f"sqlite:///{database_path}",
        development_owner_user_id="owner",
        icon_generation_provider=provider,
        persistent_icon_dir=persistent_assets,
        temporary_icon_dir=temporary_assets,
    )
    client = start_test_client(application)
    refrigerator_id, _ = _create_refrigerator(client)
    with caplog.at_level("INFO", logger="fridgeboard.inventory_routes"):
        response = client.post(
            f"/api/owner/refrigerators/{refrigerator_id}/icon-candidates/stream",
            json={"subcategory_name": "洗发水"},
        )

    assert response.status_code == 200
    assert 'event: done' in response.text
    assert observed["during_model_wait"] == 0
    assert "图标生成模型完成" in caplog.text
    assert "图标候选持久化完成" in caplog.text
    assert "pool=" in caplog.text


def test_confirmed_icon_file_follows_database_rollback(tmp_path: Path) -> None:
    """确认候选所在事务回滚时保留候选并删除尚未提交的持久文件。"""
    database_url = f"sqlite:///{tmp_path / 'rollback.db'}"
    engine = create_database_engine(database_url)
    create_database_schema(engine)
    session_factory = create_session_factory(engine)
    persistent_assets = tmp_path / "persistent"
    temporary_assets = tmp_path / "temporary"
    generated = [_transparent_png((0, 0, 0, 255)) for _ in range(4)]

    async def provider(_name: str, _count: int) -> list[bytes]:
        return generated

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
        )
        normalized_name, images = asyncio.run(generate_icon_images(provider, "洗发水"))
        generation = asyncio.run(
            service.persist_generation(refrigerator_id, normalized_name, images)
        )
        candidate = asyncio.run(service.candidates(generation.id))[0]
        generation_id = generation.id
        candidate_id = candidate.id
    with sync_session(session_factory) as session:
        service = IconService(session, persistent_assets, temporary_assets)
        asyncio.run(
            service.confirm(
                refrigerator_id,
                generation_id,
                candidate_id,
                "builtin-group-snacks",
                "洗发水",
            )
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
    create_database_schema(engine)
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
        assert asyncio.run(
            AccessService(session).purge_expired_refrigerators(
                persistent_icon_dir=persistent_assets,
                temporary_icon_dir=temporary_assets,
            )
        ) == 1

    assert not icon_path.exists()
