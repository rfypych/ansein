from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.models import User
from app.schemas.schemas import (
    InvestigationCreate,
    InvestigationOut,
    InvestigationUpdate,
    MessageOut,
    PaginatedOut,
)
from app.services import investigation_service, setup_service

router = APIRouter()


@router.get("", response_model=PaginatedOut)
def list_investigations(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    items, total = investigation_service.list_investigations(
        db, user.id, page=page, page_size=page_size, status=status
    )
    return PaginatedOut(items=items, total=total, page=page, page_size=page_size)


@router.post("", response_model=InvestigationOut, status_code=201)
def create_investigation_(
    payload: InvestigationCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    inv = investigation_service.create_investigation(db, user.id, payload)
    return investigation_service._inv_to_out(inv, db)


@router.get("/{inv_id}", response_model=InvestigationOut)
def get_investigation_(
    inv_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    inv = investigation_service.get_investigation(db, user.id, inv_id)
    if not inv:
        raise HTTPException(404, "Investigation not found")
    return investigation_service._inv_to_out(inv, db)


@router.patch("/{inv_id}", response_model=InvestigationOut)
def update_investigation_(
    inv_id: int,
    payload: InvestigationUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    inv = investigation_service.update_investigation(db, user.id, inv_id, payload)
    if not inv:
        raise HTTPException(404, "Investigation not found")
    return investigation_service._inv_to_out(inv, db)


@router.delete("/{inv_id}", response_model=MessageOut)
def delete_investigation_(
    inv_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not investigation_service.delete_investigation(db, user.id, inv_id):
        raise HTTPException(404, "Investigation not found")
    return MessageOut(message="Deleted")


@router.post("/{inv_id}/pipeline", response_model=InvestigationOut)
def run_pipeline_(
    inv_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    inv = investigation_service.run_pipeline(db, user.id, inv_id)
    if not inv:
        raise HTTPException(404, "Investigation not found")
    return investigation_service._inv_to_out(inv, db)
