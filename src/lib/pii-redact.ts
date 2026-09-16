/**
 * PII Auto-Redaction — fast regex-based detection and redaction.
 *
 * Detects:
 *  - Credit card numbers (Visa/Mastercard/Amex) → [REDACTED_CC]
 *  - US Social Security Numbers (XXX-XX-XXXX) → [REDACTED_SSN]
 *  - Email addresses → [REDACTED_EMAIL]
 *  - Phone numbers (US + international) → [REDACTED_PHONE]
 *  - API keys / long hex|base64 secrets (>32 chars) → [REDACTED_API_KEY]
 *  - JWT tokens (eyJ... three-segment base64url) → [REDACTED_JWT]
 *  - PEM private key blocks → [REDACTED_PRIVATE_KEY]
 *
 * Designed to be fast (single-pass per pattern, no NLP deps) and safe:
 * always replaces with deterministic, opaque placeholder tokens so the
 * original secret never reaches the database or downstream LLM prompts.
 */

export type PiiType =
  | 'CC'
  | 'SSN'
  | 'EMAIL'
  | 'PHONE'
  | 'API_KEY'
  | 'JWT'
  | 'PRIVATE_KEY'

export interface RedactResult {
  redacted: string
  found: number
  types: string[]
}

const PLACEHOLDER: Record<PiiType, string> = {
  CC: '[REDACTED_CC]',
  SSN: '[REDACTED_SSN]',
  EMAIL: '[REDACTED_EMAIL]',
  PHONE: '[REDACTED_PHONE]',
  API_KEY: '[REDACTED_API_KEY]',
  JWT: '[REDACTED_JWT]',
  PRIVATE_KEY: '[REDACTED_PRIVATE_KEY]',
}

/**
 * Luhn checksum — used to validate credit card candidates and avoid
 * false positives on long digit runs that happen to match the pattern.
 */
function luhnValid(digits: string): boolean {
  let sum = 0
  let dbl = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48
    if (d < 0 || d > 9) return false
    if (dbl) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    dbl = !dbl
  }
  return sum > 0 && sum % 10 === 0
}

interface Rule {
  type: PiiType
  pattern: RegExp
  /** Optional validator; returns false to reject the match. */
  validate?: (match: string) => boolean
}

// ------------------------------------------------ pattern definitions
// Credit card: Visa (13/16), MC (16, 51-55 or 2221-2720), Amex (15, 34/37)
const CC_PATTERN = /\b(?:4\d{12}(?:\d{3})?|(?:5[1-5]\d{2}|222[1-9]|22[3-9]\d|2[3-6]\d{2}|27[01]\d|2720)\d{12}|3[47]\d{13})\b/g

// SSN: 9 digits in XXX-XX-XXXX form; reject obviously invalid ranges
const SSN_PATTERN = /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g

// Email — RFC 5322 simplified
const EMAIL_PATTERN = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g

// Phone — US (with optional +1) and international E.164-ish.
// Anchored with \b on both sides and no leading \s* so the regex cannot
// consume the whitespace preceding the number or match inside a long
// digit run (e.g. an API key).
const PHONE_PATTERN =
  /\b(?:(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}|\+\d{1,3}[\s.-]?\d{1,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4})\b/g

// API keys / long opaque secrets — hex or base64, 33+ chars, no spaces
const API_KEY_PATTERN = /\b[A-Za-z0-9+\/_-]{33,}={0,2}\b/g

// JWT — three base64url segments, first segment starts with eyJ
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g

// PEM private key blocks (RSA, EC, OPENSSH, etc.) — multi-line
const PRIVATE_KEY_PATTERN =
  /-----BEGIN (?:[A-Z ]*)?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z ]*)?PRIVATE KEY-----/g

const RULES: Rule[] = [
  { type: 'PRIVATE_KEY', pattern: PRIVATE_KEY_PATTERN },
  { type: 'JWT', pattern: JWT_PATTERN },
  { type: 'CC', pattern: CC_PATTERN, validate: (m) => luhnValid(m.replace(/\D/g, '')) },
  { type: 'SSN', pattern: SSN_PATTERN },
  { type: 'EMAIL', pattern: EMAIL_PATTERN },
  { type: 'PHONE', pattern: PHONE_PATTERN },
  // API keys last — only matches tokens that survive prior redaction
  // and aren't obviously JWTs (which start with `eyJ`).
  // CTI exemption: pure-hex strings of file-hash lengths (MD5/SHA-1/
  // SHA-256/SHA-512) are IOCs — the platform's core product — not secrets.
  // Redacting them silently destroys hash extraction downstream.
  {
    type: 'API_KEY',
    pattern: API_KEY_PATTERN,
    validate: (m) =>
      !m.startsWith('eyJ') &&
      !/^-----BEGIN/.test(m) &&
      !/^[a-fA-F0-9]{32}$/.test(m) &&
      !/^[a-fA-F0-9]{40}$/.test(m) &&
      !/^[a-fA-F0-9]{64}$/.test(m) &&
      !/^[a-fA-F0-9]{128}$/.test(m),
  },
]

/**
 * Redact PII from the input text. Returns the redacted text, the total
 * number of redactions made, and a de-duplicated list of PII types found.
 *
 * The function runs each rule in order against the (progressively redacted)
 * string. Order matters: long-form secrets (PEM blocks, JWTs) are matched
 * first so their constituent tokens are not separately classified as API
 * keys or emails.
 */
export function redactPII(text: string): RedactResult {
  if (!text || typeof text !== 'string') {
    return { redacted: text ?? '', found: 0, types: [] }
  }

  let working = text
  let found = 0
  const typesFound = new Set<string>()

  for (const rule of RULES) {
    // Reset lastIndex because RegExp with /g is stateful when used with exec,
    // but String.replace is safe. We use replace here.
    const matches = working.match(rule.pattern)
    if (!matches || matches.length === 0) continue

    let replaced = 0
    working = working.replace(rule.pattern, (match) => {
      if (rule.validate && !rule.validate(match)) return match
      replaced += 1
      return PLACEHOLDER[rule.type]
    })

    if (replaced > 0) {
      found += replaced
      typesFound.add(rule.type)
    }
  }

  return {
    redacted: working,
    found,
    types: Array.from(typesFound),
  }
}

/**
 * Convenience helper for callers that only need the count + types without
 * the (potentially large) redacted payload.
 */
export function countPII(text: string): Pick<RedactResult, 'found' | 'types'> {
  const { found, types } = redactPII(text)
  return { found, types }
}
