"""Ingest endpoints — add sources (text/file/URL) to an investigation."""
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.models import User
from app.schemas.schemas import MessageOut, SourceCreate, SourceOut
from app.services import investigation_service

router = APIRouter()


@router.post("/{inv_id}/sources", response_model=SourceOut, status_code=201)
def add_source_text(
    inv_id: int,
    payload: SourceCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    src = investigation_service.add_source(db, user.id, inv_id, payload)
    if not src:
        raise HTTPException(404, "Investigation not found")
    return src


@router.post("/{inv_id}/sources/upload", response_model=SourceOut, status_code=201)
async def add_source_file(
    inv_id: int,
    file: UploadFile = File(...),
    title: str = Form(""),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(400, "No filename provided")
    raw = await file.read()
    if len(raw) > 5 * 1024 * 1024:  # 5MB cap
        raise HTTPException(413, "File too large (max 5MB)")
    try:
        content = raw.decode("utf-8", errors="ignore")
    except Exception:
        content = ""
    payload = SourceCreate(
        source_type="file",
        title=title or file.filename,
        content=content,
        mime_type=file.content_type or "application/octet-stream",
    )
    src = investigation_service.add_source(db, user.id, inv_id, payload)
    if not src:
        raise HTTPException(404, "Investigation not found")
    return src


@router.get("/{inv_id}/sources", response_model=list[SourceOut])
def list_sources_(
    inv_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    out = investigation_service.list_sources(db, user.id, inv_id)
    if out is None:
        raise HTTPException(404, "Investigation not found")
    return out
