"""Contract helpers for trust score and green credit flows."""

from app.chain.contracts import get_contract
from app.chain.relayer import RelayerTxResult, send_contract_transaction


def get_trust_score(wallet_address: str) -> int:
    contract = get_contract("TrustScoreSBT")
    return int(contract.functions.getScore(wallet_address).call())


def mint_initial_trust_score(wallet_address: str) -> RelayerTxResult:
    contract = get_contract("TrustScoreSBT")
    return send_contract_transaction(contract.functions.mintInitialScore(wallet_address))


def adjust_trust_score(wallet_address: str, delta: int, reason_code: str) -> RelayerTxResult:
    contract = get_contract("TrustScoreSBT")
    return send_contract_transaction(contract.functions.adjustScore(wallet_address, delta, reason_code))


def get_green_credit_balance(wallet_address: str) -> int:
    contract = get_contract("GreenCreditToken")
    return int(contract.functions.balanceOf(wallet_address).call())


def mint_green_credit(wallet_address: str, amount: int, reason_code: str) -> RelayerTxResult:
    contract = get_contract("GreenCreditToken")
    return send_contract_transaction(contract.functions.mintCredit(wallet_address, amount, reason_code))


def redeem_green_credit(wallet_address: str, amount: int) -> RelayerTxResult:
    contract = get_contract("GreenCreditToken")
    return send_contract_transaction(contract.functions.redeemCredit(wallet_address, amount))
