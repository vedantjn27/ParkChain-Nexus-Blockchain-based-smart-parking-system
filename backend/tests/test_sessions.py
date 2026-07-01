import pytest
from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.models import Lot, Slot
from app.db.session import Base, get_db
from app.main import app


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
    lot = Lot(
        owner_wallet="0x0000000000000000000000000000000000000001",
        name="Lifecycle Test Lot",
        lat=19.0,
        lng=72.0,
        total_slots=2,
        base_price=2.0,
        slots=[Slot(slot_number="A-01"), Slot(slot_number="A-02")],
    )
    db.add(lot)
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


def auth_headers(client: TestClient) -> dict[str, str]:
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
    return {"Authorization": f"Bearer {token}"}


def reserve_slot(client: TestClient, headers: dict[str, str], slot_id: int = 1):
    return client.post(
        "/sessions/reserve",
        headers=headers,
        json={"lot_id": 1, "slot_id": slot_id, "is_ev_charging": False},
    )


def test_session_lifecycle_and_timeline(client: TestClient) -> None:
    headers = auth_headers(client)

    reserve_response = reserve_slot(client, headers)
    assert reserve_response.status_code == 201
    session_id = reserve_response.json()["session_id"]
    assert reserve_response.json()["state"] == "Reserved"

    entry_response = client.post(
        f"/sessions/{session_id}/entry",
        headers=headers,
        json={"geo_proof_hash": "qr-proof"},
    )
    assert entry_response.status_code == 200
    assert entry_response.json()["state"] == "EntryConfirmed"

    exit_response = client.post(f"/sessions/{session_id}/exit", headers=headers)
    assert exit_response.status_code == 200
    assert exit_response.json()["state"] == "ExitConfirmed"

    dispute_response = client.post(
        f"/sessions/{session_id}/dispute",
        headers=headers,
        json={"reason": "Exit timestamp was incorrect in the demo flow."},
    )
    assert dispute_response.status_code == 201
    assert dispute_response.json()["state"] == "Disputed"

    timeline_response = client.get(f"/sessions/{session_id}/timeline", headers=headers)
    assert timeline_response.status_code == 200
    assert [event["event_type"] for event in timeline_response.json()] == [
        "SlotReserved",
        "EntryConfirmed",
        "ExitConfirmed",
        "DisputeRaised",
    ]


def test_priced_session_can_confirm_exit_and_calculate_total(client: TestClient) -> None:
    headers = auth_headers(client)

    session_id = reserve_slot(client, headers).json()["session_id"]
    entry_response = client.post(
        f"/sessions/{session_id}/entry",
        headers=headers,
        json={"geo_proof_hash": "qr-proof"},
    )
    assert entry_response.status_code == 200

    price_response = client.post(
        f"/sessions/{session_id}/price",
        headers=headers,
        json={"historical_demand_factor": 1.2, "weather_flag": "clear"},
    )
    assert price_response.status_code == 200

    exit_response = client.post(f"/sessions/{session_id}/exit", headers=headers)

    assert exit_response.status_code == 200
    assert exit_response.json()["state"] == "ExitConfirmed"
    assert exit_response.json()["total_amount"] is not None
    assert exit_response.json()["total_amount"] > 0


def test_reserve_rejects_double_booking(client: TestClient) -> None:
    headers = auth_headers(client)

    first_response = reserve_slot(client, headers)
    second_response = reserve_slot(client, headers)

    assert first_response.status_code == 201
    assert second_response.status_code == 409


def test_user_can_list_active_sessions_after_leaving_flow(client: TestClient) -> None:
    headers = auth_headers(client)

    reserve_response = reserve_slot(client, headers)
    session_id = reserve_response.json()["session_id"]

    active_response = client.get("/sessions/active/me", headers=headers)

    assert active_response.status_code == 200
    assert active_response.json()[0]["session_id"] == session_id
    assert active_response.json()[0]["slot_id"] == 1
    assert active_response.json()[0]["state"] == "Reserved"


def test_session_requires_owner_wallet(client: TestClient) -> None:
    owner_headers = auth_headers(client)
    other_headers = auth_headers(client)
    session_id = reserve_slot(client, owner_headers).json()["session_id"]

    response = client.get(f"/sessions/{session_id}", headers=other_headers)

    assert response.status_code == 403
