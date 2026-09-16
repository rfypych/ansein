/**
 * HttpOnly cookie auth — access/refresh JWTs live in Secure, HttpOnly,
 * SameSite=Lax cookies instead of localStorage (XSS-safe: page JS can never
 * read the tokens; the browser attaches them to same-origin /api requests).
 */
import type { NextRequest } from 'next/server'
import type { TokenPair } from '@/lib/auth'

export const ACCESS_COOKIE = 'ansein_access'
export const REFRESH_COOKIE = 'ansein_refresh'

// 24h access / 7d refresh — mirrors ACCESS_TOKEN_EXPIRE_MINUTES / REFRESH_TOKEN_EXPIRE_DAYS
export const ACCESS_MAX_AGE = 24 * 60 * 60
export const REFRESH_MAX_AGE = 7 * 24 * 60 * 60

function cookieFlags(maxAge: number) {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  }
}

export function setAuthCookies(res: Response, tokens: TokenPair): void {
  // NextResponse cookies API; Response from Response.json() in route handlers
  // is a NextResponse-compatible object when constructed via NextResponse.
  const jar = (res as unknown as { cookies: { set: (n: string, v: string, o: object) => void } }).cookies
  jar.set(ACCESS_COOKIE, tokens.access_token, cookieFlags(ACCESS_MAX_AGE))
  jar.set(REFRESH_COOKIE, tokens.refresh_token, cookieFlags(REFRESH_MAX_AGE))
}

export function clearAuthCookies(res: Response): void {
  const jar = (res as unknown as { cookies: { set: (n: string, v: string, o: object) => void } }).cookies
  jar.set(ACCESS_COOKIE, '', { ...cookieFlags(0), maxAge: 0 })
  jar.set(REFRESH_COOKIE, '', { ...cookieFlags(0), maxAge: 0 })
}

export function getCookieToken(req: NextRequest, name: string): string | null {
  return req.cookies.get(name)?.value || null
}
