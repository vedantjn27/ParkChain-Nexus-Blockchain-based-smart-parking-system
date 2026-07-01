"""Wallet-signature authentication routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import (
    SecurityError,
    build_login_message,
    create_access_token,
    decode_access_token,
    normalize_wallet_address,
    verify_wallet_signature,
)
from app.db.models import User
from app.db.session import get_db


router = APIRouter(prefix="/auth", tags=["auth"])
bearer_scheme = HTTPBearer(auto_error=False)


class LoginMessageResponse(BaseModel):
    wallet_address: str
    message: str


class WalletLoginRequest(BaseModel):
    wallet_address: str = Field(min_length=1)
    message: str = Field(min_length=1)
    signature: str = Field(min_length=1)
    display_name: str | None = Field(default=None, max_length=120)


class UserResponse(BaseModel):
    wallet_address: str
    display_name: str | None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


def _auth_error(detail: str = "Authentication failed") -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


@router.get("/message/{wallet_address}", response_model=LoginMessageResponse)
def get_login_message(wallet_address: str) -> LoginMessageResponse:
    try:
        checksum_address = normalize_wallet_address(wallet_address)
        message = build_login_message(checksum_address)
    except SecurityError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    return LoginMessageResponse(wallet_address=checksum_address, message=message)


@router.post("/wallet-login", response_model=TokenResponse)
def wallet_login(payload: WalletLoginRequest, db: Annotated[Session, Depends(get_db)]) -> TokenResponse:
    try:
        wallet_address = verify_wallet_signature(
            message=payload.message,
            signature=payload.signature,
            expected_wallet=payload.wallet_address,
        )
    except SecurityError as exc:
        raise _auth_error(str(exc)) from exc

    user = db.scalar(select(User).where(User.wallet_address == wallet_address))
    if user is None:
        user = User(wallet_address=wallet_address, display_name=payload.display_name)
        db.add(user)
    elif payload.display_name is not None:
        user.display_name = payload.display_name

    db.commit()
    db.refresh(user)

    return TokenResponse(
        access_token=create_access_token(wallet_address),
        user=UserResponse(wallet_address=user.wallet_address, display_name=user.display_name),
    )


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _auth_error("Missing bearer token")

    try:
        payload = decode_access_token(credentials.credentials)
    except SecurityError as exc:
        raise _auth_error(str(exc)) from exc

    user = db.scalar(select(User).where(User.wallet_address == payload["sub"]))
    if user is None:
        raise _auth_error("User not found")

    return user


@router.get("/me", response_model=UserResponse)
def read_current_user(current_user: Annotated[User, Depends(get_current_user)]) -> UserResponse:
    return UserResponse(
        wallet_address=current_user.wallet_address,
        display_name=current_user.display_name,
    )
