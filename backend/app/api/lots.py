"""Parking lot and slot routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.demo.seed import seed_demo_data
from app.db.models import Lot, ParkingSession, SessionState, Slot, User
from app.db.session import get_db


router = APIRouter(prefix="/lots", tags=["lots"])

OCCUPYING_STATES = {
    SessionState.RESERVED,
    SessionState.ENTRY_CONFIRMED,
    SessionState.PRICE_COMMITTED,
    SessionState.ACTIVE,
}


class SlotCreate(BaseModel):
    slot_number: str = Field(min_length=1, max_length=40)
    is_ev: bool = False
    is_premium: bool = False
    min_trust_score: int = Field(default=0, ge=0, le=1000)


class LotCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    base_price: float = Field(gt=0)
    slots: list[SlotCreate] = Field(min_length=1)


class SlotResponse(BaseModel):
    slot_id: int
    lot_id: int
    slot_number: str
    is_ev: bool
    is_premium: bool
    min_trust_score: int
    status: str


class LotResponse(BaseModel):
    lot_id: int
    owner_wallet: str
    name: str
    lat: float
    lng: float
    total_slots: int
    base_price: float
    occupied_slots: int
    occupancy_pct: float


def _occupied_count(db: Session, lot_id: int) -> int:
    return db.scalar(
        select(func.count(ParkingSession.session_id)).where(
            ParkingSession.lot_id == lot_id,
            ParkingSession.state.in_(OCCUPYING_STATES),
        )
    ) or 0


def _lot_response(db: Session, lot: Lot) -> LotResponse:
    occupied_slots = _occupied_count(db, lot.lot_id)
    occupancy_pct = 0.0 if lot.total_slots == 0 else round((occupied_slots / lot.total_slots) * 100, 2)
    return LotResponse(
        lot_id=lot.lot_id,
        owner_wallet=lot.owner_wallet,
        name=lot.name,
        lat=lot.lat,
        lng=lot.lng,
        total_slots=lot.total_slots,
        base_price=lot.base_price,
        occupied_slots=occupied_slots,
        occupancy_pct=occupancy_pct,
    )


def _slot_status(db: Session, slot_id: int) -> str:
    active_session = db.scalar(
        select(ParkingSession.session_id).where(
            ParkingSession.slot_id == slot_id,
            ParkingSession.state.in_(OCCUPYING_STATES),
        )
    )
    return "occupied" if active_session is not None else "available"


@router.get("", response_model=list[LotResponse])
def list_lots(db: Annotated[Session, Depends(get_db)]) -> list[LotResponse]:
    lots = db.scalars(select(Lot).order_by(Lot.lot_id)).all()
    return [_lot_response(db, lot) for lot in lots]


@router.post("", response_model=LotResponse, status_code=status.HTTP_201_CREATED)
def create_lot(
    payload: LotCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> LotResponse:
    lot = Lot(
        owner_wallet=current_user.wallet_address,
        name=payload.name,
        lat=payload.lat,
        lng=payload.lng,
        total_slots=len(payload.slots),
        base_price=payload.base_price,
    )
    lot.slots = [
        Slot(
            slot_number=slot.slot_number,
            is_ev=slot.is_ev,
            is_premium=slot.is_premium,
            min_trust_score=slot.min_trust_score,
        )
        for slot in payload.slots
    ]

    db.add(lot)
    db.commit()
    db.refresh(lot)
    return _lot_response(db, lot)


@router.get("/{lot_id}/slots", response_model=list[SlotResponse])
def list_slots(lot_id: int, db: Annotated[Session, Depends(get_db)]) -> list[SlotResponse]:
    lot = db.get(Lot, lot_id)
    if lot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lot not found")

    slots = db.scalars(select(Slot).where(Slot.lot_id == lot_id).order_by(Slot.slot_number)).all()
    return [
        SlotResponse(
            slot_id=slot.slot_id,
            lot_id=slot.lot_id,
            slot_number=slot.slot_number,
            is_ev=slot.is_ev,
            is_premium=slot.is_premium,
            min_trust_score=slot.min_trust_score,
            status=_slot_status(db, slot.slot_id),
        )
        for slot in slots
    ]


@router.post("/seed-demo", response_model=list[LotResponse], status_code=status.HTTP_201_CREATED)
def seed_demo_lots(db: Annotated[Session, Depends(get_db)]) -> list[LotResponse]:
    lots = seed_demo_data(db)
    return [_lot_response(db, lot) for lot in lots]
