"""
Cognitive analysis engine. Generates:
* narrative          — natural-language summary of the threat
* actor_hypothesis   — structured attribution hypothesis
* severity_score     — 0-100
* recommendations    — actionable list
* admiralty_code     — reliability/credibility rating

Uses LLM when available; falls back to a rule-based heuristic otherwise.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Optional

from app.engines import llm as llm_mod
from app.engines.enrichment import EnrichmentEngine

log = logging.getLogger(__name__)


class AnalysisEngine:
    NARRATIVE_PROMPT = """You are a senior cyber threat intelligence analyst. Based on the extracted entities and enrichment data below, write a concise threat narrative (3-5 paragraphs).

Cover:
1. What the threat is and its primary mechanism
2. Who is likely behind it (attribution reasoning) — only if entities suggest an actor
3. Who/what is being targeted
4. Severity assessment (0-100) with justification
5. Recommended defensive actions

Return strict JSON with keys: narrative (string), actor_hypothesis (object with keys: actor, confidence, motivation, origin, reasoning), severity_score (number 0-100), recommendations (array of strings).

ENTITIES:
{entities}

ENRICHMENT SUMMARY:
{enrichment}
"""

    def analyze(
        self,
        entities: list[dict],
        enrichment: dict,
        *,
        user_keys: Optional[dict] = None,
        source_text: str = "",
    ) -> dict:
        if llm_mod.is_available(user_keys):
            try:
                return self._llm_analysis(entities, enrichment, user_keys=user_keys)
            except Exception as e:
                log.warning("LLM analysis failed, falling back to heuristic: %s", e)
        return self._heuristic_analysis(entities, enrichment, source_text=source_text)

    # ----------------------------------------------------------- LLM
    def _llm_analysis(self, entities: list[dict], enrichment: dict, *, user_keys: Optional[dict] = None) -> dict:
        ents_summary = self._summarize_entities(entities)
        enr_summary = self._summarize_enrichment(enrichment)
        prompt = self.NARRATIVE_PROMPT.format(entities=ents_summary, enrichment=enr_summary)

        resp = llm_mod.chat(
            [
                {"role": "system", "content": "You output strict JSON, no prose, no code fences."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            max_tokens=2048,
            user_keys=user_keys,
        )

        content = resp.content.strip()
        if content.startswith("```"):
            content = re.sub(r"^```(?:json)?\s*", "", content)
            content = re.sub(r"\s*```$", "", content)

        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            # Fall back to heuristic but keep LLM narrative text
            data = {"narrative": resp.content, "actor_hypothesis": {}, "severity_score": 0, "recommendations": []}

        admiralty, conf = EnrichmentEngine.compute_admiralty(enrichment, 0.7)
        data.setdefault("actor_hypothesis", {})
        data.setdefault("recommendations", [])
        data["admiralty_code"] = admiralty
        data["confidence"] = conf
        data["model_used"] = resp.model
        data["tokens_used"] = resp.tokens_in + resp.tokens_out
        data["severity_score"] = float(max(0, min(100, data.get("severity_score", 0))))
        return data

    # ----------------------------------------------------- heuristic
    def _heuristic_analysis(
        self, entities: list[dict], enrichment: dict, source_text: str = ""
    ) -> dict:
        # Count entities by type
        type_counts: dict[str, int] = {}
        for e in entities:
            t = e.get("entity_type", "unknown")
            type_counts[t] = type_counts.get(t, 0) + 1

        # Severity scoring
        severity = 0
        severity += min(20, type_counts.get("threat_actor", 0) * 20)
        severity += min(20, type_counts.get("malware", 0) * 10)
        severity += min(15, type_counts.get("vulnerability", 0) * 8)
        severity += min(15, type_counts.get("ioc_hash", 0) * 3)
        severity += min(15, type_counts.get("ioc_ip", 0) * 2)
        severity += min(15, type_counts.get("ioc_url", 0) * 3)

        # Enrichment-based bumps
        for src, data in enrichment.items():
            if not isinstance(data, dict) or src == "mock":
                continue
            if data.get("malicious", 0) > 0:
                severity += min(10, int(data["malicious"]) * 2)
            if data.get("abuse_score", 0) >= 75:
                severity += 5

        severity = min(100, severity)

        # Narrative
        narrative_parts = [
            f"This investigation contains {len(entities)} extracted entities across {len(type_counts)} types.",
            f"Entity breakdown: {', '.join(f'{k}={v}' for k, v in sorted(type_counts.items(), key=lambda x: -x[1])[:5])}.",
        ]
        if "threat_actor" in type_counts:
            narrative_parts.append(
                "Attribution indicators present — at least one named threat actor was identified in the source material."
            )
        if "malware" in type_counts:
            narrative_parts.append(
                "Malware artifacts detected — defensive teams should review IOCs against EDR/AV telemetry."
            )
        if severity >= 70:
            narrative_parts.append("Severity is HIGH — escalate to incident response immediately.")
        elif severity >= 40:
            narrative_parts.append("Severity is MEDIUM — monitor and prepare defensive measures.")
        else:
            narrative_parts.append("Severity is LOW — maintain baseline vigilance.")

        actor_hyp = {}
        actors = [e for e in entities if e.get("entity_type") == "threat_actor"]
        if actors:
            actor_hyp = {
                "actor": actors[0].get("value", "Unknown"),
                "confidence": 0.4,
                "motivation": "Unknown — insufficient enrichment data",
                "origin": "Unknown",
                "reasoning": "Identified from extraction only; no enrichment data to corroborate.",
            }

        recommendations = self._heuristic_recommendations(type_counts, enrichment, severity)

        admiralty, conf = EnrichmentEngine.compute_admiralty(enrichment, 0.5)

        return {
            "narrative": " ".join(narrative_parts),
            "actor_hypothesis": actor_hyp,
            "severity_score": float(severity),
            "recommendations": recommendations,
            "admiralty_code": admiralty,
            "confidence": conf,
            "model_used": "heuristic",
            "tokens_used": 0,
        }

    # ----------------------------------------------------- helpers
    @staticmethod
    def _summarize_entities(entities: list[dict]) -> str:
        if not entities:
            return "(none)"
        lines = []
        for e in entities[:50]:
            lines.append(f"- [{e.get('entity_type', '?')}] {e.get('value', '?')} (conf={e.get('confidence', '?')})")
        return "\n".join(lines)

    @staticmethod
    def _summarize_enrichment(enrichment: dict) -> str:
        if not enrichment:
            return "(none)"
        lines = []
        for src, data in enrichment.items():
            if src == "mock":
                continue
            if isinstance(data, dict):
                short = {k: data[k] for k in list(data.keys())[:5]}
                lines.append(f"- {src}: {json.dumps(short)}")
        return "\n".join(lines) or "(none)"

    @staticmethod
    def _heuristic_recommendations(type_counts: dict, enrichment: dict, severity: float) -> list[str]:
        recs = []
        if type_counts.get("ioc_hash"):
            recs.append("Hash-based IOCs detected — block at endpoint protection and review SIEM for matches.")
        if type_counts.get("ioc_ip"):
            recs.append("Network IOCs detected — add to firewall blocklists and monitor egress traffic.")
        if type_counts.get("ioc_domain") or type_counts.get("ioc_url"):
            recs.append("Domain/URL IOCs detected — block at proxy/DNS resolver and inspect proxy logs.")
        if type_counts.get("vulnerability"):
            recs.append("Vulnerability references found — prioritise patching of listed CVEs.")
        if type_counts.get("malware"):
            recs.append("Malware family identified — update detection signatures and quarantine affected hosts.")
        if type_counts.get("threat_actor"):
            recs.append("Threat actor named — review TTPs from public threat reports and update detection rules.")
        if severity >= 70:
            recs.append("HIGH severity — convene incident response bridge and notify leadership.")
        if not recs:
            recs.append("No specific recommendations — continue monitoring for additional indicators.")
        return recs
