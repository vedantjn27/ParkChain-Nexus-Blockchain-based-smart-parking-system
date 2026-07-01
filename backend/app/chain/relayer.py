"""Backend relayer wallet transaction helpers."""

from dataclasses import dataclass
from typing import Any

from eth_account import Account
from eth_account.signers.local import LocalAccount

from app.core.config import get_settings
from app.core.security import normalize_wallet_address
from app.chain.contracts import get_web3


class RelayerConfigError(RuntimeError):
    pass


@dataclass(frozen=True)
class RelayerTxResult:
    tx_hash: str
    from_address: str
    block_number: int | None = None


def normalize_tx_hash(tx_hash: str) -> str:
    normalized = tx_hash.lower()
    return normalized if normalized.startswith("0x") else f"0x{normalized}"


def get_relayer_account() -> LocalAccount:
    settings = get_settings()
    if not settings.relayer_private_key:
        raise RelayerConfigError("RELAYER_PRIVATE_KEY is not configured")
    return Account.from_key(settings.relayer_private_key)


def get_relayer_address() -> str:
    return normalize_wallet_address(get_relayer_account().address)


def send_contract_transaction(
    contract_function: Any,
    *,
    value: int = 0,
    gas: int | None = None,
    wait: bool = True,
) -> RelayerTxResult:
    web3 = get_web3()
    account = get_relayer_account()
    nonce = web3.eth.get_transaction_count(account.address)
    tx: dict[str, Any] = {
        "from": account.address,
        "nonce": nonce,
        "chainId": web3.eth.chain_id,
        "value": value,
    }
    if gas is not None:
        tx["gas"] = gas

    built_tx = contract_function.build_transaction(tx)
    if "gas" not in built_tx:
        built_tx["gas"] = web3.eth.estimate_gas(built_tx)

    signed_tx = account.sign_transaction(built_tx)
    tx_hash = web3.eth.send_raw_transaction(signed_tx.raw_transaction)
    block_number = None
    if wait:
        receipt = web3.eth.wait_for_transaction_receipt(tx_hash)
        block_number = receipt["blockNumber"]
    return RelayerTxResult(
        tx_hash=normalize_tx_hash(tx_hash.hex()),
        from_address=normalize_wallet_address(account.address),
        block_number=block_number,
    )
