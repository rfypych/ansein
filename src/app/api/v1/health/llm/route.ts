import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, withErrorHandler, requireUser } from '@/lib/api'
import { checkLlmProviders } from '@/lib/llm'
import { decryptVersioned, type DecryptStatus } from '@/lib/crypto'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/health/llm — provider reachability without burning tokens.
 * Exists so model rotation / dead keys are visible BEFORE a pipeline
 * silently degrades to zero-token heuristic output.
 *
 * Also reports `vault`: per-provider key provenance (current / legacy /
 * undecryptable). `undecryptable` means the stored ciphertext does not
 * authenticate with the active SECRET_KEY — the signature of a key rotation
 * — and the pipeline already treats such keys as missing. Re-enter the key
 * in Settings to restore it.
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const user = await requireUser(req)
  const settings = await db.userSettings.findUnique({ where: { userId: user.id } })
  const vault: Array<{ provider: string; status: DecryptStatus }> = []
  const read = (stored: string | undefined, provider: string): string | undefined => {
    if (!stored) return undefined
    const r = decryptVersioned(stored)
    vault.push({ provider, status: r.status })
    return r.value || undefined
  }
  const providers = await checkLlmProviders({
    openai_api_key: read(settings?.openaiApiKey, 'openai'),
    groq_api_key: read(settings?.groqApiKey, 'groq'),
    preferred_llm: settings?.preferredLlm,
    custom_llm_api_key: read(settings?.customLlmApiKey, 'custom'),
    custom_llm_base_url: settings?.customLlmBaseUrl || undefined,
    custom_llm_model: settings?.customLlmModel || undefined,
  })
  const allDown = providers.every((p) => !p.reachable && p.provider !== 'pollinations') &&
    providers.some((p) => p.provider === 'pollinations' && !p.reachable)
  return ok({ providers, vault, all_down: allDown })
})
