import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  ok,
  created,
  jsonError,
  withErrorHandler,
  requireUser,
  handlePrismaError,
  safeParseJson,
  safeStringifyJson,
} from '@/lib/api'
import { canManagePlaybooks } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

/**
 * SOAR Playbook — request/response shape. Stored in the DB with `trigger`
 * and `actions` as JSON-encoded strings (SQLite-compatible). On the wire we
 * surface them as parsed JSON for client convenience.
 */
interface PlaybookOut {
  id: number
  user_id: number
  name: string
  description: string
  trigger: Record<string, unknown> | null
  actions: Array<Record<string, unknown>>
  enabled: boolean
  created_at: string
  updated_at: string
}

function playbookOut(p: {
  id: number
  userId: number
  name: string
  description: string
  trigger: string
  actions: string
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}): PlaybookOut {
  const trigger = safeParseJson<Record<string, unknown> | null>(p.trigger, null)
  const actions = safeParseJson<Array<Record<string, unknown>>>(p.actions, [])
  return {
    id: p.id,
    user_id: p.userId,
    name: p.name,
    description: p.description,
    trigger,
    actions,
    enabled: p.enabled,
    created_at: p.createdAt.toISOString(),
    updated_at: p.updatedAt.toISOString(),
  }
}

const TriggerSchema = z
  .object({
    type: z.enum(['severity_threshold', 'entity_type', 'alert_type', 'always']),
    value: z.union([z.number(), z.string()]).optional(),
  })
  .nullable()
  .default(null)

const ActionSchema = z.object({
  type: z.enum(['notify', 'tag', 'star', 'export']),
  params: z.record(z.string(), z.unknown()).default({}),
})

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional().default(''),
  trigger: TriggerSchema,
  actions: z.array(ActionSchema).max(20).default([]),
  enabled: z.boolean().optional().default(true),
})

/** List the caller's playbooks. */
async function list(req: NextRequest) {
  const user = await requireUser(req)
  const items = await db.playbook.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  })
  return ok({ items: items.map(playbookOut) })
}

/** Create a new playbook. Admin-only (canManagePlaybooks). */
async function create(req: NextRequest) {
  const user = await requireUser(req)
  if (!canManagePlaybooks(user)) {
    return jsonError(403, 'forbidden', 'Only admins may create playbooks.')
  }
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'invalid_body', 'Invalid JSON body')
  }
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(422, 'validation_error', parsed.error.issues[0]?.message || 'Invalid input')
  }
  try {
    const p = await db.playbook.create({
      data: {
        userId: user.id,
        name: parsed.data.name,
        description: parsed.data.description,
        trigger: parsed.data.trigger ? safeStringifyJson(parsed.data.trigger) : '',
        actions: safeStringifyJson(parsed.data.actions),
        enabled: parsed.data.enabled,
      },
    })
    return created(playbookOut(p))
  } catch (e) {
    const err = handlePrismaError(e)
    return jsonError(err.status, err.code, err.message)
  }
}

export const GET = withErrorHandler(list)
export const POST = withErrorHandler(create)
