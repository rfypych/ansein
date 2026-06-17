"""Tests for security primitives: hashing, JWT, rate limiting."""
from __future__ import annotations

import time

import pytest

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)


class TestPasswordHashing:
    def test_hash_and_verify(self):
        plain = "my_secret_password"
        hashed = hash_password(plain)
        assert hashed != plain
        assert verify_password(plain, hashed) is True

    def test_wrong_password_fails(self):
        hashed = hash_password("correct")
        assert verify_password("wrong", hashed) is False

    def test_each_hash_is_unique(self):
        # Same password → different hashes (bcrypt salt)
        h1 = hash_password("same")
        h2 = hash_password("same")
        assert h1 != h2
        assert verify_password("same", h1)
        assert verify_password("same", h2)

    def test_empty_password(self):
        hashed = hash_password("")
        assert verify_password("", hashed) is True

    def test_unicode_password(self):
        plain = "пароль🔒"
        hashed = hash_password(plain)
        assert verify_password(plain, hashed) is True


class TestJWT:
    def test_create_and_decode_access_token(self):
        token = create_access_token("user123", extra={"email": "a@b.com"})
        payload = decode_token(token)
        assert payload is not None
        assert payload["sub"] == "user123"
        assert payload["email"] == "a@b.com"
        assert payload["type"] == "access"

    def test_create_and_decode_refresh_token(self):
        token = create_refresh_token("user123")
        payload = decode_token(token)
        assert payload is not None
        assert payload["sub"] == "user123"
        assert payload["type"] == "refresh"

    def test_decode_garbage_returns_none(self):
        assert decode_token("garbage") is None
        assert decode_token("") is None
        assert decode_token(None) is None  # type: ignore[arg-type]

    def test_token_has_jti(self):
        token = create_access_token("u1")
        payload = decode_token(token)
        assert "jti" in payload
        # JTI should be unique per token
        token2 = create_access_token("u1")
        assert decode_token(token2)["jti"] != payload["jti"]


class TestCrypto:
    def test_encrypt_decrypt_roundtrip(self):
        from app.services.crypto import decrypt, encrypt

        plaintext = "gsk_my_secret_api_key_12345"
        ciphertext = encrypt(plaintext)
        assert ciphertext != plaintext
        assert decrypt(ciphertext) == plaintext

    def test_encrypt_empty_returns_empty(self):
        from app.services.crypto import encrypt, decrypt

        assert encrypt("") == ""
        assert decrypt("") == ""

    def test_decrypt_plaintext_returns_plaintext(self):
        """If a value was stored in plaintext (migration scenario),
        decrypt should return it as-is rather than crashing."""
        from app.services.crypto import decrypt

        assert decrypt("not-encrypted-just-text") == "not-encrypted-just-text"
