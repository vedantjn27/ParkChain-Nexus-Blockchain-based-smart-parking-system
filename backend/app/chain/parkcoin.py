"""ParkCoin contract helpers."""

from app.chain.contracts import get_contract
from app.chain.relayer import RelayerTxResult, send_contract_transaction


def get_park_balance(wallet_address: str) -> int:
    contract = get_contract("ParkCoin")
    return int(contract.functions.balanceOf(wallet_address).call())


def mint_park_coin(wallet_address: str, amount: int) -> RelayerTxResult:
    contract = get_contract("ParkCoin")
    return send_contract_transaction(contract.functions.mint(wallet_address, amount))
