import pytest
from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

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
    user = User(wallet_address=account.address)
    lot = Lot(
        owner_wallet=account.address,
        name="On-chain Test Lot",
        lat=19.0,
        lng=72.0,
        total_slots=1,
        base_price=2.0,
        slots=[Slot(slot_number="A-01")],
    )
    db.add_all([user, lot])
    db.flush()
    session = ParkingSession(
        on_chain_session_id=99,
        driver_wallet=account.address,
        lot_id=lot.lot_id,
        slot_id=lot.slots[0].slot_id,
        state=SessionState.RESERVED,
    )
    db.add(session)
    db.commit()
    db.close()

    def override_get_db():
        session_db: Session = TestingSessionLocal()
        try:
            yield session_db
        finally:
            session_db.close()

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
        yield test_client
    app.dependency_overrides.clear()


def test_entry_uses_chain_tx_hash_for_on_chain_session(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.api.sessions.confirm_entry_on_chain",
        lambda on_chain_session_id, geo_proof_hash: RelayerTxResult(
            tx_hash="0x" + "3" * 64,
            from_address="0x0000000000000000000000000000000000000001",
            block_number=100,
        ),
    )

    response = client.post("/sessions/1/entry", json={"geo_proof_hash": "qr"})

    assert response.status_code == 200
    assert response.json()["tx_hash"] == "0x" + "3" * 64


def test_pricing_uses_chain_tx_hashes_for_on_chain_session(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.api.pricing.commit_ai_pricing_on_chain",
        lambda on_chain_session_id, commit_hash, price_per_minute: RelayerTxResult(
            tx_hash="0x" + "4" * 64,
            from_address="0x0000000000000000000000000000000000000001",
        ),
    )
    monkeypatch.setattr(
        "app.api.pricing.reveal_pricing_on_chain",
        lambda on_chain_session_id, inputs, final_price_per_minute: RelayerTxResult(
            tx_hash="0x" + "5" * 64,
            from_address="0x0000000000000000000000000000000000000001",
        ),
    )

    response = client.post("/sessions/1/price", json={})

    assert response.status_code == 200
    timeline = client.get("/sessions/1/timeline").json()
    assert timeline[-2]["tx_hash"] == "0x" + "4" * 64
    assert timeline[-1]["tx_hash"] == "0x" + "5" * 64
