"""Trust score routes."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.chain.rewards import (
    adjust_trust_score,
    get_green_credit_balance,
    get_trust_score,
    mint_green_credit,
    mint_initial_trust_score,
    redeem_green_credit,
)
from app.core.config import get_settings
from app.core.security import SecurityError, normalize_wallet_address
from app.db.models import GreenCreditLedger, TrustHistory, User
from app.db.session import get_db


router = APIRouter(tags=["trust"])
logger = logging.getLogger(__name__)


class TrustResponse(BaseModel):
    wallet_address: str
    score: int
    history: list[dict[str, object]]


class MintTrustResponse(BaseModel):
    wallet_address: str
    tx_hash: str
    chain_status: str | None = None
    chain_error: str | None = None


class AdjustTrustRequest(BaseModel):
    delta: int = Field(ge=-1000, le=1000)
    reason_code: str = Field(min_length=1, max_length=80)


class GreenCreditRequest(BaseModel):
    amount: int = Field(gt=0)
    reason_code: str = Field(default="ev-session", max_length=80)


class GreenCreditResponse(BaseModel):
    wallet_address: str
    balance: int
    tx_hash: str | None = None
    chain_status: str | None = None
    chain_error: str | None = None


def _local_tx_hash(event_type: str, wallet_address: str) -> str:
    return f"local-{event_type.lower()}-{wallet_address[-6:].lower()}"


def _ensure_user(db: Session, wallet_address: str) -> None:
    if db.get(User, wallet_address) is None:
        db.add(User(wallet_address=wallet_address))


def _local_trust_score(history: list[TrustHistory]) -> int:
    if not history:
        return 0
    score = sum(item.delta for item in history)
    return max(0, min(1000, score))


def _local_green_balance(db: Session, wallet_address: str) -> int:
    entries = db.scalars(select(GreenCreditLedger).where(GreenCreditLedger.wallet_address == wallet_address)).all()
    return max(sum(item.amount for item in entries), 0)


def _chain_or_local_trust_score(wallet_address: str, history: list[TrustHistory]) -> int:
    try:
        chain_score = get_trust_score(wallet_address)
    except Exception as exc:
        if not get_settings().demo_chain_fallback:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Trust score contract read failed: {exc}",
            ) from exc
        logger.warning("Trust score contract read failed for %s; using local mirror: %s", wallet_address, exc)
        return _local_trust_score(history)
    return max(chain_score, _local_trust_score(history))


def _chain_or_local_green_balance(db: Session, wallet_address: str) -> int:
    local_balance = _local_green_balance(db, wallet_address)
    try:
        chain_balance = get_green_credit_balance(wallet_address)
    except Exception as exc:
        if not get_settings().demo_chain_fallback:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Green credit contract read failed: {exc}",
            ) from exc
        logger.warning("Green credit contract read failed for %s; using local mirror: %s", wallet_address, exc)
        return local_balance
    return chain_balance + local_balance


@router.get("/trust/{wallet_address}", response_model=TrustResponse)
def read_trust(wallet_address: str, db: Annotated[Session, Depends(get_db)]) -> TrustResponse:
    try:
        checksum_wallet = normalize_wallet_address(wallet_address)
    except SecurityError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    history = db.scalars(
        select(TrustHistory).where(TrustHistory.wallet_address == checksum_wallet).order_by(TrustHistory.id.desc())
    ).all()
    return TrustResponse(
        wallet_address=checksum_wallet,
        score=_chain_or_local_trust_score(checksum_wallet, history),
        history=[
            {
                "delta": item.delta,
                "reason_code": item.reason_code,
                "tx_hash": item.tx_hash,
                "created_at": item.created_at.isoformat(),
            }
            for item in history
        ],
    )


@router.post("/trust/me/mint", response_model=MintTrustResponse, status_code=status.HTTP_201_CREATED)
def mint_my_trust_score(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> MintTrustResponse:
    try:
        tx = mint_initial_trust_score(current_user.wallet_address)
        tx_hash = tx.tx_hash
        chain_error = None
    except Exception as exc:
        chain_error = str(exc)
        if not get_settings().demo_chain_fallback:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Trust SBT mint transaction failed: {exc}",
            ) from exc
        logger.warning("Trust SBT mint failed for %s; using local mirror: %s", current_user.wallet_address, exc)
        tx_hash = _local_tx_hash("trust-mint", current_user.wallet_address)
        _ensure_user(db, current_user.wallet_address)
        db.add(
            TrustHistory(
                wallet_address=current_user.wallet_address,
                delta=500,
                reason_code="demo-initial-sbt",
                tx_hash=tx_hash,
            )
        )
        db.commit()
    return MintTrustResponse(
        wallet_address=current_user.wallet_address,
        tx_hash=tx_hash,
        chain_status="fallback" if chain_error else "confirmed",
        chain_error=chain_error,
    )


@router.post("/trust/{wallet_address}/adjust", response_model=MintTrustResponse)
def adjust_wallet_trust_score(
    wallet_address: str,
    payload: AdjustTrustRequest,
    db: Annotated[Session, Depends(get_db)],
) -> MintTrustResponse:
    checksum_wallet = normalize_wallet_address(wallet_address)
    _ensure_user(db, checksum_wallet)
    try:
        tx = adjust_trust_score(checksum_wallet, payload.delta, payload.reason_code)
        tx_hash = tx.tx_hash
        chain_error = None
    except Exception as exc:
        chain_error = str(exc)
        if not get_settings().demo_chain_fallback:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Trust score adjustment transaction failed: {exc}",
            ) from exc
        logger.warning("Trust adjustment failed for %s; using local mirror: %s", checksum_wallet, exc)
        tx_hash = _local_tx_hash("trust-adjust", checksum_wallet)
    db.add(
        TrustHistory(
            wallet_address=checksum_wallet,
            delta=payload.delta,
            reason_code=payload.reason_code,
            tx_hash=tx_hash,
        )
    )
    db.commit()
    return MintTrustResponse(
        wallet_address=checksum_wallet,
        tx_hash=tx_hash,
        chain_status="fallback" if chain_error else "confirmed",
        chain_error=chain_error,
    )


@router.get("/green-credits/{wallet_address}", response_model=GreenCreditResponse)
def read_green_credits(wallet_address: str, db: Annotated[Session, Depends(get_db)]) -> GreenCreditResponse:
    checksum_wallet = normalize_wallet_address(wallet_address)
    return GreenCreditResponse(wallet_address=checksum_wallet, balance=_chain_or_local_green_balance(db, checksum_wallet))


@router.post("/green-credits/{wallet_address}/mint", response_model=GreenCreditResponse)
def mint_green_credits(
    wallet_address: str,
    payload: GreenCreditRequest,
    db: Annotated[Session, Depends(get_db)],
) -> GreenCreditResponse:
    checksum_wallet = normalize_wallet_address(wallet_address)
    try:
        tx = mint_green_credit(checksum_wallet, payload.amount, payload.reason_code)
        tx_hash = tx.tx_hash
        chain_error = None
    except Exception as exc:
        chain_error = str(exc)
        if not get_settings().demo_chain_fallback:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Green credit mint transaction failed: {exc}",
            ) from exc
        logger.warning("Green credit mint failed for %s; using local mirror: %s", checksum_wallet, exc)
        tx_hash = _local_tx_hash("green-mint", checksum_wallet)
        _ensure_user(db, checksum_wallet)
        db.add(
            GreenCreditLedger(
                wallet_address=checksum_wallet,
                amount=payload.amount,
                reason_code=payload.reason_code,
                tx_hash=tx_hash,
            )
        )
        db.commit()
    return GreenCreditResponse(
        wallet_address=checksum_wallet,
        balance=_chain_or_local_green_balance(db, checksum_wallet),
        tx_hash=tx_hash,
        chain_status="fallback" if chain_error else "confirmed",
        chain_error=chain_error,
    )


@router.post("/green-credits/me/redeem", response_model=GreenCreditResponse)
def redeem_my_green_credits(
    payload: GreenCreditRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> GreenCreditResponse:
    try:
        tx = redeem_green_credit(current_user.wallet_address, payload.amount)
        tx_hash = tx.tx_hash
        chain_error = None
    except Exception as exc:
        chain_error = str(exc)
        if not get_settings().demo_chain_fallback:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Green credit redeem transaction failed: {exc}",
            ) from exc
        logger.warning("Green credit redeem failed for %s; using local mirror: %s", current_user.wallet_address, exc)
        tx_hash = _local_tx_hash("green-redeem", current_user.wallet_address)
        _ensure_user(db, current_user.wallet_address)
        db.add(
            GreenCreditLedger(
                wallet_address=current_user.wallet_address,
                amount=-payload.amount,
                reason_code=f"redeem:{payload.reason_code}",
                tx_hash=tx_hash,
            )
        )
        db.commit()
    return GreenCreditResponse(
        wallet_address=current_user.wallet_address,
        balance=_chain_or_local_green_balance(db, current_user.wallet_address),
        tx_hash=tx_hash,
        chain_status="fallback" if chain_error else "confirmed",
        chain_error=chain_error,
    )
