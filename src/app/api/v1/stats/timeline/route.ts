import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, withErrorHandler, requireUser } from '@/lib/api'
import { canEditAnyInvestigation } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/stats/timeline
 *
 * Returns the investigation-creation timeline for the past 30 days. Each
 * entry is one day:
 *   { date: 'YYYY-MM-DD', count: number, avg_severity: number }
 *
 * - Analysts see only their own investigations.
 * - Editors/admins see the workspace-wide timeline.
 *
 * Days with zero investigations are still included (count=0, avg_severity=0)
 * so the dashboard widget can render a continuous 30-bar chart.
 */
async function timeline(req: NextRequest) {
  const user = await requireUser(req)
  const scopeAll = canEditAnyInvestigation(user)
  const where = scopeAll ? {} : { userId: user.id }

  // Build the 30-day window (UTC midnight boundaries).
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const days: { date: string; start: Date; end: Date }[] = []
  for (let i = 29; i >= 0; i--) {
    const start = new Date(today.getTime() - i * 86400_000)
    const end = new Date(start.getTime() + 86400_000)
    days.push({
      date: start.toISOString().slice(0, 10),
      start,
      end,
    })
  }

  // Pull every investigation created inside the window. We rely on createdAt
  // rather than updatedAt so the chart reflects when analysts opened new
  // cases — not when they last touched them.
  const fromStart = days[0].start
  const toEnd = days[days.length - 1].end
  const rows = await db.investigation.findMany({
    where: {
      ...where,
      createdAt: { gte: fromStart, lt: toEnd },
    },
    select: { createdAt: true, severityScore: true },
  })

  // Bucket per day.
  const bucketByDate = new Map<string, { count: number; sum: number }>()
  for (const d of days) bucketByDate.set(d.date, { count: 0, sum: 0 })
  for (const r of rows) {
    const day = r.createdAt.toISOString().slice(0, 10)
    const bucket = bucketByDate.get(day)
    if (!bucket) continue
    bucket.count += 1
    bucket.sum += r.severityScore || 0
  }

  return ok({
    scope: scopeAll ? 'workspace' : 'own',
    days: days.map((d) => {
      const b = bucketByDate.get(d.date)!
      return {
        date: d.date,
        count: b.count,
        avg_severity: b.count > 0 ? Math.round((b.sum / b.count) * 10) / 10 : 0,
      }
    }),
    total_in_window: rows.length,
    window_days: days.length,
  })
}

export const GET = withErrorHandler(timeline)
