/**
 * Analysis engine — LLM narrative + heuristic fallback.
 * Ported from backend/app/engines/analysis.py
 */
import { chatCompletion, isLlmAvailable, type ChatMessage } from '@/lib/llm'
import { computeAdmiralty, type EnrichmentData } from '@/lib/engines/enrichment'
import type { EntityType, UserKeys } from '@/lib/engines/extraction'

export interface EntityForAnalysis {
  entity_type: EntityType
  value: string
  confidence: number
  enrichment: EnrichmentData
}

export interface ActorHypothesis {
  actor: string
  confidence: number
  motivation: string
  origin: string
  reasoning: string
}

export interface ThreatHypothesis {
  scenario: string
  confidence: number
  reasoning: string
  next_steps: string[]
}

export interface AnalysisResult {
  narrative: string
  actor_hypothesis: ActorHypothesis | Record<string, never>
  severity_score: number
  recommendations: string[]
  admiralty_code: string
  confidence: number
  model_used: string
  tokens_used: number
  hypotheses: ThreatHypothesis[]
}

const LLM_SYSTEM = 'You output strict JSON, no prose, no code fences. Use GitHub-flavored Markdown (headings, bold, lists, code blocks) for the narrative and recommendations fields.'

const LLM_PROMPT = `You are a senior cyber threat intelligence analyst. Based on the extracted entities and enrichment data below, write a detailed threat narrative using **GitHub-flavored Markdown** formatting.

Structure your narrative with clear sections using ## headings:

## Overview
Brief summary of the threat (1-2 paragraphs).

## Attack Chain
Describe the primary mechanism and kill chain phases. Use **bold** for key entities and \`inline code\` for IOCs (IPs, domains, hashes).

## Attribution
If entities suggest an actor, provide attribution reasoning with confidence assessment.

## Targets & Impact
Who/what is being targeted and potential impact.

## Severity Assessment
Score (0-100) with justification. Use a table if comparing multiple factors.

## Attack Hypotheses
For each of the following, provide scenario, confidence %, reasoning, and recommended next steps:
1. Lateral Movement Potential
2. Data Exfiltration Risk
3. Persistence & Long-term Access

Cover:
1. What the threat is and its primary mechanism
2. Who is likely behind it (attribution reasoning) — only if entities suggest an actor
3. Who/what is being targeted
4. Severity assessment (0-100) with justification
5. Recommended defensive actions (as a numbered list with **bold** action items)
6. Three attack hypotheses (lateral movement, data exfiltration, persistence)

Return strict JSON with keys: narrative (string, Markdown formatted),
actor_hypothesis (object with keys: actor, confidence, motivation, origin, reasoning),
severity_score (number 0-100), recommendations (array of strings, each Markdown formatted),
hypotheses (array of 3 objects, each with keys: scenario (string), confidence (number 0-100),
reasoning (string, Markdown formatted), next_steps (array of strings)).

ENTITIES:
`

function summariseEntities(entities: EntityForAnalysis[]): string {
  return entities
    .slice(0, 50)
    .map((e) => `- [${e.entity_type}] ${e.value} (conf=${e.confidence.toFixed(2)})`)
    .join('\n')
}

function summariseEnrichment(entities: EntityForAnalysis[]): string {
  const out: string[] = []
  for (const e of entities) {
    const keys = Object.keys(e.enrichment || {})
    if (keys.length === 0) continue
    for (const k of keys) {
      const v = e.enrichment[k]
      if (!v || typeof v !== 'object') continue
      const scalars = Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => typeof x !== 'object' && x !== '')
        .slice(0, 5)
        .map(([kk, vv]) => `${kk}=${vv}`)
        .join(', ')
      if (scalars) out.push(`- ${k}: { ${scalars} }`)
    }
  }
  return out.join('\n') || '(no enrichment data)'
}

// ------------------------------------------------ heuristic fallback
function heuristicSeverity(
  entities: EntityForAnalysis[],
  enrichmentByEntity: EnrichmentData[]
): number {
  const counts: Partial<Record<EntityType, number>> = {}
  for (const e of entities) {
    counts[e.entity_type] = (counts[e.entity_type] || 0) + 1
  }
  let severity = 0
  severity += Math.min(20, (counts.threat_actor || 0) * 20)
  severity += Math.min(20, (counts.malware || 0) * 10)
  severity += Math.min(15, (counts.vulnerability || 0) * 8)
  severity += Math.min(15, (counts.ioc_hash || 0) * 3)
  severity += Math.min(15, (counts.ioc_ip || 0) * 2)
  severity += Math.min(15, (counts.ioc_url || 0) * 3)

  for (const enr of enrichmentByEntity) {
    for (const [, d] of Object.entries(enr)) {
      if (typeof d?.malicious === 'number' && d.malicious > 0) {
        severity += Math.min(10, d.malicious * 2)
      }
      if (typeof d?.abuse_score === 'number' && d.abuse_score >= 75) {
        severity += 5
      }
    }
  }
  return Math.min(100, severity)
}

function heuristicNarrative(entities: EntityForAnalysis[], severity: number): string {
  const counts: Partial<Record<EntityType, number>> = {}
  for (const e of entities) counts[e.entity_type] = (counts[e.entity_type] || 0) + 1
  const total = entities.length
  const typeCount = Object.keys(counts).length
  const topTypes = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t, c]) => `${t} (${c})`)
    .join(', ')

  const tier = severity >= 70 ? 'HIGH' : severity >= 40 ? 'MEDIUM' : 'LOW'
  const tierNote =
    severity >= 70
      ? 'This severity level warrants immediate escalation to incident response.'
      : severity >= 40
      ? 'This severity level indicates moderate risk and should be tracked.'
      : 'This severity level suggests low immediate risk but warrants monitoring.'

  let attribution = ''
  if (counts.threat_actor) {
    const actor = entities.find((e) => e.entity_type === 'threat_actor')?.value || 'unknown'
    attribution = ` Threat actor "${actor}" was identified among the indicators. Attribution confidence is limited without further enrichment.`
  }

  return [
    `This investigation contains ${total} extracted entities across ${typeCount} types. The most prevalent entity types are: ${topTypes}.`,
    `Extracted indicators include ${
      ['ioc_ip', 'ioc_domain', 'ioc_url', 'ioc_hash']
        .filter((t) => counts[t as EntityType])
        .map((t) => `${counts[t as EntityType]} ${t.replace('ioc_', '')}(s)`)
        .join(', ') || 'no technical IOCs'
    }.${attribution}`,
    `Based on the available indicators and enrichment data, the composite severity score is ${severity}/100 (${tier}). ${tierNote}`,
    `Review the extracted entities and recommendations below for defensive actions.`,
  ].join('\n\n')
}

function heuristicActorHypothesis(entities: EntityForAnalysis[]): ActorHypothesis | Record<string, never> {
  const actors = entities.filter((e) => e.entity_type === 'threat_actor')
  if (actors.length === 0) return {}
  return {
    actor: actors[0].value,
    confidence: 0.4,
    motivation: 'Unknown — insufficient enrichment data',
    origin: 'Unknown',
    reasoning: 'Identified from extraction only; no enrichment data to corroborate.',
  }
}

function heuristicRecommendations(
  entities: EntityForAnalysis[],
  severity: number
): string[] {
  const counts: Partial<Record<EntityType, number>> = {}
  for (const e of entities) counts[e.entity_type] = (counts[e.entity_type] || 0) + 1
  const recs: string[] = []
  if (counts.ioc_hash) recs.push(`Block ${counts.ioc_hash} file hash(es) at endpoint EDR / AV consoles.`)
  if (counts.ioc_ip) recs.push(`Add ${counts.ioc_ip} IP indicator(s) to firewall blocklists.`)
  if (counts.ioc_domain || counts.ioc_url) recs.push(`Add domain/URL indicators to proxy and DNS filtering rules.`)
  if (counts.vulnerability) recs.push(`Patch or mitigate ${counts.vulnerability} identified CVE(s) on affected assets.`)
  if (counts.malware) recs.push(`Create detection signatures for ${counts.malware} identified malware family/families.`)
  if (counts.threat_actor) recs.push(`Review known TTPs for the identified threat actor and update detection rules.`)
  if (severity >= 70) recs.push(`Escalate to incident response bridge; activate containment playbooks.`)
  if (recs.length === 0) recs.push('Continue monitoring for additional indicators; enrich existing entities when feeds become available.')
  return recs
}

/**
 * Generate three attack hypotheses (lateral movement, data exfiltration,
 * persistence) from extracted entities. Used as the heuristic fallback and
 * to fill in any hypotheses the LLM omits.
 *
 * Confidence is computed from entity coverage + investigation severity:
 *  - Each hypothesis has a "core" entity-type pair. Confidence is boosted
 *    when both halves are present, when the severity score is high, and
 *    when enrichment corroborates the indicators (malicious flags).
 *  - All confidences are clamped to [0, 100].
 */
export function generateHypotheses(
  entities: EntityForAnalysis[],
  severity: number
): ThreatHypothesis[] {
  const counts: Partial<Record<EntityType, number>> = {}
  for (const e of entities) counts[e.entity_type] = (counts[e.entity_type] || 0) + 1

  // Aggregate enrichment signal (any malicious verdict bumps confidence).
  let maliciousHits = 0
  for (const e of entities) {
    for (const [, d] of Object.entries(e.enrichment || {})) {
      if (typeof d?.malicious === 'number' && d.malicious > 0) maliciousHits += 1
      if (typeof d?.abuse_score === 'number' && d.abuse_score >= 75) maliciousHits += 1
    }
  }
  const sevBoost = Math.min(25, Math.round(severity * 0.25))
  const enrBoost = Math.min(20, maliciousHits * 4)
  const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)))

  // ----- 1. Lateral Movement (IPs + domains) -----
  const hasIp = (counts.ioc_ip || 0) > 0
  const hasDomain = (counts.ioc_domain || 0) > 0
  let latConf = 0
  if (hasIp && hasDomain) latConf = 55
  else if (hasIp || hasDomain) latConf = 30
  latConf += sevBoost + enrBoost
  if (counts.target) latConf += 5
  const latSteps = [
    'Map all internal hosts that have communicated with the implicated external IPs/domains.',
    'Review authentication logs for anomalous logins and new account creation.',
    'Deploy EDR telemetry to detect Pass-the-Hash / Pass-the-Ticket attempts.',
    'Segment the network to contain any identified pivot points.',
  ]
  if (!hasIp && !hasDomain) latSteps.unshift('No network IOCs available — collect internal flow logs first to baseline normal traffic.')

  // ----- 2. Data Exfiltration (URLs + hashes) -----
  const hasUrl = (counts.ioc_url || 0) > 0
  const hasHash = (counts.ioc_hash || 0) > 0
  let exfConf = 0
  if (hasUrl && hasHash) exfConf = 55
  else if (hasUrl || hasHash) exfConf = 30
  exfConf += sevBoost + enrBoost
  if (counts.malware) exfConf += 5
  const exfSteps = [
    'Inventory files matching the identified hashes across the estate.',
    'Inspect proxy egress logs for large or anomalous uploads to the implicated URLs.',
    'Enable DLP rules to flag staging of compressed archives in temp directories.',
    'Correlate DNS beaconing patterns with the identified URLs for C2 staging detection.',
  ]
  if (!hasUrl && !hasHash) exfSteps.unshift('No URL/hash IOCs available — focus on outbound bandwidth baselining until indicators arrive.')

  // ----- 3. Persistence (malware + techniques) -----
  const hasMalware = (counts.malware || 0) > 0
  const hasTechnique = (counts.technique || 0) > 0
  let persConf = 0
  if (hasMalware && hasTechnique) persConf = 55
  else if (hasMalware || hasTechnique) persConf = 30
  persConf += sevBoost + enrBoost
  if (counts.vulnerability) persConf += 5
  const persSteps = [
    'Hunt for the identified malware family across scheduled tasks, run keys, and startup folders.',
    'Audit WMI subscriptions, services, and LSASS injection for the identified techniques.',
    'Pull and preserve volatile memory from suspect hosts for timeline reconstruction.',
    'Validate patch posture against any CVEs leveraged by the malware.',
  ]
  if (!hasMalware && !hasTechnique) persSteps.unshift('No malware/technique entities extracted — review autoruns and persistence mechanisms manually.')

  return [
    {
      scenario: 'Lateral Movement Potential',
      confidence: clamp(latConf),
      reasoning: `Based on **${counts.ioc_ip || 0} IP** and **${counts.ioc_domain || 0} domain** indicators extracted from the source. ` +
        `Combined with a severity score of ${severity}/100${maliciousHits > 0 ? ` and ${maliciousHits} corroborating enrichment hit(s)` : ''}, ` +
        `the adversary is ${hasIp && hasDomain ? 'well-positioned' : 'potentially able'} to pivot from initial foothold into the internal network.`,
      next_steps: latSteps,
    },
    {
      scenario: 'Data Exfiltration Risk',
      confidence: clamp(exfConf),
      reasoning: `Derived from **${counts.ioc_url || 0} URL** and **${counts.ioc_hash || 0} file hash** indicators. ` +
        `URLs paired with file artifacts is a classic staging/exfiltration signature. ` +
        `Severity of ${severity}/100${maliciousHits > 0 ? ` plus ${maliciousHits} enrichment corroboration(s)` : ''} ` +
        `elevates the likelihood of active data movement.`,
      next_steps: exfSteps,
    },
    {
      scenario: 'Persistence & Long-term Access',
      confidence: clamp(persConf),
      reasoning: `Based on **${counts.malware || 0} malware** and **${counts.technique || 0} technique** entities. ` +
        `Presence of named malware families alongside known TTPs strongly suggests the adversary will ` +
        `re-establish footholds after reboots or remediation. Severity ${severity}/100 ` +
        `${maliciousHits > 0 ? `and ${maliciousHits} enrichment hit(s) ` : ''}reinforce the need for persistence hunting.`,
      next_steps: persSteps,
    },
  ]
}

/** Normalise raw hypothesis objects coming back from the LLM. */
function normaliseHypotheses(raw: unknown, fallback: ThreatHypothesis[]): ThreatHypothesis[] {
  if (!Array.isArray(raw) || raw.length === 0) return fallback
  const out: ThreatHypothesis[] = []
  for (const item of raw.slice(0, 3)) {
    if (!item || typeof item !== 'object') continue
    const obj = item as Record<string, unknown>
    const scenario = typeof obj.scenario === 'string' ? obj.scenario : ''
    const confidenceRaw = Number(obj.confidence)
    const confidence = Number.isFinite(confidenceRaw)
      ? Math.min(100, Math.max(0, Math.round(confidenceRaw > 1 ? confidenceRaw : confidenceRaw * 100)))
      : 0
    const reasoning = typeof obj.reasoning === 'string' ? obj.reasoning : ''
    const next_steps = Array.isArray(obj.next_steps)
      ? obj.next_steps.filter((s): s is string => typeof s === 'string')
      : []
    if (!scenario && !reasoning) continue
    out.push({ scenario: scenario || 'Untitled hypothesis', confidence, reasoning, next_steps })
  }
  // Pad with fallback hypotheses if the LLM returned fewer than 3.
  while (out.length < 3 && fallback.length > 0) {
    out.push(fallback[out.length])
  }
  return out
}

// ------------------------------------------------ main entry
export async function analyze(
  entities: EntityForAnalysis[],
  mergedEnrichment: EnrichmentData,
  userKeys: UserKeys = {},
  sourceText = ''
): Promise<AnalysisResult> {
  // Build merged enrichment list per-entity for severity calc
  const enrichmentByEntity = entities.map((e) => e.enrichment)

  // Try LLM analysis if available
  if (isLlmAvailable(userKeys)) {
    try {
      const entitiesSummary = summariseEntities(entities)
      const enrichmentSummary = summariseEnrichment(entities)
      const prompt =
        LLM_PROMPT +
        entitiesSummary +
        '\n\nENRICHMENT SUMMARY:\n' +
        enrichmentSummary +
        (sourceText ? '\n\nSOURCE EXCERPT:\n' + sourceText.slice(0, 2000) : '')

      const messages: ChatMessage[] = [
        { role: 'system', content: LLM_SYSTEM },
        { role: 'user', content: prompt },
      ]
      const resp = await chatCompletion({
        messages,
        temperature: 0.2,
        maxTokens: 2048,
        userKeys,
      })
      const cleaned = resp.content
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim()
      let parsed: {
        narrative?: string
        actor_hypothesis?: ActorHypothesis
        severity_score?: number
        recommendations?: string[]
        hypotheses?: unknown
      } = {}
      try {
        parsed = JSON.parse(cleaned)
      } catch {
        // Fallback: keep raw text as narrative
        parsed = { narrative: resp.content }
      }

      const severity = Math.min(100, Math.max(0, Number(parsed.severity_score) || heuristicSeverity(entities, enrichmentByEntity)))
      const [admiraltyCode, confidence] = computeAdmiralty(mergedEnrichment, 0.7)
      // Normalise actor confidence to 0-1 range (LLMs sometimes return 0-100)
      let actorHypothesis = parsed.actor_hypothesis || heuristicActorHypothesis(entities)
      if (actorHypothesis && typeof actorHypothesis === 'object' && 'confidence' in actorHypothesis) {
        const c = Number((actorHypothesis as Record<string, unknown>).confidence)
        if (Number.isFinite(c)) {
          (actorHypothesis as { confidence: number }).confidence = c > 1 ? c / 100 : c
        }
      }
      return {
        narrative: parsed.narrative || heuristicNarrative(entities, severity),
        actor_hypothesis: actorHypothesis,
        severity_score: severity,
        recommendations: Array.isArray(parsed.recommendations) && parsed.recommendations.length > 0
          ? parsed.recommendations
          : heuristicRecommendations(entities, severity),
        admiralty_code: admiraltyCode,
        confidence,
        model_used: resp.model,
        tokens_used: resp.tokensIn + resp.tokensOut,
        hypotheses: normaliseHypotheses(parsed.hypotheses, generateHypotheses(entities, severity)),
      }
    } catch (e) {
      console.warn('[analysis] LLM failed, using heuristic:', e)
    }
  }

  // Heuristic fallback
  const severity = heuristicSeverity(entities, enrichmentByEntity)
  const [admiraltyCode, confidence] = computeAdmiralty(mergedEnrichment, 0.5)
  return {
    narrative: heuristicNarrative(entities, severity),
    actor_hypothesis: heuristicActorHypothesis(entities),
    severity_score: severity,
    recommendations: heuristicRecommendations(entities, severity),
    admiralty_code: admiraltyCode,
    confidence,
    model_used: 'heuristic',
    tokens_used: 0,
    hypotheses: generateHypotheses(entities, severity),
  }
}
