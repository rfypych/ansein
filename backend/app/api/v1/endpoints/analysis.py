from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.models import User
from app.schemas.schemas import AnalysisOut
from app.services import investigation_service

router = APIRouter()


@router.get("/{inv_id}", response_model=AnalysisOut)
def get_analysis_(
    inv_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    out = investigation_service.get_latest_analysis(db, user.id, inv_id)
    if out is None:
        raise HTTPException(404, "Investigation not found or no analysis run yet")
    return out
