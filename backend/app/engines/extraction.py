"""
Hybrid extraction pipeline: Regex → GLiNER → LLM.

* Regex is fast, zero-dependency, and perfect for IOCs (IPs, hashes, URLs).
* GLiNER handles named entities (threat actor, malware family) when available.
* LLM does the final semantic pass to catch ambiguous/contextual entities.

Each stage is independent and degrades gracefully — if GLiNER isn't installed
or no LLM is configured, the pipeline still returns what it can.
"""
from __future__ import annotations

import hashlib
import ipaddress
import logging
import re
from dataclasses import asdict, dataclass, field
from typing import Iterable, Optional

from app.engines import llm as llm_mod

log = logging.getLogger(__name__)

# ---------------------------------------------------------------- regex
# Be strict to avoid false positives on things like version numbers.
_IPV4 = re.compile(r"\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b")
_IPV6 = re.compile(r"\b(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}\b")
# Domains — must have at least one dot, no leading dot, TLD 2-24 chars
_DOMAIN = re.compile(r"\b(?!\.)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}\b", re.I)
_URL = re.compile(r"\bhttps?://[^\s<>\"')]+", re.I)
_EMAIL = re.compile(r"\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}\b", re.I)
# Hashes — fixed length, hex only
_MD5 = re.compile(r"\b[a-fA-F0-9]{32}\b")
_SHA1 = re.compile(r"\b[a-fA-F0-9]{40}\b")
_SHA256 = re.compile(r"\b[a-fA-F0-9]{64}\b")
_SHA512 = re.compile(r"\b[a-fA-F0-9]{128}\b")
# CVE
_CVE = re.compile(r"\bCVE-\d{4}-\d{4,7}\b", re.I)
# Bitcoin address (legacy + bech32)
_BTC_LEGACY = re.compile(r"\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b")
_BTC_BECH32 = re.compile(r"\bbc1[ac-hj-np-z02-9]{6,87}\b", re.I)


@dataclass
class ExtractedEntity:
    entity_type: str
    value: str
    normalized: str
    confidence: float
    source_method: str  # regex | gliner | llm
    context: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


# ---------------------------------------------------------------- helpers
def _safe_ip(text: str) -> bool:
    """Filter out version-number lookalikes like 1.2.3.4 from inside long strings."""
    try:
        ipaddress.ip_address(text)
        return True
    except ValueError:
        return False


def _norm(value: str, etype: str) -> str:
    v = value.strip()
    if etype.startswith("ioc_"):
        return v.lower()
    return v


# ---------------------------------------------------------------- engine
class ExtractionEngine:
    """Pure-Python regex extractor with optional GLiNER/LLM upgrades."""

    def __init__(self, use_gliner: bool = True, use_llm: bool = True):
        self.use_gliner = use_gliner
        self.use_llm = use_llm
        self._gliner_model = None
        if use_gliner:
            self._gliner_model = self._try_load_gliner()

    @staticmethod
    def _try_load_gliner():
        try:
            from gliner import GLiNER  # type: ignore

            model = GLiNER.from_pretrained("urchade/gliner_multi-v2.1")
            log.info("GLiNER model loaded")
            return model
        except Exception as e:
            log.info("GLiNER unavailable (%s) — falling back to regex-only", e)
            return None

    # ------------------------------------------------------- stage 1: regex
    def _regex_pass(self, text: str) -> list[ExtractedEntity]:
        out: list[ExtractedEntity] = []

        def add(etype: str, value: str, confidence: float = 0.95) -> None:
            v = value.strip()
            if etype == "ioc_ip" and not _safe_ip(v):
                return
            out.append(
                ExtractedEntity(
                    entity_type=etype,
                    value=v,
                    normalized=_norm(v, etype),
                    confidence=confidence,
                    source_method="regex",
                )
            )

        for m in _IPV4.finditer(text):
            add("ioc_ip", m.group(0), 0.95)
        for m in _IPV6.finditer(text):
            add("ioc_ip", m.group(0), 0.85)
        for m in _URL.finditer(text):
            add("ioc_url", m.group(0), 0.95)
        for m in _EMAIL.finditer(text):
            add("identity", m.group(0), 0.85)
        for m in _MD5.finditer(text):
            add("ioc_hash", m.group(0), 0.95)
        for m in _SHA1.finditer(text):
            add("ioc_hash", m.group(0), 0.95)
        for m in _SHA256.finditer(text):
            add("ioc_hash", m.group(0), 0.98)
        for m in _SHA512.finditer(text):
            add("ioc_hash", m.group(0), 0.98)
        for m in _CVE.finditer(text):
            add("vulnerability", m.group(0).upper(), 0.95)
        for m in _BTC_LEGACY.finditer(text):
            add("ioc_wallet", m.group(0), 0.7)
        for m in _BTC_BECH32.finditer(text):
            add("ioc_wallet", m.group(0), 0.85)
        for m in _DOMAIN.finditer(text):
            d = m.group(0).lower()
            # Filter common false-positives
            if d.endswith((".jpg", ".png", ".gif", ".css", ".js")):
                continue
            add("ioc_domain", d, 0.85)

        return out

    # ------------------------------------------------------- stage 2: gliner
    def _gliner_pass(self, text: str) -> list[ExtractedEntity]:
        if not self._gliner_model or len(text) < 10:
            return []
        labels = [
            "threat actor",
            "malware",
            "tool",
            "vulnerability",
            "target organization",
            "country",
            "city",
            "technique",
        ]
        try:
            ents = self._gliner_model.get_entities(text, labels=labels, threshold=0.5)
        except Exception as e:
            log.warning("GLiNER pass failed: %s", e)
            return []

        type_map = {
            "threat actor": "threat_actor",
            "malware": "malware",
            "tool": "tool",
            "vulnerability": "vulnerability",
            "target organization": "target",
            "country": "location",
            "city": "location",
            "technique": "technique",
        }
        out = []
        for e in ents:
            label = type_map.get(e.get("label", "").lower())
            if not label:
                continue
            out.append(
                ExtractedEntity(
                    entity_type=label,
                    value=e["text"],
                    normalized=_norm(e["text"], label),
                    confidence=float(e.get("score", 0.7)),
                    source_method="gliner",
                )
            )
        return out

    # ------------------------------------------------------- stage 3: llm
    LLM_PROMPT_TEMPLATE = (
        "You are a cyber threat intelligence extractor. From the text below, "
        "extract a JSON array of objects. Each object MUST have keys: "
        "entity_type, value, confidence. entity_type must be one of: "
        "threat_actor, malware, tool, target, technique, vulnerability, "
        "ioc_ip, ioc_domain, ioc_url, ioc_hash, location, identity. "
        "Only include entities explicitly mentioned. Return [] if none.\n\n"
        "TEXT:\n```\n{text}\n```"
    )

    def _llm_pass(self, text: str, user_keys: Optional[dict] = None) -> list[ExtractedEntity]:
        if not self.use_llm or not llm_mod.is_available(user_keys):
            return []
        # Skip LLM if text is too short to be worth a call
        if len(text) < 80:
            return []

        import json

        prompt = self.LLM_PROMPT_TEMPLATE.format(text=text[:8000])
        try:
            resp = llm_mod.chat(
                [
                    {"role": "system", "content": "You output strict JSON, no prose."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.0,
                max_tokens=2048,
                user_keys=user_keys,
            )
        except Exception as e:
            log.warning("LLM extraction failed: %s", e)
            return []

        try:
            # Strip ```json fences if present
            content = resp.content.strip()
            if content.startswith("```"):
                content = re.sub(r"^```(?:json)?\s*", "", content)
                content = re.sub(r"\s*```$", "", content)
            data = json.loads(content)
        except json.JSONDecodeError:
            log.warning("LLM returned non-JSON; skipping")
            return []

        out = []
        if not isinstance(data, list):
            return out
        for item in data:
            if not isinstance(item, dict):
                continue
            etype = item.get("entity_type", "").strip().lower()
            value = str(item.get("value", "")).strip()
            if not etype or not value:
                continue
            conf = float(item.get("confidence", 0.7))
            conf = max(0.0, min(1.0, conf))
            out.append(
                ExtractedEntity(
                    entity_type=etype,
                    value=value,
                    normalized=_norm(value, etype),
                    confidence=conf,
                    source_method="llm",
                )
            )
        return out

    # ----------------------------------------------------------- dedupe
    @staticmethod
    def _dedupe(entities: Iterable[ExtractedEntity]) -> list[ExtractedEntity]:
        """Keep highest-confidence entity per (type, normalized)."""
        seen: dict[tuple[str, str], ExtractedEntity] = {}
        for e in entities:
            key = (e.entity_type, e.normalized.lower())
            if key not in seen or e.confidence > seen[key].confidence:
                seen[key] = e
        return list(seen.values())

    # ----------------------------------------------------------- public
    def extract(
        self,
        text: str,
        *,
        user_keys: Optional[dict] = None,
        max_chars: int = 20000,
    ) -> list[ExtractedEntity]:
        if not text or not text.strip():
            return []
        text = text[:max_chars]

        ents: list[ExtractedEntity] = []
        ents.extend(self._regex_pass(text))
        ents.extend(self._gliner_pass(text))
        ents.extend(self._llm_pass(text, user_keys=user_keys))

        return self._dedupe(ents)

    @staticmethod
    def content_hash(text: str) -> str:
        return hashlib.sha256(text.encode("utf-8", errors="ignore")).hexdigest()


def infer_relationships(entities: list[ExtractedEntity], text: str) -> list[dict]:
    """
    Heuristic relationship inference (no LLM):
    * 'communicates_with' between IPs/domains co-occurring in same paragraph
    * 'located_in' between location and any other entity within 200 chars
    * 'targets' between threat_actor and target/malware within 400 chars

    Returns list of {source, target, relation_type, evidence, weight}.
    """
    if not entities:
        return []

    # Map value → entity for fast lookup
    by_val = {e.normalized.lower(): e for e in entities}
    out: list[dict] = []

    # Co-occurrence-based edges
    paragraphs = re.split(r"\n\s*\n", text)
    for para in paragraphs:
        para_lower = para.lower()
        present = [e for e in entities if e.normalized.lower() in para_lower]
        # communicate_with: ip <-> domain
        ips = [e for e in present if e.entity_type == "ioc_ip"]
        domains = [e for e in present if e.entity_type == "ioc_domain"]
        for ip in ips:
            for d in domains:
                out.append(
                    {
                        "source": ip.normalized,
                        "target": d.normalized,
                        "relation_type": "communicates_with",
                        "evidence": para[:200],
                        "weight": 0.6,
                    }
                )

        # located_in: location -> anything
        locs = [e for e in present if e.entity_type == "location"]
        for loc in locs:
            for e in present:
                if e.entity_type in ("threat_actor", "target", "malware", "identity"):
                    out.append(
                        {
                            "source": e.normalized,
                            "target": loc.normalized,
                            "relation_type": "located_in",
                            "evidence": para[:200],
                            "weight": 0.5,
                        }
                    )

        # targets: threat_actor -> target/malware
        actors = [e for e in present if e.entity_type == "threat_actor"]
        targets = [e for e in present if e.entity_type in ("target", "malware")]
        for a in actors:
            for t in targets:
                out.append(
                    {
                        "source": a.normalized,
                        "target": t.normalized,
                        "relation_type": "targets",
                        "evidence": para[:200],
                        "weight": 0.7,
                    }
                )

    # Dedupe by (source, target, type)
    seen = set()
    deduped = []
    for r in out:
        key = (r["source"], r["target"], r["relation_type"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(r)
    return deduped
