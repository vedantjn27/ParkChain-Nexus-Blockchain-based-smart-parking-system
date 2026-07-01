"""web3.py contract loading and bindings."""

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from web3 import Web3
from web3.contract import Contract
from web3.middleware import ExtraDataToPOAMiddleware

from app.core.config import get_settings
from app.core.security import normalize_wallet_address


class ContractConfigError(RuntimeError):
    pass


CONTRACT_ADDRESS_SETTINGS = {
    "ParkingSessionManager": "parking_session_manager_address",
    "TrustScoreSBT": "trust_score_sbt_address",
    "EscrowSettlement": "escrow_settlement_address",
    "GreenCreditToken": "green_credit_token_address",
    "ParkCoin": "park_coin_address",
}


@lru_cache
def get_web3() -> Web3:
    settings = get_settings()
    web3 = Web3(Web3.HTTPProvider(settings.rpc_url_amoy))
    web3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
    return web3


def get_contract_address(contract_name: str) -> str | None:
    settings = get_settings()
    setting_name = CONTRACT_ADDRESS_SETTINGS.get(contract_name)
    if setting_name is None:
        raise ContractConfigError(f"Unknown contract: {contract_name}")

    address = getattr(settings, setting_name)
    return normalize_wallet_address(address) if address else None


def load_contract_abi(contract_name: str) -> list[dict[str, Any]]:
    abi_path = Path(__file__).resolve().parent / "abis" / f"{contract_name}.json"
    if not abi_path.exists():
        raise ContractConfigError(f"ABI file not found for {contract_name}: {abi_path}")

    payload = json.loads(abi_path.read_text(encoding="utf-8"))
    if isinstance(payload, dict) and "abi" in payload:
        return payload["abi"]
    if isinstance(payload, list):
        return payload
    raise ContractConfigError(f"Invalid ABI format for {contract_name}")


def get_contract(contract_name: str) -> Contract:
    address = get_contract_address(contract_name)
    if address is None:
        raise ContractConfigError(f"{contract_name} address is not configured")

    return get_web3().eth.contract(address=address, abi=load_contract_abi(contract_name))


def configured_contracts() -> dict[str, bool]:
    return {
        contract_name: get_contract_address(contract_name) is not None
        for contract_name in CONTRACT_ADDRESS_SETTINGS
    }
