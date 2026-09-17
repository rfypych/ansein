/**
 * In-memory sliding-window rate limiter for abuse-sensitive routes (login,
 * register, webhook ingest).
 *
 * HONEST LIMITATION: serverless functions are stateless and horizontally
 * scaled — each instance holds its own counters, so this is a per-instance
 * speed bump, not a global lock. It still defeats naive single-connection
 * brute force (the common case) at zero cost and zero dependencies. The real
 * fix for distributed enforcement is a shared counter (e.g. Upstash Redis
 * free tier); graduate to that when abuse is actually observed.
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
