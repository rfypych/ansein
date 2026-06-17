"""Shared test fixtures."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Ensure backend/ is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Force a clean test env (override any inherited DATABASE_URL)
os.environ["DATABASE_URL"] = "sqlite://"
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-tests-only")
os.environ["RATE_LIMIT_DISABLED"] = "1"


@pytest.fixture(scope="function")
def temp_db():
    """Per-test in-memory SQLite database (isolated, fast)."""
    from app.db import session as db_session
    from app.db.session import Base, get_db
    from app.models import models  # noqa: F401 — register tables

    # Fresh in-memory engine for each test
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    # Override FastAPI's get_db dependency
    def _override_get_db():
        db = TestSessionLocal()
        try:
            yield db
        finally:
            db.close()

    # Override module-level engine/session too (for non-FastAPI code paths)
    orig_engine = db_session._engine
    orig_session = db_session._SessionLocal
    db_session._engine = engine
    db_session._SessionLocal = TestSessionLocal

    # Patch app's dependency
    from app.main import app

    app.dependency_overrides[get_db] = _override_get_db

    yield TestSessionLocal

    # Teardown
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)
    db_session._engine = orig_engine
    db_session._SessionLocal = orig_session


@pytest.fixture(scope="function")
def client(temp_db):
    """FastAPI TestClient with isolated DB."""
    from app.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture
def auth_token(client):
    """Register a user and return their access token."""
    r = client.post(
        "/api/v1/auth/register",
        json={"email": "tester@example.com", "password": "password123", "full_name": "Tester"},
    )
    assert r.status_code == 201, r.text
    return r.json()["access_token"]


@pytest.fixture
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}"}


@pytest.fixture
def second_user_token(client):
    """A second user for multi-tenant isolation tests."""
    r = client.post(
        "/api/v1/auth/register",
        json={"email": "other@example.com", "password": "password123", "full_name": "Other"},
    )
    assert r.status_code == 201, r.text
    return r.json()["access_token"]


@pytest.fixture
def second_user_headers(second_user_token):
    return {"Authorization": f"Bearer {second_user_token}"}


@pytest.fixture
def investigation_id(client, auth_headers):
    """Create a fresh investigation owned by the primary test user."""
    r = client.post(
        "/api/v1/investigations",
        json={"title": "Test Investigation", "description": "test", "tags": ["test"]},
        headers=auth_headers,
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]
