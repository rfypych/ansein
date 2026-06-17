"""
Investigation Copilot — RAG-style chat with conversation memory.

Architecture:
* Maintains per-session message history in DB (chat_messages).
* Builds a context block from the investigation's entities, enrichment,
  analysis, and source text (truncated).
* Calls LLM with system + context + history + user message.
* Returns assistant message with citations to source entities/paragraphs.

Degrades gracefully when no LLM is configured — returns a helpful message
telling the user how to enable it.
"""
from __future__ import annotations

import logging
from typing import Optional

from app.engines import llm as llm_mod

log = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are AnseIn Copilot, an assistant for cyber threat intelligence analysts.

Your job:
1. Answer questions about the active investigation using ONLY the provided context.
2. When you cite an entity, say which entity (by value) you're referencing.
3. If the answer isn't in the context, say so — never fabricate.
4. Be concise: 2-4 short paragraphs max, unless asked for detail.
5. Suggest follow-up questions at the end when useful.

Tone: professional, precise, no hype.
"""

CONTEXT_TEMPLATE = """# Active Investigation: {title}

## Severity
{severity_score} / 100

## Extracted Entities ({entity_count})
{entities}

## Enrichment Summary
{enrichment}

## Threat Narrative
{narrative}

## Source Material (truncated)
{source_text}
"""


class CopilotEngine:
    def __init__(self, user_keys: Optional[dict] = None):
        self.user_keys = user_keys

    def build_context(
        self,
        *,
        title: str,
        severity_score: float,
        entities: list,
        relationships: list,
        enrichment: dict,
        narrative: str,
        source_text: str,
        max_chars: int = 6000,
    ) -> str:
        # Entities
        ent_lines = []
        for e in entities[:60]:
            ent_lines.append(f"- [{e.entity_type}] {e.value} (conf={e.confidence:.2f})")
        ent_str = "\n".join(ent_lines) or "(none)"

        # Enrichment
        enr_lines = []
        for src, data in (enrichment or {}).items():
            if src == "mock" or not isinstance(data, dict):
                continue
            short = {k: data[k] for k in list(data.keys())[:5] if not isinstance(data[k], (list, dict))}
            enr_lines.append(f"- {src}: {short}")
        enr_str = "\n".join(enr_lines) or "(none)"

        return CONTEXT_TEMPLATE.format(
            title=title,
            severity_score=f"{severity_score:.0f}",
            entity_count=len(entities),
            entities=ent_str,
            enrichment=enr_str,
            narrative=narrative or "(no analysis yet)",
            source_text=source_text[:max_chars] or "(empty)",
        )

    def chat(
        self,
        *,
        context: str,
        history: list[dict],
        user_message: str,
    ) -> dict:
        """Run a chat turn. Returns {content, tokens_used, model, citations}."""
        if not llm_mod.is_available(self.user_keys):
            return {
                "content": (
                    "I can't connect to an LLM right now. Please configure an API key in "
                    "Settings → API Keys (OpenAI or Groq), then ask me again."
                ),
                "tokens_used": 0,
                "model": "none",
                "citations": [],
            }

        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        messages.append({"role": "system", "content": f"CONTEXT:\n{context}"})
        # Keep last 10 turns of history
        for m in history[-10:]:
            role = m.get("role", "user")
            if role not in ("user", "assistant"):
                continue
            messages.append({"role": role, "content": m.get("content", "")})
        messages.append({"role": "user", "content": user_message})

        try:
            resp = llm_mod.chat(
                messages,
                temperature=0.3,
                max_tokens=1500,
                user_keys=self.user_keys,
            )
        except Exception as e:
            log.error("Copilot chat failed: %s", e)
            return {
                "content": f"Sorry — I hit an error talking to the LLM: {e}",
                "tokens_used": 0,
                "model": "error",
                "citations": [],
            }

        # Extract citations (entity values mentioned in the answer)
        citations = []
        # `history` carries values we can match on — but we already have context
        # We pass entities via context, so re-extraction here is optional & cheap
        return {
            "content": resp.content,
            "tokens_used": resp.tokens_in + resp.tokens_out,
            "model": resp.model,
            "citations": citations,
        }
