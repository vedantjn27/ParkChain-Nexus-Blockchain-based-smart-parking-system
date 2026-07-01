"""Contract transaction helpers for ParkingSessionManager."""

from app.ai.pricing_engine import PricingInputs, pricing_inputs_for_contract
from app.chain.contracts import get_contract
from app.chain.relayer import RelayerTxResult, send_contract_transaction
from web3 import Web3


def _bytes32_hex(value: str | None) -> str:
    if not value:
        return "0x" + "0" * 64
    hex_body = value[2:] if value.startswith("0x") else value
    if len(hex_body) == 64 and all(char in "0123456789abcdefABCDEF" for char in hex_body):
        return f"0x{hex_body}"
    hashed = Web3.keccak(text=value).hex()
    return hashed if hashed.startswith("0x") else f"0x{hashed}"


def get_on_chain_session(on_chain_session_id: int) -> dict[str, object]:
    contract = get_contract("ParkingSessionManager")
    session = contract.functions.getSession(on_chain_session_id).call()
    return {
        "session_id": session[0],
        "driver": session[1],
        "lot_id": session[2],
        "slot_id": session[3],
        "state": session[4],
        "commit_hash": session[5].hex(),
        "final_price_per_minute": session[6],
        "entry_timestamp": session[7],
        "exit_timestamp": session[8],
        "amount_escrowed": session[9],
        "dispute_raised": session[10],
    }


def confirm_entry_on_chain(on_chain_session_id: int, geo_proof_hash: str | None) -> RelayerTxResult:
    contract = get_contract("ParkingSessionManager")
    return send_contract_transaction(contract.functions.confirmEntry(on_chain_session_id, _bytes32_hex(geo_proof_hash)))


def commit_ai_pricing_on_chain(
    on_chain_session_id: int,
    commit_hash: str,
    price_per_minute: float,
) -> RelayerTxResult:
    contract = get_contract("ParkingSessionManager")
    return send_contract_transaction(
        contract.functions.commitAIPricing(
            on_chain_session_id,
            _bytes32_hex(commit_hash),
            int(price_per_minute * 100),
        )
    )


def reveal_pricing_on_chain(
    on_chain_session_id: int,
    inputs: PricingInputs,
    final_price_per_minute: float,
) -> RelayerTxResult:
    contract = get_contract("ParkingSessionManager")
    return send_contract_transaction(
        contract.functions.revealPricing(
            on_chain_session_id,
            pricing_inputs_for_contract(inputs),
            int(final_price_per_minute * 100),
        )
    )


def confirm_exit_on_chain(on_chain_session_id: int) -> RelayerTxResult:
    contract = get_contract("ParkingSessionManager")
    return send_contract_transaction(contract.functions.confirmExit(on_chain_session_id))


def mark_escrow_exit_if_deposited(on_chain_session_id: int) -> RelayerTxResult | None:
    contract = get_contract("EscrowSettlement")
    escrow = contract.functions.escrows(on_chain_session_id).call()
    amount = int(escrow[2])
    exit_timestamp = int(escrow[3])
    if amount <= 0 or exit_timestamp > 0:
        return None
    return send_contract_transaction(contract.functions.markExitConfirmed(on_chain_session_id))


def raise_dispute_on_chain(on_chain_session_id: int, reason: str) -> RelayerTxResult:
    contract = get_contract("ParkingSessionManager")
    return send_contract_transaction(contract.functions.raiseDispute(on_chain_session_id, reason))


def resolve_dispute_on_chain(on_chain_session_id: int, refund_driver: bool) -> RelayerTxResult:
    contract = get_contract("ParkingSessionManager")
    return send_contract_transaction(contract.functions.resolveDispute(on_chain_session_id, refund_driver))
