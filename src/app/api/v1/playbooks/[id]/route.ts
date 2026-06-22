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
  safeStringifyJson,
} from '@/lib/api'
import { canManagePlaybooks } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

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

const UpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  trigger: TriggerSchema.optional(),
  actions: z.array(ActionSchema).max(20).optional(),
  enabled: z.boolean().optional(),
})

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

async function update(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  if (!canManagePlaybooks(user)) {
    return jsonError(403, 'forbidden', 'Only admins may modify playbooks.')
  }
  const { id } = await ctx.params
  const pid = Number(id)
  if (!Number.isFinite(pid)) return jsonError(400, 'invalid_id', 'Invalid playbook ID')

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

  const existing = await db.playbook.findFirst({ where: { id: pid, userId: user.id } })
  if (!existing) return jsonError(404, 'not_found', 'Playbook not found')

  const data: Record<string, unknown> = {}
  if (parsed.data.name !== undefined) data.name = parsed.data.name
  if (parsed.data.description !== undefined) data.description = parsed.data.description
  if (parsed.data.trigger !== undefined) {
    data.trigger = parsed.data.trigger ? safeStringifyJson(parsed.data.trigger) : ''
  }
  if (parsed.data.actions !== undefined) data.actions = safeStringifyJson(parsed.data.actions)
  if (parsed.data.enabled !== undefined) data.enabled = parsed.data.enabled

  try {
    const p = await db.playbook.update({ where: { id: pid }, data })
    return ok(playbookOut(p))
  } catch (e) {
    const err = handlePrismaError(e)
    return jsonError(err.status, err.code, err.message)
  }
}

async function remove(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  if (!canManagePlaybooks(user)) {
    return jsonError(403, 'forbidden', 'Only admins may delete playbooks.')
  }
  const { id } = await ctx.params
  const pid = Number(id)
  if (!Number.isFinite(pid)) return jsonError(400, 'invalid_id', 'Invalid playbook ID')

  const existing = await db.playbook.findFirst({ where: { id: pid, userId: user.id } })
  if (!existing) return jsonError(404, 'not_found', 'Playbook not found')

  await db.playbook.delete({ where: { id: pid } })
  return ok({ message: 'Deleted' })
}

export const PATCH = withErrorHandler(update)
export const DELETE = withErrorHandler(remove)
