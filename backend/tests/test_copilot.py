"""Tests for the copilot chat service."""
from __future__ import annotations

import pytest


class TestCopilotSessions:
    def test_create_session(self, client, auth_headers):
        r = client.post("/api/v1/copilot/sessions", headers=auth_headers)
        assert r.status_code == 201
        data = r.json()
        assert data["id"] > 0
        assert data["title"] == "New Chat"

    def test_list_sessions(self, client, auth_headers):
        for _ in range(3):
            client.post("/api/v1/copilot/sessions", headers=auth_headers)
        r = client.get("/api/v1/copilot/sessions", headers=auth_headers)
        assert r.status_code == 200
        assert len(r.json()) >= 3

    def test_delete_session(self, client, auth_headers):
        r = client.post("/api/v1/copilot/sessions", headers=auth_headers)
        sid = r.json()["id"]
        r2 = client.delete(f"/api/v1/copilot/sessions/{sid}", headers=auth_headers)
        assert r2.status_code == 200

    def test_delete_nonexistent_session(self, client, auth_headers):
        r = client.delete("/api/v1/copilot/sessions/99999", headers=auth_headers)
        assert r.status_code == 404

    def test_session_isolation(self, client, auth_headers, second_user_headers):
        r = client.post("/api/v1/copilot/sessions", headers=auth_headers)
        sid = r.json()["id"]
        # user2 should not be able to delete user1's session
        r2 = client.delete(f"/api/v1/copilot/sessions/{sid}", headers=second_user_headers)
        assert r2.status_code == 404

    def test_messages_initially_empty(self, client, auth_headers):
        r = client.post("/api/v1/copilot/sessions", headers=auth_headers)
        sid = r.json()["id"]
        r2 = client.get(f"/api/v1/copilot/sessions/{sid}/messages", headers=auth_headers)
        assert r2.status_code == 200
        assert r2.json() == []


class TestCopilotAsk:
    def test_ask_creates_session_if_not_provided(self, client, auth_headers):
        r = client.post(
            "/api/v1/copilot/ask",
            json={"message": "Hello"},
            headers=auth_headers,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["session_id"] > 0
        assert data["message"]["role"] == "assistant"
        # User message should also be in the session
        r2 = client.get(
            f"/api/v1/copilot/sessions/{data['session_id']}/messages",
            headers=auth_headers,
        )
        msgs = r2.json()
        assert any(m["role"] == "user" and m["content"] == "Hello" for m in msgs)
        assert any(m["role"] == "assistant" for m in msgs)

    def test_ask_with_existing_session(self, client, auth_headers):
        # Create session
        r = client.post("/api/v1/copilot/sessions", headers=auth_headers)
        sid = r.json()["id"]
        # Ask in existing session
        r2 = client.post(
            "/api/v1/copilot/ask",
            json={"session_id": sid, "message": "Question 1"},
            headers=auth_headers,
        )
        assert r2.status_code == 200
        assert r2.json()["session_id"] == sid

    def test_ask_with_nonexistent_session(self, client, auth_headers):
        """If session_id is provided but doesn't exist, return 404."""
        r = client.post(
            "/api/v1/copilot/ask",
            json={"session_id": 99999, "message": "x"},
            headers=auth_headers,
        )
        assert r.status_code == 404

    def test_ask_without_session_creates_new(self, client, auth_headers):
        """If session_id is None, a fresh session is created."""
        r = client.post(
            "/api/v1/copilot/ask",
            json={"message": "hello"},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.json()["session_id"] > 0

    def test_ask_with_invalid_session_other_user(self, client, auth_headers, second_user_headers):
        # user1 creates session
        r = client.post("/api/v1/copilot/sessions", headers=auth_headers)
        sid = r.json()["id"]
        # user2 tries to use user1's session
        r2 = client.post(
            "/api/v1/copilot/ask",
            json={"session_id": sid, "message": "x"},
            headers=second_user_headers,
        )
        # Should NOT succeed — return 404
        assert r2.status_code == 404

    def test_ask_empty_message_rejected(self, client, auth_headers):
        r = client.post(
            "/api/v1/copilot/ask",
            json={"message": ""},
            headers=auth_headers,
        )
        assert r.status_code == 422

    def test_ask_message_too_long_rejected(self, client, auth_headers):
        r = client.post(
            "/api/v1/copilot/ask",
            json={"message": "x" * 9000},
            headers=auth_headers,
        )
        assert r.status_code == 422

    def test_no_llm_returns_helpful_message(self, client, auth_headers):
        """Without any LLM key configured, copilot should explain — not crash."""
        r = client.post(
            "/api/v1/copilot/ask",
            json={"message": "Summarise the threat"},
            headers=auth_headers,
        )
        assert r.status_code == 200
        content = r.json()["message"]["content"]
        # Should mention API key configuration
        assert any(kw in content.lower() for kw in ["api key", "configure", "llm", "settings"])
