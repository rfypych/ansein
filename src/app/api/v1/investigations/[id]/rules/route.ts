import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, jsonError, withErrorHandler, requireUser } from '@/lib/api'
import {
  generateSigmaRule,
  generateYaraRule,
  generateSuricataRules,
  generateKqlQuery,
} from '@/lib/engines/detection-rules'
import { defang, isGroundedInText } from '@/lib/engines/extraction'

export const dynamic = 'force-dynamic'

export const GET = withErrorHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requireUser(req)
  const resolvedParams = await params
  const id = Number(resolvedParams.id)
  if (isNaN(id)) return jsonError(400, 'invalid_id', 'Investigation ID must be a number')

  const inv = await db.investigation.findUnique({
    where: { id },
    include: {
      // Analyst-adjudicated false positives never ship in detection content
      entities: { where: { isFalsePositive: false } },
      sources: { select: { content: true } },
    },
  })

  if (!inv) return jsonError(404, 'not_found', 'Investigation not found')

  // SIEM safety: only grounded IOCs become detection content. An ungrounded
  // (LLM-paraphrased, absent from sources) value must never ship in a rule.
  const corpus = defang(inv.sources.map((s) => s.content).join('\n')).toLowerCase()
  const ips: string[] = []
  const domains: string[] = []
  const hashes: string[] = []
  const urls: string[] = []
  let unverifiedExcluded = 0

  for (const e of inv.entities) {
    const isIoc =
      e.entityType === 'ioc_ip' ||
      e.entityType === 'ioc_domain' ||
      e.entityType === 'ioc_hash' ||
      e.entityType === 'ioc_url'
    if (!isIoc) continue
    if (
      e.sourceMethod !== 'regex' &&
      e.sourceMethod !== 'both' &&
      e.sourceMethod !== 'stix_import' &&
      !isGroundedInText(e.value, e.entityType, corpus)
    ) {
      unverifiedExcluded++
      continue
    }
    if (e.entityType === 'ioc_ip') ips.push(e.value)
    else if (e.entityType === 'ioc_domain') domains.push(e.value)
    else if (e.entityType === 'ioc_hash') hashes.push(e.value)
    else if (e.entityType === 'ioc_url') urls.push(e.value)
  }

  const sev = inv.severityScore >= 80 ? 'critical' : inv.severityScore >= 60 ? 'high' : inv.severityScore >= 30 ? 'medium' : 'low'

  const input = {
    title: inv.title,
    description: inv.description,
    severity: sev as any,
    iocs: { ips, domains, hashes, urls },
  }

  const sigma = generateSigmaRule(input)
  const yara = generateYaraRule(input)
  const suricata = generateSuricataRules(input)
  const kql = generateKqlQuery(input)

  return ok({
    investigation_id: inv.id,
    title: inv.title,
    unverified_excluded: unverifiedExcluded,
    rules: {
      sigma,
      yara,
      suricata,
      kql,
    },
  })
})
