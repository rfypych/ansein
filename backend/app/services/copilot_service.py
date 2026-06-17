"""Copilot chat service."""
from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.engines.copilot import CopilotEngine
from app.models.models import (
    AnalysisRun,
    ChatMessage,
    ChatSession,
    Entity,
    Investigation,
    Relationship,
    Source,
)
from app.schemas.schemas import ChatAsk, ChatMessageOut, ChatResponse, ChatSessionOut
from app.services.user_service import get_user_keys

log = logging.getLogger(__name__)


def list_sessions(db: Session, user_id: int) -> list[ChatSessionOut]:
    rows = db.execute(
        select(ChatSession)
        .where(ChatSession.user_id == user_id)
        .order_by(ChatSession.updated_at.desc())
    ).scalars().all()
    return [ChatSessionOut.model_validate(r) for r in rows]


def create_session(
    db: Session, user_id: int, *, investigation_id: Optional[int] = None, title: str = "New Chat"
) -> ChatSessionOut:
    if investigation_id:
        # Verify ownership
        inv = db.get(Investigation, investigation_id)
        if not inv or inv.user_id != user_id:
            raise ValueError("Investigation not found")
    s = ChatSession(
        user_id=user_id,
        investigation_id=investigation_id,
        title=title,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return ChatSessionOut.model_validate(s)


def delete_session(db: Session, user_id: int, session_id: int) -> bool:
    s = db.get(ChatSession, session_id)
    if not s or s.user_id != user_id:
        return False
    db.delete(s)
    db.commit()
    return True


def list_messages(db: Session, user_id: int, session_id: int) -> Optional[list[ChatMessageOut]]:
    s = db.get(ChatSession, session_id)
    if not s or s.user_id != user_id:
        return None
    rows = db.execute(
        select(ChatMessage).where(ChatMessage.session_id == session_id).order_by(ChatMessage.id)
    ).scalars().all()
    return [ChatMessageOut.model_validate(r) for r in rows]


def ask(db: Session, user_id: int, payload: ChatAsk) -> Optional[ChatResponse]:
    """Run a chat turn. Returns None if session ownership check fails."""
    session_id = payload.session_id
    if not session_id:
        s = create_session(
            db, user_id, investigation_id=payload.investigation_id, title=payload.message[:60]
        )
        session_id = s.id
    else:
        s = db.get(ChatSession, session_id)
        if not s or s.user_id != user_id:
            return None

    # Persist user message
    user_msg = ChatMessage(session_id=session_id, role="user", content=payload.message)
    db.add(user_msg)
    db.commit()
    db.refresh(user_msg)

    # Build history (excluding the just-added user message)
    history = [
        {"role": m.role, "content": m.content}
        for m in db.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id, ChatMessage.id < user_msg.id)
            .order_by(ChatMessage.id)
        ).scalars().all()
    ]

    # Build context from investigation (if attached)
    context = ""
    if s.investigation_id:
        inv = db.get(Investigation, s.investigation_id)
        if inv and inv.user_id == user_id:
            entities = db.execute(
                select(Entity).where(Entity.investigation_id == inv.id)
            ).scalars().all()
            rels = db.execute(
                select(Relationship).where(Relationship.investigation_id == inv.id)
            ).scalars().all()
            latest = db.execute(
                select(AnalysisRun)
                .where(AnalysisRun.investigation_id == inv.id)
                .order_by(AnalysisRun.created_at.desc())
                .limit(1)
            ).scalar_one_or_none()
            sources = db.execute(
                select(Source).where(Source.investigation_id == inv.id)
            ).scalars().all()
            source_text = "\n\n".join(src.content for src in sources)[:6000]

            # Merge enrichment
            merged_enr: dict = {}
            for e in entities:
                for k, v in (e.enrichment or {}).items():
                    if k == "mock":
                        continue
                    merged_enr.setdefault(k, []).append(v)

            user_keys = get_user_keys(db, user_id)
            copilot = CopilotEngine(user_keys=user_keys)
            context = copilot.build_context(
                title=inv.title,
                severity_score=inv.severity_score,
                entities=entities,
                relationships=rels,
                enrichment=merged_enr,
                narrative=latest.narrative if latest else "",
                source_text=source_text,
            )

    # Get response from LLM
    user_keys = get_user_keys(db, user_id)
    copilot = CopilotEngine(user_keys=user_keys)
    result = copilot.chat(context=context, history=history, user_message=payload.message)

    # Persist assistant message
    asst_msg = ChatMessage(
        session_id=session_id,
        role="assistant",
        content=result["content"],
        citations=result.get("citations", []),
        tokens_used=result.get("tokens_used", 0),
    )
    db.add(asst_msg)
    db.commit()
    db.refresh(asst_msg)

    return ChatResponse(
        session_id=session_id,
        message=ChatMessageOut.model_validate(asst_msg),
        tokens_used=result.get("tokens_used", 0),
    )
