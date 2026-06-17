from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.models import User
from app.schemas.schemas import EntityOut, RelationshipOut
from app.services import investigation_service

router = APIRouter()


@router.get("/{inv_id}", response_model=list[EntityOut])
def list_entities_(
    inv_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    out = investigation_service.list_entities(db, user.id, inv_id)
    if out is None:
        raise HTTPException(404, "Investigation not found")
    return out


@router.get("/{inv_id}/relationships", response_model=list[RelationshipOut])
def list_relationships_(
    inv_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    out = investigation_service.list_relationships(db, user.id, inv_id)
    if out is None:
        raise HTTPException(404, "Investigation not found")
    return out
