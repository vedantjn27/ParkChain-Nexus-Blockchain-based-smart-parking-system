import pytest
from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.chain.listener import MirroredEvent, mirror_event
from app.chain.relayer import RelayerTxResult
from app.db.models import Lot, ParkingSession, SessionState, Slot, User
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

    account = Account.create()
    db = TestingSessionLocal()
    lot = Lot(
        owner_wallet=account.address,
        name="Remaining Phases Lot",
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
        message = test_client.get(f"/auth/message/{account.address}").json()["message"]
        signature = Account.sign_message(
            encode_defunct(text=message),
            private_key=account.key,
        ).signature.hex()
        token = test_client.post(
            "/auth/wallet-login",
            json={
                "wallet_address": account.address,
                "message": message,
                "signature": signature,
            },
        ).json()["access_token"]
        test_client.headers.update({"Authorization": f"Bearer {token}"})
        test_client.account_address = account.address
        yield test_client
    app.dependency_overrides.clear()


def fake_tx(hash_digit: str = "6") -> RelayerTxResult:
    return RelayerTxResult(
        tx_hash="0x" + hash_digit * 64,
        from_address="0x0000000000000000000000000000000000000001",
    )


def test_import_on_chain_session(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.api.sessions.get_on_chain_session",
        lambda on_chain_session_id: {
            "session_id": on_chain_session_id,
            "driver": client.account_address,
            "lot_id": 1,
            "slot_id": 1,
            "state": 0,
        },
    )

    response = client.post(
        "/sessions/import-on-chain",
        json={
            "on_chain_session_id": 77,
            "lot_id": 1,
            "slot_id": 1,
            "reserve_tx_hash": "0x" + "7" * 64,
        },
    )

    assert response.status_code == 201
    assert response.json()["on_chain_session_id"] == 77
    assert response.json()["tx_hash"] == "0x" + "7" * 64


def test_sync_events_endpoint_broadcasts_mirrored_events(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_sync(db: Session, *, from_block: int, to_block: int | str):
        event = mirror_event(
            db,
            MirroredEvent(
                event_type="SlotReserved",
                tx_hash="0x" + "8" * 64,
                block_number=from_block,
                payload={"sessionId": 1},
            ),
        )
        return [event]

    monkeypatch.setattr("app.api.chain.sync_all_configured_contract_events", fake_sync)
    response = client.post("/chain/events/sync", json={"from_block": 100, "to_block": 100})

    assert response.status_code == 200
    assert response.json()[0]["event_type"] == "SlotReserved"


def test_trust_and_green_credit_routes(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.api.trust.get_trust_score", lambda wallet: 700)
    monkeypatch.setattr("app.api.trust.mint_initial_trust_score", lambda wallet: fake_tx("9"))
    monkeypatch.setattr("app.api.trust.adjust_trust_score", lambda wallet, delta, reason_code: fake_tx("a"))
    monkeypatch.setattr("app.api.trust.get_green_credit_balance", lambda wallet: 42)
    monkeypatch.setattr("app.api.trust.mint_green_credit", lambda wallet, amount, reason_code: fake_tx("b"))
    monkeypatch.setattr("app.api.trust.redeem_green_credit", lambda wallet, amount: fake_tx("c"))

    trust_response = client.get(f"/trust/{client.account_address}")
    mint_response = client.post("/trust/me/mint")
    adjust_response = client.post(
        f"/trust/{client.account_address}/adjust",
        json={"delta": 5, "reason_code": "clean-session"},
    )
    credit_response = client.get(f"/green-credits/{client.account_address}")
    mint_credit_response = client.post(
        f"/green-credits/{client.account_address}/mint",
        json={"amount": 10, "reason_code": "ev-session"},
    )
    redeem_response = client.post(
        "/green-credits/me/redeem",
        json={"amount": 1, "reason_code": "discount"},
    )

    assert trust_response.json()["score"] == 700
    assert mint_response.json()["tx_hash"] == "0x" + "9" * 64
    assert adjust_response.json()["tx_hash"] == "0x" + "a" * 64
    assert credit_response.json()["balance"] == 42
    assert mint_credit_response.json()["tx_hash"] == "0x" + "b" * 64
    assert redeem_response.json()["tx_hash"] == "0x" + "c" * 64


def test_resolve_dispute_uses_chain_when_available(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.api.sessions.resolve_dispute_on_chain", lambda session_id, refund_driver: fake_tx("d"))

    db = next(app.dependency_overrides[get_db]())
    try:
        session = ParkingSession(
            on_chain_session_id=55,
            driver_wallet=client.account_address,
            lot_id=1,
            slot_id=1,
            state=SessionState.DISPUTED,
        )
        db.add(session)
        db.commit()
    finally:
        db.close()

    response = client.post("/sessions/1/resolve-dispute", json={"refund_driver": True})

    assert response.status_code == 200
    assert response.json()["state"] == "Resolved"
    assert response.json()["tx_hash"] == "0x" + "d" * 64


def test_demo_seed_route_is_idempotent(client: TestClient) -> None:
    response = client.post("/demo/seed")
    second_response = client.post("/demo/seed")

    assert response.status_code == 200
    assert second_response.status_code == 200
    assert second_response.json()["lots"] >= 1
