from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Environment
    environment: Literal["development", "staging", "production"] = "development"
    debug: bool = False

    # Database (PlanetScale)
    database_url: str = ""

    # AWS Cognito
    cognito_user_pool_id: str = ""
    cognito_region: str = "eu-central-1"
    cognito_app_client_id: str = ""

    # AWS
    aws_region: str = "eu-central-1"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""

    # API
    api_prefix: str = "/api/v1"
    cors_origins: list[str] = ["http://localhost:5173"]

    @property
    def cognito_issuer(self) -> str:
        return f"https://cognito-idp.{self.cognito_region}.amazonaws.com/{self.cognito_user_pool_id}"

    @property
    def cognito_jwks_url(self) -> str:
        return f"{self.cognito_issuer}/.well-known/jwks.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()
