from fastapi.testclient import TestClient

from app.db.session import Base
from app.main import app


def test_health_check() -> None:
    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_cors_preflight_allows_any_frontend_origin() -> None:
    with TestClient(app) as client:
        response = client.options(
            "/health",
            headers={
                "Origin": "https://demo.example.test",
                "Access-Control-Request-Method": "GET",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://demo.example.test"


def test_core_tables_are_registered() -> None:
    expected_tables = {
        "users",
        "lots",
        "slots",
        "sessions",
        "chain_events",
        "ai_pricing_logs",
        "trust_history",
        "disputes",
    }

    assert expected_tables.issubset(Base.metadata.tables.keys())
