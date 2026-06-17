import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  ok,
  jsonError,
  withErrorHandler,
  requireUser,
} from '@/lib/api'
import { regexExtract } from '@/lib/engines/extraction'
import { enrichEntity, type EnrichmentData } from '@/lib/engines/enrichment'
import { decrypt } from '@/lib/crypto'

export const dynamic = 'force-dynamic'

const AnalyzeSchema = z.object({
  text: z.string().min(1).max(10000),
})

interface IocResult {
  type: string
  value: string
  confidence: number
  enrichment: EnrichmentData
  admiralty: string
}

/**
 * IOC Playground — instant extraction + enrichment without creating an investigation.
 * Pastes raw text, extracts IOCs via regex, enriches them with BYOK keys, returns results.
 */
async function handler(req: NextRequest) {
  const user = await requireUser(req)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'invalid_body', 'Invalid JSON body')
  }
  const parsed = AnalyzeSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(422, 'validation_error', parsed.error.issues[0]?.message || 'Invalid input')
  }

  const text = parsed.data.text

  // Extract IOCs via regex
  const hits = regexExtract(text)
  // Only keep IOC types (not identity/email, target, etc.)
  const iocHits = hits.filter((h) => h.entity_type.startsWith('ioc_') || h.entity_type === 'vulnerability')

  if (iocHits.length === 0) {
    return ok({
      iocs: [],
      total: 0,
      message: 'No IOCs detected in the provided text.',
    })
  }

  // Get user enrichment keys
  const settings = await db.userSettings.findUnique({ where: { userId: user.id } })
  const enrichKeys = {
    virustotal_api_key: settings?.virustotalApiKey ? decrypt(settings.virustotalApiKey) : undefined,
    abuseipdb_api_key: settings?.abuseipdbApiKey ? decrypt(settings.abuseipdbApiKey) : undefined,
    shodan_api_key: settings?.shodanApiKey ? decrypt(settings.shodanApiKey) : undefined,
  }

  // Enrich each IOC (limit to first 20 to avoid rate limits)
  const results: IocResult[] = []
  for (const hit of iocHits.slice(0, 20)) {
    let enrichment: EnrichmentData = {}
    try {
      enrichment = await enrichEntity(
        hit.entity_type as any,
        hit.value,
        enrichKeys
      )
    } catch {
      enrichment = {}
    }
    // Compute a simple admiralty-like code
    const hasEnrich = Object.keys(enrichment).length > 0
    const admiralty = hasEnrich ? 'B1' : 'C2'
    results.push({
      type: hit.entity_type,
      value: hit.value,
      confidence: hit.confidence,
      enrichment,
      admiralty,
    })
  }

  return ok({
    iocs: results,
    total: results.length,
    summary: {
      total_extracted: iocHits.length,
      enriched: results.filter((r) => Object.keys(r.enrichment).length > 0).length,
      malicious: results.filter((r) => {
        return Object.values(r.enrichment).some((v) => {
          if (!v || typeof v !== 'object') return false
          const d = v as Record<string, unknown>
          return (typeof d?.malicious === 'number' && d.malicious > 0) ||
            (typeof d?.abuse_score === 'number' && d.abuse_score >= 75)
        })
      }).length,
    },
  })
}

export const POST = withErrorHandler(handler)
