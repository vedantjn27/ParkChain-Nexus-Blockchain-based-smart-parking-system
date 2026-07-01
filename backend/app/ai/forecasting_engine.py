"""Occupancy forecasting engine."""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone


@dataclass(frozen=True)
class ForecastPoint:
    minutes_ahead: int
    predicted_occupancy_pct: float
    timestamp: datetime


def forecast_occupancy(current_occupancy_pct: float, historical_demand_factor: float) -> list[ForecastPoint]:
    now = datetime.now(timezone.utc)
    demand_push = (historical_demand_factor - 1.0) * 12
    points = []
    for minutes in (30, 60):
        drift = demand_push + (minutes / 60) * 6
        predicted = round(min(max(current_occupancy_pct + drift, 0), 100), 2)
        points.append(
            ForecastPoint(
                minutes_ahead=minutes,
                predicted_occupancy_pct=predicted,
                timestamp=now + timedelta(minutes=minutes),
            )
        )
    return points
