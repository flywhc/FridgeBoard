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


def test_fridge_route_serves_standalone_qr_page(tmp_path) -> None:
    """Serve the standalone Kindle QR page instead of the module PWA at /fridge."""
    (tmp_path / "index.html").write_text("<html>FridgeBoard</html>", encoding="utf-8")
    (tmp_path / "fridge-qr.html").write_text(
        "<html><title>Kindle QR</title></html>", encoding="utf-8"
    )
    client = TestClient(create_app(frontend_dist=tmp_path))

    response = client.get("/fridge")

    assert response.status_code == 200
    assert response.text == "<html><title>Kindle QR</title></html>"


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
