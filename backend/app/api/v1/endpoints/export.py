from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.models import User
from app.services import export_service

router = APIRouter()


@router.get("/{inv_id}/json")
def export_json_(
    inv_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    out = export_service.export_json(db, user.id, inv_id)
    if not out:
        raise HTTPException(404, "Investigation not found")
    return out


@router.get("/{inv_id}/stix")
def export_stix_(
    inv_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    out = export_service.export_stix(db, user.id, inv_id)
    if not out:
        raise HTTPException(404, "Investigation not found")
    return out


@router.get("/{inv_id}/pdf")
def export_pdf_(
    inv_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    out = export_service.export_pdf(db, user.id, inv_id)
    if not out:
        raise HTTPException(404, "Investigation not found")
    return Response(
        content=out,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="ansein-investigation-{inv_id}.pdf"'
        },
    )
