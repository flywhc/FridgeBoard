"""Tests for the public application health contract."""

from fastapi.testclient import TestClient
from fridgeboard.main import app, create_app


def test_healthz_reports_a_healthy_application() -> None:
    """Expose a stable, dependency-free probe for the container platform."""
    response = TestClient(app).get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


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
