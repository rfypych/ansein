from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.schemas import (
    MessageOut,
    SetupAdmin,
    SetupDatabase,
    SetupResult,
    SetupStatus,
)
from app.services import setup_service

router = APIRouter()


@router.get("/status", response_model=SetupStatus)
def status(db: Session = Depends(get_db)):
    """Return the current setup wizard state."""
    return setup_service.get_status(db)


@router.post("/database", response_model=SetupResult)
def configure_database(payload: SetupDatabase):
    """Phase 1: connect & migrate the database."""
    return setup_service.configure_database(payload)


@router.post("/admin", response_model=SetupResult)
def create_admin(payload: SetupAdmin, db: Session = Depends(get_db)):
    """Phase 2: create the first admin account."""
    return setup_service.create_admin(db, payload)


@router.post("/complete", response_model=MessageOut)
def mark_complete():
    """Final hook — the frontend calls this after the wizard closes."""
    return MessageOut(message="Setup complete. You can now log in.")
