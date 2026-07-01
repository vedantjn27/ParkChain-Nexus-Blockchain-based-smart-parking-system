"""Occupancy forecasting routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.ai.forecasting_engine import forecast_occupancy
from app.db.models import Lot, SessionState
from app.db.session import get_db


router = APIRouter(prefix="/forecast", tags=["forecast"])


class ForecastPointResponse(BaseModel):
    minutes_ahead: int
    predicted_occupancy_pct: float
    timestamp: str


class ForecastResponse(BaseModel):
    lot_id: int
    current_occupancy_pct: float
    historical_demand_factor: float
    points: list[ForecastPointResponse]
    rationale: str


@router.get("/{lot_id}", response_model=ForecastResponse)
def get_forecast(
    lot_id: int,
    db: Annotated[Session, Depends(get_db)],
    historical_demand_factor: float = Query(default=1.0, ge=0.1, le=5.0),
) -> ForecastResponse:
    lot = db.get(Lot, lot_id)
    if lot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lot not found")

    active_states = {
        SessionState.RESERVED,
        SessionState.ENTRY_CONFIRMED,
        SessionState.PRICE_COMMITTED,
        SessionState.ACTIVE,
    }
    occupied = len([session for session in lot.sessions if session.state in active_states])
    current_occupancy_pct = 0.0 if lot.total_slots == 0 else round((occupied / lot.total_slots) * 100, 2)
    points = forecast_occupancy(current_occupancy_pct, historical_demand_factor)

    return ForecastResponse(
        lot_id=lot.lot_id,
        current_occupancy_pct=current_occupancy_pct,
        historical_demand_factor=historical_demand_factor,
        points=[
            ForecastPointResponse(
                minutes_ahead=point.minutes_ahead,
                predicted_occupancy_pct=point.predicted_occupancy_pct,
                timestamp=point.timestamp.isoformat(),
            )
            for point in points
        ],
        rationale="Forecast combines current lot occupancy with recent demand pressure.",
    )
