"""Cryptography helpers for encrypting user BYOK keys at rest."""
from __future__ import annotations

import base64
import hashlib
import logging
from typing import Optional

from app.core.config import get_settings

log = logging.getLogger(__name__)

try:
    from cryptography.fernet import Fernet  # type: ignore
    _HAS_FERNET = True
except ImportError:
    _HAS_FERNET = False
    log.warning("cryptography not installed — BYOK keys will be stored in plaintext")


def _derive_key() -> bytes:
    """Derive a 32-byte Fernet key from SECRET_KEY (sha256 → base64)."""
    s = get_settings()
    digest = hashlib.sha256(s.secret_key.encode()).digest()
    return base64.urlsafe_b64encode(digest)


def get_fernet() -> Optional["Fernet"]:
    if not _HAS_FERNET:
        return None
    return Fernet(_derive_key())


def encrypt(plaintext: str) -> str:
    if not plaintext:
        return ""
    f = get_fernet()
    if f is None:
        return plaintext  # plaintext fallback (already warned)
    return f.encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    if not ciphertext:
        return ""
    f = get_fernet()
    if f is None:
        return ciphertext
    try:
        return f.decrypt(ciphertext.encode()).decode()
    except Exception:
        # Probably stored in plaintext during migration — return as-is
        return ciphertext
