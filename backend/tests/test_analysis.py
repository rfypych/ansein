"""Tests for the analysis engine."""
from __future__ import annotations

import pytest

from app.engines.analysis import AnalysisEngine


@pytest.fixture
def engine():
    return AnalysisEngine()


class TestHeuristicAnalysis:
    def test_no_entities_low_severity(self, engine):
        result = engine.analyze([], {}, source_text="")
        assert result["severity_score"] == 0
        assert "narrative" in result
        assert isinstance(result["recommendations"], list)
        assert result["model_used"] == "heuristic"

    def test_threat_actor_bumps_severity(self, engine):
        entities = [{"entity_type": "threat_actor", "value": "APT29", "confidence": 0.9}]
        result = engine.analyze(entities, {})
        assert result["severity_score"] >= 15  # at least 15 from threat_actor

    def test_malware_contributes_to_severity(self, engine):
        entities = [{"entity_type": "malware", "value": "CozyDuke", "confidence": 0.9}]
        result = engine.analyze(entities, {})
        assert result["severity_score"] >= 10

    def test_vulnerability_adds_severity(self, engine):
        entities = [{"entity_type": "vulnerability", "value": "CVE-2024-1", "confidence": 0.9}]
        result = engine.analyze(entities, {})
        assert result["severity_score"] >= 8

    def test_actor_hypothesis_when_actor_present(self, engine):
        entities = [{"entity_type": "threat_actor", "value": "APT29", "confidence": 0.9}]
        result = engine.analyze(entities, {})
        assert result["actor_hypothesis"]["actor"] == "APT29"
        assert "motivation" in result["actor_hypothesis"]

    def test_no_actor_hypothesis_when_no_actor(self, engine):
        entities = [{"entity_type": "ioc_ip", "value": "1.1.1.1", "confidence": 0.9}]
        result = engine.analyze(entities, {})
        assert result["actor_hypothesis"] == {}

    def test_recommendations_generated(self, engine):
        entities = [
            {"entity_type": "ioc_hash", "value": "abc", "confidence": 0.9},
            {"entity_type": "ioc_ip", "value": "1.1.1.1", "confidence": 0.9},
            {"entity_type": "ioc_domain", "value": "bad.com", "confidence": 0.9},
            {"entity_type": "vulnerability", "value": "CVE-2024-1", "confidence": 0.9},
            {"entity_type": "malware", "value": "CozyDuke", "confidence": 0.9},
            {"entity_type": "threat_actor", "value": "APT29", "confidence": 0.9},
        ]
        result = engine.analyze(entities, {})
        recs = result["recommendations"]
        assert len(recs) >= 5
        assert any("hash" in r.lower() for r in recs)
        assert any("network" in r.lower() or "ip" in r.lower() for r in recs)
        assert any("patch" in r.lower() or "cve" in r.lower() for r in recs)

    def test_high_severity_escalation_recommendation(self, engine):
        entities = [
            {"entity_type": "threat_actor", "value": "APT29", "confidence": 0.9}
        ] * 5
        result = engine.analyze(entities, {})
        if result["severity_score"] >= 70:
            assert any("HIGH" in r for r in result["recommendations"])

    def test_severity_capped_at_100(self, engine):
        # Lots of every entity type
        entities = []
        for et in ["threat_actor", "malware", "vulnerability", "ioc_hash", "ioc_ip", "ioc_url"]:
            for i in range(20):
                entities.append({"entity_type": et, "value": f"{et}_{i}", "confidence": 0.9})
        result = engine.analyze(entities, {})
        assert result["severity_score"] <= 100

    def test_enrichment_malicious_bumps_severity(self, engine):
        entities = [{"entity_type": "ioc_ip", "value": "1.1.1.1", "confidence": 0.9}]
        enrichment = {"virustotal": {"malicious": 5}}
        result = engine.analyze(entities, enrichment)
        assert result["severity_score"] > 0

    def test_enrichment_abuse_score_bumps_severity(self, engine):
        entities = [{"entity_type": "ioc_ip", "value": "1.1.1.1", "confidence": 0.9}]
        enrichment = {"abuseipdb": {"abuse_score": 95}}
        result = engine.analyze(entities, enrichment)
        assert result["severity_score"] > 0

    def test_admiralty_code_returned(self, engine):
        result = engine.analyze([], {})
        assert "admiralty_code" in result
        assert result["admiralty_code"]  # not empty

    def test_confidence_in_range(self, engine):
        result = engine.analyze([], {})
        assert 0.0 <= result["confidence"] <= 1.0
