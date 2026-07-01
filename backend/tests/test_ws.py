from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.session import Base, get_db
from app.main import app


def test_chain_feed_broadcasts_mirrored_events() -> None:
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
    try:
        with TestClient(app) as client:
            with client.websocket_connect("/ws/chain-feed") as websocket:
                connected = websocket.receive_json()
                assert connected["type"] == "feed_connected"

                response = client.post(
                    "/chain/events/mirror",
                    json={
                        "event_type": "SlotReserved",
                        "tx_hash": "0x" + "2" * 64,
                        "payload": {"session_id": 44},
                        "session_id": None,
                        "block_number": 987,
                    },
                )

                assert response.status_code == 200
                message = websocket.receive_json()
                assert message["type"] == "tx_confirmed"
                assert message["payload"]["event_type"] == "SlotReserved"
                assert message["payload"]["block_number"] == 987
    finally:
        app.dependency_overrides.clear()
