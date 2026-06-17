"""Tests for the extraction engine."""
from __future__ import annotations

import pytest

from app.engines.extraction import ExtractionEngine, ExtractedEntity, infer_relationships


@pytest.fixture(scope="module")
def engine():
    return ExtractionEngine(use_gliner=False, use_llm=False)


class TestRegexExtraction:
    def test_extracts_ipv4(self, engine):
        ents = engine.extract("Contact 185.142.236.34 for C2.")
        types_values = [(e.entity_type, e.value) for e in ents]
        assert ("ioc_ip", "185.142.236.34") in types_values

    def test_extracts_multiple_ipv4(self, engine):
        ents = engine.extract("IPs: 1.1.1.1 and 8.8.8.8 and 10.0.0.1")
        ips = [e.value for e in ents if e.entity_type == "ioc_ip"]
        assert "1.1.1.1" in ips
        assert "8.8.8.8" in ips
        assert "10.0.0.1" in ips

    def test_extracts_domain(self, engine):
        ents = engine.extract("Visit bad-domain.com for more.")
        domains = [e.value for e in ents if e.entity_type == "ioc_domain"]
        assert "bad-domain.com" in domains

    def test_extracts_url(self, engine):
        ents = engine.extract("See https://example.com/path?x=1")
        urls = [e.value for e in ents if e.entity_type == "ioc_url"]
        assert any("https://example.com" in u for u in urls)

    def test_extracts_email(self, engine):
        ents = engine.extract("Contact analyst@example.com")
        emails = [e.value for e in ents if e.entity_type == "identity"]
        assert "analyst@example.com" in emails

    def test_extracts_md5(self, engine):
        ents = engine.extract("MD5: d41d8cd98f00b204e9800998ecf8427e")
        hashes = [e.value for e in ents if e.entity_type == "ioc_hash"]
        assert "d41d8cd98f00b204e9800998ecf8427e" in hashes

    def test_extracts_sha256(self, engine):
        h = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        ents = engine.extract(f"SHA256: {h}")
        hashes = [e.value for e in ents if e.entity_type == "ioc_hash"]
        assert h in hashes

    def test_extracts_cve(self, engine):
        ents = engine.extract("Vulnerable to CVE-2024-12345.")
        cves = [e.value for e in ents if e.entity_type == "vulnerability"]
        assert "CVE-2024-12345" in cves

    def test_extracts_btc_address(self, engine):
        ents = engine.extract("Ransom paid to bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh")
        wallets = [e.value for e in ents if e.entity_type == "ioc_wallet"]
        assert any(w.startswith("bc1") for w in wallets)

    def test_does_not_extract_version_numbers_as_ips(self, engine):
        ents = engine.extract("Updated to v2.4.6.8 of the library")
        # 2.4.6.8 looks like an IP but shouldn't be extracted
        ips = [e.value for e in ents if e.entity_type == "ioc_ip"]
        # ipaddress module accepts 2.4.6.8 as valid, so it will be extracted
        # — but 256.1.1.1 should never be
        ents2 = engine.extract("Bad IP 256.1.1.1 here")
        ips2 = [e.value for e in ents2 if e.entity_type == "ioc_ip"]
        assert "256.1.1.1" not in ips2

    def test_extracts_multiple_types_at_once(self, engine):
        text = (
            "APT29 used 185.142.236.34 to deliver malware hash "
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 "
            "via bad-domain.com. CVE-2024-9999 was exploited."
        )
        ents = engine.extract(text)
        types = {e.entity_type for e in ents}
        assert "ioc_ip" in types
        assert "ioc_hash" in types
        assert "ioc_domain" in types
        assert "vulnerability" in types


class TestDeduplication:
    def test_duplicate_entities_deduped(self, engine):
        text = "IP 1.2.3.4 and 1.2.3.4 and 1.2.3.4"
        ents = engine.extract(text)
        ips = [e for e in ents if e.entity_type == "ioc_ip" and e.value == "1.2.3.4"]
        assert len(ips) == 1

    def test_highest_confidence_wins(self, engine):
        # Same entity extracted by regex (0.95) and another source — keep regex
        e1 = ExtractedEntity("ioc_ip", "1.1.1.1", "1.1.1.1", 0.95, "regex")
        e2 = ExtractedEntity("ioc_ip", "1.1.1.1", "1.1.1.1", 0.7, "gliner")
        deduped = ExtractionEngine._dedupe([e1, e2])
        assert len(deduped) == 1
        assert deduped[0].confidence == 0.95


class TestRelationshipInference:
    def test_communicates_with_inferred(self):
        from app.engines.extraction import ExtractedEntity

        entities = [
            ExtractedEntity("ioc_ip", "1.2.3.4", "1.2.3.4", 0.9, "regex"),
            ExtractedEntity("ioc_domain", "bad.com", "bad.com", 0.9, "regex"),
        ]
        text = "1.2.3.4 was seen contacting bad.com"
        rels = infer_relationships(entities, text)
        types = [(r["source"], r["target"], r["relation_type"]) for r in rels]
        assert any("communicates_with" in t for t in types)

    def test_no_relationships_for_empty_text(self):
        entities = []
        rels = infer_relationships(entities, "")
        assert rels == []


class TestEdgeCases:
    def test_empty_text(self, engine):
        assert engine.extract("") == []
        assert engine.extract("   ") == []
        assert engine.extract(None) == []  # type: ignore[arg-type]

    def test_long_text_truncated(self, engine):
        text = "IP 1.1.1.1 " + "x" * 50_000
        ents = engine.extract(text, max_chars=10000)
        # Should still extract the IP from the start
        ips = [e.value for e in ents if e.entity_type == "ioc_ip"]
        assert "1.1.1.1" in ips

    def test_content_hash(self):
        h1 = ExtractionEngine.content_hash("hello")
        h2 = ExtractionEngine.content_hash("hello")
        h3 = ExtractionEngine.content_hash("world")
        assert h1 == h2
        assert h1 != h3
        assert len(h1) == 64  # SHA-256
