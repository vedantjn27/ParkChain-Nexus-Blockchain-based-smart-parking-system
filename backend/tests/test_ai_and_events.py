from dataclasses import dataclass

import pytest
from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.ai.pricing_engine import PricingInputs
from app.db.models import Lot, ParkingSession, SessionState, Slot, User
from app.db.session import Base, get_db
from app.main import app


@dataclass(frozen=True)
class FakePricingResult:
    inputs: PricingInputs
    commit_hash: str = "0x" + "a" * 64
    price_per_minute: float = 3.25
    surge_multiplier: float = 1.3
    rationale: str = "Demand is elevated but still within normal range."
    source: str = "test"


@pytest.fixture()
def client() -> TestClient:
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    db = TestingSessionLocal()
    user = User(wallet_address="0x0000000000000000000000000000000000000001")
    lot = Lot(
        owner_wallet=user.wallet_address,
        name="AI Test Lot",
        lat=19.0,
        lng=72.0,
        total_slots=2,
        base_price=2.5,
        slots=[Slot(slot_number="A-01"), Slot(slot_number="A-02")],
    )
    db.add_all([user, lot])
    db.commit()
    db.close()

    def override_get_db():
        session: Session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def auth_headers(client: TestClient) -> tuple[dict[str, str], str]:
    account = Account.create()
    message = client.get(f"/auth/message/{account.address}").json()["message"]
    signature = Account.sign_message(
        encode_defunct(text=message),
        private_key=account.key,
    ).signature.hex()
    token = client.post(
        "/auth/wallet-login",
        json={
            "wallet_address": account.address,
            "message": message,
            "signature": signature,
        },
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}, account.address


def test_mirror_event_endpoint_records_chain_event(client: TestClient) -> None:
    response = client.post(
        "/chain/events/mirror",
        json={
            "event_type": "SlotReserved",
            "tx_hash": "0x" + "1" * 64,
            "payload": {"session_id": 1},
            "block_number": 123,
        },
    )

    assert response.status_code == 200
    assert response.json()["event_type"] == "SlotReserved"
    events_response = client.get("/chain/events")
    assert events_response.json()[0]["block_number"] == 123


def test_sync_events_returns_empty_list_when_rpc_sync_fails(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail_sync(*args, **kwargs):
        raise RuntimeError("RPC log query failed")

    monkeypatch.setattr("app.api.chain.sync_all_configured_contract_events", fail_sync)

    response = client.post("/chain/events/sync", json={"from_block": 0, "to_block": "latest"})

    assert response.status_code == 200
    assert response.json() == []


def test_price_session_records_commit_reveal_and_log(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.api.pricing.calculate_ai_price",
        lambda inputs: FakePricingResult(inputs=inputs),
    )
    headers, _ = auth_headers(client)
    reserve_response = client.post(
        "/sessions/reserve",
        headers=headers,
        json={"lot_id": 1, "slot_id": 1},
    )
    session_id = reserve_response.json()["session_id"]

    price_response = client.post(
        f"/sessions/{session_id}/price",
        headers=headers,
        json={"historical_demand_factor": 1.2, "weather_flag": "clear"},
    )

    assert price_response.status_code == 200
    assert price_response.json()["commit_hash"] == "0x" + "a" * 64
    assert price_response.json()["verified"] is True

    timeline_response = client.get(f"/sessions/{session_id}/timeline", headers=headers)
    assert [event["event_type"] for event in timeline_response.json()] == [
        "SlotReserved",
        "PricingCommitted",
        "PricingRevealed",
    ]


def test_forecast_returns_30_and_60_minute_points(client: TestClient) -> None:
    db_override = next(app.dependency_overrides[get_db]())
    try:
        db_override.add(
            ParkingSession(
                driver_wallet="0x0000000000000000000000000000000000000001",
                lot_id=1,
                slot_id=1,
                state=SessionState.ACTIVE,
            )
        )
        db_override.commit()
    finally:
        db_override.close()

    response = client.get("/forecast/1?historical_demand_factor=1.1")

    assert response.status_code == 200
    assert response.json()["current_occupancy_pct"] == 50.0
    assert [point["minutes_ahead"] for point in response.json()["points"]] == [30, 60]
