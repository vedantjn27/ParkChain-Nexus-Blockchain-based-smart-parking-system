"""JWT and wallet-signature security helpers."""

from datetime import datetime, timedelta, timezone
from typing import Any

from eth_account import Account
from eth_account.messages import encode_defunct
from jose import JWTError, jwt
from web3 import Web3

from app.core.config import get_settings


class SecurityError(ValueError):
    pass


def normalize_wallet_address(address: str) -> str:
    try:
        return Web3.to_checksum_address(address)
    except ValueError as exc:
        raise SecurityError("Invalid wallet address") from exc


def build_login_message(wallet_address: str) -> str:
    checksum_address = normalize_wallet_address(wallet_address)
    return (
        "Sign in to ParkChain Nexus\n"
        f"Wallet: {checksum_address}\n"
        "Purpose: wallet authentication"
    )


def verify_wallet_signature(message: str, signature: str, expected_wallet: str) -> str:
    expected_checksum = normalize_wallet_address(expected_wallet)
    if "ParkChain Nexus" not in message or expected_checksum.lower() not in message.lower():
        raise SecurityError("Signed message does not match this application or wallet")

    signable_message = encode_defunct(text=message)
    try:
        recovered_address = Account.recover_message(signable_message, signature=signature)
    except Exception as exc:
        raise SecurityError("Invalid wallet signature") from exc

    recovered_checksum = normalize_wallet_address(recovered_address)
    if recovered_checksum.lower() != expected_checksum.lower():
        raise SecurityError("Signature does not belong to the requested wallet")

    return recovered_checksum


def create_access_token(subject: str, expires_delta: timedelta | None = None) -> str:
    settings = get_settings()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    payload = {"sub": normalize_wallet_address(subject), "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise SecurityError("Invalid or expired token") from exc

    subject = payload.get("sub")
    if not isinstance(subject, str):
        raise SecurityError("Token subject is missing")

    payload["sub"] = normalize_wallet_address(subject)
    return payload
