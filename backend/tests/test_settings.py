"""Tests for user settings — BYOK encryption, multi-tenant isolation."""
from __future__ import annotations

import pytest


class TestSettings:
    def test_default_settings_all_empty(self, client, auth_headers):
        r = client.get("/api/v1/settings", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["preferred_llm"] == "auto"
        assert data["has_openai"] is False
        assert data["has_groq"] is False
        assert data["has_virustotal"] is False
        assert data["has_abuseipdb"] is False
        assert data["has_shodan"] is False

    def test_set_groq_key(self, client, auth_headers):
        r = client.put(
            "/api/v1/settings",
            json={"groq_api_key": "gsk_test_key_123"},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.json()["has_groq"] is True

    def test_set_multiple_keys(self, client, auth_headers):
        client.put(
            "/api/v1/settings",
            json={
                "openai_api_key": "sk-test",
                "virustotal_api_key": "vt-test",
                "abuseipdb_api_key": "ab-test",
                "shodan_api_key": "sh-test",
            },
            headers=auth_headers,
        )
        r = client.get("/api/v1/settings", headers=auth_headers)
        data = r.json()
        assert data["has_openai"] is True
        assert data["has_virustotal"] is True
        assert data["has_abuseipdb"] is True
        assert data["has_shodan"] is True

    def test_clear_key_by_setting_empty(self, client, auth_headers):
        client.put("/api/v1/settings", json={"groq_api_key": "gsk_test"}, headers=auth_headers)
        client.put("/api/v1/settings", json={"groq_api_key": ""}, headers=auth_headers)
        r = client.get("/api/v1/settings", headers=auth_headers)
        assert r.json()["has_groq"] is False

    def test_keys_isolated_per_user(self, client, auth_headers, second_user_headers):
        # user1 sets a key
        client.put(
            "/api/v1/settings",
            json={"groq_api_key": "user1_groq_key"},
            headers=auth_headers,
        )
        # user2 should NOT see user1's key
        r = client.get("/api/v1/settings", headers=second_user_headers)
        assert r.json()["has_groq"] is False

    def test_preferred_llm_validation(self, client, auth_headers):
        r = client.put(
            "/api/v1/settings",
            json={"preferred_llm": "invalid"},
            headers=auth_headers,
        )
        assert r.status_code == 422

    def test_set_preferred_llm(self, client, auth_headers):
        r = client.put(
            "/api/v1/settings",
            json={"preferred_llm": "groq"},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.json()["preferred_llm"] == "groq"

    def test_keys_encrypted_at_rest(self, client, auth_headers, temp_db):
        """Verify keys are encrypted before being stored in DB."""
        from app.services import crypto
        from app.models.models import UserSettings

        client.put(
            "/api/v1/settings",
            json={"groq_api_key": "plaintext_secret_key"},
            headers=auth_headers,
        )

        # Read raw from DB
        with temp_db() as db:
            row = db.query(UserSettings).first()
            assert row is not None
            # The stored value should NOT be the plaintext
            assert row.groq_api_key != "plaintext_secret_key"
            # But decryption should recover the plaintext
            assert crypto.decrypt(row.groq_api_key) == "plaintext_secret_key"
