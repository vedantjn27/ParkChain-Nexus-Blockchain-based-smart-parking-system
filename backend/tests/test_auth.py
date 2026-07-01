import pytest
from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

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

    def override_get_db():
        db: Session = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_wallet_login_issues_token_and_creates_user(client: TestClient) -> None:
    account = Account.create()
    message_response = client.get(f"/auth/message/{account.address}")
    message = message_response.json()["message"]
    signature = Account.sign_message(
        encode_defunct(text=message),
        private_key=account.key,
    ).signature.hex()

    login_response = client.post(
        "/auth/wallet-login",
        json={
            "wallet_address": account.address,
            "message": message,
            "signature": signature,
            "display_name": "Demo Driver",
        },
    )

    assert login_response.status_code == 200
    token = login_response.json()["access_token"]
    assert token
    assert login_response.json()["user"]["display_name"] == "Demo Driver"

    me_response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_response.status_code == 200
    assert me_response.json()["wallet_address"] == account.address


def test_wallet_login_rejects_wrong_signature(client: TestClient) -> None:
    account = Account.create()
    other_account = Account.create()
    message = client.get(f"/auth/message/{account.address}").json()["message"]
    signature = Account.sign_message(
        encode_defunct(text=message),
        private_key=other_account.key,
    ).signature.hex()

    response = client.post(
        "/auth/wallet-login",
        json={
            "wallet_address": account.address,
            "message": message,
            "signature": signature,
        },
    )

    assert response.status_code == 401
