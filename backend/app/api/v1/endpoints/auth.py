from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.models import User
from app.schemas.schemas import (
    RefreshIn,
    TokenPair,
    UserCreate,
    UserLogin,
    UserOut,
)
from app.services import user_service

router = APIRouter()


@router.post("/register", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    """Self-registration. If no users exist yet, the first one becomes admin."""
    is_first = not user_service.any_users_exist(db)
    try:
        user = user_service.create_user(db, payload, is_superuser=is_first)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    return user_service.issue_tokens(user)


@router.post("/login", response_model=TokenPair)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    user = user_service.authenticate(db, payload)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    return user_service.issue_tokens(user)


@router.post("/refresh", response_model=TokenPair)
def refresh(payload: RefreshIn, db: Session = Depends(get_db)):
    out = user_service.refresh_tokens(db, payload)
    if not out:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )
    return out


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(__import__("app.api.deps", fromlist=["get_current_user"]).get_current_user)):
    return user
