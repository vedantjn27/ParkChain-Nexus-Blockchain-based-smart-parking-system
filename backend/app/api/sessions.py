"""Parking session lifecycle routes."""

import json
import logging
from datetime import datetime, timezone
from collections.abc import Callable
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.chain.session_manager import (
    confirm_entry_on_chain,
    confirm_exit_on_chain,
    get_on_chain_session,
    mark_escrow_exit_if_deposited,
    raise_dispute_on_chain,
    resolve_dispute_on_chain,
)
from app.chain.listener import normalize_tx_hash
from app.core.config import get_settings
from app.db.models import ChainEvent, Dispute, Lot, ParkingSession, SessionState, Slot, User
from app.db.session import get_db


router = APIRouter(prefix="/sessions", tags=["sessions"])
logger = logging.getLogger(__name__)

OCCUPYING_STATES = {
    SessionState.RESERVED,
    SessionState.ENTRY_CONFIRMED,
    SessionState.PRICE_COMMITTED,
    SessionState.ACTIVE,
}


class ReserveSessionRequest(BaseModel):
    lot_id: int = Field(gt=0)
    slot_id: int = Field(gt=0)
    is_ev_charging: bool = False


class EntryRequest(BaseModel):
    geo_proof_hash: str | None = Field(default=None, max_length=128)


class DisputeRequest(BaseModel):
    reason: str = Field(min_length=5, max_length=1000)


class ResolveDisputeRequest(BaseModel):
    refund_driver: bool = False


class ImportOnChainSessionRequest(BaseModel):
    on_chain_session_id: int = Field(gt=0)
    lot_id: int = Field(gt=0)
    slot_id: int = Field(gt=0)
    reserve_tx_hash: str | None = Field(default=None, max_length=100)
    is_ev_charging: bool = False


class SessionResponse(BaseModel):
    session_id: int
    on_chain_session_id: int | None
    driver_wallet: str
    lot_id: int
    slot_id: int
    state: str
    entry_ts: datetime | None
    exit_ts: datetime | None
    final_price_per_min: float | None
    total_amount: float | None
    is_ev_charging: bool
    tx_hash: str | None = None
    chain_status: str | None = None
    chain_error: str | None = None


class TimelineEventResponse(BaseModel):
    event_type: str
    tx_hash: str
    block_number: int | None
    payload: dict[str, Any]
    indexed_at: datetime


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc_naive(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _duration_minutes(start: datetime, end: datetime) -> float:
    return max((_as_utc_naive(end) - _as_utc_naive(start)).total_seconds() / 60, 1)


def _session_response(
    session: ParkingSession,
    tx_hash: str | None = None,
    chain_status: str | None = None,
    chain_error: str | None = None,
) -> SessionResponse:
    return SessionResponse(
        session_id=session.session_id,
        on_chain_session_id=session.on_chain_session_id,
        driver_wallet=session.driver_wallet,
        lot_id=session.lot_id,
        slot_id=session.slot_id,
        state=session.state,
        entry_ts=session.entry_ts,
        exit_ts=session.exit_ts,
        final_price_per_min=session.final_price_per_min,
        total_amount=session.total_amount,
        is_ev_charging=session.is_ev_charging,
        tx_hash=tx_hash,
        chain_status=chain_status,
        chain_error=chain_error,
    )


def _local_tx_hash(event_type: str, session_id: int) -> str:
    return f"local-{event_type.lower()}-{session_id}"


def _chain_or_demo_tx(event_type: str, session: ParkingSession, send_tx: Callable[[], Any]) -> tuple[str, str | None]:
    try:
        return send_tx().tx_hash, None
    except Exception as exc:
        chain_error = str(exc)
        if not get_settings().demo_chain_fallback:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"{event_type} blockchain transaction failed: {chain_error}",
            ) from exc
        logger.warning(
            "%s blockchain transaction failed for session %s; using local demo event: %s",
            event_type,
            session.session_id,
            exc,
        )
        return _local_tx_hash(f"{event_type}DemoFallback", session.session_id), chain_error


def _record_event(
    db: Session,
    *,
    session: ParkingSession,
    event_type: str,
    payload: dict[str, Any],
    tx_hash: str | None = None,
) -> str:
    event_tx_hash = tx_hash or _local_tx_hash(event_type, session.session_id)
    event_tx_hash = normalize_tx_hash(event_tx_hash)
    db.add(
        ChainEvent(
            event_type=event_type,
            session_id=session.session_id,
            tx_hash=event_tx_hash,
            payload_json=json.dumps(payload, default=str),
        )
    )
    return event_tx_hash


def _get_owned_session(db: Session, session_id: int, user: User) -> ParkingSession:
    session = db.get(ParkingSession, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if session.driver_wallet.lower() != user.wallet_address.lower():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Session belongs to another wallet")
    return session


def _ensure_slot_available(db: Session, slot_id: int) -> None:
    existing_session = db.scalar(
        select(ParkingSession).where(
            ParkingSession.slot_id == slot_id,
            ParkingSession.state.in_(OCCUPYING_STATES),
        )
    )
    if existing_session is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Slot is already reserved or active")


@router.post("/reserve", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
def reserve_session(
    payload: ReserveSessionRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> SessionResponse:
    lot = db.get(Lot, payload.lot_id)
    if lot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lot not found")

    slot = db.get(Slot, payload.slot_id)
    if slot is None or slot.lot_id != lot.lot_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Slot not found for this lot")

    _ensure_slot_available(db, slot.slot_id)

    session = ParkingSession(
        driver_wallet=current_user.wallet_address,
        lot_id=lot.lot_id,
        slot_id=slot.slot_id,
        state=SessionState.RESERVED,
        is_ev_charging=payload.is_ev_charging,
    )
    db.add(session)
    db.flush()
    tx_hash = _record_event(
        db,
        session=session,
        event_type="SlotReserved",
        payload={
            "session_id": session.session_id,
            "driver": current_user.wallet_address,
            "lot_id": lot.lot_id,
            "slot_id": slot.slot_id,
        },
    )
    db.commit()
    db.refresh(session)
    return _session_response(session, tx_hash=tx_hash)


@router.post("/import-on-chain", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
def import_on_chain_session(
    payload: ImportOnChainSessionRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> SessionResponse:
    existing = db.scalar(
        select(ParkingSession).where(ParkingSession.on_chain_session_id == payload.on_chain_session_id)
    )
    if existing is not None:
        return _session_response(existing)

    lot = db.get(Lot, payload.lot_id)
    slot = db.get(Slot, payload.slot_id)
    if lot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lot not found")
    if slot is None or slot.lot_id != lot.lot_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Slot not found for this lot")

    chain_session = get_on_chain_session(payload.on_chain_session_id)
    if int(chain_session["session_id"]) != payload.on_chain_session_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="On-chain session not found")
    if str(chain_session["driver"]).lower() != current_user.wallet_address.lower():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="On-chain session belongs to another wallet")
    if int(chain_session["lot_id"]) != payload.lot_id or int(chain_session["slot_id"]) != payload.slot_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="On-chain lot or slot does not match payload")

    _ensure_slot_available(db, slot.slot_id)
    session = ParkingSession(
        on_chain_session_id=payload.on_chain_session_id,
        driver_wallet=current_user.wallet_address,
        lot_id=payload.lot_id,
        slot_id=payload.slot_id,
        state=SessionState.RESERVED,
        is_ev_charging=payload.is_ev_charging,
    )
    db.add(session)
    db.flush()
    tx_hash = _record_event(
        db,
        session=session,
        event_type="SlotReserved",
        payload={
            "session_id": session.session_id,
            "on_chain_session_id": payload.on_chain_session_id,
            "driver": current_user.wallet_address,
            "lot_id": payload.lot_id,
            "slot_id": payload.slot_id,
        },
        tx_hash=payload.reserve_tx_hash,
    )
    db.commit()
    db.refresh(session)
    return _session_response(session, tx_hash=tx_hash)


@router.get("/active/me", response_model=list[SessionResponse])
def list_my_active_sessions(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[SessionResponse]:
    sessions = db.scalars(
        select(ParkingSession)
        .where(
            ParkingSession.driver_wallet == current_user.wallet_address,
            ParkingSession.state.in_(OCCUPYING_STATES),
        )
        .order_by(ParkingSession.session_id.desc())
    ).all()
    return [_session_response(session) for session in sessions]


@router.post("/{session_id}/entry", response_model=SessionResponse)
def confirm_entry(
    session_id: int,
    payload: EntryRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> SessionResponse:
    session = _get_owned_session(db, session_id, current_user)
    if session.state != SessionState.RESERVED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Session is not ready for entry")

    session.state = SessionState.ENTRY_CONFIRMED
    session.entry_ts = utc_now()
    chain_tx_hash = None
    chain_error = None
    if session.on_chain_session_id is not None:
        chain_tx_hash, chain_error = _chain_or_demo_tx(
            "EntryConfirmed",
            session,
            lambda: confirm_entry_on_chain(session.on_chain_session_id, payload.geo_proof_hash),
        )
    tx_hash = _record_event(
        db,
        session=session,
        event_type="EntryConfirmed",
        payload={
            "session_id": session.session_id,
            "geo_proof_hash": payload.geo_proof_hash,
            **({"chain_error": chain_error} if chain_error else {}),
        },
        tx_hash=chain_tx_hash,
    )
    db.commit()
    db.refresh(session)
    return _session_response(
        session,
        tx_hash=tx_hash,
        chain_status="fallback" if chain_error else ("confirmed" if session.on_chain_session_id is not None else "local"),
        chain_error=chain_error,
    )


@router.post("/{session_id}/exit", response_model=SessionResponse)
def confirm_exit(
    session_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> SessionResponse:
    session = _get_owned_session(db, session_id, current_user)
    if session.state not in {
        SessionState.ENTRY_CONFIRMED,
        SessionState.PRICE_COMMITTED,
        SessionState.ACTIVE,
    }:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Session is not active")

    session.state = SessionState.EXIT_CONFIRMED
    session.exit_ts = utc_now()
    chain_tx_hash = None
    chain_error = None
    if session.on_chain_session_id is not None:
        chain_tx_hash, chain_error = _chain_or_demo_tx(
            "ExitConfirmed",
            session,
            lambda: confirm_exit_on_chain(session.on_chain_session_id),
        )
        try:
            escrow_tx = mark_escrow_exit_if_deposited(session.on_chain_session_id)
        except Exception as exc:
            escrow_tx = None
            if not get_settings().demo_chain_fallback:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=f"Escrow exit marking failed: {exc}",
                ) from exc
            logger.warning(
                "Escrow exit marking failed for session %s; continuing with local exit: %s",
                session.session_id,
                exc,
            )
            chain_error = chain_error or f"Escrow exit marking failed: {exc}"
        if escrow_tx is not None:
            _record_event(
                db,
                session=session,
                event_type="EscrowExitMarked",
                payload={"session_id": session.session_id},
                tx_hash=escrow_tx.tx_hash,
            )
    if session.entry_ts is not None and session.exit_ts is not None and session.final_price_per_min is not None:
        duration_minutes = _duration_minutes(session.entry_ts, session.exit_ts)
        session.total_amount = round(duration_minutes * session.final_price_per_min, 4)

    tx_hash = _record_event(
        db,
        session=session,
        event_type="ExitConfirmed",
        payload={
            "session_id": session.session_id,
            "total_amount": session.total_amount,
            **({"chain_error": chain_error} if chain_error else {}),
        },
        tx_hash=chain_tx_hash,
    )
    db.commit()
    db.refresh(session)
    return _session_response(
        session,
        tx_hash=tx_hash,
        chain_status="fallback" if chain_error else ("confirmed" if session.on_chain_session_id is not None else "local"),
        chain_error=chain_error,
    )


@router.post("/{session_id}/dispute", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
def raise_dispute(
    session_id: int,
    payload: DisputeRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> SessionResponse:
    session = _get_owned_session(db, session_id, current_user)
    if session.state not in {
        SessionState.EXIT_CONFIRMED,
        SessionState.SETTLED,
        SessionState.DISPUTED,
    }:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Session cannot be disputed yet")
    if session.state == SessionState.DISPUTED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Dispute already exists")

    db.add(Dispute(session_id=session.session_id, reason=payload.reason, status="open"))
    session.state = SessionState.DISPUTED
    chain_tx_hash = None
    chain_error = None
    if session.on_chain_session_id is not None:
        chain_tx_hash, chain_error = _chain_or_demo_tx(
            "DisputeRaised",
            session,
            lambda: raise_dispute_on_chain(session.on_chain_session_id, payload.reason),
        )
    tx_hash = _record_event(
        db,
        session=session,
        event_type="DisputeRaised",
        payload={
            "session_id": session.session_id,
            "reason": payload.reason,
            **({"chain_error": chain_error} if chain_error else {}),
        },
        tx_hash=chain_tx_hash,
    )
    db.commit()
    db.refresh(session)
    return _session_response(
        session,
        tx_hash=tx_hash,
        chain_status="fallback" if chain_error else ("confirmed" if session.on_chain_session_id is not None else "local"),
        chain_error=chain_error,
    )


@router.post("/{session_id}/resolve-dispute", response_model=SessionResponse)
def resolve_dispute(
    session_id: int,
    payload: ResolveDisputeRequest,
    db: Annotated[Session, Depends(get_db)],
) -> SessionResponse:
    session = db.get(ParkingSession, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if session.state != SessionState.DISPUTED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Session is not disputed")

    chain_tx_hash = None
    chain_error = None
    if session.on_chain_session_id is not None:
        chain_tx_hash, chain_error = _chain_or_demo_tx(
            "DisputeResolved",
            session,
            lambda: resolve_dispute_on_chain(session.on_chain_session_id, payload.refund_driver),
        )
    session.state = SessionState.RESOLVED
    tx_hash = _record_event(
        db,
        session=session,
        event_type="DisputeResolved",
        payload={
            "session_id": session.session_id,
            "refunded": payload.refund_driver,
            **({"chain_error": chain_error} if chain_error else {}),
        },
        tx_hash=chain_tx_hash,
    )
    db.commit()
    db.refresh(session)
    return _session_response(
        session,
        tx_hash=tx_hash,
        chain_status="fallback" if chain_error else ("confirmed" if session.on_chain_session_id is not None else "local"),
        chain_error=chain_error,
    )


@router.get("/{session_id}", response_model=SessionResponse)
def get_session(
    session_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> SessionResponse:
    return _session_response(_get_owned_session(db, session_id, current_user))


@router.get("/{session_id}/timeline", response_model=list[TimelineEventResponse])
def get_session_timeline(
    session_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[TimelineEventResponse]:
    session = _get_owned_session(db, session_id, current_user)
    events = db.scalars(
        select(ChainEvent)
        .where(ChainEvent.session_id == session.session_id)
        .order_by(ChainEvent.indexed_at, ChainEvent.id)
    ).all()
    return [
        TimelineEventResponse(
            event_type=event.event_type,
            tx_hash=event.tx_hash,
            block_number=event.block_number,
            payload=json.loads(event.payload_json),
            indexed_at=event.indexed_at,
        )
        for event in events
    ]
