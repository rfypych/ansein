"""Tests for the export endpoints."""
from __future__ import annotations

import json

import pytest


@pytest.fixture
def populated_investigation(client, auth_headers, investigation_id):
    """An investigation with sources + pipeline run."""
    client.post(
        f"/api/v1/ingest/{investigation_id}/sources",
        json={
            "source_type": "text",
            "title": "T",
            "content": (
                "APT29 used CozyDuke malware against targets in USA. "
                "IP 185.142.236.34 contacted bad-domain.com. "
                "Hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
            ),
        },
        headers=auth_headers,
    )
    client.post(f"/api/v1/investigations/{investigation_id}/pipeline", headers=auth_headers)
    return investigation_id


class TestJsonExport:
    def test_export_json(self, client, auth_headers, populated_investigation):
        r = client.get(
            f"/api/v1/export/{populated_investigation}/json", headers=auth_headers
        )
        assert r.status_code == 200
        data = r.json()
        assert data["investigation"]["id"] == populated_investigation
        assert isinstance(data["entities"], list)
        assert len(data["entities"]) > 0
        assert "exported_at" in data

    def test_export_json_nonexistent(self, client, auth_headers):
        r = client.get("/api/v1/export/99999/json", headers=auth_headers)
        assert r.status_code == 404

    def test_export_json_other_user_404(self, client, auth_headers, second_user_headers, populated_investigation):
        r = client.get(
            f"/api/v1/export/{populated_investigation}/json", headers=second_user_headers
        )
        assert r.status_code == 404


class TestStixExport:
    def test_export_stix(self, client, auth_headers, populated_investigation):
        r = client.get(
            f"/api/v1/export/{populated_investigation}/stix", headers=auth_headers
        )
        assert r.status_code == 200
        data = r.json()
        assert data["type"] == "bundle"
        assert isinstance(data["objects"], list)
        assert len(data["objects"]) > 0
        # Every object should have a valid STIX id
        for obj in data["objects"]:
            if "id" in obj:
                assert "--" in obj["id"]

    def test_export_stix_nonexistent(self, client, auth_headers):
        r = client.get("/api/v1/export/99999/stix", headers=auth_headers)
        assert r.status_code == 404


class TestPdfExport:
    def test_export_pdf(self, client, auth_headers, populated_investigation):
        r = client.get(
            f"/api/v1/export/{populated_investigation}/pdf", headers=auth_headers
        )
        assert r.status_code == 200
        assert r.headers["content-type"] == "application/pdf"
        assert len(r.content) > 1000  # PDFs have non-trivial size
        # PDF magic bytes
        assert r.content[:4] == b"%PDF"

    def test_export_pdf_nonexistent(self, client, auth_headers):
        r = client.get("/api/v1/export/99999/pdf", headers=auth_headers)
        assert r.status_code == 404

    def test_pdf_has_disposition_header(self, client, auth_headers, populated_investigation):
        r = client.get(
            f"/api/v1/export/{populated_investigation}/pdf", headers=auth_headers
        )
        assert "content-disposition" in {k.lower() for k in r.headers.keys()}
        assert "attachment" in r.headers["content-disposition"]
