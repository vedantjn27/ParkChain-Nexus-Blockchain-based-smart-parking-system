"""Demo helper routes."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.demo.seed import seed_demo_data
from app.db.session import get_db


router = APIRouter(prefix="/demo", tags=["demo"])


@router.post("/seed")
def seed_demo(db: Annotated[Session, Depends(get_db)]) -> dict[str, object]:
    lots = seed_demo_data(db)
    return {"lots": len(lots), "message": "Demo data ready"}
