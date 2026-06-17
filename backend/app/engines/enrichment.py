"""
Threat intel enrichment. Calls real APIs only — no mocks.

Each provider returns a normalised dict so the analysis layer can treat
them uniformly. When a key is missing, the method returns {} (empty) —
this propagates upstream as "no enrichment data" rather than fake data.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

import httpx

from app.core.config import get_settings

log = logging.getLogger(__name__)

VT_BASE = "https://www.virustotal.com/api/v3"
ABUSE_BASE = "https://api.abuseipdb.com/api/v2"
SHODAN_BASE = "https://api.shodan.io"


@dataclass
class EnrichmentResult:
    provider: str
    data: dict
    success: bool
    error: str = ""


class EnrichmentEngine:
    def __init__(self, user_keys: Optional[dict] = None, timeout: float = 10.0):
        s = get_settings()
        self.user_keys = user_keys or {}
        self.timeout = timeout

        # Resolve active keys (user BYOK overrides system defaults)
        self.vt_key = self.user_keys.get("virustotal_api_key") or s.virustotal_api_key
        self.abuse_key = self.user_keys.get("abuseipdb_api_key") or s.abuseipdb_api_key
        self.shodan_key = self.user_keys.get("shodan_api_key") or s.shodan_api_key

    # ------------------------------------------------------- dispatch
    def enrich(self, entity_type: str, value: str) -> dict:
        """Return a merged dict of enrichment data across providers."""
        etype = entity_type.lower()
        v = value.strip()
        if not v:
            return {}

        result: dict = {"mock": False}

        if etype == "ioc_ip":
            result.update(self._enrich_ip(v))
        elif etype == "ioc_domain":
            result.update(self._enrich_domain(v))
        elif etype == "ioc_hash":
            result.update(self._enrich_hash(v))
        elif etype == "ioc_url":
            result.update(self._enrich_url(v))
        return result

    # ------------------------------------------------------ VirusTotal
    def _enrich_ip(self, ip: str) -> dict:
        out: dict = {}
        if self.vt_key:
            r = self._vt_request(f"/ip_addresses/{ip}")
            if r:
                attrs = r.get("attributes", {})
                out["virustotal"] = {
                    "reputation": attrs.get("reputation", 0),
                    "malicious": attrs.get("last_analysis_stats", {}).get("malicious", 0),
                    "suspicious": attrs.get("last_analysis_stats", {}).get("suspicious", 0),
                    "harmless": attrs.get("last_analysis_stats", {}).get("harmless", 0),
                    "country": attrs.get("country", ""),
                    "as_owner": attrs.get("as_owner", ""),
                }
        if self.abuse_key:
            r = self._abuseipdb_request(ip)
            if r:
                out["abuseipdb"] = r
        if self.shodan_key:
            r = self._shodan_request(f"shodan/host/{ip}")
            if r:
                out["shodan"] = {
                    "ports": r.get("ports", []),
                    "org": r.get("org", ""),
                    "os": r.get("os", ""),
                    "hostnames": r.get("hostnames", [])[:5],
                    "vulns": list(r.get("vulns", []) or [])[:10],
                }
        return out

    def _enrich_domain(self, domain: str) -> dict:
        if not self.vt_key:
            return {}
        r = self._vt_request(f"/domains/{domain}")
        if not r:
            return {}
        attrs = r.get("attributes", {})
        return {
            "virustotal": {
                "reputation": attrs.get("reputation", 0),
                "malicious": attrs.get("last_analysis_stats", {}).get("malicious", 0),
                "suspicious": attrs.get("last_analysis_stats", {}).get("suspicious", 0),
                "harmless": attrs.get("last_analysis_stats", {}).get("harmless", 0),
                "registrar": attrs.get("registrar", ""),
                "creation_date": attrs.get("creation_date", 0),
                "categories": attrs.get("categories", {}),
            }
        }

    def _enrich_hash(self, h: str) -> dict:
        if not self.vt_key:
            return {}
        r = self._vt_request(f"/files/{h}")
        if not r:
            return {}
        attrs = r.get("attributes", {})
        return {
            "virustotal": {
                "malicious": attrs.get("last_analysis_stats", {}).get("malicious", 0),
                "suspicious": attrs.get("last_analysis_stats", {}).get("suspicious", 0),
                "harmless": attrs.get("last_analysis_stats", {}).get("harmless", 0),
                "type_description": attrs.get("type_description", ""),
                "popular_threat_name": attrs.get("popular_threat_classification", {})
                .get("popular_threat_name", [{}])[0]
                .get("value", "")
                if attrs.get("popular_threat_classification")
                else "",
                "names": attrs.get("names", [])[:10],
            }
        }

    def _enrich_url(self, url: str) -> dict:
        if not self.vt_key:
            return {}
        import base64
        import hashlib

        url_id = base64.urlsafe_b64encode(hashlib.sha256(url.encode()).digest()).decode().strip("=")
        r = self._vt_request(f"/urls/{url_id}")
        if not r:
            return {}
        attrs = r.get("attributes", {})
        return {
            "virustotal": {
                "malicious": attrs.get("last_analysis_stats", {}).get("malicious", 0),
                "suspicious": attrs.get("last_analysis_stats", {}).get("suspicious", 0),
                "harmless": attrs.get("last_analysis_stats", {}).get("harmless", 0),
                "title": attrs.get("title", ""),
                "final_url": attrs.get("final_url", ""),
            }
        }

    # ------------------------------------------------------- helpers
    def _vt_request(self, path: str) -> dict:
        try:
            with httpx.Client(timeout=self.timeout) as c:
                r = c.get(f"{VT_BASE}{path}", headers={"x-apikey": self.vt_key})
            if r.status_code == 404:
                return {}
            r.raise_for_status()
            return r.json().get("data", {})
        except Exception as e:
            log.debug("VT %s failed: %s", path, e)
            return {}

    def _abuseipdb_request(self, ip: str) -> dict:
        try:
            with httpx.Client(timeout=self.timeout) as c:
                r = c.get(
                    f"{ABUSE_BASE}/check",
                    params={"ipAddress": ip, "maxAgeInDays": 90},
                    headers={"Key": self.abuse_key, "Accept": "application/json"},
                )
            r.raise_for_status()
            d = r.json().get("data", {})
            return {
                "abuse_score": d.get("abuseConfidenceScore", 0),
                "country": d.get("countryCode", ""),
                "usage_type": d.get("usageType", ""),
                "isp": d.get("isp", ""),
                "total_reports": d.get("totalReports", 0),
            }
        except Exception as e:
            log.debug("AbuseIPDB %s failed: %s", ip, e)
            return {}

    def _shodan_request(self, path: str) -> dict:
        try:
            with httpx.Client(timeout=self.timeout) as c:
                r = c.get(f"{SHODAN_BASE}/{path}", params={"key": self.shodan_key})
            if r.status_code == 404:
                return {}
            r.raise_for_status()
            return r.json()
        except Exception as e:
            log.debug("Shodan %s failed: %s", path, e)
            return {}

    # ------------------------------------------------------- admiralty
    @staticmethod
    def compute_admiralty(enrichment: dict, base_confidence: float = 0.5) -> tuple[str, float]:
        """
        Return (admiralty_code, confidence). Code uses A-F (reliability) + 1-6
        (credibility). Real enrichment data upgrades reliability from F→D→B.

        Rules:
        * No enrichment data  → F6, base_confidence × 0.6
        * Single source        → D6, base_confidence × 0.8
        * Two+ sources         → B2, base_confidence
        * Malicious verdicts   → bump reliability one level
        """
        sources = [k for k in enrichment.keys() if k != "mock" and enrichment.get(k)]
        if not sources:
            return "F6", max(0.1, base_confidence * 0.6)

        reliability = "D"
        if len(sources) >= 2:
            reliability = "B"

        # Bump on malicious
        malicious_count = 0
        for src in sources:
            d = enrichment.get(src, {})
            if isinstance(d, dict):
                if d.get("malicious", 0) > 0 or d.get("abuse_score", 0) >= 75:
                    malicious_count += 1
        if malicious_count >= 1 and reliability == "D":
            reliability = "C"
        if malicious_count >= 2 and reliability == "B":
            reliability = "A"

        credibility = "2" if malicious_count >= 1 else "6"
        multiplier = 1.0 if len(sources) >= 2 else 0.85
        return f"{reliability}{credibility}", max(0.1, min(1.0, base_confidence * multiplier))
