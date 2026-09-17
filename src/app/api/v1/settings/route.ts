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
import { canManageSettings } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

const UpdateSchema = z.object({
  openai_api_key: z.string().max(500).optional(),
  groq_api_key: z.string().max(500).optional(),
  virustotal_api_key: z.string().max(500).optional(),
  abuseipdb_api_key: z.string().max(500).optional(),
  shodan_api_key: z.string().max(500).optional(),
  abusech_api_key: z.string().max(500).optional(),
  preferred_llm: z.enum(['auto', 'openai', 'groq', 'custom']).optional(),
  // Custom OpenAI-compatible LLM provider
  custom_llm_api_key: z.string().max(500).optional(),
  custom_llm_base_url: z.string().max(500).optional(),
  custom_llm_model: z.string().max(200).optional(),
  // Webhook integration — stored in AppConfig (global), not UserSettings.
  // Admin-only. Empty string clears the secret.
  webhook_secret: z.string().max(500).optional(),
})

function settingsOut(s: {
  openaiApiKey: string
  groqApiKey: string
  virustotalApiKey: string
  abuseipdbApiKey: string
  shodanApiKey: string
  abusechApiKey: string
  preferredLlm: string
  customLlmApiKey: string
  customLlmBaseUrl: string
  customLlmModel: string
  updatedAt: Date
}, hasWebhookSecret = false) {
  return {
    preferred_llm: s.preferredLlm,
    has_openai: !!s.openaiApiKey,
    has_groq: !!s.groqApiKey,
    has_virustotal: !!s.virustotalApiKey,
    has_abuseipdb: !!s.abuseipdbApiKey,
    has_shodan: !!s.shodanApiKey,
    has_abusech: !!s.abusechApiKey,
    has_custom_llm: !!(s.customLlmBaseUrl && s.customLlmModel),
    custom_llm_base_url: s.customLlmBaseUrl || '',
    custom_llm_model: s.customLlmModel || '',
    has_webhook_secret: hasWebhookSecret,
    updated_at: s.updatedAt.toISOString(),
  }
}

async function getSettings(req: NextRequest) {
  const user = await requireUser(req)
  let s = await db.userSettings.findUnique({ where: { userId: user.id } })
  if (!s) {
    s = await db.userSettings.create({ data: { userId: user.id } })
  }
  // The webhook secret is a global app-config value — surfaced to all users
  // as a boolean (so the UI can show whether webhook ingestion is enabled)
  // but the actual value is never returned.
  const webhookCfg = await db.appConfig.findUnique({ where: { key: 'webhook_secret' } })
  return ok(settingsOut(s, !!webhookCfg?.value))
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

  // Webhook secret is admin-only. Reject silently if a non-admin tries to set it.
  if (parsed.data.webhook_secret !== undefined && !canManageSettings(user)) {
    return jsonError(403, 'forbidden', 'Only admins may configure the webhook secret.')
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
  if (parsed.data.abusech_api_key !== undefined)
    data.abusechApiKey = parsed.data.abusech_api_key ? encrypt(parsed.data.abusech_api_key) : ''
  if (parsed.data.custom_llm_api_key !== undefined)
    data.customLlmApiKey = parsed.data.custom_llm_api_key ? encrypt(parsed.data.custom_llm_api_key) : ''
  if (parsed.data.custom_llm_base_url !== undefined)
    data.customLlmBaseUrl = parsed.data.custom_llm_base_url || ''
  if (parsed.data.custom_llm_model !== undefined)
    data.customLlmModel = parsed.data.custom_llm_model || ''
  if (parsed.data.preferred_llm) data.preferredLlm = parsed.data.preferred_llm

  // Persist webhook_secret to AppConfig (upsert). Stored in plaintext because
  // it's compared directly against the X-Webhook-Key header at ingest time —
  // encryption-at-rest would just add a decrypt step with no real security
  // gain (the comparison still needs the cleartext). The secret is never
  // returned in API responses.
  if (parsed.data.webhook_secret !== undefined) {
    await db.appConfig.upsert({
      where: { key: 'webhook_secret' },
      create: { key: 'webhook_secret', value: parsed.data.webhook_secret },
      update: { value: parsed.data.webhook_secret },
    })
  }

  try {
    let s = await db.userSettings.findUnique({ where: { userId: user.id } })
    if (!s) {
      s = await db.userSettings.create({ data: { userId: user.id, ...data } })
    } else {
      s = await db.userSettings.update({ where: { userId: user.id }, data })
    }
    const webhookCfg = await db.appConfig.findUnique({ where: { key: 'webhook_secret' } })
    return ok(settingsOut(s, !!webhookCfg?.value))
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
    abusech_api_key: s.abusechApiKey ? decrypt(s.abusechApiKey) : '',
    preferred_llm: s.preferredLlm,
    custom_llm_api_key: s.customLlmApiKey ? decrypt(s.customLlmApiKey) : '',
    custom_llm_base_url: s.customLlmBaseUrl || '',
    custom_llm_model: s.customLlmModel || '',
  }
}
