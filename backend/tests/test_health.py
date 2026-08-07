"""Tests for the public application health contract."""

import logging
import re
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

    for path in ("/fridge", "/fridge/device", "/fridge/pair"):
        response = client.get(path)
        assert response.status_code == 200
        assert response.text == "<html><title>Kindle static</title></html>"
        assert response.headers["cache-control"] == "no-store, max-age=0"


def test_kindle_page_keeps_the_dp75sdi_es5_fallback_contract() -> None:
    """Kindle 页面在不支持现代布局或脚本时仍保留可读的完整设备状态。"""
    root = Path(__file__).resolve().parents[2] / "frontend" / "public"
    page = (root / "kindle.html").read_text(encoding="utf-8")
    script = (root / "kindle.js").read_text(encoding="utf-8")
    style = (root / "kindle.css").read_text(encoding="utf-8")

    assert '<h1>家常食橱</h1>' in page
    assert "new XMLHttpRequest()" in script
    assert "document.documentElement.clientWidth" in script
    assert "document.documentElement.clientHeight" in script
    assert "REQUEST_TIMEOUT_MS" in script
    assert "setup_status" in script
    assert "/fridge/pair" in script
    assert "path.replace(/\\/+$/, '')" in script
    assert "/api/kindle/page-state" in script
    assert "result.state === 'unconfigured'" in script
    assert "/api/kindle/bind" in script
    assert "normalizePasscode" in script
    assert "kindle-passcode-panel" in script
    assert "绑定码无效、已过期或已使用" in script
    assert "status === 201 && refrigerator" in script
    assert "window.location.replace('/fridge/device')" in script
    assert "showWaitingLayout(refrigerator)" in script
    assert "image.onerror" in script
    assert "state.actionBusy" in script
    assert "status === 0 || status >= 500" in script
    assert "Promise" not in script
    assert "fetch(" not in script
    assert "URL(" not in script
    assert "=>" not in script
    assert "display: flex" not in style
    assert "display: grid" not in style
    assert "100dvh" not in style
    assert "aspect-ratio" not in style
    assert "calc(" not in style
    assert "overflow: hidden" not in style


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
