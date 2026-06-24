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

const SYSTEM_PROMPT = `You are the AnseIn Autonomous Agent, a highly capable cyber threat intelligence assistant.

Your capabilities:
1. You have access to local investigation context (provided below). Use it as your primary source of truth.
2. You have OSINT tools (e.g., web search, VirusTotal lookup). IF the user asks a question whose answer is not fully covered by the local context, or asks you to "search" or "investigate" something external, YOU MUST proactively use your tools.
3. You MUST follow the ReAct (Reasoning and Acting) methodology. Before calling any tool, you MUST output a brief text explaining your thought process (e.g., "I need to search for X to find Y."). Gather data via tools, evaluate it, and query again if needed before giving a final answer.

Formatting: Use **GitHub-flavored Markdown** for your responses.
- Use **bold** for key entities, threat actors, and important findings.
- Use \`inline code\` for IOCs (IPs, domains, hashes, URLs).
- Use bullet lists for enumerations.
- Use ## headings for longer responses.
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
    
    // Helper to strip /chat/completions or /responses from baseURLs for Vercel AI SDK
    const cleanBaseUrl = (url: string) => url.replace(/\/chat\/completions\/?$/, '').replace(/\/responses\/?$/, '').replace(/\/$/, '')
    
    // Custom fetch wrapper to fix Vercel AI SDK omitting type: "object" in tool parameters.
    // In Next.js environments, options.body may be a string, Buffer, or Uint8Array.
    const customFetch = async (url: RequestInfo | URL, options?: RequestInit) => {
      if (options?.body) {
        try {
          let bodyString = ''
          if (typeof options.body === 'string') {
            bodyString = options.body
          } else if (options.body instanceof Uint8Array) {
            bodyString = new TextDecoder().decode(options.body)
          } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(options.body)) {
            bodyString = options.body.toString('utf-8')
          }
          
          if (bodyString) {
            const payload = JSON.parse(bodyString)
            if (payload.tools && Array.isArray(payload.tools)) {
              payload.tools.forEach((t: any) => {
                if (t.function && t.function.parameters && !t.function.parameters.type) {
                  t.function.parameters.type = 'object'
                }
              })
            }
            // Strip temperature for Claude/O1 models that forbid it via strict proxies
            if (payload.model && (payload.model.toLowerCase().includes('claude') || payload.model.toLowerCase().includes('o1-'))) {
              delete payload.temperature
            }
            options.body = JSON.stringify(payload)
          }
        } catch (e) {
          console.warn('Failed to intercept payload:', e)
        }
      }
      return fetch(url, options)
    }
    
    // Attempt to use Vercel AI SDK for providers that support tools (OpenAI compatible)
    let aiProvider = null;
    let aiModelName = '';
    
    if (preferred === 'openai' && userKeys.openai_api_key) {
      aiProvider = createOpenAI({ apiKey: userKeys.openai_api_key, baseURL: cleanBaseUrl(process.env.OPENAI_API_BASE || 'https://api.openai.com/v1'), fetch: customFetch })
      aiModelName = process.env.OPENAI_MODEL || 'gpt-4o-mini'
    } else if (preferred === 'groq' && userKeys.groq_api_key) {
      aiProvider = createOpenAI({ apiKey: userKeys.groq_api_key, baseURL: cleanBaseUrl(process.env.GROQ_API_BASE || 'https://api.groq.com/openai/v1'), fetch: customFetch })
      aiModelName = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
    } else if (preferred === 'custom' && userKeys.custom_llm_base_url && userKeys.custom_llm_model) {
      aiProvider = createOpenAI({ apiKey: userKeys.custom_llm_api_key || '', baseURL: cleanBaseUrl(userKeys.custom_llm_base_url), fetch: customFetch })
      aiModelName = userKeys.custom_llm_model
    } else if (userKeys.groq_api_key) {
      aiProvider = createOpenAI({ apiKey: userKeys.groq_api_key, baseURL: cleanBaseUrl(process.env.GROQ_API_BASE || 'https://api.groq.com/openai/v1'), fetch: customFetch })
      aiModelName = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
    } else if (userKeys.openai_api_key) {
      aiProvider = createOpenAI({ apiKey: userKeys.openai_api_key, baseURL: cleanBaseUrl(process.env.OPENAI_API_BASE || 'https://api.openai.com/v1'), fetch: customFetch })
      aiModelName = process.env.OPENAI_MODEL || 'gpt-4o-mini'
    } else if (userKeys.custom_llm_base_url && userKeys.custom_llm_model) {
      aiProvider = createOpenAI({ apiKey: userKeys.custom_llm_api_key || '', baseURL: cleanBaseUrl(userKeys.custom_llm_base_url), fetch: customFetch })
      aiModelName = userKeys.custom_llm_model
    }

    let finalContent = ''
    let totalTokens = 0
    let modelUsed = ''

    if (aiProvider) {
      // Extract system messages for the 'system' property to avoid warnings
      const systemMessages = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n')
      const userAndAssistantMessages = messages.filter(m => m.role !== 'system')

      // Use Vercel AI SDK for tool calling support!
      const model = aiProvider.chat(aiModelName)
      const result = await generateText({
        model,
        system: systemMessages,
        messages: userAndAssistantMessages,
        tools: getOsintTools(userKeys),
        maxSteps: 5, // Allow multi-step reasoning!
        temperature: 0.3,
        maxTokens: 1500,
      })
      
      let reasoningLog = ''
      if (result.steps && result.steps.length > 1) {
        reasoningLog += '> [!NOTE]\n> **Agentic Reasoning Trace:**\n'
        result.steps.forEach((step, idx) => {
          if (step.toolCalls && step.toolCalls.length > 0) {
            const thought = step.text ? step.text.trim().replace(/\n/g, ' ') : 'Decided to use a tool.'
            reasoningLog += `> - **Thought:** ${thought}\n`
            step.toolCalls.forEach(tc => {
              reasoningLog += `> - **Action:** Called \`${tc.toolName}\`\n`
            })
          }
        })
        reasoningLog += '\n\n'
      }
      
      finalContent = reasoningLog + result.text
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
  } catch (e: any) {
    let errorDetails = e.message || 'unknown error'
    if (e.url) errorDetails += ` (URL: ${e.url})`
    if (e.statusCode) errorDetails += ` (Status: ${e.statusCode})`
    
    return {
      content: `Sorry — I hit an error talking to the LLM: **${errorDetails}**. \n\n*Diagnostic info: Make sure your API Base URL (in Settings or .env) is correct. If using a custom OpenAI proxy, ensure the URL ends with \`/v1\` (not \`/chat/completions\`) and that the specified model exists on that proxy.*`,
      tokens_used: 0,
      model: 'error',
      citations: [],
    }
  }
}
