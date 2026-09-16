/**
 * Indicator decay — OpenCTI-style lifecycle scoring, zero-dependency.
 *
 * Threat intel rots: a C2 IP from 6 months ago is far less actionable than
 * one seen yesterday, while a file hash stays lethal indefinitely. Each
 * entity type gets a half-life; reported confidence decays exponentially:
 *
 *   decayed = base * 0.5 ^ (ageDays / halfLifeDays)
 *
 * Types without meaningful rot (actors, malware families, techniques,
 * targets) are marked `stable` and never decay. This mirrors OpenCTI's
 * decay-rule concept (per-type lifetimes, automatic score updates) without
 * requiring background workers — values are computed at read time.
 */

export type Freshness = 'fresh' | 'aging' | 'stale' | 'stable'

/** Half-life in days per entity type. Infinity = does not decay. */
const HALF_LIFE_DAYS: Record<string, number> = {
  ioc_ip: 30,
  ioc_domain: 60,
  ioc_url: 30,
  ioc_hash: 180,
  ioc_wallet: 180,
  vulnerability: 365,
}

const STALE_THRESHOLD = 0.3
const AGING_THRESHOLD = 0.6
const DECAY_FLOOR = 0.05

export interface DecayInfo {
  decayed_confidence: number
  age_days: number
  freshness: Freshness
  /** False for entity types that do not rot (actors, tools, techniques...). */
  decays: boolean
}

export function decayEntity(
  entityType: string,
  baseConfidence: number,
  createdAt: Date | string,
  now: Date = new Date()
): DecayInfo {
  const halfLife = HALF_LIFE_DAYS[entityType]
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt)
  const ageMs = Math.max(0, now.getTime() - created.getTime())
  const ageDays = ageMs / 86_400_000

  if (!halfLife || !Number.isFinite(halfLife)) {
    return {
      decayed_confidence: Math.min(1, Math.max(0, baseConfidence)),
      age_days: Math.floor(ageDays),
      freshness: 'stable',
      decays: false,
    }
  }

  const decayed = Math.max(
    DECAY_FLOOR,
    baseConfidence * Math.pow(0.5, ageDays / halfLife)
  )
  return {
    decayed_confidence: Math.min(1, decayed),
    age_days: Math.floor(ageDays),
    freshness: decayed >= AGING_THRESHOLD ? 'fresh' : decayed >= STALE_THRESHOLD ? 'aging' : 'stale',
    decays: true,
  }
}
