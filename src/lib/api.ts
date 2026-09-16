/**
 * Shared API helpers: response shapes, error classes, auth context.
 */
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { decodeToken, AccessTokenPayload } from '@/lib/auth'

export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function jsonError(status: number, code: string, message: string) {
  return Response.json({ detail: message, code }, { status })
}

export function ok<T>(data: T, status = 200) {
  return Response.json(data, { status })
}

export function created<T>(data: T) {
  return Response.json(data, { status: 201 })
}

/**
 * Resolve the active User row from a Bearer token OR the httpOnly
 * `ansein_access` cookie. Cookie-first for browser clients (XSS-safe),
 * Bearer kept for programmatic API consumers (webhooks use their own key).
 * Throws ApiError(401) if missing / invalid / user not found / inactive.
 */
export async function requireUser(req: NextRequest) {
  let token: string | null = null
  const auth = req.headers.get('authorization') || req.headers.get('Authorization')
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    token = auth.slice(7).trim()
  }
  if (!token) {
    token = req.cookies.get('ansein_access')?.value || null
  }
  if (!token) {
    throw new ApiError(401, 'unauthorized', 'Not authenticated')
  }
  const payload = await decodeToken<AccessTokenPayload>(token)
  if (!payload || payload.type !== 'access') {
    throw new ApiError(401, 'invalid_token', 'Invalid or expired access token')
  }
  const userId = Number(payload.sub)
  if (!Number.isFinite(userId)) {
    throw new ApiError(401, 'invalid_token', 'Invalid token subject')
  }
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user || !user.isActive) {
    throw new ApiError(401, 'inactive', 'Account is inactive or not found')
  }
  return user
}

/** Optional auth — returns user or null without throwing. */
export async function optionalUser(req: NextRequest) {
  try {
    return await requireUser(req)
  } catch {
    return null
  }
}

export function getClientIp(req: NextRequest): string {
  const xf = req.headers.get('x-forwarded-for')
  if (xf) return xf.split(',')[0].trim()
  const xr = req.headers.get('x-real-ip')
  if (xr) return xr
  return '127.0.0.1'
}

/** Generic pagination helper. */
export function paginate<T>(items: T[], total: number, page: number, pageSize: number) {
  return {
    items,
    total,
    page,
    page_size: pageSize,
  }
}

export function parsePageParams(req: NextRequest) {
  const url = new URL(req.url)
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'))
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('page_size') || '20')))
  return { page, pageSize, url }
}

/** Convert a Prisma error to a friendly ApiError. */
export function handlePrismaError(e: unknown): ApiError {
  const err = e as { code?: string; message?: string }
  if (err?.code === 'P2002') {
    return new ApiError(409, 'conflict', 'Resource already exists')
  }
  if (err?.code === 'P2025') {
    return new ApiError(404, 'not_found', 'Resource not found')
  }
  console.error('[prisma] error:', err)
  const msg = process.env.NODE_ENV === 'production' 
    ? 'A database error occurred' 
    : `Prisma Error: ${err?.message || String(err)}`
  return new ApiError(500, 'internal', msg)
}

/** Wrap a route handler with structured error handling + audit logging hooks. */
export function withErrorHandler<TArgs extends unknown[]>(
  fn: (...args: TArgs) => Promise<Response>
): (...args: TArgs) => Promise<Response> {
  return async (...args: TArgs) => {
    try {
      return await fn(...args)
    } catch (e) {
      if (e instanceof ApiError) {
        return jsonError(e.status, e.code, e.message)
      }
      console.error('[api] unhandled error:', e)
      const msg = process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : `Unhandled Error: ${e instanceof Error ? e.message : String(e)}`
      return jsonError(500, 'internal', msg)
    }
  }
}

// JSON helpers. Prisma Json columns return parsed values (object/array) while
// legacy String columns return raw text — accept both so reads work during
// and after the String → JSONB migration.
export function safeParseJson<T>(raw: unknown, fallback: T): T {
  if (raw === null || raw === undefined || raw === '') return fallback
  if (typeof raw !== 'string') return raw as T
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function safeStringifyJson(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return '{}'
  }
}
