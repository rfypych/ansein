"""Pydantic schemas — request/response contracts for the API layer."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ============================================================ auth
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(default="", max_length=120)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: EmailStr
    full_name: str
    is_active: bool
    is_superuser: bool
    created_at: datetime


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


class RefreshIn(BaseModel):
    refresh_token: str


# ============================================================ settings
class UserSettingsUpdate(BaseModel):
    openai_api_key: Optional[str] = None
    groq_api_key: Optional[str] = None
    virustotal_api_key: Optional[str] = None
    abuseipdb_api_key: Optional[str] = None
    shodan_api_key: Optional[str] = None
    preferred_llm: Optional[str] = Field(default=None, pattern="^(auto|openai|groq)$")


class UserSettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    preferred_llm: str
    has_openai: bool
    has_groq: bool
    has_virustotal: bool
    has_abuseipdb: bool
    has_shodan: bool
    updated_at: datetime


# ============================================================ investigation
class InvestigationCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str = ""
    tags: list[str] = Field(default_factory=list)


class InvestigationUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[list[str]] = None
    status: Optional[str] = Field(
        default=None,
        pattern="^(pending|extracting|enriching|analyzing|completed|failed)$",
    )


class InvestigationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    description: str
    status: str
    severity_score: float
    tags: list[str]
    created_at: datetime
    updated_at: datetime
    source_count: int = 0
    entity_count: int = 0
    relationship_count: int = 0


# ============================================================ source
class SourceCreate(BaseModel):
    source_type: str = Field(pattern="^(text|file|url|email)$")
    title: str = Field(default="", max_length=255)
    content: str = ""
    mime_type: str = "text/plain"


class SourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    investigation_id: int
    source_type: str
    title: str
    content: str
    content_hash: str
    mime_type: str
    size_bytes: int
    created_at: datetime


# ============================================================ entity
class EntityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    entity_type: str
    value: str
    normalized: str
    confidence: float
    source_method: str
    enrichment: dict
    created_at: datetime


class RelationshipOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    source_id: int
    target_id: int
    relation_type: str
    weight: float
    evidence: str


class GraphData(BaseModel):
    nodes: list[dict]
    edges: list[dict]


# ============================================================ analysis
class AnalysisOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    investigation_id: int
    narrative: str
    actor_hypothesis: dict
    severity_score: float
    recommendations: list[str]
    admiralty_code: str
    confidence: float
    model_used: str
    created_at: datetime


# ============================================================ copilot
class ChatSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    investigation_id: Optional[int]
    created_at: datetime
    updated_at: datetime


class ChatMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    role: str
    content: str
    citations: list
    created_at: datetime


class ChatAsk(BaseModel):
    session_id: Optional[int] = None
    investigation_id: Optional[int] = None
    message: str = Field(min_length=1, max_length=8000)


class ChatResponse(BaseModel):
    session_id: int
    message: ChatMessageOut
    tokens_used: int


# ============================================================ setup
class SetupStatus(BaseModel):
    setup_required: bool
    database_configured: bool
    admin_exists: bool
    app_env: str


class SetupDatabase(BaseModel):
    database_url: str = Field(min_length=10)
    secret_key: Optional[str] = None


class SetupAdmin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = ""


class SetupResult(BaseModel):
    success: bool
    message: str
    next_step: Optional[str] = None


# ============================================================ common
class PaginatedOut(BaseModel):
    items: list[Any]
    total: int
    page: int
    page_size: int


class MessageOut(BaseModel):
    message: str
    detail: Optional[Any] = None


class ErrorOut(BaseModel):
    detail: str
    code: Optional[str] = None
