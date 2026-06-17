"""Database session/engine — MySQL-first, gracefully degrades when unconfigured."""
from __future__ import annotations

import logging
from contextlib import contextmanager
from typing import Generator, Optional

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from app.core.config import get_settings

log = logging.getLogger(__name__)
Base = declarative_base()

_engine: Optional[Engine] = None
_SessionLocal: Optional[sessionmaker] = None


def _build_engine(database_url: str) -> Engine:
    s = get_settings()
    connect_args: dict = {}
    pool_kwargs: dict = {}

    # MySQL via PyMySQL — preferred for cPanel shared hosting
    if database_url.startswith("mysql"):
        # PyMySQL doesn't accept check_same_thread (that's SQLite-only)
        pool_kwargs = {
            "pool_size": s.db_pool_size,
            "pool_recycle": s.db_pool_recycle,
            "pool_pre_ping": True,
        }
    elif database_url.startswith("sqlite"):
        connect_args = {"check_same_thread": False}
    else:  # postgres etc.
        pool_kwargs = {
            "pool_size": s.db_pool_size,
            "pool_recycle": s.db_pool_recycle,
            "pool_pre_ping": True,
        }

    engine = create_engine(
        database_url,
        echo=False,
        connect_args=connect_args,
        **pool_kwargs,
    )

    # Make MySQL strict about utf8mb4 (emoji + CJK)
    if database_url.startswith("mysql"):

        @event.listens_for(engine, "connect")
        def _set_mysql_strict(dbapi_conn, _):  # noqa: ANN001
            cur = dbapi_conn.cursor()
            cur.execute("SET SESSION sql_mode='STRICT_TRANS_TABLES'")
            cur.execute("SET SESSION time_zone='+00:00'")
            cur.close()

    return engine


def init_engine(database_url: Optional[str] = None) -> Engine:
    """Initialise (or re-initialise) the global engine."""
    global _engine, _SessionLocal
    s = get_settings()
    url = database_url or s.database_url
    if not url:
        # In-memory SQLite so import-time metadata doesn't crash
        url = "sqlite:///:memory:"
        log.warning("DATABASE_URL not set — falling back to in-memory SQLite (setup mode).")
    _engine = _build_engine(url)
    _SessionLocal = sessionmaker(bind=_engine, autoflush=False, autocommit=False, expire_on_commit=False)
    return _engine


def get_engine() -> Engine:
    if _engine is None:
        init_engine()
    return _engine  # type: ignore[return-value]


def get_session_local() -> sessionmaker:
    if _SessionLocal is None:
        init_engine()
    return _SessionLocal  # type: ignore[return-value]


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency."""
    if _SessionLocal is None:
        init_engine()
    db = _SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def session_scope() -> Generator[Session, None, None]:
    """Context manager for non-FastAPI code paths (scripts, tests, workers)."""
    if _SessionLocal is None:
        init_engine()
    db = _SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def ping() -> bool:
    """Lightweight DB health probe."""
    try:
        eng = get_engine()
        with eng.connect() as conn:
            conn.exec_driver_sql("SELECT 1")
        return True
    except Exception as e:
        log.warning("DB ping failed: %s", e)
        return False
