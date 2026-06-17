"""Tests for setup wizard and health endpoints."""
from __future__ import annotations

import pytest


class TestHealth:
    def test_health_returns_ok(self, client):
        r = client.get("/api/v1/health")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "ok"
        assert data["app"] == "AnseIn"
        assert "database_configured" in data
        assert "setup_required" in data
        assert "setup_complete" in data


class TestSetupStatus:
    def test_setup_status_structure(self, client):
        r = client.get("/api/v1/setup/status")
        assert r.status_code == 200
        data = r.json()
        assert "setup_required" in data
        assert "database_configured" in data
        assert "admin_exists" in data
        assert "app_env" in data

    def test_setup_status_after_admin_registered(self, client, auth_headers):
        # auth_headers fixture registers an admin
        r = client.get("/api/v1/setup/status")
        assert r.status_code == 200
        data = r.json()
        assert data["admin_exists"] is True
        assert data["setup_required"] is False


class TestSetupDatabase:
    def test_invalid_url_rejected(self, client):
        # Schema requires database_url min_length=10, so short strings get 422.
        r = client.post(
            "/api/v1/setup/database",
            json={"database_url": "not-a-url-but-long-enough"},
        )
        # Endpoint returns 200 with success=False (it tries to connect, fails, returns)
        assert r.status_code == 200
        assert r.json()["success"] is False

    def test_valid_sqlite_url_accepted(self, client, tmp_path):
        db_path = tmp_path / "test_setup.db"
        r = client.post(
            "/api/v1/setup/database",
            json={"database_url": f"sqlite:///{db_path}"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True


class TestSetupAdmin:
    def test_create_admin_when_none_exists(self, client):
        # No users yet
        r = client.post(
            "/api/v1/setup/admin",
            json={"email": "newadmin@example.com", "password": "password123", "full_name": "Admin"},
        )
        assert r.status_code == 200
        assert r.json()["success"] is True

    def test_create_admin_twice_fails(self, client):
        # Create first admin
        client.post(
            "/api/v1/setup/admin",
            json={"email": "admin1@example.com", "password": "password123", "full_name": "A1"},
        )
        # Second should fail
        r = client.post(
            "/api/v1/setup/admin",
            json={"email": "admin2@example.com", "password": "password123", "full_name": "A2"},
        )
        assert r.status_code == 200
        assert r.json()["success"] is False

    def test_short_password_rejected(self, client):
        r = client.post(
            "/api/v1/setup/admin",
            json={"email": "x@example.com", "password": "short", "full_name": "X"},
        )
        # Pydantic validation in schema
        assert r.status_code == 422
