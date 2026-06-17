import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, jsonError, withErrorHandler, requireUser } from '@/lib/api'
import { buildJsonExport, buildStixBundle, buildPdfHtml } from '@/lib/services/export'

export const dynamic = 'force-dynamic'

async function handler(req: NextRequest, ctx: { params: Promise<{ id: string; format: string }> }) {
  const user = await requireUser(req)
  const { id, format } = await ctx.params
  const invId = Number(id)
  if (!Number.isFinite(invId)) return jsonError(400, 'invalid_id', 'Invalid investigation ID')

  const inv = await db.investigation.findFirst({
    where: { id: invId, userId: user.id },
    include: {
      sources: true,
      entities: true,
      relationships: true,
      analysisRuns: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  })
  if (!inv) return jsonError(404, 'not_found', 'Investigation not found')

  const fmt = format.toLowerCase()

  if (fmt === 'json') {
    const bundle = buildJsonExport(
      inv,
      inv.sources,
      inv.entities,
      inv.relationships,
      inv.analysisRuns[0] || null
    )
    return ok(bundle)
  }

  if (fmt === 'stix') {
    const bundle = buildStixBundle(inv, inv.entities, inv.relationships)
    return ok(bundle)
  }

  if (fmt === 'pdf') {
    const html = buildPdfHtml(inv, inv.entities, inv.relationships, inv.analysisRuns[0] || null)
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="ansein-investigation-${inv.id}.html"`,
      },
    })
  }

  return jsonError(400, 'invalid_format', 'Format must be json, stix, or pdf')
}

export const GET = withErrorHandler(handler)
