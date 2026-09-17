import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, withErrorHandler, requireUser } from '@/lib/api'
import { checkLlmProviders } from '@/lib/llm'
import { decrypt } from '@/lib/crypto'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/health/llm — provider reachability without burning tokens.
 * Exists so model rotation / dead keys are visible BEFORE a pipeline
 * silently degrades to zero-token heuristic output.
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const user = await requireUser(req)
  const settings = await db.userSettings.findUnique({ where: { userId: user.id } })
  const providers = await checkLlmProviders({
    openai_api_key: settings?.openaiApiKey ? decrypt(settings.openaiApiKey) : undefined,
    groq_api_key: settings?.groqApiKey ? decrypt(settings.groqApiKey) : undefined,
    preferred_llm: settings?.preferredLlm,
    custom_llm_api_key: settings?.customLlmApiKey ? decrypt(settings.customLlmApiKey) : undefined,
    custom_llm_base_url: settings?.customLlmBaseUrl || undefined,
    custom_llm_model: settings?.customLlmModel || undefined,
  })
  const allDown = providers.every((p) => !p.reachable && p.provider !== 'pollinations') &&
    providers.some((p) => p.provider === 'pollinations' && !p.reachable)
  return ok({ providers, all_down: allDown })
})
