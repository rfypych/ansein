/**
 * Unified LLM client.
 * Uses z-ai-web-dev-sdk as the system LLM (already configured in environment).
 * Also supports BYOK OpenAI/Groq keys (OpenAI-compatible endpoints).
 *
 * Ported from backend/app/engines/llm.py with the addition that when no
 * user keys are provided, we fall back to the system z-ai SDK.
 */
import ZAI from 'z-ai-web-dev-sdk'
import type { UserKeys } from '@/lib/engines/extraction'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMResponse {
  content: string
  model: string
  tokensIn: number
  tokensOut: number
  provider: 'zai' | 'openai' | 'groq' | 'custom' | 'pollinations'
}

export function isLlmAvailable(userKeys: UserKeys = {}): boolean {
  if (userKeys.openai_api_key || userKeys.groq_api_key) return true
  if (userKeys.custom_llm_base_url && userKeys.custom_llm_model) return true
  // z-ai SDK is always available in this environment
  return true
}

async function callOpenAICompatible(
  apiKey: string,
  baseUrl: string,
  model: string,
  messages: ChatMessage[],
  temperature: number,
  maxTokens: number
): Promise<LLMResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }
  const endpoint = baseUrl.endsWith('/chat/completions') 
    ? baseUrl 
    : `${baseUrl.replace(/\/$/, '')}/chat/completions`

  let bodyObj: any = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  }

  if (model.toLowerCase().includes('o1-') || model.toLowerCase().includes('claude')) {
    delete bodyObj.temperature
  }

  // Retry with exponential backoff on rate-limit (429) / transient 5xx.
  // Groq free tier enforces strict TPM+RPM caps; without backoff a burst of
  // pipeline calls (extract x N chunks + relationships + analysis) collapses
  // into silent heuristic fallback. Retry keeps the LLM path alive.
  let resp: Response | null = null
  let lastStatus = 0
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) {
      const backoffMs = Math.min(8000, 1000 * 2 ** (attempt - 1))
      await new Promise((r) => setTimeout(r, backoffMs))
    }
    resp = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(bodyObj),
    })
    lastStatus = resp.status
    if (resp.status !== 429 && (resp.status < 500 || resp.status >= 600)) break
    // Consume body before retrying so the socket can be reused
    await resp.text().catch(() => '')
    if (attempt === 3) {
      throw new Error(`OpenAI-compatible API rate-limited/unavailable (status ${lastStatus}) after retries`)
    }
  }
  resp = resp as Response

  if (resp.status === 400) {
    const txt = await resp.text().catch(() => '')
    if (txt.toLowerCase().includes('temperature')) {
      delete bodyObj.temperature
      resp = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyObj),
      })
    } else {
      throw new Error(`OpenAI-compatible API error ${resp.status}: ${txt.slice(0, 200)}`)
    }
  }

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '')
    throw new Error(`OpenAI-compatible API error ${resp.status}: ${txt.slice(0, 200)}`)
  }
  const data = await resp.json() as {
    choices?: Array<{ message?: { content?: string } }>
    model?: string
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  return {
    content: data.choices?.[0]?.message?.content || '',
    model: data.model || model,
    tokensIn: data.usage?.prompt_tokens || 0,
    tokensOut: data.usage?.completion_tokens || 0,
    provider: 'openai',
  }
}

const GROQ_CANDIDATE_MODELS = [
  process.env.GROQ_MODEL,
  'llama-3.1-8b-instant',
  'openai/gpt-oss-120b',
  'llama-3.3-70b-versatile',
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-20b',
].filter(Boolean) as string[]

async function callGroqWithFallback(
  apiKey: string,
  messages: ChatMessage[],
  temperature: number,
  maxTokens: number
): Promise<LLMResponse> {
  const base = process.env.GROQ_API_BASE || 'https://api.groq.com/openai/v1'
  let lastErr: unknown = null
  for (const model of GROQ_CANDIDATE_MODELS) {
    try {
      return await callOpenAICompatible(
        apiKey,
        base,
        model,
        messages,
        temperature,
        maxTokens
      ).then((r) => ({ ...r, provider: 'groq' as const }))
    } catch (e: any) {
      lastErr = e
      console.warn(`[llm] Groq model candidate '${model}' failed:`, e?.message || e)
      continue // try next candidate model
    }
  }
  throw lastErr || new Error('All Groq models failed')
}

async function callZai(
  messages: ChatMessage[],
  temperature: number,
  maxTokens: number
): Promise<LLMResponse> {
  try {
    const zai = await ZAI.create()
    // Map our messages into z-ai SDK's expected shape
    const systemMsgs = messages.filter((m) => m.role === 'system')
    const userMsgs = messages.filter((m) => m.role !== 'system')
    const systemPrompt = systemMsgs.map((m) => m.content).join('\n\n')

    // Convert conversation history into the user message
    let userPrompt = ''
    for (const m of userMsgs) {
      if (m.role === 'user') userPrompt += `User: ${m.content}\n\n`
      else if (m.role === 'assistant') userPrompt += `Assistant: ${m.content}\n\n`
    }
    if (!userPrompt) userPrompt = messages[messages.length - 1]?.content || ''

    const completion = await zai.chat.completions.create({
      messages: [
        ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
        { role: 'user' as const, content: userPrompt },
      ],
      temperature,
      max_tokens: maxTokens,
    })

    const content = completion.choices?.[0]?.message?.content ?? ''
    return {
      content,
      model: completion.model || 'zai-glm',
      tokensIn: completion.usage?.prompt_tokens || 0,
      tokensOut: completion.usage?.completion_tokens || 0,
      provider: 'zai',
    }
  } catch (e: any) {
    if (e.message?.includes('.z-ai-config')) {
      throw new Error('LLM Provider is not configured. Please add an OpenAI, Groq, or Custom LLM API key in Settings.')
    }
    throw e
  }
}

export interface ChatOptions {
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  userKeys?: UserKeys
  preferred?: 'auto' | 'openai' | 'groq' | 'custom' | 'pollinations'
}

/**
 * Free, keyless, OpenAI-compatible LLM (Pollinations.ai). Anonymous tier is
 * ~1 req/15s — slow, but it only fires when every keyed provider has failed,
 * where the alternative is a zero-token heuristic fallback. Strictly better
 * than silent degradation, and costs the user nothing.
 */
const POLLINATIONS_BASE = 'https://text.pollinations.ai/openai'
const POLLINATIONS_MODEL = 'openai'

async function callPollinations(
  messages: ChatMessage[],
  temperature: number,
  maxTokens: number
): Promise<LLMResponse> {
  return callOpenAICompatible('', POLLINATIONS_BASE, POLLINATIONS_MODEL, messages, temperature, maxTokens)
    .then((r) => ({ ...r, provider: 'pollinations' as const }))
}

/**
 * Provider health probe (no token-burning chat calls).
 * - Groq/OpenAI/custom: key presence + Groq model-list reachability.
 * - Pollinations: public /models endpoint (free, keyless).
 * Used by GET /api/v1/health/llm so provider rot is visible BEFORE a
 * pipeline silently falls back to heuristics.
 */
export interface ProviderHealth {
  provider: string
  configured: boolean
  reachable: boolean
  detail: string
  models?: string[]
}

export async function checkLlmProviders(userKeys: UserKeys = {}): Promise<ProviderHealth[]> {
  const out: ProviderHealth[] = []

  if (userKeys.groq_api_key) {
    try {
      const base = process.env.GROQ_API_BASE || 'https://api.groq.com/openai/v1'
      const resp = await fetch(`${base.replace(/\/$/, '')}/models`, {
        headers: { Authorization: `Bearer ${userKeys.groq_api_key}` },
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = (await resp.json()) as { data?: Array<{ id?: string }> }
      const models = Array.isArray(data.data) ? data.data.map((m) => String(m.id || '')).filter(Boolean) : []
      const alive = GROQ_CANDIDATE_MODELS.filter((c) => models.includes(c))
      out.push({
        provider: 'groq',
        configured: true,
        reachable: true,
        detail: alive.length > 0
          ? `${alive.length}/${GROQ_CANDIDATE_MODELS.length} fallback models live`
          : 'key valid but NONE of the fallback candidate models exist (rotation risk!)',
        models: alive,
      })
    } catch (e) {
      out.push({
        provider: 'groq',
        configured: true,
        reachable: false,
        detail: `key present but API unreachable: ${e instanceof Error ? e.message.slice(0, 120) : String(e).slice(0, 120)}`,
      })
    }
  } else {
    out.push({ provider: 'groq', configured: false, reachable: false, detail: 'no API key configured' })
  }

  out.push({
    provider: 'openai',
    configured: !!userKeys.openai_api_key,
    reachable: !!userKeys.openai_api_key,
    detail: userKeys.openai_api_key ? 'key configured (not probed to avoid spend)' : 'no API key configured',
  })
  out.push({
    provider: 'custom',
    configured: !!(userKeys.custom_llm_base_url && userKeys.custom_llm_model),
    reachable: !!(userKeys.custom_llm_base_url && userKeys.custom_llm_model),
    detail: userKeys.custom_llm_base_url
      ? `endpoint ${userKeys.custom_llm_base_url} model ${userKeys.custom_llm_model || '?'}`
      : 'no custom endpoint configured (Gemini/OpenRouter-compatible URL goes here)',
  })

  try {
    const resp = await fetch('https://text.pollinations.ai/models')
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const models = (await resp.json()) as unknown
    const list = Array.isArray(models) ? models.map(String).slice(0, 12) : []
    out.push({
      provider: 'pollinations',
      configured: true,
      reachable: true,
      detail: 'free keyless fallback reachable (anonymous ~1 req/15s)',
      models: list,
    })
  } catch (e) {
    out.push({
      provider: 'pollinations',
      configured: true,
      reachable: false,
      detail: `free fallback unreachable: ${e instanceof Error ? e.message.slice(0, 120) : String(e).slice(0, 120)}`,
    })
  }

  return out
}

/**
 * Chat with the LLM. Provider priority:
 * 1. preferred = openai/groq/custom + matching key/config
 * 2. user groq key
 * 3. user openai key
 * 4. user custom LLM (if base_url + model set)
 * 5. pollinations (free, keyless — slow last resort before heuristics)
 * 6. system z-ai SDK
 */
export async function chatCompletion(opts: ChatOptions): Promise<LLMResponse> {
  const {
    messages,
    temperature = 0.2,
    maxTokens = 2048,
    userKeys = {},
    preferred = userKeys.preferred_llm || 'auto',
  } = opts
  const temperatureClamped = Math.min(2, Math.max(0, temperature))
  const maxTokensClamped = Math.min(8192, Math.max(1, Math.floor(maxTokens)))

  // Try preferred provider first
  if (preferred === 'openai' && userKeys.openai_api_key) {
    return callOpenAICompatible(
      userKeys.openai_api_key,
      process.env.OPENAI_API_BASE || 'https://api.openai.com/v1',
      process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages,
      temperatureClamped,
      maxTokensClamped
    ).then((r) => ({ ...r, provider: 'openai' as const }))
  }
  if (preferred === 'groq' && userKeys.groq_api_key) {
    return callGroqWithFallback(
      userKeys.groq_api_key,
      messages,
      temperatureClamped,
      maxTokensClamped
    )
  }
  if (preferred === 'custom' && userKeys.custom_llm_base_url && userKeys.custom_llm_model) {
    return callOpenAICompatible(
      userKeys.custom_llm_api_key || '',
      userKeys.custom_llm_base_url,
      userKeys.custom_llm_model,
      messages,
      temperatureClamped,
      maxTokensClamped
    ).then((r) => ({ ...r, provider: 'custom' as const }))
  }
  if (preferred === 'pollinations') {
    // Explicit free choice: no key needed, anonymous ~1 req/15s — slow but
    // free forever. Failures fall through to z-ai / heuristics below.
    try {
      return await callPollinations(messages, temperatureClamped, maxTokensClamped)
    } catch (e) {
      console.warn('[llm] Explicit pollinations failed, falling back:', e)
    }
  }
  // Auto preference — try Groq, then OpenAI, then custom, then pollinations, then z-ai
  if (userKeys.groq_api_key) {
    try {
      return await callGroqWithFallback(
        userKeys.groq_api_key,
        messages,
        temperatureClamped,
        maxTokensClamped
      )
    } catch (e) {
      console.warn('[llm] Groq failed, falling back:', e)
    }
  }
  if (userKeys.openai_api_key) {
    try {
      return await callOpenAICompatible(
        userKeys.openai_api_key,
        process.env.OPENAI_API_BASE || 'https://api.openai.com/v1',
        process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages,
        temperatureClamped,
        maxTokensClamped
      ).then((r) => ({ ...r, provider: 'openai' as const }))
    } catch (e) {
      console.warn('[llm] OpenAI failed, falling back:', e)
    }
  }
  // Try custom LLM provider if configured
  if (userKeys.custom_llm_base_url && userKeys.custom_llm_model) {
    try {
      return await callOpenAICompatible(
        userKeys.custom_llm_api_key || '',
        userKeys.custom_llm_base_url,
        userKeys.custom_llm_model,
        messages,
        temperatureClamped,
        maxTokensClamped
      ).then((r) => ({ ...r, provider: 'custom' as const }))
    } catch (e) {
      console.warn('[llm] Custom LLM failed, falling back to z-ai:', e)
    }
  }
  // Free keyless fallback before giving up to heuristics
  try {
    return await callPollinations(messages, temperatureClamped, maxTokensClamped)
  } catch (e) {
    console.warn('[llm] Pollinations failed, falling back to z-ai:', e)
  }
  // System fallback: z-ai SDK
  return callZai(messages, temperatureClamped, maxTokensClamped)
}
