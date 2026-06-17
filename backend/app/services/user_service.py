"""User & auth service."""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.models import User, UserSettings
from app.schemas.schemas import (
    RefreshIn,
    TokenPair,
    UserCreate,
    UserLogin,
    UserOut,
    UserSettingsOut,
    UserSettingsUpdate,
)
from app.services import crypto

log = logging.getLogger(__name__)


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    return db.scalar(select(User).where(User.email == email.lower()))


def get_user_by_id(db: Session, user_id: int) -> Optional[User]:
    return db.get(User, user_id)


def admin_exists(db: Session) -> bool:
    return db.scalar(select(User).where(User.is_superuser.is_(True)).limit(1)) is not None


def any_users_exist(db: Session) -> bool:
    return db.scalar(select(User).limit(1)) is not None


def create_user(db: Session, payload: UserCreate, *, is_superuser: bool = False) -> User:
    email = payload.email.lower()
    existing = get_user_by_email(db, email)
    if existing:
        raise ValueError("Email already registered")

    user = User(
        email=email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name or "",
        is_active=True,
        is_superuser=is_superuser,
    )
    db.add(user)
    db.flush()
    # Ensure user_settings row exists
    settings = UserSettings(user_id=user.id)
    db.add(settings)
    db.commit()
    db.refresh(user)
    return user


def authenticate(db: Session, payload: UserLogin) -> Optional[User]:
    user = get_user_by_email(db, payload.email)
    if not user or not verify_password(payload.password, user.hashed_password):
        return None
    if not user.is_active:
        return None
    user.last_login_at = datetime.utcnow()
    db.commit()
    return user


def issue_tokens(user: User) -> TokenPair:
    access = create_access_token(
        str(user.id), extra={"email": user.email, "is_superuser": user.is_superuser}
    )
    refresh = create_refresh_token(str(user.id))
    return TokenPair(
        access_token=access,
        refresh_token=refresh,
        user=UserOut.model_validate(user),
    )


def refresh_tokens(db: Session, payload: RefreshIn) -> Optional[TokenPair]:
    decoded = decode_token(payload.refresh_token)
    if not decoded or decoded.get("type") != "refresh":
        return None
    user = get_user_by_id(db, int(decoded["sub"]))
    if not user or not user.is_active:
        return None
    return issue_tokens(user)


# ----------------------------------------------------------- settings
def get_settings_out(db: Session, user_id: int) -> UserSettingsOut:
    s = db.get(UserSettings, user_id) or _ensure_user_settings(db, user_id)
    return UserSettingsOut(
        preferred_llm=s.preferred_llm,
        has_openai=bool(crypto.decrypt(s.openai_api_key)),
        has_groq=bool(crypto.decrypt(s.groq_api_key)),
        has_virustotal=bool(crypto.decrypt(s.virustotal_api_key)),
        has_abuseipdb=bool(crypto.decrypt(s.abuseipdb_api_key)),
        has_shodan=bool(crypto.decrypt(s.shodan_api_key)),
        updated_at=s.updated_at,
    )


def get_user_keys(db: Session, user_id: int) -> dict[str, str]:
    """Return decrypted BYOK keys as a dict ready for engine consumption."""
    s = db.get(UserSettings, user_id) or _ensure_user_settings(db, user_id)
    return {
        "openai_api_key": crypto.decrypt(s.openai_api_key),
        "groq_api_key": crypto.decrypt(s.groq_api_key),
        "virustotal_api_key": crypto.decrypt(s.virustotal_api_key),
        "abuseipdb_api_key": crypto.decrypt(s.abuseipdb_api_key),
        "shodan_api_key": crypto.decrypt(s.shodan_api_key),
    }


def update_user_settings(db: Session, user_id: int, payload: UserSettingsUpdate) -> UserSettingsOut:
    s = db.get(UserSettings, user_id) or _ensure_user_settings(db, user_id)
    if payload.openai_api_key is not None:
        s.openai_api_key = crypto.encrypt(payload.openai_api_key) if payload.openai_api_key else ""
    if payload.groq_api_key is not None:
        s.groq_api_key = crypto.encrypt(payload.groq_api_key) if payload.groq_api_key else ""
    if payload.virustotal_api_key is not None:
        s.virustotal_api_key = (
            crypto.encrypt(payload.virustotal_api_key) if payload.virustotal_api_key else ""
        )
    if payload.abuseipdb_api_key is not None:
        s.abuseipdb_api_key = (
            crypto.encrypt(payload.abuseipdb_api_key) if payload.abuseipdb_api_key else ""
        )
    if payload.shodan_api_key is not None:
        s.shodan_api_key = crypto.encrypt(payload.shodan_api_key) if payload.shodan_api_key else ""
    if payload.preferred_llm is not None:
        s.preferred_llm = payload.preferred_llm
    db.commit()
    db.refresh(s)
    return get_settings_out(db, user_id)


def _ensure_user_settings(db: Session, user_id: int) -> UserSettings:
    s = db.get(UserSettings, user_id)
    if s:
        return s
    s = UserSettings(user_id=user_id)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s
