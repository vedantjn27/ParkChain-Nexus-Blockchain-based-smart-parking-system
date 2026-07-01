"""Seed reusable local demo data."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Lot, Slot, User


def seed_demo_data(db: Session) -> list[Lot]:
    existing_lots = db.scalars(select(Lot).order_by(Lot.lot_id)).all()
    if existing_lots:
        return existing_lots

    owner_wallet = "0x000000000000000000000000000000000000dEaD"
    if db.get(User, owner_wallet) is None:
        db.add(User(wallet_address=owner_wallet, display_name="ParkChain Demo Owner"))

    lots = [
        Lot(
            owner_wallet=owner_wallet,
            name="Nexus Central Garage",
            lat=19.076,
            lng=72.8777,
            total_slots=12,
            base_price=2.5,
            slots=[
                Slot(slot_number=f"A-{number:02d}", is_ev=number in {3, 4}, is_premium=number in {1, 2})
                for number in range(1, 13)
            ],
        ),
        Lot(
            owner_wallet=owner_wallet,
            name="GreenGrid EV Plaza",
            lat=19.1176,
            lng=72.906,
            total_slots=8,
            base_price=3.0,
            slots=[
                Slot(slot_number=f"E-{number:02d}", is_ev=number <= 6, is_premium=number in {1, 2})
                for number in range(1, 9)
            ],
        ),
    ]
    db.add_all(lots)
    db.commit()
    for lot in lots:
        db.refresh(lot)
    return lots
