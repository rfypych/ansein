"""Unified LLM client — picks provider based on availability (BYOK)."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Iterable, Optional

from openai import OpenAI

from app.core.config import get_settings

log = logging.getLogger(__name__)


@dataclass
class LLMResponse:
    content: str
    model: str
    tokens_in: int
    tokens_out: int
    provider: str


class LLMUnavailable(RuntimeError):
    """Raised when no LLM provider is configured."""


def _resolve_provider(preferred: Optional[str] = None) -> tuple[str, str, str, OpenAI]:
    """
    Return (provider_name, api_key, api_base, model). Falls back through
    settings → user-supplied keys in order of preference.
    """
    s = get_settings()
    candidates = []
    if preferred == "groq" or preferred is None:
        candidates.append(("groq", s.groq_api_key, s.groq_api_base, s.groq_model))
    if preferred == "openai" or preferred is None:
        candidates.append(("openai", s.openai_api_key, s.openai_api_base, s.openai_model))
    if preferred is None:
        # also try the opposite order
        candidates.append(("groq", s.groq_api_key, s.groq_api_base, s.groq_model))

    for prov, key, base, model in candidates:
        if key and key.strip():
            return prov, key, base, model

    raise LLMUnavailable(
        "No LLM provider configured. Set OPENAI_API_KEY or GROQ_API_KEY in .env "
        "or via Settings → API Keys."
    )


def chat(
    messages: list[dict[str, str]],
    *,
    temperature: float = 0.2,
    max_tokens: int = 2048,
    preferred: Optional[str] = None,
    user_keys: Optional[dict[str, str]] = None,
) -> LLMResponse:
    """
    Run a chat completion. `messages` is OpenAI-style
    [{role, content}, ...]. `user_keys` overrides settings (per-user BYOK).
    """
    # If user supplied keys, temporarily override settings via a fake provider
    if user_keys:
        if user_keys.get("groq_api_key"):
            client = OpenAI(
                api_key=user_keys["groq_api_key"],
                base_url=get_settings().groq_api_base,
            )
            model = get_settings().groq_model
            provider = "groq"
        elif user_keys.get("openai_api_key"):
            client = OpenAI(
                api_key=user_keys["openai_api_key"],
                base_url=get_settings().openai_api_base,
            )
            model = get_settings().openai_model
            provider = "openai"
        else:
            raise LLMUnavailable("User has no LLM API keys configured.")
    else:
        provider, key, base, model = _resolve_provider(preferred)
        client = OpenAI(api_key=key, base_url=base)

    try:
        resp = client.chat.completions.create(
            model=model,
            messages=messages,  # type: ignore[arg-type]
            temperature=temperature,
            max_tokens=max_tokens,
        )
    except Exception as e:
        log.error("LLM call failed (%s): %s", provider, e)
        raise

    usage = resp.usage
    return LLMResponse(
        content=resp.choices[0].message.content or "",
        model=model,
        tokens_in=usage.prompt_tokens if usage else 0,
        tokens_out=usage.completion_tokens if usage else 0,
        provider=provider,
    )


def is_available(user_keys: Optional[dict[str, str]] = None) -> bool:
    """Cheap check used by the API layer to surface availability in the UI."""
    try:
        if user_keys:
            return bool(user_keys.get("groq_api_key") or user_keys.get("openai_api_key"))
        _resolve_provider()
        return True
    except LLMUnavailable:
        return False
