import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, jsonError, withErrorHandler, requireUser, parsePageParams, safeParseJson } from '@/lib/api'
import { verifyAuditChain, backfillAuditChain } from '@/lib/audit-chain'
import { canViewFullAuditLog, can } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/audit
 *
 * - editor+ roles: see the full cross-user audit log (canViewFullAuditLog).
 * - analyst role:  see only their own actions (filtered by userId).
 *
 * The response shape is identical in both cases so the UI doesn't need to
 * branch — analysts simply see a subset.
 */
async function list(req: NextRequest) {
  const user = await requireUser(req)
  const viewFull = canViewFullAuditLog(user)
  const { page, pageSize } = parsePageParams(req)
  const where = viewFull ? {} : { userId: user.id }
  const [total, items] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])
  return ok({
    items: items.map((a) => ({
      id: a.id,
      user_id: a.userId,
      action: a.action,
      target_type: a.targetType,
      target_id: a.targetId,
      ip_address: a.ipAddress,
      extra_metadata: safeParseJson<Record<string, unknown>>(a.extraMetadata, {}),
      prev_hash: a.prevHash,
      entry_hash: a.entryHash,
      created_at: a.createdAt.toISOString(),
    })),
    total,
    page,
    page_size: pageSize,
    scope: viewFull ? 'workspace' : 'own',
  })
}

/**
 * POST /api/v1/audit
 *
 * Runs verifyAuditChain against the most recent N entries (default 500,
 * capped at 5,000) and returns the validity status plus the id of the
 * first broken row (if any). Admin-only (audit.verify_chain permission).
 */
async function verify(req: NextRequest) {
  const user = await requireUser(req)
  if (!can(user, 'audit.verify_chain')) {
    return jsonError(403, 'forbidden', 'Administrator access required')
  }
  const url = new URL(req.url)
  const sampleSize = Math.min(5000, Math.max(50, Number(url.searchParams.get('sample') || '500')))
  // Pull the most recent entries — verifyAuditChain sorts ascending internally,
  // so passing them in descending order is fine.
  const entries = await db.auditLog.findMany({
    orderBy: { id: 'desc' },
    take: sampleSize,
  })
  const result = await verifyAuditChain(db, entries)
  return ok({
    ...result,
    sample_size: entries.length,
    scanned_range:
      entries.length > 0
        ? { from: Math.min(...entries.map((e) => e.id)), to: Math.max(...entries.map((e) => e.id)) }
        : null,
  })
}

/**
 * POST /api/v1/audit/backfill
 *
 * One-time maintenance: fills prevHash/entryHash for rows created before
 * hash-chaining was consistently applied (empty-hash rows), using the
 * CURRENT canonicalization. Rows that already carry a hash — even ones from
 * a legacy algorithm era that can no longer be reproduced — are left
 * untouched (rewriting history would destroy evidence, not repair it).
 * Those stay reported as a legacy prefix by verifyAuditChain.
 * Admin-only. Idempotent: safe to run repeatedly.
 */
async function backfill(req: NextRequest) {
  const user = await requireUser(req)
  if (!can(user, 'audit.verify_chain')) {
    return jsonError(403, 'forbidden', 'Administrator access required')
  }
  const summary = await backfillAuditChain(db)
  return ok(summary)
}

export const GET = withErrorHandler(list)
export const POST = withErrorHandler(verify)
export const PUT = withErrorHandler(backfill)
