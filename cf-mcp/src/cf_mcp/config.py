"""Configuration via pydantic-settings."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Cloudflare API configuration loaded from environment variables and .env files."""

    cf_api_token: str = ""
    cf_account_id: str = ""
    cloudflare_account_id: str = ""
    cloudflare_tunnel_id: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def account_id(self) -> str:
        """Return the account ID from either env var name."""
        return self.cf_account_id or self.cloudflare_account_id

    @property
    def token(self) -> str:
        """Return the API token, raising if not set."""
        if not self.cf_api_token:
            msg = (
                "CF_API_TOKEN is not set. "
                "Set it in your environment or .env file.\n"
                "Create one at: https://dash.cloudflare.com/profile/api-tokens"
            )
            raise ValueError(msg)
        return self.cf_api_token

    @property
    def tunnel_id(self) -> str:
        """Return the default tunnel ID."""
        return self.cloudflare_tunnel_id


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
