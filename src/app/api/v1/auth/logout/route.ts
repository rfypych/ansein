import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler, optionalUser } from '@/lib/api'
import { clearAuthCookies } from '@/lib/cookies'

export const dynamic = 'force-dynamic'

export const POST = withErrorHandler(async (req: NextRequest) => {
  // Server-side logout: bump the session generation so every previously
  // issued token (including copies an attacker may hold) is rejected.
  // Best-effort — cookie clearing below happens regardless.
  const user = await optionalUser(req)
  if (user) {
    await db.user
      .update({ where: { id: user.id }, data: { tokenVersion: { increment: 1 } } })
      .catch(() => {})
  }
  const res = NextResponse.json({ message: 'Signed out' })
  clearAuthCookies(res)
  return res
})
