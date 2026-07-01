"""Blockchain integration status routes."""

import json
import logging
from typing import Annotated, Any

from fastapi import APIRouter
from fastapi import Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.chain.contracts import configured_contracts, get_web3
from app.chain.listener import MirroredEvent, mirror_event, sync_all_configured_contract_events
from app.chain.relayer import RelayerConfigError, get_relayer_address
from app.core.config import get_settings
from app.api.ws import chain_event_message, chain_feed_manager
from app.db.models import ChainEvent
from app.db.session import get_db


router = APIRouter(prefix="/chain", tags=["chain"])
logger = logging.getLogger(__name__)


class MirrorEventRequest(BaseModel):
    event_type: str = Field(min_length=1, max_length=80)
    tx_hash: str = Field(min_length=1, max_length=100)
    payload: dict[str, Any] = Field(default_factory=dict)
    session_id: int | None = None
    block_number: int | None = None


class ChainEventResponse(BaseModel):
    id: int
    event_type: str
    session_id: int | None
    block_number: int | None
    tx_hash: str
    payload: dict[str, Any]


class SyncEventsRequest(BaseModel):
    from_block: int = Field(ge=0)
    to_block: int | str = "latest"


@router.get("/status")
def chain_status() -> dict[str, object]:
    settings = get_settings()
    try:
        relayer_address = get_relayer_address()
    except RelayerConfigError:
        relayer_address = None

    return {
        "rpc_url": settings.rpc_url_amoy,
        "network": "polygon-amoy",
        "connected": get_web3().is_connected(),
        "relayer_address": relayer_address,
        "contracts": configured_contracts(),
    }


@router.get("/events", response_model=list[ChainEventResponse])
def list_chain_events(db: Annotated[Session, Depends(get_db)], limit: int = 50) -> list[ChainEventResponse]:
    events = db.scalars(select(ChainEvent).order_by(ChainEvent.id.desc()).limit(min(limit, 200))).all()
    return [
        ChainEventResponse(
            id=event.id,
            event_type=event.event_type,
            session_id=event.session_id,
            block_number=event.block_number,
            tx_hash=event.tx_hash,
            payload=json.loads(event.payload_json),
        )
        for event in events
    ]


@router.post("/events/mirror", response_model=ChainEventResponse)
async def mirror_chain_event(
    payload: MirrorEventRequest,
    db: Annotated[Session, Depends(get_db)],
) -> ChainEventResponse:
    event = mirror_event(
        db,
        MirroredEvent(
            event_type=payload.event_type,
            tx_hash=payload.tx_hash,
            payload=payload.payload,
            session_id=payload.session_id,
            block_number=payload.block_number,
        ),
    )
    db.commit()
    db.refresh(event)
    await chain_feed_manager.broadcast(chain_event_message(event))
    return ChainEventResponse(
        id=event.id,
        event_type=event.event_type,
        session_id=event.session_id,
        block_number=event.block_number,
        tx_hash=event.tx_hash,
        payload=json.loads(event.payload_json),
    )


@router.post("/events/sync", response_model=list[ChainEventResponse])
async def sync_chain_events(
    payload: SyncEventsRequest,
    db: Annotated[Session, Depends(get_db)],
) -> list[ChainEventResponse]:
    try:
        events = sync_all_configured_contract_events(db, from_block=payload.from_block, to_block=payload.to_block)
    except Exception as exc:
        logger.warning("Chain event sync failed; returning no events: %s", exc)
        events = []
    db.commit()
    for event in events:
        await chain_feed_manager.broadcast(chain_event_message(event))
    return [
        ChainEventResponse(
            id=event.id,
            event_type=event.event_type,
            session_id=event.session_id,
            block_number=event.block_number,
            tx_hash=event.tx_hash,
            payload=json.loads(event.payload_json),
        )
        for event in events
    ]
