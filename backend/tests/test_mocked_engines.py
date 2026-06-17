"""Mocked tests for LLM, enrichment, and copilot paths that hit external APIs."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


# ---------------------------------------------------------- LLM
class TestLLMProvider:
    def test_is_available_returns_false_without_keys(self, monkeypatch):
        from app.core.config import get_settings
        from app.engines import llm

        s = get_settings()
        monkeypatch.setattr(s, "groq_api_key", "")
        monkeypatch.setattr(s, "openai_api_key", "")
        assert llm.is_available() is False

    def test_is_available_returns_true_with_groq(self, monkeypatch):
        from app.core.config import get_settings
        from app.engines import llm

        s = get_settings()
        monkeypatch.setattr(s, "groq_api_key", "gsk_test")
        assert llm.is_available() is True

    def test_is_available_returns_true_with_openai(self, monkeypatch):
        from app.core.config import get_settings
        from app.engines import llm

        s = get_settings()
        monkeypatch.setattr(s, "groq_api_key", "")
        monkeypatch.setattr(s, "openai_api_key", "sk_test")
        assert llm.is_available() is True

    def test_resolve_provider_raises_when_none(self, monkeypatch):
        from app.core.config import get_settings
        from app.engines import llm

        s = get_settings()
        monkeypatch.setattr(s, "groq_api_key", "")
        monkeypatch.setattr(s, "openai_api_key", "")
        with pytest.raises(llm.LLMUnavailable):
            llm._resolve_provider()

    def test_chat_with_user_keys_uses_groq_when_present(self):
        from app.engines import llm

        # Patch OpenAI client so no real HTTP call is made
        mock_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.choices = [MagicMock(message=MagicMock(content="Hello from Groq"))]
        mock_resp.usage = MagicMock(prompt_tokens=10, completion_tokens=5)
        mock_client.chat.completions.create.return_value = mock_resp

        with patch("app.engines.llm.OpenAI", return_value=mock_client):
            resp = llm.chat(
                [{"role": "user", "content": "hi"}],
                user_keys={"groq_api_key": "gsk_x"},
            )
        assert resp.content == "Hello from Groq"
        assert resp.provider == "groq"
        assert resp.tokens_in == 10
        assert resp.tokens_out == 5

    def test_chat_with_user_keys_falls_back_to_openai(self):
        from app.engines import llm

        mock_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.choices = [MagicMock(message=MagicMock(content="OpenAI reply"))]
        mock_resp.usage = MagicMock(prompt_tokens=8, completion_tokens=3)
        mock_client.chat.completions.create.return_value = mock_resp

        with patch("app.engines.llm.OpenAI", return_value=mock_client):
            resp = llm.chat(
                [{"role": "user", "content": "hi"}],
                user_keys={"openai_api_key": "sk_x"},  # no groq
            )
        assert resp.content == "OpenAI reply"
        assert resp.provider == "openai"

    def test_chat_raises_when_no_user_keys(self):
        from app.engines import llm

        with pytest.raises(llm.LLMUnavailable):
            llm.chat([{"role": "user", "content": "hi"}], user_keys={})


# ---------------------------------------------------------- Extraction (LLM)
class TestLLMExtraction:
    def test_llm_pass_extracts_entities_from_json(self, monkeypatch):
        from app.engines import extraction

        # Mock LLM response with valid JSON
        mock_resp = MagicMock()
        mock_resp.content = (
            '```json\n'
            '[{"entity_type": "threat_actor", "value": "APT29", "confidence": 0.9}, '
            '{"entity_type": "malware", "value": "CozyDuke", "confidence": 0.85}]\n'
            '```'
        )
        mock_resp.tokens_in = 50
        mock_resp.tokens_out = 30
        mock_resp.model = "groq-test"

        # Force llm to be "available"
        with patch("app.engines.llm.is_available", return_value=True), \
             patch("app.engines.llm.chat", return_value=mock_resp):
            eng = extraction.ExtractionEngine(use_gliner=False, use_llm=True)
            ents = eng.extract(
                "APT29 used CozyDuke malware against Western government targets in Europe and North America recently.",
                user_keys={"groq_api_key": "x"},
            )
        types_values = [(e.entity_type, e.value) for e in ents]
        assert ("threat_actor", "APT29") in types_values
        assert ("malware", "CozyDuke") in types_values
        # source_method should be llm for these
        llm_ents = [e for e in ents if e.source_method == "llm"]
        assert len(llm_ents) >= 2

    def test_llm_pass_handles_invalid_json_gracefully(self):
        from app.engines import extraction

        mock_resp = MagicMock()
        mock_resp.content = "This is not JSON at all"
        mock_resp.tokens_in = 10
        mock_resp.tokens_out = 5
        mock_resp.model = "groq-test"

        with patch("app.engines.llm.is_available", return_value=True), \
             patch("app.engines.llm.chat", return_value=mock_resp):
            eng = extraction.ExtractionEngine(use_gliner=False, use_llm=True)
            # Should not crash, just return regex-only results
            ents = eng.extract(
                "IP 1.2.3.4 contacted bad-domain.com",
                user_keys={"groq_api_key": "x"},
            )
        # Regex should still have caught these
        values = [e.value for e in ents]
        assert "1.2.3.4" in values
        assert "bad-domain.com" in values

    def test_llm_pass_handles_exception(self):
        from app.engines import extraction

        with patch("app.engines.llm.is_available", return_value=True), \
             patch("app.engines.llm.chat", side_effect=Exception("Network error")):
            eng = extraction.ExtractionEngine(use_gliner=False, use_llm=True)
            ents = eng.extract(
                "IP 1.2.3.4",
                user_keys={"groq_api_key": "x"},
            )
        # Should still get regex-extracted entity
        assert any(e.value == "1.2.3.4" for e in ents)

    def test_llm_pass_skipped_for_short_text(self):
        """Short text shouldn't waste an LLM call."""
        from app.engines import extraction

        with patch("app.engines.llm.is_available", return_value=True), \
             patch("app.engines.llm.chat") as mock_chat:
            eng = extraction.ExtractionEngine(use_gliner=False, use_llm=True)
            eng.extract("short", user_keys={"groq_api_key": "x"})
            assert mock_chat.call_count == 0  # No LLM call for short text


# ---------------------------------------------------------- Analysis (LLM)
class TestLLMAnalysis:
    def test_llm_analysis_with_mock_response(self):
        from app.engines import analysis

        mock_resp = MagicMock()
        mock_resp.content = (
            '{"narrative": "APT29 is a sophisticated threat actor.", '
            '"actor_hypothesis": {"actor": "APT29", "confidence": 0.8, '
            '"motivation": "espionage", "origin": "Russia", "reasoning": "TTPs match."}, '
            '"severity_score": 75, '
            '"recommendations": ["Block IOCs", "Patch CVEs"]}'
        )
        mock_resp.tokens_in = 100
        mock_resp.tokens_out = 80
        mock_resp.model = "groq-test"

        with patch("app.engines.llm.is_available", return_value=True), \
             patch("app.engines.llm.chat", return_value=mock_resp):
            eng = analysis.AnalysisEngine()
            result = eng.analyze(
                [{"entity_type": "threat_actor", "value": "APT29"}],
                {},
                user_keys={"groq_api_key": "x"},
            )
        assert "APT29" in result["narrative"]
        assert result["severity_score"] == 75
        assert result["actor_hypothesis"]["actor"] == "APT29"
        assert "Block IOCs" in result["recommendations"]
        assert result["model_used"] == "groq-test"
        assert result["tokens_used"] == 180

    def test_llm_analysis_falls_back_on_invalid_json(self):
        from app.engines import analysis

        mock_resp = MagicMock()
        mock_resp.content = "Not JSON"
        mock_resp.tokens_in = 10
        mock_resp.tokens_out = 5
        mock_resp.model = "groq-test"

        with patch("app.engines.llm.is_available", return_value=True), \
             patch("app.engines.llm.chat", return_value=mock_resp):
            eng = analysis.AnalysisEngine()
            result = eng.analyze(
                [{"entity_type": "ioc_ip", "value": "1.1.1.1"}],
                {},
                user_keys={"groq_api_key": "x"},
            )
        # Should fall back but keep LLM's narrative text
        assert "narrative" in result
        assert result["severity_score"] == 0  # default when parse fails

    def test_llm_analysis_falls_back_on_exception(self):
        from app.engines import analysis

        with patch("app.engines.llm.is_available", return_value=True), \
             patch("app.engines.llm.chat", side_effect=Exception("LLM down")):
            eng = analysis.AnalysisEngine()
            result = eng.analyze(
                [{"entity_type": "ioc_ip", "value": "1.1.1.1"}],
                {},
                user_keys={"groq_api_key": "x"},
            )
        # Should use heuristic
        assert result["model_used"] == "heuristic"


# ---------------------------------------------------------- Copilot (LLM)
class TestCopilotLLM:
    def test_copilot_uses_llm_when_available(self):
        from app.engines.copilot import CopilotEngine

        mock_resp = MagicMock()
        mock_resp.content = "Based on the investigation, APT29 is the likely actor."
        mock_resp.tokens_in = 80
        mock_resp.tokens_out = 30
        mock_resp.model = "groq-test"

        with patch("app.engines.llm.is_available", return_value=True), \
             patch("app.engines.llm.chat", return_value=mock_resp):
            eng = CopilotEngine(user_keys={"groq_api_key": "x"})
            result = eng.chat(
                context="Investigation: APT29",
                history=[],
                user_message="Who is the actor?",
            )
        assert "APT29" in result["content"]
        assert result["tokens_used"] == 110
        assert result["model"] == "groq-test"

    def test_copilot_returns_helpful_message_without_llm(self):
        from app.engines.copilot import CopilotEngine

        with patch("app.engines.llm.is_available", return_value=False):
            eng = CopilotEngine(user_keys={})
            result = eng.chat(
                context="",
                history=[],
                user_message="What is the threat?",
            )
        assert "api key" in result["content"].lower() or "llm" in result["content"].lower()
        assert result["tokens_used"] == 0
        assert result["model"] == "none"

    def test_copilot_handles_llm_exception(self):
        from app.engines.copilot import CopilotEngine

        with patch("app.engines.llm.is_available", return_value=True), \
             patch("app.engines.llm.chat", side_effect=Exception("Network error")):
            eng = CopilotEngine(user_keys={"groq_api_key": "x"})
            result = eng.chat(
                context="",
                history=[],
                user_message="test",
            )
        assert "error" in result["content"].lower()

    def test_copilot_build_context_includes_entities(self):
        from app.engines.copilot import CopilotEngine

        # Mock entities
        class MockEntity:
            def __init__(self, entity_type, value, confidence):
                self.entity_type = entity_type
                self.value = value
                self.confidence = confidence

        entities = [
            MockEntity("threat_actor", "APT29", 0.9),
            MockEntity("ioc_ip", "1.2.3.4", 0.95),
        ]
        eng = CopilotEngine()
        ctx = eng.build_context(
            title="Test",
            severity_score=75,
            entities=entities,
            relationships=[],
            enrichment={},
            narrative="Test narrative",
            source_text="Source material here",
        )
        assert "APT29" in ctx
        assert "1.2.3.4" in ctx
        assert "Test narrative" in ctx


# ---------------------------------------------------------- Enrichment (HTTP)
class TestEnrichmentHTTP:
    def test_vt_request_handles_404(self):
        """A 404 from VirusTotal should return empty dict (not crash)."""
        from app.engines import enrichment

        eng = enrichment.EnrichmentEngine(user_keys={"virustotal_api_key": "fake"})
        # Mock httpx.Client to return 404
        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_response.raise_for_status = MagicMock()

        mock_client = MagicMock()
        mock_client.__enter__.return_value = mock_client
        mock_client.__exit__.return_value = False
        mock_client.get.return_value = mock_response

        with patch("app.engines.enrichment.httpx.Client", return_value=mock_client):
            result = eng._vt_request("/ip_addresses/1.1.1.1")
        assert result == {}

    def test_vt_request_handles_exception(self):
        from app.engines import enrichment

        eng = enrichment.EnrichmentEngine(user_keys={"virustotal_api_key": "fake"})

        with patch("app.engines.enrichment.httpx.Client", side_effect=Exception("Network")):
            result = eng._vt_request("/ip_addresses/1.1.1.1")
        assert result == {}

    def test_abuseipdb_request_handles_exception(self):
        from app.engines import enrichment

        eng = enrichment.EnrichmentEngine(user_keys={"abuseipdb_api_key": "fake"})

        with patch("app.engines.enrichment.httpx.Client", side_effect=Exception("Network")):
            result = eng._abuseipdb_request("1.1.1.1")
        assert result == {}

    def test_shodan_request_handles_exception(self):
        from app.engines import enrichment

        eng = enrichment.EnrichmentEngine(user_keys={"shodan_api_key": "fake"})

        with patch("app.engines.enrichment.httpx.Client", side_effect=Exception("Network")):
            result = eng._shodan_request("shodan/host/1.1.1.1")
        assert result == {}

    def test_enrich_ip_with_mocked_vt(self):
        """Full enrich_ip path with mocked VirusTotal response."""
        from app.engines import enrichment

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "data": {
                "attributes": {
                    "reputation": -5,
                    "last_analysis_stats": {"malicious": 12, "suspicious": 3, "harmless": 70},
                    "country": "RU",
                    "as_owner": "AS-MALICIOUS",
                }
            }
        }

        mock_client = MagicMock()
        mock_client.__enter__.return_value = mock_client
        mock_client.__exit__.return_value = False
        mock_client.get.return_value = mock_response

        eng = enrichment.EnrichmentEngine(user_keys={"virustotal_api_key": "fake"})
        with patch("app.engines.enrichment.httpx.Client", return_value=mock_client):
            result = eng.enrich("ioc_ip", "1.1.1.1")
        assert "virustotal" in result
        assert result["virustotal"]["malicious"] == 12
        assert result["virustotal"]["country"] == "RU"

    def test_enrich_url_with_mocked_vt(self):
        from app.engines import enrichment

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "data": {
                "attributes": {
                    "last_analysis_stats": {"malicious": 5, "suspicious": 1, "harmless": 80},
                    "title": "Bad Page",
                }
            }
        }

        mock_client = MagicMock()
        mock_client.__enter__.return_value = mock_client
        mock_client.__exit__.return_value = False
        mock_client.get.return_value = mock_response

        eng = enrichment.EnrichmentEngine(user_keys={"virustotal_api_key": "fake"})
        with patch("app.engines.enrichment.httpx.Client", return_value=mock_client):
            result = eng.enrich("ioc_url", "https://bad.example.com")
        assert "virustotal" in result
        assert result["virustotal"]["malicious"] == 5

    def test_enrich_hash_with_mocked_vt(self):
        from app.engines import enrichment

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "data": {
                "attributes": {
                    "last_analysis_stats": {"malicious": 50, "suspicious": 5, "harmless": 25},
                    "type_description": "Win32 EXE",
                    "popular_threat_classification": {
                        "popular_threat_name": [{"value": "Trojan.CozyDuke"}]
                    },
                    "names": ["cozy.exe", "malware.dll"],
                }
            }
        }

        mock_client = MagicMock()
        mock_client.__enter__.return_value = mock_client
        mock_client.__exit__.return_value = False
        mock_client.get.return_value = mock_response

        eng = enrichment.EnrichmentEngine(user_keys={"virustotal_api_key": "fake"})
        with patch("app.engines.enrichment.httpx.Client", return_value=mock_client):
            h = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
            result = eng.enrich("ioc_hash", h)
        assert "virustotal" in result
        assert result["virustotal"]["malicious"] == 50
        assert result["virustotal"]["type_description"] == "Win32 EXE"
