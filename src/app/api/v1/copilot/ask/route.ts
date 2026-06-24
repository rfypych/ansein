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
import { askCopilot, type CopilotContext } from '@/lib/engines/copilot'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const AskSchema = z.object({
  session_id: z.number().int().positive().optional(),
  investigation_id: z.number().int().positive().optional(),
  message: z.string().min(1).max(8000),
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
  const { session_id, investigation_id, message } = parsed.data

  // Resolve or create session
  let sessionId = session_id
  if (!sessionId) {
    if (!investigation_id) {
      // Create unbound session titled after first 60 chars of message
      try {
        const session = await db.chatSession.create({
          data: {
            userId: user.id,
            investigationId: null,
            title: message.slice(0, 60) + (message.length > 60 ? '…' : ''),
          },
        })
        sessionId = session.id
      } catch (e) {
        const err = handlePrismaError(e)
        return jsonError(err.status, err.code, err.message)
      }
    } else {
      // Verify investigation ownership
      const inv = await db.investigation.findFirst({
        where: { id: investigation_id, userId: user.id },
      })
      if (!inv) return jsonError(404, 'not_found', 'Investigation not found')
      const session = await db.chatSession.create({
        data: {
          userId: user.id,
          investigationId: investigation_id,
          title: inv.title,
        },
      })
      sessionId = session.id
    }
  } else {
    // Verify session ownership
    const session = await db.chatSession.findFirst({
      where: { id: sessionId, userId: user.id },
    })
    if (!session) return jsonError(404, 'not_found', 'Chat session not found')
  }

  // Persist the user message
  await db.chatMessage.create({
    data: {
      sessionId,
      role: 'user',
      content: message,
    },
  })

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

  // Build history (exclude the message we just persisted, since askCopilot
  // also gets userMessage separately)
  const history = session.messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(0, -1) // exclude the user message we just persisted
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

  const userKeys = await getUserKeys(user.id)
  const result = await askCopilot(ctx, history, message, userKeys)

  // Persist assistant response
  const assistantMsg = await db.chatMessage.create({
    data: {
      sessionId,
      role: 'assistant',
      content: result.content,
      citations: JSON.stringify(result.citations),
      tokensUsed: result.tokens_used,
    },
  })

  // Bump session.updatedAt
  await db.chatSession.update({ where: { id: sessionId }, data: { updatedAt: new Date() } })

  return ok({
    session_id: sessionId,
    message: {
      id: assistantMsg.id,
      session_id: sessionId,
      role: 'assistant',
      content: result.content,
      citations: result.citations,
      tokens_used: result.tokens_used,
      created_at: assistantMsg.createdAt.toISOString(),
    },
    tokens_used: result.tokens_used,
  })
}

export const POST = withErrorHandler(handler)
