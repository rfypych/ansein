"""
First-run Setup Wizard service.

Two-phase:
1. configure_database — write DATABASE_URL to .env, re-init engine, run migrations
2. create_admin        — create first superuser account

`SetupStatus` exposes what the frontend needs to render the wizard.
"""
from __future__ import annotations

import logging
import os
import secrets
from pathlib import Path
from typing import Optional

from sqlalchemy import inspect, select
from sqlalchemy.orm import Session

from app.core.config import get_settings, reload_settings
from app.db.session import Base, get_engine, init_engine, session_scope
from app.models.models import User
from app.schemas.schemas import SetupAdmin, SetupDatabase, SetupResult, SetupStatus, UserCreate
from app.services.user_service import admin_exists, any_users_exist, create_user

log = logging.getLogger(__name__)


def get_status(db: Session) -> SetupStatus:
    s = get_settings()
    db_ok = s.database_configured
    has_admin = admin_exists(db) if db_ok else False
    
    setup_req = s.setup_required
    if s.setup_mode == "auto":
        setup_req = not db_ok or not has_admin
        
    return SetupStatus(
        setup_required=setup_req,
        database_configured=db_ok,
        admin_exists=has_admin,
        app_env=s.app_env,
    )


def configure_database(payload: SetupDatabase) -> SetupResult:
    """Write DATABASE_URL to .env (creating .env if missing)."""
    env_path = Path(__file__).resolve().parent.parent.parent / ".env"
    url = payload.database_url.strip()

    # Validate URL format
    if not (url.startswith("mysql://") or url.startswith("mysql+pymysql://")
            or url.startswith("postgresql://") or url.startswith("sqlite://")):
        return SetupResult(
            success=False,
            message="DATABASE_URL must start with mysql://, mysql+pymysql://, postgresql://, or sqlite://",
        )

    # Try to connect + create tables
    try:
        init_engine(url)
        Base.metadata.create_all(bind=get_engine())
    except Exception as e:
        return SetupResult(
            success=False,
            message=f"Failed to connect to database: {e}",
        )

    # Read existing .env (if any)
    lines: list[str] = []
    if env_path.exists():
        lines = env_path.read_text(encoding="utf-8").splitlines()

    # Update / append DATABASE_URL and SECRET_KEY
    found_db = False
    found_sk = False
    new_sk = payload.secret_key or secrets.token_urlsafe(48)
    for i, line in enumerate(lines):
        if line.startswith("DATABASE_URL="):
            lines[i] = f"DATABASE_URL={url}"
            found_db = True
        elif line.startswith("SECRET_KEY=") and payload.secret_key:
            lines[i] = f"SECRET_KEY={new_sk}"
            found_sk = True
    if not found_db:
        lines.append(f"DATABASE_URL={url}")
    if not found_sk and payload.secret_key:
        lines.append(f"SECRET_KEY={new_sk}")

    env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    # Update os.environ so pydantic-settings doesn't read the old cached env vars
    import os
    os.environ["DATABASE_URL"] = url
    if payload.secret_key:
        os.environ["SECRET_KEY"] = new_sk

    # Reload settings
    reload_settings()
    return SetupResult(
        success=True,
        message="Database connected and migrations applied. Next: create your admin account.",
        next_step="create_admin",
    )


def create_admin(db: Session, payload: SetupAdmin) -> SetupResult:
    """Create the first (and only) superuser account."""
    if admin_exists(db):
        return SetupResult(success=False, message="An admin account already exists.")
    try:
        user = create_user(
            db,
            UserCreate(
                email=payload.email,
                password=payload.password,
                full_name=payload.full_name,
            ),
            is_superuser=True,
        )
    except ValueError as e:
        return SetupResult(success=False, message=str(e))
    except Exception as e:
        return SetupResult(success=False, message=f"Failed to create admin: {e}")

    return SetupResult(
        success=True,
        message=f"Admin account created for {user.email}. Setup complete — you can now log in.",
        next_step="login",
    )


def is_setup_complete() -> bool:
    s = get_settings()
    if not s.database_configured:
        return False
    try:
        with session_scope() as db:
            return admin_exists(db)
    except Exception:
        return False
