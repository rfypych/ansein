import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { created, jsonError, withErrorHandler, requireUser } from '@/lib/api'
import { regexExtract, inferRelationships, normalizeValue, contentHash } from '@/lib/engines/extraction'
import { severityBreakdown } from '@/lib/engines/analysis'

export const dynamic = 'force-dynamic'

const BulkSchema = z.object({
  title: z.string().max(255).optional().default('Bulk IOC import'),
  description: z.string().max(10000).optional().default(''),
  content: z.string().min(1).max(200_000),
})

const MAX_ENTITIES = 2000

/**
 * POST /api/v1/import/iocs — bulk IOC intake for analysts living in CSVs
 * and paste buffers. Deterministic regex extraction only: no LLM calls, no
 * tokens, completes in milliseconds. Heuristic relationships + transparent
 * severity, same engines as the pipeline.
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const user = await requireUser(req)
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'invalid_json', 'Invalid JSON payload')
  }
  const parsed = BulkSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(422, 'validation_error', parsed.error.issues[0]?.message || 'Invalid input')
  }
  const { title, description, content } = parsed.data

  const inv = await db.investigation.create({
    data: {
      userId: user.id,
      title,
      description: description || 'Bulk IOC import (regex extraction, no LLM)',
      status: 'extracting',
      tags: ['bulk-import'],
    },
  })
  await db.source.create({
    data: {
      investigationId: inv.id,
      sourceType: 'text',
      title: 'bulk-iocs.txt',
      content: content.slice(0, 200_000),
      contentHash: contentHash(content),
      mimeType: 'text/plain',
      sizeBytes: Buffer.byteLength(content, 'utf8'),
    },
  })

  const hits = regexExtract(content).slice(0, MAX_ENTITIES)
  const valueToId = new Map<string, number>()
  for (const h of hits) {
    const normalized = normalizeValue(h.entity_type, h.value)
    const createdEntity = await db.entity.create({
      data: {
        investigationId: inv.id,
        entityType: h.entity_type,
        value: h.value,
        normalized,
        confidence: h.confidence,
        sourceMethod: 'regex',
        enrichment: {},
      },
    })
    valueToId.set(normalized.toLowerCase(), createdEntity.id)
  }

  const extracted = hits.map((h) => ({
    entity_type: h.entity_type,
    value: h.value,
    normalized: normalizeValue(h.entity_type, h.value),
    confidence: h.confidence,
    source_method: 'regex' as const,
  }))
  const rels = inferRelationships(extracted, content)
  let relCount = 0
  for (const r of rels) {
    const srcId = valueToId.get(r.source)
    const tgtId = valueToId.get(r.target)
    if (!srcId || !tgtId || srcId === tgtId) continue
    await db.relationship.create({
      data: {
        investigationId: inv.id,
        sourceId: srcId,
        targetId: tgtId,
        relationType: r.relation_type,
        weight: r.weight,
        evidence: r.evidence,
      },
    })
    relCount++
  }

  const breakdown = severityBreakdown(
    extracted.map((e) => ({ entity_type: e.entity_type, enrichment: {} })),
    []
  )
  await db.investigation.update({
    where: { id: inv.id },
    data: { status: 'completed', severityScore: breakdown.total },
  })

  return created({
    investigation_id: inv.id,
    entities_imported: hits.length,
    relationships_imported: relCount,
    severity_score: breakdown.total,
  })
})
