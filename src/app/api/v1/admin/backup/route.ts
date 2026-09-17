import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler, requireUser, jsonError } from '@/lib/api'
import { canManageUsers } from '@/lib/rbac'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET /api/v1/admin/backup — full workspace disaster copy (admin only).
 *
 * Dumps every investigation with sources/entities/relationships/analyses/
 * notes, plus playbooks and the hash-chained audit log, as one JSON file.
 * Password hashes are NEVER included. BYOK settings ARE included still
 * encrypted (restorable only with the same SECRET_KEY — rotate the key and
 * this part of the backup becomes unreadable; re-enter keys instead). The
 * webhook secret is excluded (presence flag only) — it is a live credential,
 * not data.
 *
 * Honest scope: this is a disaster COPY, not one-click restore. Restore =
 * re-create cases and re-import STIX bundles per investigation (see
 * POST /api/v1/import/stix). Documented here so nobody mistakes a download
 * button for a backup strategy.
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const user = await requireUser(req)
  if (!canManageUsers(user)) {
    return jsonError(403, 'forbidden', 'Administrator access required')
  }

  const [users, settings, investigations, sources, entities, relationships, analyses, notes, playbooks, audit, appConfig] =
    await Promise.all([
      db.user.findMany({
        select: { id: true, email: true, fullName: true, role: true, isActive: true, isSuperuser: true, createdAt: true },
      }),
      db.userSettings.findMany(),
      db.investigation.findMany(),
      db.source.findMany(),
      db.entity.findMany(),
      db.relationship.findMany(),
      db.analysisRun.findMany(),
      db.investigationNote.findMany(),
      db.playbook.findMany({ select: { id: true, userId: true, name: true, description: true, trigger: true, actions: true, enabled: true, createdAt: true } }),
      db.auditLog.findMany({ orderBy: { id: 'asc' } }),
      db.appConfig.findMany(),
    ])

  const stripDates = (o: unknown): unknown => JSON.parse(JSON.stringify(o))
  const payload = {
    format: 'ansein-workspace-backup',
    version: 1,
    exported_at: new Date().toISOString(),
    exported_by: user.email,
    counts: {
      users: users.length,
      settings_rows: settings.length,
      investigations: investigations.length,
      sources: sources.length,
      entities: entities.length,
      relationships: relationships.length,
      analyses: analyses.length,
      notes: notes.length,
      playbooks: playbooks.length,
      audit_entries: audit.length,
    },
    users: stripDates(users),
    user_settings_encrypted: stripDates(settings),
    investigations: stripDates(investigations),
    sources: stripDates(sources),
    entities: stripDates(entities),
    relationships: stripDates(relationships),
    analyses: stripDates(analyses),
    notes: stripDates(notes),
    playbooks: stripDates(playbooks),
    audit_log: stripDates(audit),
    app_config_keys: appConfig.map((c) => c.key),
    webhook_secret_configured: appConfig.some((c) => c.key === 'webhook_secret' && !!c.value),
  }

  const res = NextResponse.json(payload)
  res.headers.set(
    'Content-Disposition',
    `attachment; filename="ansein-backup-${new Date().toISOString().slice(0, 10)}.json"`
  )
  return res
})
