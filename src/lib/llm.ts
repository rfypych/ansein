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
  provider: 'zai' | 'openai' | 'groq'
}

export function isLlmAvailable(userKeys: UserKeys = {}): boolean {
  if (userKeys.openai_api_key || userKeys.groq_api_key) return true
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
  const resp = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  })
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
}

export interface ChatOptions {
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  userKeys?: UserKeys
  preferred?: 'auto' | 'openai' | 'groq'
}

/**
 * Chat with the LLM. Provider priority:
 * 1. preferred = openai/groq + matching key
 * 2. user groq key
 * 3. user openai key
 * 4. system z-ai SDK
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
  // Auto preference — try Groq, then OpenAI, then z-ai
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
      console.warn('[llm] OpenAI failed, falling back to z-ai:', e)
    }
  }
  // System fallback: z-ai SDK
  return callZai(messages, temperatureClamped, maxTokensClamped)
}
