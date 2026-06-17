"""Tests for investigation CRUD + pipeline."""
from __future__ import annotations

import pytest


class TestInvestigationCRUD:
    def test_create_investigation(self, client, auth_headers):
        r = client.post(
            "/api/v1/investigations",
            json={"title": "My Case", "description": "desc", "tags": ["a", "b"]},
            headers=auth_headers,
        )
        assert r.status_code == 201
        data = r.json()
        assert data["title"] == "My Case"
        assert data["description"] == "desc"
        assert data["tags"] == ["a", "b"]
        assert data["status"] == "pending"
        assert data["severity_score"] == 0.0
        assert data["id"] > 0

    def test_create_investigation_requires_title(self, client, auth_headers):
        r = client.post(
            "/api/v1/investigations",
            json={"title": "", "description": "x"},
            headers=auth_headers,
        )
        assert r.status_code == 422

    def test_list_investigations(self, client, auth_headers):
        # Create 3
        for i in range(3):
            client.post(
                "/api/v1/investigations",
                json={"title": f"Case {i}", "description": "", "tags": []},
                headers=auth_headers,
            )
        r = client.get("/api/v1/investigations", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["total"] >= 3
        assert len(data["items"]) >= 3

    def test_get_investigation(self, client, auth_headers, investigation_id):
        r = client.get(f"/api/v1/investigations/{investigation_id}", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["id"] == investigation_id

    def test_get_nonexistent_investigation(self, client, auth_headers):
        r = client.get("/api/v1/investigations/99999", headers=auth_headers)
        assert r.status_code == 404

    def test_update_investigation(self, client, auth_headers, investigation_id):
        r = client.patch(
            f"/api/v1/investigations/{investigation_id}",
            json={"title": "Updated", "tags": ["new", "tags"]},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.json()["title"] == "Updated"
        assert r.json()["tags"] == ["new", "tags"]

    def test_delete_investigation(self, client, auth_headers, investigation_id):
        r = client.delete(f"/api/v1/investigations/{investigation_id}", headers=auth_headers)
        assert r.status_code == 200
        # Confirm deleted
        r2 = client.get(f"/api/v1/investigations/{investigation_id}", headers=auth_headers)
        assert r2.status_code == 404

    def test_delete_nonexistent(self, client, auth_headers):
        r = client.delete("/api/v1/investigations/99999", headers=auth_headers)
        assert r.status_code == 404


class TestMultiTenantIsolation:
    def test_user_cannot_see_others_investigations(self, client, auth_headers, second_user_headers):
        # user1 creates an investigation
        r = client.post(
            "/api/v1/investigations",
            json={"title": "User1 secret", "description": "private"},
            headers=auth_headers,
        )
        inv_id = r.json()["id"]
        # user2 should NOT see it in their list
        r2 = client.get("/api/v1/investigations", headers=second_user_headers)
        ids = [i["id"] for i in r2.json()["items"]]
        assert inv_id not in ids

    def test_user_cannot_access_others_investigation(self, client, auth_headers, second_user_headers):
        r = client.post(
            "/api/v1/investigations",
            json={"title": "User1 secret"},
            headers=auth_headers,
        )
        inv_id = r.json()["id"]
        # user2 direct access → 404
        r2 = client.get(f"/api/v1/investigations/{inv_id}", headers=second_user_headers)
        assert r2.status_code == 404

    def test_user_cannot_delete_others_investigation(self, client, auth_headers, second_user_headers):
        r = client.post(
            "/api/v1/investigations",
            json={"title": "User1 secret"},
            headers=auth_headers,
        )
        inv_id = r.json()["id"]
        r2 = client.delete(f"/api/v1/investigations/{inv_id}", headers=second_user_headers)
        assert r2.status_code == 404


class TestSources:
    def test_add_text_source(self, client, auth_headers, investigation_id):
        r = client.post(
            f"/api/v1/ingest/{investigation_id}/sources",
            json={
                "source_type": "text",
                "title": "Blog post",
                "content": "APT29 used CozyDuke malware against targets.",
            },
            headers=auth_headers,
        )
        assert r.status_code == 201
        data = r.json()
        assert data["source_type"] == "text"
        assert data["title"] == "Blog post"
        assert data["size_bytes"] > 0
        assert len(data["content_hash"]) == 64  # SHA-256

    def test_list_sources(self, client, auth_headers, investigation_id):
        for i in range(3):
            client.post(
                f"/api/v1/ingest/{investigation_id}/sources",
                json={"source_type": "text", "title": f"S{i}", "content": f"content {i}"},
                headers=auth_headers,
            )
        r = client.get(f"/api/v1/ingest/{investigation_id}/sources", headers=auth_headers)
        assert r.status_code == 200
        assert len(r.json()) == 3

    def test_add_source_to_nonexistent_investigation(self, client, auth_headers):
        r = client.post(
            "/api/v1/ingest/99999/sources",
            json={"source_type": "text", "content": "x"},
            headers=auth_headers,
        )
        assert r.status_code == 404

    def test_upload_file(self, client, auth_headers, investigation_id):
        import io

        content = b"APT29 targeting with 8.8.8.8 and example.com"
        files = {"file": ("report.txt", io.BytesIO(content), "text/plain")}
        r = client.post(
            f"/api/v1/ingest/{investigation_id}/sources/upload",
            files=files,
            data={"title": "Uploaded"},
            headers=auth_headers,
        )
        assert r.status_code == 201
        assert r.json()["title"] == "Uploaded"
        assert r.json()["size_bytes"] > 0


class TestPipeline:
    SAMPLE_TEXT = (
        "APT29 has been observed using the CozyDuke malware family against "
        "Western government targets in USA. The IP 185.142.236.34 was seen "
        "communicating with bad-domain.com. "
        "File hash: 4d2c6b6f9c3f9a8e7b1d5e8a4c3b2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c"
    )

    def test_pipeline_extracts_iocs(self, client, auth_headers, investigation_id):
        # Add source
        client.post(
            f"/api/v1/ingest/{investigation_id}/sources",
            json={"source_type": "text", "title": "T", "content": self.SAMPLE_TEXT},
            headers=auth_headers,
        )
        # Run pipeline
        r = client.post(f"/api/v1/investigations/{investigation_id}/pipeline", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["status"] in ("completed", "failed")

        # Check entities
        r2 = client.get(f"/api/v1/entities/{investigation_id}", headers=auth_headers)
        assert r2.status_code == 200
        entities = r2.json()
        values = [e["value"].lower() for e in entities]
        assert "185.142.236.34" in values
        assert "bad-domain.com" in values
        # SHA-256 hash
        assert any(v.startswith("4d2c6b6f") for v in values)

    def test_pipeline_with_empty_sources(self, client, auth_headers, investigation_id):
        # No sources added — pipeline should not crash
        r = client.post(f"/api/v1/investigations/{investigation_id}/pipeline", headers=auth_headers)
        assert r.status_code == 200
        # Should stay pending (no text to extract from)
        assert r.json()["status"] == "pending"

    def test_pipeline_idempotent(self, client, auth_headers, investigation_id):
        # Add source
        client.post(
            f"/api/v1/ingest/{investigation_id}/sources",
            json={"source_type": "text", "content": "IP 1.2.3.4 contacted domain example.com"},
            headers=auth_headers,
        )
        # Run twice
        client.post(f"/api/v1/investigations/{investigation_id}/pipeline", headers=auth_headers)
        r = client.post(f"/api/v1/investigations/{investigation_id}/pipeline", headers=auth_headers)
        assert r.status_code == 200

        # Entities should not be duplicated
        r2 = client.get(f"/api/v1/entities/{investigation_id}", headers=auth_headers)
        entities = r2.json()
        values = [(e["entity_type"], e["value"]) for e in entities]
        assert len(values) == len(set(values)), "Duplicate entities detected"

    def test_pipeline_generates_analysis(self, client, auth_headers, investigation_id):
        client.post(
            f"/api/v1/ingest/{investigation_id}/sources",
            json={"source_type": "text", "content": self.SAMPLE_TEXT},
            headers=auth_headers,
        )
        client.post(f"/api/v1/investigations/{investigation_id}/pipeline", headers=auth_headers)

        r = client.get(f"/api/v1/analysis/{investigation_id}", headers=auth_headers)
        assert r.status_code == 200
        a = r.json()
        assert "narrative" in a
        assert isinstance(a["recommendations"], list)
        assert 0 <= a["severity_score"] <= 100
        assert a["admiralty_code"]
