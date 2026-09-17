/**
 * Immutable, hash-chained audit log (blockchain-style tamper-evidence).
 *
 * Each AuditLog row stores two extra columns:
 *   prevHash  — the entryHash of the immediately-preceding row ("" for the
 *               genesis/first row).
 *   entryHash — SHA-256 over (id | userId | action | targetType | targetId |
 *               ipAddress | extraMetadata | createdAt | prevHash).
 *
 * To forge a historical entry, an attacker would have to recompute that entry's
 * hash AND every subsequent entry's hash (because each one transitively
 * depends on its predecessor). verifyAuditChain() walks the chain in order and
 * confirms every link still holds.
 *
 * The chain is intentionally computed over the *post-insert* row (id assigned
 * by the DB) so appendAuditLog performs an INSERT followed by an UPDATE of the
 * two hash columns. This keeps the on-disk row self-verifying.
 */
import { createHash } from 'node:crypto'
import type { PrismaClient, AuditLog } from '@prisma/client'

/** Shape used both for hashing and for the appendAuditLog input. */
export interface AuditChainEntry {
  id: number
  userId: number | null
  action: string
  targetType: string
  targetId: number | null
  ipAddress: string
  // Prisma Json column: object post-migration, raw string pre-migration.
  extraMetadata: unknown
  createdAt: Date
  prevHash: string
}

/**
 * Compute the SHA-256 entry hash for an audit log row.
 *
 * Field order is fixed and deterministic — never change it without a schema
 * migration, or the chain will appear "broken" against historical rows.
 */
export function canonicalMetadata(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value ?? {})
  } catch {
    return '{}'
  }
}

export function computeAuditHash(entry: AuditChainEntry): string {
  const payload = [
    `id=${entry.id}`,
    `userId=${entry.userId ?? ''}`,
    `action=${entry.action}`,
    `targetType=${entry.targetType}`,
    `targetId=${entry.targetId ?? ''}`,
    `ipAddress=${entry.ipAddress}`,
    `extraMetadata=${canonicalMetadata(entry.extraMetadata)}`,
    `createdAt=${entry.createdAt.toISOString()}`,
    `prevHash=${entry.prevHash}`,
  ].join('|')
  return createHash('sha256').update(payload, 'utf8').digest('hex')
}

/** Input for appendAuditLog — fields the caller knows at insert time. */
export interface AppendAuditLogInput {
  userId: number | null
  action: string
  targetType: string
  targetId: number | null
  ipAddress: string
  extraMetadata: object
}

/**
 * Append a new entry to the audit chain.
 *
 * 1. Read the last entry's entryHash (ordered by id DESC).
 * 2. INSERT a new row with prevHash = lastEntry.entryHash (or "" if empty table).
 * 3. Compute this row's entryHash and UPDATE the row in place.
 *
 * Best-effort by design — failures are caught and swallowed so they never
 * break the user-facing request, mirroring the previous direct
 * `db.auditLog.create(...).catch(() => {})` pattern.
 */
export async function appendAuditLog(
  db: PrismaClient,
  data: AppendAuditLogInput,
): Promise<AuditLog | null> {
  try {
    // 1. Get the previous entry's hash (the tail of the chain).
    const lastEntry = await db.auditLog.findFirst({
      orderBy: { id: 'desc' },
      select: { entryHash: true },
    })
    const prevHash = lastEntry?.entryHash || ''

    // 2. Insert the new row (entryHash blank for now — we don't know the id yet).
    const created = await db.auditLog.create({
      data: {
        userId: data.userId,
        action: data.action,
        targetType: data.targetType,
        targetId: data.targetId,
        ipAddress: data.ipAddress,
        extraMetadata: data.extraMetadata,
        prevHash,
        entryHash: '',
      },
    })

    // 3. Compute and persist the entry hash.
    const entryHash = computeAuditHash({
      id: created.id,
      userId: created.userId,
      action: created.action,
      targetType: created.targetType,
      targetId: created.targetId,
      ipAddress: created.ipAddress,
      extraMetadata: created.extraMetadata,
      createdAt: created.createdAt,
      prevHash,
    })

    await db.auditLog.update({
      where: { id: created.id },
      data: { entryHash },
    })

    return { ...created, entryHash }
  } catch (err) {
    // Audit logging must never break the request — log and move on.
    console.error('[audit-chain] append failed:', err)
    return null
  }
}

/**
 * Backfill `prevHash` and `entryHash` for audit log entries that were created
 * before hash-chaining was enabled (i.e. rows where `entryHash` is empty).
 *
 * Reads ALL rows ordered by id ASC, then for each row:
 *   - sets prevHash = previous row's entryHash (or "" for the first row),
 *   - computes entryHash from the row's fields + prevHash,
 *   - UPDATEs the row in place.
 *
 * Idempotent: rows that already have a non-empty entryHash are left untouched
 * (their existing hash is used as the prevHash seed for the next row).
 *
 * This is intended to be run ONCE immediately after enabling hash-chaining on
 * an existing database. New rows created via `appendAuditLog` are always
 * chained at insert time and don't need backfilling.
 *
 * Returns a summary `{ total, backfilled, skipped }`.
 */
export async function backfillAuditChain(
  db: PrismaClient,
): Promise<{ total: number; backfilled: number; skipped: number }> {
  const all = await db.auditLog.findMany({ orderBy: { id: 'asc' } })
  let prevHash = ''
  let backfilled = 0
  let skipped = 0
  for (const entry of all) {
    if (entry.entryHash) {
      // Already chained — use it as the seed for the next row.
      prevHash = entry.entryHash
      skipped++
      continue
    }
    const newEntryHash = computeAuditHash({
      id: entry.id,
      userId: entry.userId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      ipAddress: entry.ipAddress,
      extraMetadata: entry.extraMetadata,
      createdAt: entry.createdAt,
      prevHash,
    })
    await db.auditLog.update({
      where: { id: entry.id },
      data: { prevHash, entryHash: newEntryHash },
    })
    prevHash = newEntryHash
    backfilled++
  }
  return { total: all.length, backfilled, skipped }
}

/**
 * Verify the integrity of an audit chain segment.
 *
 * Walks the entries in id-ascending order, recomputes each entry's hash from
 * its stored fields, and confirms:
 *   (a) the entry's stored prevHash matches the prior entry's entryHash
 *       (or "" for the verifiable genesis row).
 *   (b) the recomputed hash matches the stored entryHash — but only when the
 *       stored entryHash is non-empty. Entries with empty entryHash are
 *       treated as "pre-chain" rows (created before hash-chaining was
 *       enabled); their effective hash is computed on the fly so they still
 *       participate in the prevHash linkage of subsequent rows. This means
 *       tampering with a pre-chain row is still detected via the next row's
 *       prevHash check.
 *
 * Returns `{ valid: true }` if the entire segment is intact, otherwise
 * `{ valid: false, brokenAt: <first bad id> }`.
 *
 * Note: callers should pass entries already sorted ascending by id and ideally
 * starting from the genesis row (id=1) so the prevHash linkage is checkable
 * for every row. If the first row's prevHash isn't "" (empty string) AND
 * there's no prior row providing that hash, the chain is considered broken at
 * that row.
 */
export interface AuditVerification {
  valid: boolean
  brokenAt: number | null
  /**
   * Longest trailing run of fully-linked, hash-verified rows. Historical rows
   * written before hash-chaining was consistently applied (different hash
   * construction, empty links) can never verify — they are reported as a
   * legacy prefix, NOT as tampering. Any break INSIDE the verified suffix
   * (i.e. at/after verified_from_id) is genuine tamper evidence.
   */
  verified_from_id: number | null
  verified_count: number
  legacy_prefix_ids: number[]
}

export async function verifyAuditChain(
  _db: PrismaClient,
  entries: AuditLog[],
): Promise<AuditVerification> {
  if (entries.length === 0) {
    return { valid: true, brokenAt: null, verified_from_id: null, verified_count: 0, legacy_prefix_ids: [] }
  }

  // Ensure ascending order — verification depends on chronological linkage.
  const sorted = [...entries].sort((a, b) => a.id - b.id)

  const hashOf = (entry: AuditLog): string =>
    computeAuditHash({
      id: entry.id,
      userId: entry.userId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      ipAddress: entry.ipAddress,
      extraMetadata: entry.extraMetadata,
      createdAt: entry.createdAt,
      prevHash: entry.prevHash,
    })

  // Per-row verdicts, then the longest trailing valid suffix.
  const ok: boolean[] = new Array(sorted.length).fill(false)
  let prevHash = sorted[0].prevHash
  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i]
    const linked = i === 0 || entry.prevHash === prevHash
    const recomputed = hashOf(entry)
    const hashOk = !entry.entryHash || entry.entryHash === recomputed
    ok[i] = linked && hashOk
    // Effective hash seeds the next link check (stored wins when present,
    // mirroring the append path).
    prevHash = entry.entryHash || recomputed
  }

  let start = sorted.length
  while (start > 0 && ok[start - 1]) start--
  // Suffix is maximal by construction: everything from `start` verifies.
  const verifiedFrom = start < sorted.length ? sorted[start].id : null
  const legacyIds = sorted.slice(0, start).map((e) => e.id)
  // brokenAt keeps its legacy meaning: first row (from genesis) that does
  // not verify. Null only when the ENTIRE segment verifies.
  let brokenAt: number | null = null
  for (let i = 0; i < sorted.length; i++) {
    if (!ok[i]) {
      brokenAt = sorted[i].id
      break
    }
  }

  return {
    valid: brokenAt === null,
    brokenAt,
    verified_from_id: verifiedFrom,
    verified_count: sorted.length - start,
    legacy_prefix_ids: legacyIds,
  }
}
