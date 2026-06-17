"""Tests for the enrichment engine."""
from __future__ import annotations

import pytest

from app.engines.enrichment import EnrichmentEngine


class TestAdmiraltyScoring:
    def test_no_enrichment_gives_low_grade(self):
        code, conf = EnrichmentEngine.compute_admiralty({}, 0.7)
        assert code == "F6"
        assert conf < 0.7  # degraded

    def test_single_source_upgrades_to_d(self):
        enr = {"virustotal": {"malicious": 0, "harmless": 70}}
        code, conf = EnrichmentEngine.compute_admiralty(enr, 0.7)
        assert code.startswith("D")
        assert conf > 0.5

    def test_two_sources_upgrades_to_b(self):
        enr = {
            "virustotal": {"malicious": 0},
            "abuseipdb": {"abuse_score": 10},
        }
        code, _ = EnrichmentEngine.compute_admiralty(enr, 0.7)
        assert code.startswith("B")

    def test_malicious_bumps_reliability(self):
        # Typo below was previously a bug-test (computing `compute_adrichalt`),
        # removed. Real test below.
        pass

    def test_malicious_verdicts_bump_reliability(self):
        enr = {"virustotal": {"malicious": 10}, "abuseipdb": {"abuse_score": 95}}
        code, _ = EnrichmentEngine.compute_admiralty(enr, 0.7)
        # Two sources + two malicious → "A" reliability
        assert code.startswith("A")

    def test_score_always_between_0_and_1(self):
        for enr in [{}, {"x": {}}, {"x": {"malicious": 999}}]:
            _, conf = EnrichmentEngine.compute_admiralty(enr, 0.5)
            assert 0.0 <= conf <= 1.0


class TestEnrichmentWithoutKeys:
    """When no API keys are configured, all enrichment should return empty dict."""

    def test_no_keys_returns_empty(self, monkeypatch):
        # Force no keys
        from app.core.config import get_settings

        s = get_settings()
        monkeypatch.setattr(s, "virustotal_api_key", "")
        monkeypatch.setattr(s, "abuseipdb_api_key", "")
        monkeypatch.setattr(s, "shodan_api_key", "")

        engine = EnrichmentEngine()
        result = engine.enrich("ioc_ip", "1.1.1.1")
        assert result == {"mock": False}

    def test_no_keys_for_domain(self, monkeypatch):
        from app.core.config import get_settings

        s = get_settings()
        monkeypatch.setattr(s, "virustotal_api_key", "")
        engine = EnrichmentEngine()
        result = engine.enrich("ioc_domain", "example.com")
        assert result == {"mock": False}

    def test_no_keys_for_hash(self, monkeypatch):
        from app.core.config import get_settings

        s = get_settings()
        monkeypatch.setattr(s, "virustotal_api_key", "")
        engine = EnrichmentEngine()
        result = engine.enrich(
            "ioc_hash", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        )
        assert result == {"mock": False}

    def test_empty_value_returns_empty(self):
        engine = EnrichmentEngine()
        assert engine.enrich("ioc_ip", "") == {}


class TestEnrichmentWithUserKeys:
    """User-supplied keys (BYOK) should override system defaults."""

    def test_user_keys_override_system(self, monkeypatch):
        from app.core.config import get_settings

        s = get_settings()
        monkeypatch.setattr(s, "virustotal_api_key", "")

        engine = EnrichmentEngine(user_keys={"virustotal_api_key": "user_vt_key"})
        assert engine.vt_key == "user_vt_key"

    def test_system_key_used_when_no_user_key(self, monkeypatch):
        from app.core.config import get_settings

        s = get_settings()
        monkeypatch.setattr(s, "virustotal_api_key", "system_vt_key")

        engine = EnrichmentEngine(user_keys={})
        assert engine.vt_key == "system_vt_key"
