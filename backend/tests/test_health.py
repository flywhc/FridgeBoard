"""Tests for the public application health contract."""

from pathlib import Path

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
