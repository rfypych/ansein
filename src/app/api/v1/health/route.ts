import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, jsonError, withErrorHandler } from '@/lib/api'

export const dynamic = 'force-dynamic'

async function handler(req: NextRequest) {
  const url = new URL(req.url)
  // Lightweight health check — works without DB
  if (url.pathname.endsWith('/ping')) {
    return ok({ status: 'ok' })
  }
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
    status: 'ok',
    app: 'AnseIn',
    version: '3.0.0',
    env: process.env.NODE_ENV || 'development',
    database_configured: databaseConfigured,
    database_connected: databaseConnected,
    setup_complete: !setupRequired,
    setup_required: setupRequired,
  })
}

export const GET = withErrorHandler(handler)
