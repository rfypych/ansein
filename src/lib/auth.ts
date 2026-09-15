/**
 * JWT (HS256) + bcrypt password hashing.
 * Mirrors the Python implementation: access (24h) + refresh (7d) tokens.
 */
import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'

const SECRET_KEY = process.env.SECRET_KEY || (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: SECRET_KEY environment variable is required in production')
  }
  return 'dev-insecure-secret-change-me'
})()
const ACCESS_EXPIRES_MIN = Number(process.env.ACCESS_TOKEN_EXPIRE_MINUTES || 1440)
const REFRESH_EXPIRES_DAYS = Number(process.env.REFRESH_TOKEN_EXPIRE_DAYS || 7)

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12)

function encKey(): Uint8Array {
  return new TextEncoder().encode(SECRET_KEY)
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS)
}

export async function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  if (!hashed) return false
  try {
    return await bcrypt.compare(plain, hashed)
  } catch {
    return false
  }
}

export interface AccessTokenPayload {
  sub: string
  type: 'access'
  email: string
  is_superuser: boolean
  iat: number
  exp: number
  jti: string
}

export interface RefreshTokenPayload {
  sub: string
  type: 'refresh'
  iat: number
  exp: number
  jti: string
}

export async function signAccessToken(user: { id: number; email: string; isSuperuser: boolean }): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({
    type: 'access',
    email: user.email,
    is_superuser: user.isSuperuser,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(String(user.id))
    .setIssuedAt(now)
    .setExpirationTime(now + ACCESS_EXPIRES_MIN * 60)
    .setJti(randomTokenHex(8))
    .sign(encKey())
}

export async function signRefreshToken(userId: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(String(userId))
    .setIssuedAt(now)
    .setExpirationTime(now + REFRESH_EXPIRES_DAYS * 86400)
    .setJti(randomTokenHex(16))
    .sign(encKey())
}

export async function decodeToken<T = unknown>(token: string): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(token, encKey(), { algorithms: ['HS256'] })
    return payload as T
  } catch {
    return null
  }
}

export function randomTokenHex(bytes: number): string {
  return crypto.randomBytes(bytes).toString('hex')
}

// Re-export the node crypto for token generation
import crypto from 'node:crypto'

export interface TokenPair {
  access_token: string
  refresh_token: string
  token_type: 'bearer'
}

export async function makeTokenPair(user: { id: number; email: string; isSuperuser: boolean }): Promise<TokenPair> {
  const [access_token, refresh_token] = await Promise.all([
    signAccessToken(user),
    signRefreshToken(user.id),
  ])
  return { access_token, refresh_token, token_type: 'bearer' }
}
