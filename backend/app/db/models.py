"""SQLAlchemy models for the off-chain mirror."""

from datetime import datetime, timezone
from enum import StrEnum

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class SessionState(StrEnum):
    RESERVED = "Reserved"
    ENTRY_CONFIRMED = "EntryConfirmed"
    PRICE_COMMITTED = "PriceCommitted"
    ACTIVE = "Active"
    EXIT_CONFIRMED = "ExitConfirmed"
    SETTLED = "Settled"
    DISPUTED = "Disputed"
    RESOLVED = "Resolved"


class User(Base):
    __tablename__ = "users"

    wallet_address: Mapped[str] = mapped_column(String(42), primary_key=True)
    display_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    sessions: Mapped[list["ParkingSession"]] = relationship(back_populates="driver")
    trust_history: Mapped[list["TrustHistory"]] = relationship(back_populates="user")
    green_credit_ledger: Mapped[list["GreenCreditLedger"]] = relationship(back_populates="user")


class Lot(Base):
    __tablename__ = "lots"

    lot_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_wallet: Mapped[str] = mapped_column(String(42), index=True)
    name: Mapped[str] = mapped_column(String(160))
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    total_slots: Mapped[int] = mapped_column(Integer)
    base_price: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    slots: Mapped[list["Slot"]] = relationship(back_populates="lot", cascade="all, delete-orphan")
    sessions: Mapped[list["ParkingSession"]] = relationship(back_populates="lot")


class Slot(Base):
    __tablename__ = "slots"

    slot_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lot_id: Mapped[int] = mapped_column(ForeignKey("lots.lot_id"), index=True)
    slot_number: Mapped[str] = mapped_column(String(40))
    is_ev: Mapped[bool] = mapped_column(Boolean, default=False)
    is_premium: Mapped[bool] = mapped_column(Boolean, default=False)
    min_trust_score: Mapped[int] = mapped_column(Integer, default=0)

    lot: Mapped["Lot"] = relationship(back_populates="slots")
    sessions: Mapped[list["ParkingSession"]] = relationship(back_populates="slot")

    __table_args__ = (Index("ix_slots_lot_slot_number", "lot_id", "slot_number", unique=True),)


class ParkingSession(Base):
    __tablename__ = "sessions"

    session_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    on_chain_session_id: Mapped[int | None] = mapped_column(Integer, unique=True, nullable=True)
    driver_wallet: Mapped[str] = mapped_column(ForeignKey("users.wallet_address"), index=True)
    lot_id: Mapped[int] = mapped_column(ForeignKey("lots.lot_id"), index=True)
    slot_id: Mapped[int] = mapped_column(ForeignKey("slots.slot_id"), index=True)
    state: Mapped[str] = mapped_column(String(40), default=SessionState.RESERVED)
    entry_ts: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    exit_ts: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    final_price_per_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    ai_rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    commit_hash: Mapped[str | None] = mapped_column(String(66), nullable=True)
    reveal_tx_hash: Mapped[str | None] = mapped_column(String(66), nullable=True)
    is_ev_charging: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )

    driver: Mapped["User"] = relationship(back_populates="sessions")
    lot: Mapped["Lot"] = relationship(back_populates="sessions")
    slot: Mapped["Slot"] = relationship(back_populates="sessions")
    chain_events: Mapped[list["ChainEvent"]] = relationship(back_populates="session")
    pricing_logs: Mapped[list["AIPricingLog"]] = relationship(back_populates="session")
    disputes: Mapped[list["Dispute"]] = relationship(back_populates="session")


class ChainEvent(Base):
    __tablename__ = "chain_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_type: Mapped[str] = mapped_column(String(80), index=True)
    session_id: Mapped[int | None] = mapped_column(ForeignKey("sessions.session_id"), nullable=True, index=True)
    block_number: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    tx_hash: Mapped[str] = mapped_column(String(66), index=True)
    payload_json: Mapped[str] = mapped_column(Text)
    indexed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    session: Mapped["ParkingSession | None"] = relationship(back_populates="chain_events")


class AIPricingLog(Base):
    __tablename__ = "ai_pricing_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.session_id"), index=True)
    inputs_json: Mapped[str] = mapped_column(Text)
    mistral_response_json: Mapped[str] = mapped_column(Text)
    clamped_price: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    session: Mapped["ParkingSession"] = relationship(back_populates="pricing_logs")


class TrustHistory(Base):
    __tablename__ = "trust_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    wallet_address: Mapped[str] = mapped_column(ForeignKey("users.wallet_address"), index=True)
    delta: Mapped[int] = mapped_column(Integer)
    reason_code: Mapped[str] = mapped_column(String(80))
    tx_hash: Mapped[str | None] = mapped_column(String(66), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    user: Mapped["User"] = relationship(back_populates="trust_history")


class GreenCreditLedger(Base):
    __tablename__ = "green_credit_ledger"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    wallet_address: Mapped[str] = mapped_column(ForeignKey("users.wallet_address"), index=True)
    amount: Mapped[int] = mapped_column(Integer)
    reason_code: Mapped[str] = mapped_column(String(80))
    tx_hash: Mapped[str | None] = mapped_column(String(66), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    user: Mapped["User"] = relationship(back_populates="green_credit_ledger")


class Dispute(Base):
    __tablename__ = "disputes"

    dispute_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.session_id"), index=True)
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(40), default="open")
    resolution_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    resolved_tx_hash: Mapped[str | None] = mapped_column(String(66), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    session: Mapped["ParkingSession"] = relationship(back_populates="disputes")
