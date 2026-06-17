import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  ok,
  jsonError,
  withErrorHandler,
  requireUser,
  handlePrismaError,
} from '@/lib/api'
import { encrypt, decrypt } from '@/lib/crypto'

export const dynamic = 'force-dynamic'

const UpdateSchema = z.object({
  openai_api_key: z.string().max(500).optional(),
  groq_api_key: z.string().max(500).optional(),
  virustotal_api_key: z.string().max(500).optional(),
  abuseipdb_api_key: z.string().max(500).optional(),
  shodan_api_key: z.string().max(500).optional(),
  preferred_llm: z.enum(['auto', 'openai', 'groq']).optional(),
})

function settingsOut(s: {
  openaiApiKey: string
  groqApiKey: string
  virustotalApiKey: string
  abuseipdbApiKey: string
  shodanApiKey: string
  preferredLlm: string
  updatedAt: Date
}) {
  return {
    preferred_llm: s.preferredLlm,
    has_openai: !!s.openaiApiKey,
    has_groq: !!s.groqApiKey,
    has_virustotal: !!s.virustotalApiKey,
    has_abuseipdb: !!s.abuseipdbApiKey,
    has_shodan: !!s.shodanApiKey,
    updated_at: s.updatedAt.toISOString(),
  }
}

async function getSettings(req: NextRequest) {
  const user = await requireUser(req)
  let s = await db.userSettings.findUnique({ where: { userId: user.id } })
  if (!s) {
    s = await db.userSettings.create({ data: { userId: user.id } })
  }
  return ok(settingsOut(s))
}

async function updateSettings(req: NextRequest) {
  const user = await requireUser(req)
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'invalid_body', 'Invalid JSON body')
  }
  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(422, 'validation_error', parsed.error.issues[0]?.message || 'Invalid input')
  }
  const data: Record<string, string> = {}
  if (parsed.data.openai_api_key !== undefined)
    data.openaiApiKey = parsed.data.openai_api_key ? encrypt(parsed.data.openai_api_key) : ''
  if (parsed.data.groq_api_key !== undefined)
    data.groqApiKey = parsed.data.groq_api_key ? encrypt(parsed.data.groq_api_key) : ''
  if (parsed.data.virustotal_api_key !== undefined)
    data.virustotalApiKey = parsed.data.virustotal_api_key ? encrypt(parsed.data.virustotal_api_key) : ''
  if (parsed.data.abuseipdb_api_key !== undefined)
    data.abuseipdbApiKey = parsed.data.abuseipdb_api_key ? encrypt(parsed.data.abuseipdb_api_key) : ''
  if (parsed.data.shodan_api_key !== undefined)
    data.shodanApiKey = parsed.data.shodan_api_key ? encrypt(parsed.data.shodan_api_key) : ''
  if (parsed.data.preferred_llm) data.preferredLlm = parsed.data.preferred_llm

  try {
    let s = await db.userSettings.findUnique({ where: { userId: user.id } })
    if (!s) {
      s = await db.userSettings.create({ data: { userId: user.id, ...data } })
    } else {
      s = await db.userSettings.update({ where: { userId: user.id }, data })
    }
    return ok(settingsOut(s))
  } catch (e) {
    const err = handlePrismaError(e)
    return jsonError(err.status, err.code, err.message)
  }
}

export const GET = withErrorHandler(getSettings)
export const PUT = withErrorHandler(updateSettings)

// Helper used by pipeline to decrypt user keys — exported for internal use
export async function getUserDecryptedKeys(userId: number) {
  const s = await db.userSettings.findUnique({ where: { userId } })
  if (!s) return {}
  return {
    openai_api_key: s.openaiApiKey ? decrypt(s.openaiApiKey) : '',
    groq_api_key: s.groqApiKey ? decrypt(s.groqApiKey) : '',
    virustotal_api_key: s.virustotalApiKey ? decrypt(s.virustotalApiKey) : '',
    abuseipdb_api_key: s.abuseipdbApiKey ? decrypt(s.abuseipdbApiKey) : '',
    shodan_api_key: s.shodanApiKey ? decrypt(s.shodanApiKey) : '',
    preferred_llm: s.preferredLlm,
  }
}
