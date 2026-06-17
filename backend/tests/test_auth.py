"""Tests for auth endpoints and security."""
from __future__ import annotations

import pytest


class TestRegistration:
    def test_register_first_user_becomes_admin(self, client):
        r = client.post(
            "/api/v1/auth/register",
            json={"email": "first@example.com", "password": "password123", "full_name": "First"},
        )
        assert r.status_code == 201
        data = r.json()
        assert data["access_token"]
        assert data["refresh_token"]
        assert data["user"]["email"] == "first@example.com"
        assert data["user"]["is_superuser"] is True

    def test_register_second_user_is_not_admin(self, client):
        client.post(
            "/api/v1/auth/register",
            json={"email": "first@example.com", "password": "password123", "full_name": "F"},
        )
        r = client.post(
            "/api/v1/auth/register",
            json={"email": "second@example.com", "password": "password123", "full_name": "S"},
        )
        assert r.status_code == 201
        assert r.json()["user"]["is_superuser"] is False

    def test_register_duplicate_email_fails(self, client):
        payload = {"email": "dup@example.com", "password": "password123", "full_name": "D"}
        client.post("/api/v1/auth/register", json=payload)
        r = client.post("/api/v1/auth/register", json=payload)
        assert r.status_code == 409

    def test_register_short_password_fails(self, client):
        r = client.post(
            "/api/v1/auth/register",
            json={"email": "x@example.com", "password": "short", "full_name": "X"},
        )
        assert r.status_code == 422

    def test_register_invalid_email_fails(self, client):
        r = client.post(
            "/api/v1/auth/register",
            json={"email": "not-an-email", "password": "password123", "full_name": "X"},
        )
        assert r.status_code == 422


class TestLogin:
    def test_login_success(self, client, auth_headers):
        # User already registered via auth_headers fixture
        r = client.post(
            "/api/v1/auth/login",
            json={"email": "tester@example.com", "password": "password123"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["access_token"]
        assert data["refresh_token"]
        assert data["user"]["email"] == "tester@example.com"

    def test_login_wrong_password(self, client, auth_headers):
        r = client.post(
            "/api/v1/auth/login",
            json={"email": "tester@example.com", "password": "wrong"},
        )
        assert r.status_code == 401

    def test_login_unknown_email(self, client):
        r = client.post(
            "/api/v1/auth/login",
            json={"email": "nobody@example.com", "password": "whatever"},
        )
        assert r.status_code == 401


class TestTokenRefresh:
    def test_refresh_after_login(self, client, auth_headers):
        r = client.post(
            "/api/v1/auth/login",
            json={"email": "tester@example.com", "password": "password123"},
        )
        refresh = r.json()["refresh_token"]
        r2 = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
        assert r2.status_code == 200
        assert r2.json()["access_token"]

    def test_refresh_with_garbage_token_fails(self, client):
        r = client.post("/api/v1/auth/refresh", json={"refresh_token": "garbage"})
        assert r.status_code == 401

    def test_refresh_with_access_token_fails(self, client, auth_headers):
        # Access tokens should NOT be usable as refresh tokens
        r = client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": auth_headers["Authorization"].split(" ", 1)[1]},
        )
        assert r.status_code == 401


class TestAuthEnforcement:
    def test_protected_endpoint_requires_token(self, client):
        r = client.get("/api/v1/investigations")
        assert r.status_code == 401

    def test_protected_endpoint_rejects_garbage_token(self, client):
        r = client.get(
            "/api/v1/investigations",
            headers={"Authorization": "Bearer garbage"},
        )
        assert r.status_code == 401

    def test_protected_endpoint_rejects_missing_bearer_prefix(self, client, auth_token):
        r = client.get(
            "/api/v1/investigations",
            headers={"Authorization": auth_token},  # missing "Bearer "
        )
        assert r.status_code == 401

    def test_me_returns_current_user(self, client, auth_headers):
        r = client.get("/api/v1/auth/me", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["email"] == "tester@example.com"
