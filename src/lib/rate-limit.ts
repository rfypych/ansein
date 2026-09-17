/**
 * Sliding-window rate limiter for abuse-sensitive routes (login, register,
 * webhook ingest). Two-tier, zero-mandatory-dependency design:
 *
 * 1. Shared counter via Upstash Redis REST (if UPSTASH_REDIS_REST_URL +
 *    UPSTASH_REDIS_REST_TOKEN are set — both free tier, no SDK needed, plain
 *    fetch). Correct across all serverless instances.
 * 2. In-memory per-instance fallback when Redis is unconfigured or errors.
 *    Defeats naive single-connection brute force (the common case).
 *
 * Either way a single slow dependency can never break auth: Redis failures
 * fail OPEN to the memory limiter (availability over strictness — a login
 * page that 500s because Redis hiccuped is worse than a per-instance limit).
 */

interface Bucket {
  hits: number[]
}

const buckets = new Map<string, Bucket>()

// Prevent unbounded growth: cap tracked keys, evict oldest first.
const MAX_KEYS = 5000

function prune(now: number, windowMs: number): void {
  if (buckets.size <= MAX_KEYS) return
  const cutoff = now - windowMs
  for (const [k, b] of buckets) {
    while (b.hits.length > 0 && b.hits[0] <= cutoff) b.hits.shift()
    if (b.hits.length === 0) buckets.delete(k)
    if (buckets.size <= MAX_KEYS) break
  }
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now()
): { allowed: boolean; retryAfterMs: number } {
  prune(now, windowMs)
  let b = buckets.get(key)
  if (!b) {
    b = { hits: [] }
    buckets.set(key, b)
  }
  while (b.hits.length > 0 && b.hits[0] <= now - windowMs) b.hits.shift()
  if (b.hits.length >= limit) {
    return { allowed: false, retryAfterMs: b.hits[0] + windowMs - now }
  }
  b.hits.push(now)
  return { allowed: true, retryAfterMs: 0 }
}

function redisEnv(): { url: string; token: string } | null {
  const url = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '')
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || ''
  return url && token ? { url, token } : null
}

/**
 * Shared sliding-window check against Upstash Redis (INCR + PEXPIRE pipeline
 * over REST). Returns null when Redis is unconfigured or fails, so callers
 * fall back to {@link checkRateLimit}. Never throws.
 */
export async function checkRateLimitShared(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfterMs: number } | null> {
  const env = redisEnv()
  if (!env) return null
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 1500)
    // Atomic-ish: INCR then set TTL only on first hit in window.
    const incr = await fetch(`${env.url}/incr/rl:${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${env.token}` },
      signal: ctrl.signal,
    })
    if (!incr.ok) throw new Error(`redis ${incr.status}`)
    const count = Number(((await incr.json()) as { result?: unknown }).result)
    if (!Number.isFinite(count)) throw new Error('redis bad count')
    if (count === 1) {
      await fetch(`${env.url}/pexpire/rl:${encodeURIComponent(key)}/${windowMs}`, {
        headers: { Authorization: `Bearer ${env.token}` },
        signal: ctrl.signal,
      }).catch(() => {})
    }
    clearTimeout(timer)
    if (count > limit) {
      return { allowed: false, retryAfterMs: windowMs }
    }
    return { allowed: true, retryAfterMs: 0 }
  } catch {
    return null
  }
}

/**
 * Combined check: shared Redis first, memory fallback second.
 * Async because of the Redis hop — use in routes that can await.
 */
export async function checkRateLimitAuto(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfterMs: number; backend: 'redis' | 'memory' }> {
  const shared = await checkRateLimitShared(key, limit, windowMs)
  if (shared) return { ...shared, backend: 'redis' as const }
  return { ...checkRateLimit(key, limit, windowMs), backend: 'memory' as const }
}
