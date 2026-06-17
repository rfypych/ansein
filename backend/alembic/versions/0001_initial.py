"""Initial schema.

Revision ID: 0001_initial
Revises:
Create Date: 2026-06-17

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(120), default=""),
        sa.Column("is_active", sa.Boolean, default=True, nullable=False),
        sa.Column("is_superuser", sa.Boolean, default=False, nullable=False),
        sa.Column("created_at", sa.DateTime, default=sa.func.utcnow(), nullable=False),
        sa.Column("last_login_at", sa.DateTime, nullable=True),
    )
    op.create_index("ix_users_email_active", "users", ["email", "is_active"])

    op.create_table(
        "user_settings",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("openai_api_key", sa.Text, default=""),
        sa.Column("groq_api_key", sa.Text, default=""),
        sa.Column("virustotal_api_key", sa.Text, default=""),
        sa.Column("abuseipdb_api_key", sa.Text, default=""),
        sa.Column("shodan_api_key", sa.Text, default=""),
        sa.Column("preferred_llm", sa.String(20), default="auto"),
        sa.Column("updated_at", sa.DateTime, default=sa.func.utcnow(), onupdate=sa.func.utcnow()),
    )

    op.create_table(
        "investigations",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, default=""),
        sa.Column("status", sa.String(20), default="pending", nullable=False),
        sa.Column("severity_score", sa.Float, default=0.0, nullable=False),
        sa.Column("tags", sa.JSON, default=list),
        sa.Column("created_at", sa.DateTime, default=sa.func.utcnow(), nullable=False),
        sa.Column("updated_at", sa.DateTime, default=sa.func.utcnow(), onupdate=sa.func.utcnow(), nullable=False),
    )
    op.create_index("ix_inv_user_status", "investigations", ["user_id", "status"])

    op.create_table(
        "sources",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("investigation_id", sa.Integer, sa.ForeignKey("investigations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_type", sa.String(20), nullable=False),
        sa.Column("title", sa.String(255), default=""),
        sa.Column("content", sa.Text, default=""),
        sa.Column("content_hash", sa.String(64), default=""),
        sa.Column("mime_type", sa.String(100), default="text/plain"),
        sa.Column("size_bytes", sa.Integer, default=0),
        sa.Column("created_at", sa.DateTime, default=sa.func.utcnow(), nullable=False),
    )

    op.create_table(
        "entities",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("investigation_id", sa.Integer, sa.ForeignKey("investigations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("entity_type", sa.String(40), nullable=False),
        sa.Column("value", sa.String(512), nullable=False),
        sa.Column("normalized", sa.String(512), default=""),
        sa.Column("confidence", sa.Float, default=0.5, nullable=False),
        sa.Column("enrichment", sa.JSON, default=dict),
        sa.Column("source_method", sa.String(20), default="regex"),
        sa.Column("created_at", sa.DateTime, default=sa.func.utcnow(), nullable=False),
    )
    op.create_index("ix_entity_inv_type", "entities", ["investigation_id", "entity_type"])
    op.create_index("ix_entity_value", "entities", ["value"])

    op.create_table(
        "relationships",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("investigation_id", sa.Integer, sa.ForeignKey("investigations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_id", sa.Integer, sa.ForeignKey("entities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_id", sa.Integer, sa.ForeignKey("entities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("relation_type", sa.String(60), nullable=False),
        sa.Column("weight", sa.Float, default=1.0, nullable=False),
        sa.Column("evidence", sa.Text, default=""),
        sa.Column("created_at", sa.DateTime, default=sa.func.utcnow(), nullable=False),
    )

    op.create_table(
        "analysis_runs",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("investigation_id", sa.Integer, sa.ForeignKey("investigations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("narrative", sa.Text, default=""),
        sa.Column("actor_hypothesis", sa.JSON, default=dict),
        sa.Column("severity_score", sa.Float, default=0.0, nullable=False),
        sa.Column("recommendations", sa.JSON, default=list),
        sa.Column("admiralty_code", sa.String(40), default="C2"),
        sa.Column("confidence", sa.Float, default=0.5, nullable=False),
        sa.Column("model_used", sa.String(80), default=""),
        sa.Column("tokens_used", sa.Integer, default=0),
        sa.Column("created_at", sa.DateTime, default=sa.func.utcnow(), nullable=False),
    )

    op.create_table(
        "chat_sessions",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("investigation_id", sa.Integer, sa.ForeignKey("investigations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(255), default="New Chat"),
        sa.Column("created_at", sa.DateTime, default=sa.func.utcnow(), nullable=False),
        sa.Column("updated_at", sa.DateTime, default=sa.func.utcnow(), onupdate=sa.func.utcnow(), nullable=False),
    )

    op.create_table(
        "chat_messages",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("session_id", sa.Integer, sa.ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("citations", sa.JSON, default=list),
        sa.Column("tokens_used", sa.Integer, default=0),
        sa.Column("created_at", sa.DateTime, default=sa.func.utcnow(), nullable=False),
    )

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, nullable=True),
        sa.Column("action", sa.String(80), nullable=False),
        sa.Column("target_type", sa.String(40), default=""),
        sa.Column("target_id", sa.Integer, nullable=True),
        sa.Column("ip_address", sa.String(64), default=""),
        sa.Column("extra_metadata", sa.JSON, default=dict),
        sa.Column("created_at", sa.DateTime, default=sa.func.utcnow(), nullable=False),
    )
    op.create_index("ix_audit_action_created", "audit_logs", ["action", "created_at"])


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("chat_messages")
    op.drop_table("chat_sessions")
    op.drop_table("analysis_runs")
    op.drop_table("relationships")
    op.drop_table("entities")
    op.drop_table("sources")
    op.drop_table("investigations")
    op.drop_table("user_settings")
    op.drop_table("users")
