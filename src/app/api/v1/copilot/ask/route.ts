import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  ok,
  jsonError,
  withErrorHandler,
  requireUser,
  handlePrismaError,
  safeParseJson,
} from '@/lib/api'
import { decrypt } from '@/lib/crypto'
import { streamCopilot, type CopilotContext } from '@/lib/engines/copilot'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const AskSchema = z.object({
  session_id: z.number().int().positive().optional(),
  investigation_id: z.number().int().positive().optional(),
  message: z.any().optional(), // Can be string or array from useChat
  messages: z.array(z.any()).optional(), // Native useChat payload
})

async function getUserKeys(userId: number) {
  const s = await db.userSettings.findUnique({ where: { userId } })
  if (!s) return {}
  return {
    openai_api_key: s.openaiApiKey ? decrypt(s.openaiApiKey) : '',
    groq_api_key: s.groqApiKey ? decrypt(s.groqApiKey) : '',
    preferred_llm: s.preferredLlm,
    custom_llm_api_key: s.customLlmApiKey ? decrypt(s.customLlmApiKey) : '',
    custom_llm_base_url: s.customLlmBaseUrl || '',
    custom_llm_model: s.customLlmModel || '',
    virustotal_api_key: s.virustotalApiKey ? decrypt(s.virustotalApiKey) : '',
  }
}

async function handler(req: NextRequest) {
  const user = await requireUser(req)
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'invalid_body', 'Invalid JSON body')
  }
  const parsed = AskSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(422, 'validation_error', parsed.error.issues[0]?.message || 'Invalid input')
  }
  // Build history from standard useChat payload
  const incomingMessages = parsed.data.messages || (Array.isArray(parsed.data.message) ? parsed.data.message : [])
  let userMessageText = ''
  if (typeof parsed.data.message === 'string') {
    userMessageText = parsed.data.message
  } else if (incomingMessages.length > 0) {
    userMessageText = incomingMessages[incomingMessages.length - 1].content || ''
  }

  // Resolve or create session
  let sessionId = parsed.data.session_id
  if (!sessionId) {
    if (!parsed.data.investigation_id) {
      try {
        const session = await db.chatSession.create({
          data: {
            userId: user.id,
            investigationId: null,
            title: userMessageText.slice(0, 60) + (userMessageText.length > 60 ? '…' : ''),
          },
        })
        sessionId = session.id
      } catch (e) {
        const err = handlePrismaError(e)
        return jsonError(err.status, err.code, err.message)
      }
    } else {
      const inv = await db.investigation.findFirst({
        where: { id: parsed.data.investigation_id, userId: user.id },
      })
      if (!inv) return jsonError(404, 'not_found', 'Investigation not found')
      const session = await db.chatSession.create({
        data: {
          userId: user.id,
          investigationId: parsed.data.investigation_id,
          title: inv.title,
        },
      })
      sessionId = session.id
    }
  } else {
    const session = await db.chatSession.findFirst({
      where: { id: sessionId, userId: user.id },
    })
    if (!session) return jsonError(404, 'not_found', 'Chat session not found')
  }

  // Persist the user message
  if (userMessageText) {
    await db.chatMessage.create({
      data: {
        sessionId,
        role: 'user',
        content: userMessageText,
      },
    })
  }

  // Build context for the copilot
  const session = await db.chatSession.findUnique({
    where: { id: sessionId },
    include: {
      messages: { orderBy: { id: 'asc' }, take: 30 },
    },
  })
  if (!session) return jsonError(404, 'not_found', 'Session vanished')

  let ctx: CopilotContext = {
    investigationTitle: session.title || 'General Chat',
    severityScore: 0,
    entities: [],
    narrative: '',
    sourceText: '',
  }

  if (session.investigationId) {
    const inv = await db.investigation.findFirst({
      where: { id: session.investigationId, userId: user.id },
      include: { sources: true, entities: true, analysisRuns: { orderBy: { createdAt: 'desc' }, take: 1 } },
    })
    if (inv) {
      const latestAnalysis = inv.analysisRuns[0]
      ctx = {
        investigationTitle: inv.title,
        severityScore: inv.severityScore,
        entities: inv.entities.map((e) => ({
          entity_type: e.entityType as any,
          value: e.value,
          confidence: e.confidence,
          enrichment: safeParseJson<Record<string, unknown>>(e.enrichment, {}),
        })),
        narrative: latestAnalysis?.narrative || '',
        sourceText: inv.sources.map((s) => s.content).join('\n\n'),
      }
    }
  }

  const userKeys = await getUserKeys(user.id)
  
  // Use useChat's incoming messages if present, otherwise fallback to DB history + text
  let finalMessages = []
  if (incomingMessages.length > 0) {
    finalMessages = incomingMessages.map((m: any) => {
      let content = m.content
      if (!content && m.parts && Array.isArray(m.parts)) {
        content = m.parts.map((p: any) => p.text || '').join('')
      }
      return { role: m.role, content: content || '' }
    })
  } else {
    finalMessages = session.messages.map(m => ({ role: m.role, content: m.content }))
  }

  try {
    const result = await streamCopilot(ctx, finalMessages, userKeys)
    
    // Bump session.updatedAt
    await db.chatSession.update({ where: { id: sessionId }, data: { updatedAt: new Date() } })
    
    return result.toUIMessageStreamResponse({
      async onFinish({ text, usage }) {
        try {
          await db.chatMessage.create({
            data: {
              sessionId,
              role: 'assistant',
              content: text,
              citations: '[]',
              tokensUsed: usage.totalTokens || 0,
            },
          })
        } catch (err) {
          console.error('Failed to persist assistant message:', err)
        }
      }
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

export const POST = withErrorHandler(handler)
