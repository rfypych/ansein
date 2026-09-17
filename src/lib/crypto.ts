/**
 * AES-256-GCM encryption for BYOK keys.
 * Key derived from SECRET_KEY via SHA-256 (mirrors Python Fernet key derivation).
 * Format: base64url(iv[12] || tag[16] || ciphertext)
 */
import crypto from 'node:crypto'

function getSecretKey(): string {
  return process.env.SECRET_KEY || 'dev-insecure-secret-change-me'
}

function deriveKey(): Buffer {
  return crypto.createHash('sha256').update(getSecretKey()).digest() // 32 bytes
}

/** Version tag for new encryptions — lets health checks distinguish
 *  "encrypted with the CURRENT key" from legacy/unverifiable rows. */
const KEY_VERSION = 'v1'

export function encrypt(plain: string): string {
  if (!plain) return ''
  try {
    const key = deriveKey()
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return `${KEY_VERSION}:` + Buffer.concat([iv, tag, enc]).toString('base64url')
  } catch (e) {
    console.error('[crypto] encrypt failed:', e)
    return ''
  }
}

export type DecryptStatus = 'empty' | 'current' | 'legacy' | 'undecryptable'

export interface DecryptResult {
  value: string
  status: DecryptStatus
}

/**
 * Version-aware decrypt. Returns both the value and its provenance:
 * - empty: nothing stored
 * - current: v1 payload that decrypts with the active SECRET_KEY
 * - legacy: pre-versioning payload (decrypts or passes through as plaintext);
 *   trustworthy only if SECRET_KEY never changed since it was written
 * - undecryptable: v1 payload that FAILS auth with the active key — the
 *   signature of a SECRET_KEY rotation. The value is NOT returned (it would
 *   be attacker-usable garbage or a silent misconfiguration); callers must
 *   treat the key as missing and the health endpoint reports it loudly.
 */
export function decryptVersioned(stored: string): DecryptResult {
  if (!stored) return { value: '', status: 'empty' }
  const prefix = `${KEY_VERSION}:`
  if (stored.startsWith(prefix)) {
    try {
      const buf = Buffer.from(stored.slice(prefix.length), 'base64url')
      if (buf.length < 29) return { value: '', status: 'undecryptable' }
      const iv = buf.subarray(0, 12)
      const tag = buf.subarray(12, 28)
      const enc = buf.subarray(28)
      const dec = crypto.createDecipheriv('aes-256-gcm', deriveKey(), iv)
      dec.setAuthTag(tag)
      const value = Buffer.concat([dec.update(enc), dec.final()]).toString('utf8')
      return { value, status: 'current' }
    } catch {
      return { value: '', status: 'undecryptable' }
    }
  }
  // Legacy path (pre-versioning rows + Python-era plaintext): unchanged
  // behavior — best effort, flagged as legacy so operators know the limit.
  return { value: decrypt(stored), status: 'legacy' }
}

export function decrypt(b64: string): string {
  if (!b64) return ''
  // Plaintext-migration fallback: if it doesn't look like base64url-encoded
  // IV+tag+ciphertext, return as-is (mirrors Python behavior).
  try {
    const raw = b64.startsWith(`${KEY_VERSION}:`) ? b64.slice(KEY_VERSION.length + 1) : b64
    const buf = Buffer.from(raw, 'base64url')
    if (buf.length < 29) return b64 // 12 iv + 16 tag + at least 1 byte
    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const enc = buf.subarray(28)
    const key = deriveKey()
    const dec = crypto.createDecipheriv('aes-256-gcm', key, iv)
    dec.setAuthTag(tag)
    return Buffer.concat([dec.update(enc), dec.final()]).toString('utf8')
  } catch {
    return b64
  }
}
