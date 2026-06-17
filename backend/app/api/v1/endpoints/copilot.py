from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.models import User
from app.schemas.schemas import (
    ChatAsk,
    ChatMessageOut,
    ChatResponse,
    ChatSessionOut,
    MessageOut,
)
from app.services import copilot_service

router = APIRouter()


@router.get("/sessions", response_model=list[ChatSessionOut])
def list_sessions(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return copilot_service.list_sessions(db, user.id)


@router.post("/sessions", response_model=ChatSessionOut, status_code=201)
def create_session_(
    investigation_id: int | None = None,
    title: str = "New Chat",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return copilot_service.create_session(
            db, user.id, investigation_id=investigation_id, title=title
        )
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.delete("/sessions/{session_id}", response_model=MessageOut)
def delete_session_(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not copilot_service.delete_session(db, user.id, session_id):
        raise HTTPException(404, "Chat session not found")
    return MessageOut(message="Deleted")


@router.get("/sessions/{session_id}/messages", response_model=list[ChatMessageOut])
def list_messages_(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    out = copilot_service.list_messages(db, user.id, session_id)
    if out is None:
        raise HTTPException(404, "Chat session not found")
    return out


@router.post("/ask", response_model=ChatResponse)
def ask_(
    payload: ChatAsk,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    out = copilot_service.ask(db, user.id, payload)
    if out is None:
        raise HTTPException(404, "Chat session not found")
    return out
