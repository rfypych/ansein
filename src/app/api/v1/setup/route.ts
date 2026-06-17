import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, jsonError, withErrorHandler } from '@/lib/api'

export const dynamic = 'force-dynamic'

async function getStatus() {
  let databaseConnected = false
  let adminExists = false
  try {
    adminExists = (await db.user.count()) > 0
    databaseConnected = true
  } catch {
    databaseConnected = false
  }
  const databaseConfigured = !!process.env.DATABASE_URL
  const setupMode = process.env.SETUP_MODE || 'auto'
  const setupRequired =
    setupMode === 'always' ? true : setupMode === 'never' ? false : !adminExists
  return ok({
    setup_required: setupRequired,
    database_configured: databaseConfigured,
    database_connected: databaseConnected,
    admin_exists: adminExists,
    app_env: process.env.NODE_ENV || 'development',
  })
}

/**
 * Setup wizard — complete the setup.
 * In our Next.js port, we treat setup as "first admin creation" since the
 * database is already configured via env var. This endpoint marks setup complete.
 */
async function postComplete() {
  return ok({ message: 'Setup complete. You can now log in.' })
}

export const GET = withErrorHandler(getStatus)
export const POST = withErrorHandler(postComplete)
