from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """CLI settings."""

    model_config = SettingsConfigDict(
        env_prefix="GRANTD_",
        env_file=".env",
    )

    # API Configuration
    api_url: str = "https://api.grantd.io/api/v1"

    # Local paths
    config_dir: Path = Path.home() / ".grantd"
    keys_dir: Path = Path.home() / ".grantd" / "keys"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Ensure directories exist
        self.config_dir.mkdir(parents=True, exist_ok=True)
        self.keys_dir.mkdir(parents=True, exist_ok=True)


settings = Settings()
