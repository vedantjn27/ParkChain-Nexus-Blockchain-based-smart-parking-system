"""SQLAlchemy engine and session management."""

import json
from collections.abc import Generator

from sqlalchemy import select
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()

connect_args = {}
if settings.database_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_db_and_tables() -> None:
    from app.db import models  # noqa: F401
    from app.chain.listener import normalize_tx_hash

    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seen_events = {}
        for event in db.scalars(select(models.ChainEvent)).all():
            normalized_hash = normalize_tx_hash(event.tx_hash)
            payload = json.loads(event.payload_json)
            if "sessionId" in payload and "on_chain_session_id" not in payload:
                payload["on_chain_session_id"] = int(payload["sessionId"])
            if event.session_id is not None:
                payload["session_id"] = event.session_id
            event.tx_hash = normalized_hash
            event.payload_json = json.dumps(payload, default=str)
            key = (event.event_type, normalized_hash)
            existing = seen_events.get(key)
            if existing is None:
                seen_events[key] = event
                continue
            if existing.block_number is None and event.block_number is not None:
                existing.block_number = event.block_number
            if existing.session_id is None and event.session_id is not None:
                existing.session_id = event.session_id
            existing_payload = json.loads(existing.payload_json)
            existing_payload.update(payload)
            existing.payload_json = json.dumps(existing_payload, default=str)
            db.delete(event)
        db.commit()
