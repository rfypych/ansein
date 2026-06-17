"""
SQLAlchemy models for AnseIn.

Schema overview:
* users / user_settings        — multi-tenant SaaS (BYOK keys live per-user)
* investigations               — one per analyst case
* sources                      — raw text/files attached to an investigation
* entities                     — extracted IOCs / actors / malware / etc.
* relationships                — graph edges between entities
* analysis_runs                — cognitive analysis output
* chat_sessions / chat_messages — copilot RAG history
* audit_logs                   — security forensics

All tables use utf8mb4 charset (MySQL-friendly, supports emoji + CJK).
All FKs have ON DELETE CASCADE on the parent row.
"""
from datetime import datetime
from typing import List, Optional

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


def _utcnow() -> datetime:
    return datetime.utcnow()


# ---------------------------------------------------------------- user
class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(120), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    settings: Mapped[Optional["UserSettings"]] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    investigations: Mapped[List["Investigation"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    chat_sessions: Mapped[List["ChatSession"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    __table_args__ = (Index("ix_users_email_active", "email", "is_active"),)


class UserSettings(Base):
    """Per-user BYOK keys (encrypted at rest by service layer)."""
    __tablename__ = "user_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    # Encrypted blob (Fernet). Empty string = not set.
    openai_api_key: Mapped[str] = mapped_column(Text, default="")
    groq_api_key: Mapped[str] = mapped_column(Text, default="")
    virustotal_api_key: Mapped[str] = mapped_column(Text, default="")
    abuseipdb_api_key: Mapped[str] = mapped_column(Text, default="")
    shodan_api_key: Mapped[str] = mapped_column(Text, default="")
    preferred_llm: Mapped[str] = mapped_column(String(20), default="auto")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)

    user: Mapped[User] = relationship(back_populates="settings")


# ---------------------------------------------------------- investigation
class Investigation(Base):
    __tablename__ = "investigations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    # pending | extracting | enriching | analyzing | completed | failed
    severity_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    tags: Mapped[Optional[list]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow, nullable=False
    )

    user: Mapped[User] = relationship(back_populates="investigations")
    sources: Mapped[List["Source"]] = relationship(
        back_populates="investigation", cascade="all, delete-orphan"
    )
    entities: Mapped[List["Entity"]] = relationship(
        back_populates="investigation", cascade="all, delete-orphan"
    )
    relationships: Mapped[List["Relationship"]] = relationship(
        back_populates="investigation", cascade="all, delete-orphan"
    )
    analysis_runs: Mapped[List["AnalysisRun"]] = relationship(
        back_populates="investigation", cascade="all, delete-orphan"
    )

    __table_args__ = (Index("ix_inv_user_status", "user_id", "status"),)


class Source(Base):
    __tablename__ = "sources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    investigation_id: Mapped[int] = mapped_column(
        ForeignKey("investigations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_type: Mapped[str] = mapped_column(String(20), nullable=False)
    # text | file | url | email
    title: Mapped[str] = mapped_column(String(255), default="")
    content: Mapped[str] = mapped_column(Text, default="")
    content_hash: Mapped[str] = mapped_column(String(64), default="")
    mime_type: Mapped[str] = mapped_column(String(100), default="text/plain")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)

    investigation: Mapped[Investigation] = relationship(back_populates="sources")


# ----------------------------------------------------------- entity / rel
class Entity(Base):
    __tablename__ = "entities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    investigation_id: Mapped[int] = mapped_column(
        ForeignKey("investigations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False)
    # threat_actor | malware | ioc_ip | ioc_domain | ioc_url | ioc_hash
    # vulnerability | target | location | identity | tool | technique
    value: Mapped[str] = mapped_column(String(512), nullable=False)
    normalized: Mapped[str] = mapped_column(String(512), default="")
    confidence: Mapped[float] = mapped_column(Float, default=0.5, nullable=False)
    enrichment: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    # raw API responses from VT/AbuseIPDB/Shodan
    source_method: Mapped[str] = mapped_column(String(20), default="regex")
    # regex | gliner | llm
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)

    investigation: Mapped[Investigation] = relationship(back_populates="entities")

    __table_args__ = (
        Index("ix_entity_inv_type", "investigation_id", "entity_type"),
        Index("ix_entity_value", "value"),
    )


class Relationship(Base):
    __tablename__ = "relationships"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    investigation_id: Mapped[int] = mapped_column(
        ForeignKey("investigations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_id: Mapped[int] = mapped_column(
        ForeignKey("entities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    target_id: Mapped[int] = mapped_column(
        ForeignKey("entities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    relation_type: Mapped[str] = mapped_column(String(60), nullable=False)
    # uses | targets | exploits | attributed_to | located_in | communicates_with | etc.
    weight: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    evidence: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)

    investigation: Mapped[Investigation] = relationship(back_populates="relationships")


# ------------------------------------------------------------- analysis
class AnalysisRun(Base):
    __tablename__ = "analysis_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    investigation_id: Mapped[int] = mapped_column(
        ForeignKey("investigations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    narrative: Mapped[str] = mapped_column(Text, default="")
    actor_hypothesis: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    severity_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    recommendations: Mapped[Optional[list]] = mapped_column(JSON, default=list)
    admiralty_code: Mapped[str] = mapped_column(String(40), default="C2")
    # A1..F6 reliability/credibility
    confidence: Mapped[float] = mapped_column(Float, default=0.5, nullable=False)
    model_used: Mapped[str] = mapped_column(String(80), default="")
    tokens_used: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)

    investigation: Mapped[Investigation] = relationship(back_populates="analysis_runs")


# --------------------------------------------------------------- copilot
class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    investigation_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("investigations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(255), default="New Chat")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow, nullable=False
    )

    user: Mapped[User] = relationship(back_populates="chat_sessions")
    messages: Mapped[List["ChatMessage"]] = relationship(
        back_populates="session", cascade="all, delete-orphan", order_by="ChatMessage.id"
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    # user | assistant | system
    content: Mapped[str] = mapped_column(Text, nullable=False)
    citations: Mapped[Optional[list]] = mapped_column(JSON, default=list)
    tokens_used: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)

    session: Mapped[ChatSession] = relationship(back_populates="messages")


# --------------------------------------------------------------- audit
class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    target_type: Mapped[str] = mapped_column(String(40), default="")
    target_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ip_address: Mapped[str] = mapped_column(String(64), default="")
    extra_metadata: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)

    __table_args__ = (Index("ix_audit_action_created", "action", "created_at"),)
