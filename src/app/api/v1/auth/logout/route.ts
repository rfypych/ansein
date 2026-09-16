import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandler } from '@/lib/api'
import { clearAuthCookies } from '@/lib/cookies'

export const dynamic = 'force-dynamic'

export const POST = withErrorHandler(async (_req: NextRequest) => {
  const res = NextResponse.json({ message: 'Signed out' })
  clearAuthCookies(res)
  return res
})
