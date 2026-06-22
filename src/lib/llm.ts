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
  provider: 'zai' | 'openai' | 'groq' | 'custom'
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
  // Some local providers (Ollama, LM Studio) don't need an API key
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

  // Some models (e.g., o1, claude proxies) strictly forbid temperature
  if (model.toLowerCase().includes('o1-') || model.toLowerCase().includes('claude')) {
    delete bodyObj.temperature
  }

  let resp = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(bodyObj),
  })

  if (resp.status === 400) {
    const txt = await resp.text().catch(() => '')
    if (txt.toLowerCase().includes('temperature')) {
      // Retry without temperature
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
  preferred?: 'auto' | 'openai' | 'groq' | 'custom'
}

/**
 * Chat with the LLM. Provider priority:
 * 1. preferred = openai/groq/custom + matching key/config
 * 2. user groq key
 * 3. user openai key
 * 4. user custom LLM (if base_url + model set)
 * 5. system z-ai SDK
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
    return callOpenAICompatible(
      userKeys.groq_api_key,
      process.env.GROQ_API_BASE || 'https://api.groq.com/openai/v1',
      process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages,
      temperatureClamped,
      maxTokensClamped
    ).then((r) => ({ ...r, provider: 'groq' as const }))
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
  // Auto preference — try Groq, then OpenAI, then custom, then z-ai
  if (userKeys.groq_api_key) {
    try {
      return await callOpenAICompatible(
        userKeys.groq_api_key,
        process.env.GROQ_API_BASE || 'https://api.groq.com/openai/v1',
        process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        messages,
        temperatureClamped,
        maxTokensClamped
      ).then((r) => ({ ...r, provider: 'groq' as const }))
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
  // System fallback: z-ai SDK
  return callZai(messages, temperatureClamped, maxTokensClamped)
}
