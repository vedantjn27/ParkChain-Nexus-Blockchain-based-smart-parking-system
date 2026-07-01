"""AI pricing routes."""

import json
import logging
from datetime import datetime
from secrets import token_hex
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.pricing_engine import PricingInputs, calculate_ai_price
from app.api.auth import get_current_user
from app.chain.listener import MirroredEvent, mirror_event
from app.chain.session_manager import commit_ai_pricing_on_chain, reveal_pricing_on_chain
from app.core.config import get_settings
from app.db.models import AIPricingLog, Lot, ParkingSession, SessionState, User
from app.db.session import get_db


router = APIRouter(prefix="/sessions", tags=["pricing"])
logger = logging.getLogger(__name__)


class PriceSessionRequest(BaseModel):
    historical_demand_factor: float = Field(default=1.0, ge=0.1, le=5.0)
    weather_flag: str = Field(default="clear", max_length=40)


class PriceSessionResponse(BaseModel):
    session_id: int
    commit_hash: str
    price_per_minute: float
    surge_multiplier: float
    rationale: str
    source: str
    verified: bool
    chain_status: str | None = None
    chain_error: str | None = None


def _current_occupancy_pct(db: Session, lot: Lot) -> float:
    active_states = {
        SessionState.RESERVED,
        SessionState.ENTRY_CONFIRMED,
        SessionState.PRICE_COMMITTED,
        SessionState.ACTIVE,
    }
    occupied = len([session for session in lot.sessions if session.state in active_states])
    return 0.0 if lot.total_slots == 0 else round((occupied / lot.total_slots) * 100, 2)


@router.post("/{session_id}/price", response_model=PriceSessionResponse)
def price_session(
    session_id: int,
    payload: PriceSessionRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> PriceSessionResponse:
    session = db.get(ParkingSession, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if session.driver_wallet.lower() != current_user.wallet_address.lower():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Session belongs to another wallet")
    if session.state not in {SessionState.RESERVED, SessionState.ENTRY_CONFIRMED, SessionState.PRICE_COMMITTED}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Session cannot be priced now")

    lot = db.scalar(select(Lot).where(Lot.lot_id == session.lot_id))
    if lot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lot not found")

    now = datetime.now()
    inputs = PricingInputs(
        current_occupancy_pct=_current_occupancy_pct(db, lot),
        time_of_day=now.hour,
        day_of_week=now.weekday(),
        historical_demand_factor=payload.historical_demand_factor,
        base_price=lot.base_price,
        weather_flag=payload.weather_flag,
        nonce=token_hex(16),
    )
    result = calculate_ai_price(inputs)
    commit_tx_hash = f"local-pricing-commit-{session.session_id}"
    reveal_tx_hash = f"local-pricing-reveal-{session.session_id}"
    chain_error = None
    if session.on_chain_session_id is not None:
        try:
            commit_tx = commit_ai_pricing_on_chain(
                session.on_chain_session_id,
                result.commit_hash,
                result.price_per_minute,
            )
            reveal_tx = reveal_pricing_on_chain(
                session.on_chain_session_id,
                inputs,
                result.price_per_minute,
            )
            commit_tx_hash = commit_tx.tx_hash
            reveal_tx_hash = reveal_tx.tx_hash
        except Exception as exc:
            chain_error = str(exc)
            if not get_settings().demo_chain_fallback:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=f"AI pricing blockchain commit/reveal failed: {chain_error}",
                ) from exc
            logger.warning(
                "AI pricing blockchain commit/reveal failed for session %s; using local demo events: %s",
                session.session_id,
                exc,
            )

    session.commit_hash = result.commit_hash
    session.final_price_per_min = result.price_per_minute
    session.ai_rationale = result.rationale
    session.reveal_tx_hash = reveal_tx_hash
    session.state = SessionState.ACTIVE
    db.add(
        AIPricingLog(
            session_id=session.session_id,
            inputs_json=json.dumps(inputs.__dict__),
            mistral_response_json=json.dumps(
                {
                    "price_per_minute": result.price_per_minute,
                    "surge_multiplier": result.surge_multiplier,
                    "rationale": result.rationale,
                    "source": result.source,
                }
            ),
            clamped_price=result.price_per_minute,
        )
    )
    mirror_event(
        db,
        MirroredEvent(
            event_type="PricingCommitted",
            tx_hash=commit_tx_hash,
            session_id=session.session_id,
            payload={
                "commit_hash": result.commit_hash,
                "price_per_minute": result.price_per_minute,
                **({"chain_error": chain_error} if chain_error else {}),
            },
        ),
    )
    mirror_event(
        db,
        MirroredEvent(
            event_type="PricingRevealed",
            tx_hash=reveal_tx_hash,
            session_id=session.session_id,
            payload={
                "commit_hash": result.commit_hash,
                "price_per_minute": result.price_per_minute,
                "rationale": result.rationale,
                **({"chain_error": chain_error} if chain_error else {}),
            },
        ),
    )
    db.commit()

    return PriceSessionResponse(
        session_id=session.session_id,
        commit_hash=result.commit_hash,
        price_per_minute=result.price_per_minute,
        surge_multiplier=result.surge_multiplier,
        rationale=result.rationale,
        source=result.source,
        verified=True,
        chain_status="fallback" if chain_error else ("confirmed" if session.on_chain_session_id is not None else "local"),
        chain_error=chain_error,
    )
