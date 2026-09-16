import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  ok,
  jsonError,
  withErrorHandler,
  requireUser,
  optionalUser,
  getClientIp,
  safeStringifyJson,
} from '@/lib/api'
import { contentHash } from '@/lib/engines/extraction'
import { redactPII } from '@/lib/pii-redact'
import { appendAuditLog } from '@/lib/audit-chain'

export const dynamic = 'force-dynamic'

// ----------------------------------------------------------------------------
// Rate limiting — simple in-memory counter per IP, 100 requests per minute.
// Each IP gets a sliding 60-second window. We keep a tiny LRU of recent IPs
// to bound memory in case of a flood from many distinct addresses.
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 100
const RATE_LIMIT_BUCKETS = 256

interface RateBucket {
  count: number
  windowStart: number
}
const rateBuckets = new Map<string, RateBucket>()

/** Returns true if the IP is within the rate limit; false if it should be 429'd. */
function rateLimitCheck(ip: string): boolean {
  const now = Date.now()
  const existing = rateBuckets.get(ip)
  if (!existing || now - existing.windowStart > RATE_LIMIT_WINDOW_MS) {
    // New window for this IP.
    rateBuckets.set(ip, { count: 1, windowStart: now })
    // Opportunistic eviction: if we've grown past the bucket cap, drop the
    // oldest entries so memory stays bounded under a flood of distinct IPs.
    if (rateBuckets.size > RATE_LIMIT_BUCKETS) {
      const oldest = [...rateBuckets.entries()]
        .sort((a, b) => a[1].windowStart - b[1].windowStart)
        .slice(0, rateBuckets.size - RATE_LIMIT_BUCKETS)
      for (const [key] of oldest) rateBuckets.delete(key)
    }
    return true
  }
  existing.count += 1
  return existing.count <= RATE_LIMIT_MAX
}

// ----------------------------------------------------------------------------
// Request body schema. Mirrors the spec exactly:
//   source        — one of the recognised SIEM/email-gateway types
//   alert_type    — phishing | malware | c2 | suspicious | custom
//   title         — human-readable alert title
//   raw_data      — the threat content / IOCs to ingest
//   severity_hint — optional low|medium|high|critical
//   auto_investigate — optional boolean (default false)
const IngestSchema = z.object({
  source: z.enum(['splunk', 'elastic', 'email-gateway', 'custom']),
  alert_type: z.enum(['phishing', 'malware', 'c2', 'suspicious', 'custom']),
  title: z.string().min(1).max(255),
  raw_data: z.string().min(1).max(2_000_000),
  severity_hint: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  auto_investigate: z.boolean().optional().default(false),
})

/**
 * Resolve the user making the request. Two auth modes:
 *   1. Bearer token — standard user JWT (preferred when the SIEM has one).
 *   2. X-Webhook-Key header — checked against AppConfig.webhook_secret.
 *
 * Returns `{ user, authMode }` or null if neither auth mode succeeded.
 */
async function resolveAuth(req: NextRequest): Promise<{ user: { id: number; email: string } | null; authMode: 'bearer' | 'webhook' | 'none'; webhookUser: { id: number } | null }> {
  // Try Bearer first.
  const bearerUser = await optionalUser(req)
  if (bearerUser) {
    return { user: { id: bearerUser.id, email: bearerUser.email }, authMode: 'bearer', webhookUser: null }
  }
  // Fall back to webhook key.
  const webhookKey = req.headers.get('x-webhook-key') || req.headers.get('X-Webhook-Key')
  if (webhookKey) {
    const secret = await db.appConfig.findUnique({ where: { key: 'webhook_secret' } })
    if (secret && secret.value && webhookKey === secret.value) {
      // Webhook auth — there's no associated user. Use the first superuser as
      // the owner of webhook-created investigations so the FK is satisfied.
      // (Webhook ingestion is a privileged integration; only admins configure it.)
      const admin = await db.user.findFirst({ where: { isSuperuser: true }, orderBy: { id: 'asc' } })
      if (admin) {
        return { user: null, authMode: 'webhook', webhookUser: { id: admin.id } }
      }
    }
  }
  return { user: null, authMode: 'none', webhookUser: null }
}

async function handler(req: NextRequest) {
  // ---- Rate limit (per IP) ----
  const ip = getClientIp(req)
  if (!rateLimitCheck(ip)) {
    return jsonError(429, 'rate_limited', 'Rate limit exceeded (100 req/min per IP). Please retry shortly.')
  }

  // ---- Auth ----
  const { user, authMode, webhookUser } = await resolveAuth(req)
  if (authMode === 'none') {
    // If a webhook key was provided but no webhook_secret is configured, give
    // a specific actionable error. Otherwise this is just an unauthenticated
    // request — return standard 401.
    const webhookKey = req.headers.get('x-webhook-key') || req.headers.get('X-Webhook-Key')
    if (webhookKey) {
      const secret = await db.appConfig.findUnique({ where: { key: 'webhook_secret' } })
      if (!secret || !secret.value) {
        return jsonError(403, 'webhook_not_configured', 'Webhook ingestion not configured. Set webhook_secret in app config.')
      }
    }
    return jsonError(401, 'unauthorized', 'Not authenticated. Provide a Bearer token or X-Webhook-Key header.')
  }

  // ---- Body validation ----
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'invalid_body', 'Invalid JSON body')
  }
  const parsed = IngestSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(422, 'validation_error', parsed.error.issues[0]?.message || 'Invalid input')
  }
  const payload = parsed.data

  // Resolve the owning user. For Bearer auth, that's the caller. For webhook
  // auth, we use the admin user identified during auth resolution.
  const ownerUser = user ?? webhookUser
  if (!ownerUser) {
    return jsonError(500, 'internal', 'Could not resolve owner for webhook ingestion.')
  }

  // ---- PII redaction on the raw_data before persistence ----
  const piiResult = redactPII(payload.raw_data)
  const safeContent = piiResult.redacted
  const piiNote = piiResult.found > 0 ? ` [PII REDACTED: ${piiResult.found} items]` : ''

  // ---- Create the investigation ----
  // Tags include the alert_type so playbooks/triggers can key off it later.
  const tags = [payload.alert_type, `source:${payload.source}`]
  if (payload.severity_hint) tags.push(`severity:${payload.severity_hint}`)

  const inv = await db.investigation.create({
    data: {
      userId: ownerUser.id,
      title: `${payload.title}${piiNote}`,
      description: `Auto-ingested via ${payload.source} webhook · alert_type=${payload.alert_type}${payload.severity_hint ? ` · severity_hint=${payload.severity_hint}` : ''}`,
      tags,
      status: 'pending',
    },
  })

  // ---- Add the raw_data as a text source ----
  await db.source.create({
    data: {
      investigationId: inv.id,
      sourceType: 'text',
      title: `${payload.source} · ${payload.alert_type}`,
      content: safeContent,
      contentHash: contentHash(safeContent),
      mimeType: 'text/plain',
      sizeBytes: Buffer.byteLength(safeContent, 'utf8'),
    },
  })

  // ---- Audit log: webhook.ingest ----
  await appendAuditLog(db, {
    userId: ownerUser.id,
    action: 'webhook.ingest',
    targetType: 'investigation',
    targetId: inv.id,
    ipAddress: ip,
    extraMetadata: {
      source: payload.source,
      alert_type: payload.alert_type,
      severity_hint: payload.severity_hint || null,
      auto_investigate: payload.auto_investigate,
      investigation_id: inv.id,
      pii_redacted_count: piiResult.found,
      auth_mode: authMode,
    },
  })

  // ---- Optional: run the pipeline immediately ----
  // Lazy-import the pipeline to avoid pulling LLM/enrichment modules into the
  // cold-start path for the common (auto_investigate=false) case.
  let pipelineStatus: 'skipped' | 'started' | 'failed' = 'skipped'
  let pipelineError: string | null = null
  if (payload.auto_investigate) {
    try {
      const { runPipeline } = await import('@/lib/services/pipeline')
      // Run synchronously so the webhook response can include the final status.
      // This is acceptable for typical alert payloads (a few KB of IOCs); very
      // large payloads may exceed webhook timeouts and should set
      // auto_investigate=false and trigger the pipeline separately.
      await runPipeline(inv.id, ownerUser.id)
      pipelineStatus = 'started'
    } catch (e) {
      pipelineStatus = 'failed'
      pipelineError = e instanceof Error ? e.message : String(e)
    }
  }

  return ok({
    investigation_id: inv.id,
    auto_investigate: payload.auto_investigate,
    pipeline_status: pipelineStatus,
    pipeline_error: pipelineError,
    pii_redacted_count: piiResult.found,
    auth_mode: authMode,
  })
}

export const POST = withErrorHandler(handler)
