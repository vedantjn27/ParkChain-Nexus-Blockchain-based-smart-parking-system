"""Application configuration and environment variables."""

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings loaded from backend/.env."""

    app_name: str = "ParkChain Nexus API"
    app_version: str = "0.1.0"
    environment: str = "development"

    mistral_api_key: str = ""
    rpc_url_amoy: str = "https://rpc-amoy.polygon.technology"
    relayer_private_key: str = ""

    parking_session_manager_address: str = ""
    trust_score_sbt_address: str = ""
    escrow_settlement_address: str = ""
    green_credit_token_address: str = ""
    park_coin_address: str = ""

    jwt_secret: str = Field(min_length=32)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24

    database_url: str = "sqlite:///./parkchain.db"
    dispute_window_seconds: int = 120
    cors_origins: str = "*"
    demo_chain_fallback: bool = True

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("relayer_private_key")
    @classmethod
    def normalize_private_key(cls, value: str) -> str:
        if not value:
            return value
        return value if value.startswith("0x") else f"0x{value}"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def allow_all_cors_origins(self) -> bool:
        return "*" in self.cors_origin_list


@lru_cache
def get_settings() -> Settings:
    return Settings()
