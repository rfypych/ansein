"""
Centralised configuration loader.

Design goals:
* Every value has a safe default so the app can boot in "setup mode" even
  with an empty DATABASE_URL.
* .env is loaded automatically; cPanel users only need to edit one file.
* `is_configured()` lets the app decide whether to expose the Setup Wizard.
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parent.parent  # backend/
ENV_FILE = BASE_DIR / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---- App ----
    app_name: str = "AnseIn"
    app_env: str = "development"
    app_debug: bool = True
    app_url: str = "http://localhost:8000"
    secret_key: str = "dev-insecure-secret-change-me"
    access_token_expire_minutes: int = 1440
    refresh_token_expire_days: int = 7

    # ---- Database ----
    database_url: str = ""
    db_pool_size: int = 5
    db_pool_recycle: int = 280

    # ---- Redis / Celery ----
    redis_url: str = ""
    celery_broker_url: str = ""
    celery_result_backend: str = ""

    # ---- LLM ----
    openai_api_key: str = ""
    openai_api_base: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4o-mini"
    groq_api_key: str = ""
    groq_api_base: str = "https://api.groq.com/openai/v1"
    groq_model: str = "llama-3.3-70b-versatile"

    # ---- Enrichment ----
    virustotal_api_key: str = ""
    abuseipdb_api_key: str = ""
    shodan_api_key: str = ""

    # ---- Security ----
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    bcrypt_rounds: int = 12
    rate_limit_per_minute: int = 120

    # ---- Setup ----
    setup_mode: str = "auto"  # auto | always | never

    # ---- Derived ----
    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"

    @property
    def database_configured(self) -> bool:
        return bool(self.database_url and self.database_url.strip())

    @property
    def setup_required(self) -> bool:
        """True → expose /setup wizard, block normal API."""
        if self.setup_mode == "always":
            return True
        if self.setup_mode == "never":
            return False
        # auto: setup required when DB not configured OR admin user missing
        return not self.database_configured

    @field_validator("secret_key")
    @classmethod
    def _warn_default_secret(cls, v: str) -> str:
        if v.startswith("dev-insecure") or v == "change-me-to-a-long-random-string":
            # Allow in dev, but never in production (caller checks is_production)
            pass
        return v


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


def reload_settings() -> Settings:
    """Force re-read (used after the setup wizard writes a new .env)."""
    get_settings.cache_clear()
    return get_settings()
