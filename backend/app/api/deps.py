"""FastAPI dependencies: current user extraction from JWT."""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db.session import get_db
from app.models.models import User
from app.services.setup_service import is_setup_complete


def get_current_user(
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
) -> User:
    """Resolve the user from `Authorization: Bearer <jwt>`."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not authorization or not authorization.lower().startswith("bearer "):
        raise credentials_exception
    token = authorization.split(" ", 1)[1].strip()
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise credentials_exception
    user_id = payload.get("sub")
    if not user_id:
        raise credentials_exception
    user = db.get(User, int(user_id))
    if not user or not user.is_active:
        raise credentials_exception
    return user


def require_setup_complete() -> None:
    """Block normal API access when setup wizard hasn't run."""
    if not is_setup_complete():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Setup not complete. Visit /api/v1/setup to finish configuration.",
            headers={"Location": "/setup"},
        )


def get_current_user_optional(
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
) -> Optional[User]:
    """Same as get_current_user but returns None instead of 401."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    try:
        return get_current_user(db=db, authorization=authorization)
    except HTTPException:
        return None
