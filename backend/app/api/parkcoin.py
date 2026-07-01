"""ParkCoin demo faucet routes."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.auth import get_current_user
from app.chain.parkcoin import get_park_balance, mint_park_coin
from app.db.models import User


router = APIRouter(prefix="/parkcoin", tags=["parkcoin"])
logger = logging.getLogger(__name__)

DEMO_FAUCET_AMOUNT = 25 * 10**18


class ParkCoinResponse(BaseModel):
    wallet_address: str
    balance: int
    tx_hash: str | None = None
    chain_status: str | None = None
    chain_error: str | None = None


@router.get("/me", response_model=ParkCoinResponse)
def read_my_parkcoin(current_user: Annotated[User, Depends(get_current_user)]) -> ParkCoinResponse:
    return ParkCoinResponse(
        wallet_address=current_user.wallet_address,
        balance=get_park_balance(current_user.wallet_address),
    )


@router.post("/me/faucet", response_model=ParkCoinResponse)
def mint_demo_parkcoin(current_user: Annotated[User, Depends(get_current_user)]) -> ParkCoinResponse:
    tx_hash = None
    try:
        tx = mint_park_coin(current_user.wallet_address, DEMO_FAUCET_AMOUNT)
        tx_hash = tx.tx_hash
    except Exception as exc:
        chain_error = str(exc)
        logger.warning("ParkCoin faucet failed for %s: %s", current_user.wallet_address, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"ParkCoin faucet transaction failed: {chain_error}",
        ) from exc

    return ParkCoinResponse(
        wallet_address=current_user.wallet_address,
        balance=get_park_balance(current_user.wallet_address),
        tx_hash=tx_hash,
        chain_status="confirmed",
    )
