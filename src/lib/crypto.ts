/**
 * AES-256-GCM encryption for BYOK keys.
 * Key derived from SECRET_KEY via SHA-256 (mirrors Python Fernet key derivation).
 * Format: base64url(iv[12] || tag[16] || ciphertext)
 */
import crypto from 'node:crypto'

const SECRET_KEY = process.env.SECRET_KEY || (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: SECRET_KEY environment variable is required in production')
  }
  return 'dev-insecure-secret-change-me'
})()

function deriveKey(): Buffer {
  return crypto.createHash('sha256').update(SECRET_KEY).digest() // 32 bytes
}

export function encrypt(plain: string): string {
  if (!plain) return ''
  try {
    const key = deriveKey()
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return Buffer.concat([iv, tag, enc]).toString('base64url')
  } catch (e) {
    console.error('[crypto] encrypt failed:', e)
    return ''
  }
}

export function decrypt(b64: string): string {
  if (!b64) return ''
  // Plaintext-migration fallback: if it doesn't look like base64url-encoded
  // IV+tag+ciphertext, return as-is (mirrors Python behavior).
  try {
    const buf = Buffer.from(b64, 'base64url')
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
