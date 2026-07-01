import pytest
from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.models import Lot, ParkingSession, SessionState, Slot, User
from app.db.session import Base, get_db
from app.main import app


@pytest.fixture()
def db_session() -> Session:
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield session
    finally:
        session.close()
        app.dependency_overrides.clear()


@pytest.fixture()
def client(db_session: Session) -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


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


def test_seed_demo_lots_and_slots(client: TestClient) -> None:
    seed_response = client.post("/lots/seed-demo")
    assert seed_response.status_code == 201
    assert len(seed_response.json()) == 2

    lots_response = client.get("/lots")
    assert lots_response.status_code == 200
    assert lots_response.json()[0]["name"] == "Nexus Central Garage"
    assert lots_response.json()[0]["occupancy_pct"] == 0.0

    slots_response = client.get("/lots/1/slots")
    assert slots_response.status_code == 200
    assert len(slots_response.json()) == 12
    assert slots_response.json()[0]["status"] == "available"


def test_create_lot_requires_auth(client: TestClient) -> None:
    response = client.post(
        "/lots",
        json={
            "name": "Unauthorized Lot",
            "lat": 19.0,
            "lng": 72.0,
            "base_price": 2.0,
            "slots": [{"slot_number": "A-01"}],
        },
    )

    assert response.status_code == 401


def test_authenticated_user_can_create_lot(client: TestClient) -> None:
    response = client.post(
        "/lots",
        headers=auth_headers(client),
        json={
            "name": "Creator Garage",
            "lat": 19.0,
            "lng": 72.0,
            "base_price": 2.0,
            "slots": [{"slot_number": "A-01"}, {"slot_number": "A-02", "is_ev": True}],
        },
    )

    assert response.status_code == 201
    assert response.json()["total_slots"] == 2
    assert response.json()["owner_wallet"].startswith("0x")


def test_slot_status_reflects_occupying_session(client: TestClient, db_session: Session) -> None:
    user = User(wallet_address="0x0000000000000000000000000000000000000001")
    lot = Lot(
        owner_wallet=user.wallet_address,
        name="Occupied Test Lot",
        lat=19.0,
        lng=72.0,
        total_slots=1,
        base_price=2.0,
    )
    slot = Slot(slot_number="A-01", lot=lot)
    session = ParkingSession(
        driver_wallet=user.wallet_address,
        lot=lot,
        slot=slot,
        state=SessionState.ACTIVE,
    )
    db_session.add_all([user, lot, slot, session])
    db_session.commit()

    lots_response = client.get("/lots")
    slots_response = client.get(f"/lots/{lot.lot_id}/slots")

    assert lots_response.json()[0]["occupancy_pct"] == 100.0
    assert slots_response.json()[0]["status"] == "occupied"
