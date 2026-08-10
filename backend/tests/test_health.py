"""Tests for the public application health contract."""

import json
import logging
import re
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from fridgeboard.main import app, create_app


def test_healthz_reports_a_healthy_application() -> None:
    """Expose a stable, dependency-free probe for the container platform."""
    response = TestClient(app).get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_app_creation_does_not_access_database(tmp_path: Path) -> None:
    """应用装配不应要求数据库表已在模块导入或工厂调用前存在。"""
    create_app(database_url=f"sqlite:///{tmp_path / 'uninitialized.db'}")


def test_spa_fallback_does_not_hide_routes_registered_after_app_creation(tmp_path) -> None:
    """Keep API routes reachable even when PWA fallback is enabled."""
    (tmp_path / "index.html").write_text("<html>FridgeBoard</html>", encoding="utf-8")
    test_app = create_app(frontend_dist=tmp_path)

    @test_app.get("/api/inventory")
    def inventory() -> dict[str, bool]:
        """Return a minimal route used to test registration order."""
        return {"reachable": True}

    client = TestClient(test_app)

    assert client.get("/api/inventory").json() == {"reachable": True}
    assert client.get("/fridges/current").text == "<html>FridgeBoard</html>"
    assert client.get("/api/missing").status_code == 404


def test_fridge_routes_serve_the_same_standalone_kindle_page(tmp_path) -> None:
    """All Kindle entry points must serve the standalone page, not the module PWA."""
    (tmp_path / "index.html").write_text("<html>FridgeBoard</html>", encoding="utf-8")
    (tmp_path / "kindle.html").write_text(
        "<html><title>Kindle static</title></html>", encoding="utf-8"
    )
    client = TestClient(create_app(frontend_dist=tmp_path))

    for path in (
        "/fridge",
        "/fridge/device",
        "/fridge/device/restock",
        "/fridge/pair",
        "/fridge/passcode",
        "/k",
    ):
        response = client.get(path)
        assert response.status_code == 200
        assert response.text == "<html><title>Kindle static</title></html>"
        assert response.headers["cache-control"] == "no-store, max-age=0"

    spike = client.get("/fridge?spike=1")
    assert spike.status_code == 200
    assert spike.text == "<html><title>Kindle static</title></html>"
    assert spike.headers["cache-control"] == "no-store, max-age=0"


def test_kindle_page_keeps_the_dp75sdi_es5_fallback_contract() -> None:
    """Kindle 页面在不支持现代布局或脚本时仍保留可读的完整设备状态。"""
    root = Path(__file__).resolve().parents[2] / "frontend" / "public"
    page = (root / "kindle.html").read_text(encoding="utf-8")
    script = (root / "kindle.js").read_text(encoding="utf-8")
    layout_script = (root / "kindle-layout.js").read_text(encoding="utf-8")
    core_script = (root.parent / "src" / "fridgeLayoutCore.js").read_text(
        encoding="utf-8"
    )
    style = (root / "kindle.css").read_text(encoding="utf-8")

    assert '<h1></h1>' in page
    assert 'padding-right:20px' in page
    assert 'padding-left:20px' in page
    assert 'src="/fridge-layout-core.js"' in page
    assert 'src="/kindle-layout.js"' in page
    assert page.index('src="/fridge-layout-core.js"') < page.index('src="/kindle-layout.js"')
    assert "new XMLHttpRequest()" in script
    assert "document.documentElement.clientWidth" in script
    assert "document.documentElement.clientHeight" in script
    assert "REQUEST_TIMEOUT_MS" in script
    assert "setup_status" in script
    assert "/fridge/pair" in script
    assert "/fridge/passcode" in script
    assert "path.replace(/\\/+$/, '')" in script
    assert "/api/kindle/page-state" in script
    assert "result.state === 'unconfigured'" in script
    assert "/api/kindle/bind" in script
    assert "normalizePasscode" in script
    assert "kindle-spike-page" in script
    assert "kindle-spike-external" in style
    assert "hasQueryFlag('spike')" in script
    assert "function isCapabilitySpikePath()" in script
    assert "=== '/k'" in script
    assert "function renderMarginSpike(page)" in script
    assert "setPageClass('kindle-spike-shell')" in script
    assert "boxSizing: 'content-box'" in script
    assert "paddingRight: '24px'" in script
    assert "父元素 inline padding" in script
    assert "子元素 inline margin" in script
    assert "table 空白单元格" in script
    assert "HTML 不换行空格" in script
    assert "kindle-passcode-panel" in script
    assert "绑定码无效、已过期或已使用" in script
    assert "status === 201 && refrigerator" in script
    assert "window.location.replace('/fridge/device')" in script
    assert "showWaitingLayout(refrigerator)" in script
    assert "image.onerror" in script
    assert "state.actionBusy" in script
    assert "getFoodIconPositions" in script
    assert "window.KindleLayout.getFoodIconPositions" in script
    assert "kindle-food-cluster" in script
    assert "basket: 'M3 4h2l2.2 11h10.6l3-8H6.1'" in script
    assert "circle.setAttribute('cx', parts[0]);" in script
    assert "groupedItems" not in script
    assert "var ALL_ITEMS_SLOT_ID = '__all_inventory__';" in script
    assert "if (slotId === ALL_ITEMS_SLOT_ID) return state.inventory.slice(0);" in script
    assert "renderDetail(ALL_ITEMS_SLOT_ID);" in script
    assert "detailThumbnail" not in script
    assert "kindle-item-icon-ring" in script
    assert "ring.setAttribute('r', '30');" in script
    assert "next: 'M4 12h15m0 0-7-7m7 7-7 7'" in script
    assert "iconButton('next', 'kindle-detail-page-button kindle-detail-page-button-next'" in script
    assert "status === 401 || status === 403" in script
    assert "status === 0 || status >= 500" in script
    assert "/api/devices/current/sync-status" in script
    assert "SYNC_RETRY_INTERVAL_MS" in script
    assert "document.title = name ? '家常食橱 - ' + name : '家常食橱';" in script
    assert "setRefrigerator(refrigerator)" in script
    assert "kindle-home-header-subtitle" not in script
    assert "kindle-home-header-total" in script
    assert "summary.total + ' 件物品'" in script
    assert "legacyElement('p', 'kindle-legend', syncStatusLabel(), '4')" in script
    assert "app.appendChild(header(''));" in script
    assert "app.appendChild(header(refrigerator.name));" not in script
    assert "app.style.paddingLeft = '20px';" in script
    assert "app.style.paddingRight = '20px';" in script
    assert " - 40, 1)" in script
    assert "app.style.boxSizing = 'content-box';" in script
    assert "function styleHeaderAction(node)" in script
    assert "function styleHeaderCell(node)" in script
    assert "function headerCell(content, align)" in script
    assert "function styleHeaderAction(node)" in script
    assert "cell.appendChild(styleHeaderAction(content));" in script
    assert "node.style.paddingLeft = '20px';" in script
    assert "node.style.paddingRight = '20px';" in script
    assert "node.style.width = '72px';" in script
    assert "node.style.minWidth = '72px';" in script
    assert "node.style.minHeight = '72px';" in script
    assert "kindle-home-refresh" not in script
    assert "styleHeaderAction(iconButton('refresh', 'kindle-header-action'" in script
    assert "node.style.height = '72px';" in script
    assert "node.style.marginLeft = '8px';" in script
    assert "kindle-refresh-icon" in script
    assert "svg.style.overflow = 'visible';" in script
    assert "svg.style.verticalAlign = 'middle';" in script
    assert "svg.style.strokeWidth = '2.5';" in script
    assert "M19 11a7 7 0 1 0 1.9 4.7" in script
    assert "M19 4v7h-7" in script
    assert "arrowPath" in script
    assert "node.style.paddingLeft = '20px';" in script
    assert "svg.style.width = '60px';" in script
    assert "margin: 20px auto 0;" in style
    assert "padding-left: 20px;" in style
    assert "width: 72px;" in style
    assert "margin-left: 8px;" in style
    assert "height: 60px;" in style
    assert "min-width: 112px" in style
    assert "lastSuccessfulSyncAt" in script
    assert "每 30 分钟自动重试" in script
    assert "state.syncStatus !== 'syncing'" in script
    assert script.count("schedule('syncRetry'") >= 2
    assert script.count("state.hasWorkspaceSnapshot = true;") >= 2
    assert "return false;" in script
    assert "state.lastSuccessfulSyncAt = syncResult.last_successful_sync_at;" in script
    assert "completeSync(result);" in script
    assert "currentIsoTime" not in script
    assert "if (syncBanner()) app.appendChild(syncBanner());" not in script
    assert "function markLegacy(" in script
    assert "function legacyElement(" in script
    assert "function legacyButton(" in script
    assert "legacyElement('p', 'kindle-status'" in script
    assert "legacyElement('p', 'kindle-copy-block'" in script
    assert "legacyElement('h2', 'kindle-detail-title'" in script
    assert "iconButton('take'" not in script
    assert "iconButton('minus'" in script
    assert "iconButton('plus'" in script
    assert "adjust(item, -item.quantity)" not in script
    assert "inventoryAddedDaysLabel" in script
    assert "inventoryExpiryLabel" in script
    assert "inventoryPriceLabel" in script
    assert "可食用" not in script
    assert "剩 ' + item.quantity" not in script
    assert "function homeHeader(" in script
    assert "fitHomeFridge" in script
    assert "window.FridgeLayoutCore.createFridgeRenderPlan(state.layout)" in script
    assert "window.FridgeLayoutCore.getShellGeometry(state.layout.template_key)" in script
    assert "createFridgeRenderPlan" in core_script
    assert "getDoorPanels" in core_script
    assert "getCabinetBands" in core_script
    assert "getShellGeometry" not in layout_script
    assert "getDoorSegments" not in layout_script
    assert "appendHinges(fridge, plan.hingeTracks[0]" in script
    assert "element('span', 'kindle-fridge-hinges')" in script
    assert "bandNode.style.borderBottom = '3px solid #111'" in script
    assert "slotButton.style.height = '100%'" in script
    assert "legacyButton('返回冰箱首页'" in script
    assert "new Promise" not in script
    assert ".then(" not in script
    assert "fetch(" not in script
    assert "URL(" not in script
    assert "=>" not in script
    assert "display: flex" not in style
    assert "display: grid" not in style
    assert "100dvh" not in style
    assert "aspect-ratio" not in style
    assert "calc(" not in style
    assert "overflow: hidden" not in style
    assert ".kindle-food-cluster" in style
    assert ".kindle-food-count" in style
    assert "min-width: 0;" in style
    assert "background: transparent;" in style
    assert ".kindle-detail-preview" not in style
    assert ".kindle-item-icon-ring" in style
    assert "border: 0;" in style
    assert "getThumbnailLayout" not in layout_script
    assert "Math.imul" not in layout_script
    assert "=>" not in core_script
    assert "new Promise" not in core_script
    assert "fetch(" not in core_script
    assert ".kindle-fridge-hinges i" in style
    assert ".kindle-zone-row .kindle-slot:last-child" in style


def test_shared_layout_core_drives_kindle_geometry_and_mobile_hash() -> None:
    """共享 ES5 核心应唯一生成两端结构计划，Kindle 只保留图标分散算法。"""
    core_path = (
        Path(__file__).resolve().parents[2]
        / "frontend"
        / "src"
        / "fridgeLayoutCore.js"
    )
    layout_path = Path(__file__).resolve().parents[2] / "frontend" / "public" / "kindle-layout.js"
    node_script = """
const fs = require('fs');
const vm = require('vm');
const context = { Math: Math, window: {} };
vm.runInNewContext(fs.readFileSync(__CORE_PATH__, 'utf8'), context);
vm.runInNewContext(fs.readFileSync(__LAYOUT_PATH__, 'utf8'), context);
const layout = context.window.KindleLayout;
const core = context.window.FridgeLayoutCore;
function mobileHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
if (layout.hashString('batch-1') !== mobileHash('batch-1')) throw new Error('hash mismatch');
const positions = layout.getFoodIconPositions(['a', 'b', 'c', 'd'], 160, 96);
const inBounds = positions.every(position =>
  position.x >= 0 && position.x <= 1 && position.y >= 0 && position.y <= 1
);
if (positions.length !== 4 || !inBounds) {
  throw new Error('invalid food positions');
}
    const shell = core.getShellGeometry('top_freezer_single');
    if (shell.width !== 238 || shell.height !== 315 || shell.columns.join(',') !== '144,8,70') {
      throw new Error('standard shell mismatch');
    }
    const wideShell = core.getShellGeometry('side_by_side');
    if (
      wideShell.width !== 358 ||
      wideShell.height !== 280 ||
      wideShell.columns.join(',') !== '74,8,194,8,74'
    ) {
      throw new Error('wide shell mismatch');
    }
    const plan = core.createFridgeRenderPlan({
      template_key: 'top_freezer_single',
      zones: [
        { key: 'top', is_door: false, geometry: { x: 0, y: 0, width: 100, height: 40 }, slots: [] },
        {
          key: 'middle-left', is_door: false,
          geometry: { x: 0, y: 40, width: 50, height: 20 }, slots: []
        },
        {
          key: 'middle-right', is_door: false,
          geometry: { x: 50, y: 40, width: 50, height: 20 }, slots: []
        },
        {
          key: 'bottom', is_door: false,
          geometry: { x: 0, y: 60, width: 100, height: 40 }, slots: []
        },
        {
          key: 'door', is_door: true,
          geometry: { x: 0, y: 0, width: 100, height: 100 }, slots: []
        },
      ]
    });
    if (plan.cabinetBands.length !== 3 || plan.cabinetBands[1].zones.length !== 2) {
      throw new Error('middle band mismatch');
    }
    if (plan.hingeTracks.length !== 1 || plan.hingeTracks[0].positions.join(',') !== '25,75') {
      throw new Error('standard hinge mismatch');
    }
    const frenchDoor = {
  template_key: 'french_door',
  zones: [
    {
      key: 'left_refrigerator', is_door: false,
      geometry: { x: 0, y: 0, width: 50, height: 65 },
      slots: [{ id: 'cabinet-1', geometry: { x: 0, y: 0, width: 50, height: 65 } }]
    },
    {
      key: 'door', is_door: true,
      geometry: { x: 0, y: 0, width: 100, height: 65 },
      slots: [
        { id: 'door-1', geometry: { x: 0, y: 0, width: 100, height: 33 } },
        { id: 'door-2', geometry: { x: 0, y: 33, width: 100, height: 32 } },
        { id: 'door-3', geometry: { x: 0, y: 0, width: 100, height: 33 } },
        { id: 'door-4', geometry: { x: 0, y: 33, width: 100, height: 32 } }
      ]
    }
  ]
};
const frenchPlan = core.createFridgeRenderPlan(frenchDoor);
const left = frenchPlan.doorPanels.left[0].slots.map(slot => slot.id).join(',');
const right = frenchPlan.doorPanels.right[0].slots.map(slot => slot.id).join(',');
if (left !== 'door-1,door-2' || right !== 'door-3,door-4') {
  throw new Error('french door split mismatch');
}
""".replace('__CORE_PATH__', json.dumps(str(core_path))).replace(
        '__LAYOUT_PATH__', json.dumps(str(layout_path))
    )
    result = subprocess.run(
        ["node", "-e", node_script],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr or result.stdout


def test_kindle_page_contains_the_restock_flow_contract() -> None:
    """Kindle 首页和补货页必须保留只读动态缺货流程的静态入口。"""
    root = Path(__file__).resolve().parents[2] / "frontend" / "public"
    script = (root / "kindle.js").read_text(encoding="utf-8")
    style = (root / "kindle.css").read_text(encoding="utf-8")

    assert "'/fridge/device/restock'" in script
    assert "'/fridge/device/recipes'" in script
    assert "/api/devices/current/restock" in script
    assert "/api/devices/current/recipes" in script
    assert "kindle-restock-page" in script
    assert "kindle-recipe-page" in script
    assert "kindle-recipe-tabs" in script
    assert "查看每日食谱" in script
    assert "translate(0 3)" in script
    assert "function recipeCompletionIcon(completed)" in script
    assert "kindle-recipe-status-button" in script
    assert "/api/devices/current/inventory" in script
    assert "/api/devices/current/icons" in script
    assert "kindle-recipe-ingredient-icon" in script
    assert "kindle-recipe-page" in style
    assert "kindle-recipe-entry" in style
    assert "kindle-recipe-completion-icon" in style
    assert "width: 60px" in style
    assert "kindle-recipe-ingredient-icon" in style
    assert "没有需要补货的食材" in script
    assert "补货清单暂时无法读取" in script
    assert "week_start" in script
    assert "kindle-restock-entry" in style
    assert "kindle-restock-table" in script
    assert "restockWeekEntries" in script
    assert "missingLabels.join('，')" in script
    assert "本周和下周未完成食谱的缺货食材。" not in script
    assert "kindle-restock-table" in style
    assert "kindle-restock-refresh" in style
    assert ".kindle-home-actions .kindle-alert-restock" in style
    assert "white-space: normal" in style
    assert ".kindle-home-header-actions .kindle-header-restock" not in style


def test_kindle_home_risk_summary_uses_clock_warning_and_corner_counts() -> None:
    """Kindle 首页风险汇总使用指定图标并保留右上角数字角标。"""
    root = Path(__file__).resolve().parents[2] / "frontend" / "public"
    script = (root / "kindle.js").read_text(encoding="utf-8")
    style = (root / "kindle.css").read_text(encoding="utf-8")

    assert "M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8s8-3.6 8-8s-3.6-8-8-8" in script
    assert "M8 3H7v6h5V8H8z" in script
    assert "M464 720a48 48 0 1 0 96 0a48 48 0 1 0-96 0" in script
    assert "M12 4 21 20H3L12 4" not in script
    assert "M5 2h14v20H5z" not in script
    assert "badgeIcon.setAttribute('fill', 'currentColor');" in script
    assert ".kindle-header-badge font {" in style
    assert "position: absolute;" in style
    assert "top: 2px;" in style
    assert "right: 4px;" in style


def test_http_errors_are_logged_with_request_context(caplog: pytest.LogCaptureFixture) -> None:
    """Record expected HTTP errors without exposing request credentials."""
    client = TestClient(create_app())

    with caplog.at_level(logging.ERROR, logger="fridgeboard.main"):
        response = client.get("/api/missing", headers={"Authorization": "Bearer secret"})

    assert response.status_code == 404
    assert "HTTP 错误" in caplog.text
    assert re.search(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{4}", caplog.text)
    assert "method=GET" in caplog.text
    assert "path=/api/missing" in caplog.text
    assert "secret" not in caplog.text


def test_unhandled_errors_are_logged_and_return_generic_500(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Record a traceback for unexpected failures while hiding internal details."""
    application = create_app()

    @application.get("/api/failure")
    def failure() -> None:
        """Raise an error for the logging regression test."""
        raise RuntimeError("private implementation detail")

    client = TestClient(application, raise_server_exceptions=False)
    with caplog.at_level(logging.ERROR, logger="fridgeboard.main"):
        response = client.get("/api/failure")

    assert response.status_code == 500
    assert response.json() == {"detail": "内部服务器错误"}
    assert "未处理后端异常" in caplog.text
    assert "RuntimeError" in caplog.text
    assert "private implementation detail" in caplog.text
