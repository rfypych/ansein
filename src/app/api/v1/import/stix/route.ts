import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { created, jsonError, withErrorHandler, requireUser } from '@/lib/api'
import { parseStixBundle } from '@/lib/services/stix-import'

export const dynamic = 'force-dynamic'

export const POST = withErrorHandler(async (req: NextRequest) => {
  const user = await requireUser(req)

  let body: any
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'invalid_json', 'Invalid STIX 2.1 JSON payload')
  }

  const { title, description, entities, relationships } = parseStixBundle(body)

  if (entities.length === 0) {
    return jsonError(422, 'empty_bundle', 'No recognizable STIX 2.1 objects found in bundle')
  }

  // Create new investigation from imported bundle
  const inv = await db.investigation.create({
    data: {
      userId: user.id,
      title: title || 'Imported STIX 2.1 Bundle',
      description: description || 'Imported from STIX 2.1 JSON file',
      status: 'completed',
      severityScore: 70,
      tags: JSON.stringify(['stix2.1', 'import']),
    },
  })

  // Store original source
  await db.source.create({
    data: {
      investigationId: inv.id,
      sourceType: 'file',
      title: 'stix-bundle.json',
      content: JSON.stringify(body).slice(0, 50000),
      mimeType: 'application/json',
      sizeBytes: JSON.stringify(body).length,
    },
  })

  // Insert Entities and track STIX ID mapping
  const stixToDbId = new Map<string, number>()

  for (const ent of entities) {
    const createdEntity = await db.entity.create({
      data: {
        investigationId: inv.id,
        entityType: ent.entityType,
        value: ent.value,
        normalized: ent.value.toLowerCase(),
        confidence: ent.confidence,
        sourceMethod: 'stix_import',
        enrichment: '{}',
      },
    })
    stixToDbId.set(ent.stixId, createdEntity.id)
  }

  // Insert Relationships
  let relCount = 0
  for (const rel of relationships) {
    const srcId = stixToDbId.get(rel.sourceStixId)
    const tgtId = stixToDbId.get(rel.targetStixId)
    if (srcId && tgtId) {
      await db.relationship.create({
        data: {
          investigationId: inv.id,
          sourceId: srcId,
          targetId: tgtId,
          relationType: rel.relationType,
          weight: 1,
          evidence: rel.evidence,
        },
      })
      relCount++
    }
  }

  return created({
    investigation_id: inv.id,
    title: inv.title,
    entities_imported: entities.length,
    relationships_imported: relCount,
  })
})
