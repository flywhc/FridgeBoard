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
    style = (root / "kindle.css").read_text(encoding="utf-8")

    assert '<h1>家常食橱</h1>' in page
    assert 'src="/kindle-layout.js"' in page
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
    assert "groupedItems" not in script
    assert "kindle-detail-preview" in script
    assert "status === 401 || status === 403" in script
    assert "status === 0 || status >= 500" in script
    assert "/api/devices/current/sync-status" in script
    assert "SYNC_RETRY_INTERVAL_MS" in script
    assert "document.title = name ? '家常食橱 - ' + name : '家常食橱';" in script
    assert "setRefrigerator(refrigerator)" in script
    assert "legacyElement('strong', '', '家常食橱', '5')" in script
    assert "app.appendChild(header('家常食橱'));" in script
    assert "app.appendChild(header(refrigerator.name));" not in script
    assert "margin: 20px auto 0;" in style
    assert "padding: 5px 29px 24px;" in style
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
    assert "legacyElement('strong', '', '家常食橱', '5')" in script
    assert "legacyElement('h2', 'kindle-detail-title'" in script
    assert "iconButton('take'" in script
    assert "function homeHeader(" in script
    assert "fitHomeFridge" in script
    assert "getShellGeometry" in layout_script
    assert "getDoorSegments" in layout_script
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
    assert ".kindle-detail-preview" in style
    assert "getThumbnailLayout" in layout_script
    assert "Math.imul" not in layout_script


def test_kindle_layout_script_matches_mobile_hash_and_template_geometry() -> None:
    """Kindle 的 ES5 布局脚本应保持手机端 seed 和模板缩略图几何一致。"""
    layout_path = Path(__file__).resolve().parents[2] / "frontend" / "public" / "kindle-layout.js"
    node_script = """
const fs = require('fs');
const vm = require('vm');
const context = { Math: Math, window: {} };
vm.runInNewContext(fs.readFileSync(__LAYOUT_PATH__, 'utf8'), context);
const layout = context.window.KindleLayout;
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
    const shell = layout.getShellGeometry('top_freezer_single');
    if (shell.width !== 238 || shell.height !== 315 || shell.columns.join(',') !== '144,8,70') {
      throw new Error('standard shell mismatch');
    }
    const wideShell = layout.getShellGeometry('side_by_side');
    if (
      wideShell.width !== 358 ||
      wideShell.height !== 280 ||
      wideShell.columns.join(',') !== '74,8,194,8,74'
    ) {
      throw new Error('wide shell mismatch');
    }
    const bands = layout.getZoneBands('top_freezer_single', [
      { geometry: { x: 0, y: 0, width: 100, height: 40 } },
      { geometry: { x: 0, y: 40, width: 50, height: 20 } },
      { geometry: { x: 50, y: 40, width: 50, height: 20 } },
      { geometry: { x: 0, y: 60, width: 100, height: 40 } },
    ]);
    if (bands.length !== 3 || bands[1].zones.length !== 2) {
      throw new Error('middle band mismatch');
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
const thumbnail = layout.getThumbnailLayout(frenchDoor);
const left = thumbnail.panels[0].zones[0].slots.map(slot => slot.id).join(',');
const right = thumbnail.panels[2].zones[0].slots.map(slot => slot.id).join(',');
if (left !== 'door-1,door-2' || right !== 'door-3,door-4') {
  throw new Error('french door split mismatch');
}
""".replace('__LAYOUT_PATH__', json.dumps(str(layout_path)))
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
    assert "/api/devices/current/restock" in script
    assert "kindle-restock-page" in script
    assert "没有需要补货的食材" in script
    assert "补货清单暂时无法读取" in script
    assert "week_start" in script
    assert "kindle-restock-entry" in style
    assert "kindle-restock-missing" in style
    assert ".kindle-home-actions .kindle-alert-restock" in style
    assert "white-space: normal" in style
    assert ".kindle-home-header-actions .kindle-header-restock" not in style


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
