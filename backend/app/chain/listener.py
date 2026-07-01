"""Chain event listener and SQLite mirror writer."""

import json
import logging
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.chain.contracts import ContractConfigError, get_contract, get_web3
from app.db.models import ChainEvent, ParkingSession, SessionState


logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class MirroredEvent:
    event_type: str
    tx_hash: str
    payload: dict[str, Any]
    session_id: int | None = None
    block_number: int | None = None


EVENT_STATE_MAP = {
    "SlotReserved": SessionState.RESERVED,
    "EntryConfirmed": SessionState.ENTRY_CONFIRMED,
    "PricingCommitted": SessionState.PRICE_COMMITTED,
    "PricingRevealed": SessionState.ACTIVE,
    "ExitConfirmed": SessionState.EXIT_CONFIRMED,
    "DisputeRaised": SessionState.DISPUTED,
    "DisputeResolved": SessionState.RESOLVED,
}


def normalize_tx_hash(tx_hash: str) -> str:
    if tx_hash.startswith("local-"):
        return tx_hash
    normalized = tx_hash.lower()
    return normalized if normalized.startswith("0x") else f"0x{normalized}"


def mirror_event(db: Session, event: MirroredEvent) -> ChainEvent:
    normalized_tx_hash = normalize_tx_hash(event.tx_hash)
    existing_event = db.scalar(
        select(ChainEvent).where(
            ChainEvent.tx_hash == normalized_tx_hash,
            ChainEvent.event_type == event.event_type,
        )
    )
    if existing_event is not None:
        if event.block_number is not None and existing_event.block_number is None:
            existing_event.block_number = event.block_number
        if event.session_id is not None and existing_event.session_id is None:
            existing_event.session_id = event.session_id
        existing_payload = json.loads(existing_event.payload_json)
        existing_payload.update(_normalized_payload(event))
        existing_event.payload_json = json.dumps(existing_payload, default=str)
        _apply_event_to_session(db, event)
        return existing_event

    chain_event = ChainEvent(
        event_type=event.event_type,
        session_id=event.session_id,
        block_number=event.block_number,
        tx_hash=normalized_tx_hash,
        payload_json=json.dumps(_normalized_payload(event), default=str),
    )
    db.add(chain_event)
    _apply_event_to_session(db, event)
    return chain_event


def _normalized_payload(event: MirroredEvent) -> dict[str, Any]:
    payload = dict(event.payload)
    on_chain_session_id = payload.get("sessionId") or payload.get("on_chain_session_id")
    if on_chain_session_id is not None:
        payload["on_chain_session_id"] = int(on_chain_session_id)
    if event.session_id is not None:
        payload["session_id"] = event.session_id
    return payload


def _apply_event_to_session(db: Session, event: MirroredEvent) -> None:
    if event.session_id is None:
        return

    session = db.get(ParkingSession, event.session_id)
    if session is None:
        return

    next_state = EVENT_STATE_MAP.get(event.event_type)
    if next_state is not None:
        session.state = next_state

    if event.event_type == "PricingCommitted":
        session.commit_hash = event.payload.get("commit_hash") or event.payload.get("commitHash")
        session.final_price_per_min = event.payload.get("price_per_minute")
    elif event.event_type == "PricingRevealed":
        session.final_price_per_min = event.payload.get("price_per_minute")
        session.ai_rationale = event.payload.get("rationale")
        session.reveal_tx_hash = event.tx_hash
    elif event.event_type == "ExitConfirmed":
        session.total_amount = event.payload.get("total_amount")


def sync_contract_events(
    db: Session,
    *,
    contract_name: str,
    from_block: int,
    to_block: int | str = "latest",
) -> list[ChainEvent]:
    contract = get_contract(contract_name)
    web3 = get_web3()
    latest_block = web3.eth.block_number if to_block == "latest" else int(to_block)
    synced_events: list[ChainEvent] = []

    for event_abi in contract.abi:
        if event_abi.get("type") != "event":
            continue
        event_name = event_abi["name"]
        try:
            logs = getattr(contract.events, event_name)().get_logs(from_block=from_block, to_block=latest_block)
        except Exception as exc:
            logger.warning("Skipping %s.%s event sync: %s", contract_name, event_name, exc)
            continue
        for log in logs:
            args = dict(log["args"])
            on_chain_session_id = args.get("sessionId")
            session_id = None
            if on_chain_session_id is not None:
                local_session = db.scalar(
                    select(ParkingSession).where(ParkingSession.on_chain_session_id == int(on_chain_session_id))
                )
                session_id = local_session.session_id if local_session is not None else None

            mirrored = mirror_event(
                db,
                MirroredEvent(
                    event_type=event_name,
                    tx_hash=normalize_tx_hash(log["transactionHash"].hex()),
                    block_number=log["blockNumber"],
                    session_id=session_id,
                    payload={key: _json_safe(value) for key, value in args.items()},
                ),
            )
            synced_events.append(mirrored)

    return synced_events


def sync_all_configured_contract_events(
    db: Session,
    *,
    from_block: int,
    to_block: int | str = "latest",
) -> list[ChainEvent]:
    events: list[ChainEvent] = []
    for contract_name in ("ParkingSessionManager", "TrustScoreSBT", "GreenCreditToken"):
        try:
            events.extend(sync_contract_events(db, contract_name=contract_name, from_block=from_block, to_block=to_block))
        except ContractConfigError as exc:
            logger.warning("Skipping %s sync due to configuration: %s", contract_name, exc)
        except Exception as exc:
            logger.warning("Skipping %s sync due to RPC/contract error: %s", contract_name, exc)
    return events


def _json_safe(value: Any) -> Any:
    if isinstance(value, bytes):
        return value.hex()
    if isinstance(value, list | tuple):
        return [_json_safe(item) for item in value]
    return value
