/**
 * Copilot engine — RAG-style chat grounded in investigation data.
 * Ported from backend/app/engines/copilot.py
 */
import { chatCompletion, isLlmAvailable, type ChatMessage } from '@/lib/llm'
import type { EntityType, UserKeys } from '@/lib/engines/extraction'
import { generateText, CoreMessage } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { getOsintTools } from '@/lib/osint/tools'

export interface CopilotContextEntity {
  entity_type: EntityType
  value: string
  confidence: number
  enrichment: Record<string, unknown>
}

export interface CopilotContext {
  investigationTitle: string
  severityScore: number
  entities: CopilotContextEntity[]
  narrative: string
  sourceText: string
}

export interface CopilotHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface CopilotResult {
  content: string
  tokens_used: number
  model: string
  citations: string[]
}

const SYSTEM_PROMPT = `You are AnseIn Copilot, an assistant for cyber threat intelligence analysts.

Your job:
1. Answer questions about the active investigation using ONLY the provided context.
2. When you cite an entity, say which entity (by value) you're referencing.
3. If the answer isn't in the context, say so — never fabricate.
4. Be concise: 2-4 short paragraphs max, unless asked for detail.
5. Suggest follow-up questions at the end when useful.

Formatting: Use **GitHub-flavored Markdown** for your responses.
- Use **bold** for key entities, threat actors, and important findings.
- Use \`inline code\` for IOCs (IPs, domains, hashes, URLs).
- Use bullet lists for enumerations.
- Use ## headings for longer responses (3+ paragraphs).
- Use tables for comparing entities or enrichment data.
- Use > blockquotes for important warnings or caveats.

Tone: professional, precise, no hype.`

export function buildContext(ctx: CopilotContext): string {
  const entityLines = ctx.entities
    .slice(0, 60)
    .map((e) => `- [${e.entity_type}] ${e.value} (conf=${e.confidence.toFixed(2)})`)
    .join('\n')

  // Enrichment summary
  const enrLines: string[] = []
  for (const e of ctx.entities) {
    const keys = Object.keys(e.enrichment || {})
    if (keys.length === 0) continue
    for (const k of keys) {
      const v = e.enrichment[k] as Record<string, unknown> | undefined
      if (!v || typeof v !== 'object') continue
      const scalars = Object.entries(v)
        .filter(([, x]) => typeof x !== 'object' && x !== '' && x !== null && x !== undefined)
        .slice(0, 5)
        .map(([kk, vv]) => `${kk}=${vv}`)
        .join(', ')
      if (scalars) enrLines.push(`- ${e.value} [${k}]: { ${scalars} }`)
    }
  }

  return [
    `# Active Investigation: ${ctx.investigationTitle}`,
    '',
    '## Severity',
    `${ctx.severityScore} / 100`,
    '',
    `## Extracted Entities (${ctx.entities.length})`,
    entityLines || '(none)',
    '',
    '## Enrichment Summary',
    enrLines.join('\n') || '(no enrichment data)',
    '',
    '## Threat Narrative',
    ctx.narrative || '(no analysis yet)',
    '',
    '## Source Material (truncated)',
    ctx.sourceText.slice(0, 6000) || '(empty)',
  ].join('\n')
}

export async function askCopilot(
  ctx: CopilotContext,
  history: CopilotHistoryMessage[],
  userMessage: string,
  userKeys: UserKeys = {}
): Promise<CopilotResult> {
  if (!isLlmAvailable(userKeys)) {
    return {
      content:
        'No LLM is configured. Add an OpenAI or Groq API key in Settings to enable the Copilot.',
      tokens_used: 0,
      model: 'none',
      citations: [],
    }
  }

  const context = buildContext(ctx)
  const messages: CoreMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: 'CONTEXT:\n' + context },
    ...history.slice(-10).map((m) => ({
      role: m.role,
      content: m.content,
    })) as CoreMessage[],
    { role: 'user', content: userMessage },
  ]

  try {
    const preferred = userKeys.preferred_llm || 'auto'
    
    // Attempt to use Vercel AI SDK for providers that support tools (OpenAI compatible)
    let aiProvider = null;
    let aiModelName = '';
    
    if (preferred === 'openai' && userKeys.openai_api_key) {
      aiProvider = createOpenAI({ apiKey: userKeys.openai_api_key, baseURL: process.env.OPENAI_API_BASE || 'https://api.openai.com/v1' })
      aiModelName = process.env.OPENAI_MODEL || 'gpt-4o-mini'
    } else if (preferred === 'groq' && userKeys.groq_api_key) {
      aiProvider = createOpenAI({ apiKey: userKeys.groq_api_key, baseURL: process.env.GROQ_API_BASE || 'https://api.groq.com/openai/v1' })
      aiModelName = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
    } else if (preferred === 'custom' && userKeys.custom_llm_base_url && userKeys.custom_llm_model) {
      aiProvider = createOpenAI({ apiKey: userKeys.custom_llm_api_key || '', baseURL: userKeys.custom_llm_base_url })
      aiModelName = userKeys.custom_llm_model
    } else if (userKeys.groq_api_key) {
      aiProvider = createOpenAI({ apiKey: userKeys.groq_api_key, baseURL: process.env.GROQ_API_BASE || 'https://api.groq.com/openai/v1' })
      aiModelName = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
    } else if (userKeys.openai_api_key) {
      aiProvider = createOpenAI({ apiKey: userKeys.openai_api_key, baseURL: process.env.OPENAI_API_BASE || 'https://api.openai.com/v1' })
      aiModelName = process.env.OPENAI_MODEL || 'gpt-4o-mini'
    }

    let finalContent = ''
    let totalTokens = 0
    let modelUsed = ''

    if (aiProvider) {
      // Use Vercel AI SDK for tool calling support!
      const model = aiProvider(aiModelName)
      const result = await generateText({
        model,
        messages,
        tools: getOsintTools(userKeys),
        maxSteps: 5, // Allow multi-step reasoning!
        temperature: 0.3,
        maxTokens: 1500,
      })
      finalContent = result.text
      totalTokens = (result.usage?.promptTokens || 0) + (result.usage?.completionTokens || 0)
      modelUsed = aiModelName
    } else {
      // Fallback to basic chat (z-ai)
      const resp = await chatCompletion({
        messages: messages as ChatMessage[],
        temperature: 0.3,
        maxTokens: 1500,
        userKeys,
      })
      finalContent = resp.content
      totalTokens = resp.tokensIn + resp.tokensOut
      modelUsed = resp.model
    }

    // Basic citation: match entity values mentioned in response
    const citations: string[] = []
    const lower = finalContent.toLowerCase()
    for (const e of ctx.entities.slice(0, 60)) {
      if (lower.includes(e.value.toLowerCase())) {
        citations.push(e.value)
      }
    }
    return {
      content: finalContent,
      tokens_used: totalTokens,
      model: modelUsed,
      citations: Array.from(new Set(citations)).slice(0, 10),
    }
  } catch (e) {
    return {
      content: `Sorry — I hit an error talking to the LLM: ${e instanceof Error ? e.message : 'unknown error'}`,
      tokens_used: 0,
      model: 'error',
      citations: [],
    }
  }
}
