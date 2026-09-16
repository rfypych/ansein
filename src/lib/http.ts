/**
 * Client HTTP wrapper — attaches Bearer token, auto-refreshes on 401.
 * Mirrors backend/app/contexts/AuthContext + lib/api.js behavior.
 */
import { useAuthStore, getStoredAccessToken } from '@/lib/auth-store'

const BASE = '/api/v1'

let isRefreshing = false
let refreshQueue: Array<() => void> = []

async function refreshTokenPair(): Promise<boolean> {
  // Cookie-based refresh: the browser attaches ansein_refresh automatically.
  try {
    const resp = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    if (!resp.ok) return false
    const data = await resp.json()
    if (data.access_token && data.refresh_token) {
      useAuthStore.getState().setTokens(data.access_token, data.refresh_token)
    }
    return true
  } catch {
    return false
  }
}

export async function logoutRequest(): Promise<void> {
  try {
    await fetch(`${BASE}/auth/logout`, { method: 'POST' })
  } catch {
    // ignore — client state is cleared regardless
  }
  useAuthStore.getState().logout()
}

async function request<T = unknown>(
  path: string,
  opts: RequestInit = {}
): Promise<T> {
  const token = getStoredAccessToken()
  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string>),
  }
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`
  }
  if (opts.body && !headers['Content-Type'] && typeof opts.body === 'string') {
    headers['Content-Type'] = 'application/json'
  }

  let resp = await fetch(`${BASE}${path}`, { ...opts, headers })

  // On 401, attempt refresh and retry once (unless this is already an auth route)
  if (resp.status === 401 && !path.startsWith('/auth/') && !path.startsWith('/setup')) {
    if (!isRefreshing) {
      isRefreshing = true
      const ok = await refreshTokenPair()
      isRefreshing = false
      if (ok) {
        // Drain queue
        refreshQueue.forEach((cb) => cb())
        refreshQueue = []
        // Retry this request with new token
        const newToken = getStoredAccessToken()
        if (newToken) headers.Authorization = `Bearer ${newToken}`
        resp = await fetch(`${BASE}${path}`, { ...opts, headers })
      } else {
        useAuthStore.getState().logout()
        if (typeof window !== 'undefined') {
          window.location.href = '/login'
        }
        throw new Error('Session expired')
      }
    } else {
      // Wait for ongoing refresh
      await new Promise<void>((resolve) => refreshQueue.push(resolve))
      const newToken = getStoredAccessToken()
      if (newToken) headers.Authorization = `Bearer ${newToken}`
      resp = await fetch(`${BASE}${path}`, { ...opts, headers })
    }
  }

  if (!resp.ok) {
    let detail = resp.statusText
    let code = 'error'
    try {
      const err = await resp.json()
      detail = err.detail || err.message || detail
      code = err.code || code
    } catch {
      // ignore
    }
    const e = new Error(detail) as Error & { status: number; code: string }
    e.status = resp.status
    e.code = code
    throw e
  }

  // Handle 204 No Content
  if (resp.status === 204) return undefined as T

  const ct = resp.headers.get('content-type') || ''
  if (ct.includes('application/json')) {
    return (await resp.json()) as T
  }
  // For binary (PDF) responses
  if (ct.includes('application/pdf') || ct.includes('application/octet-stream')) {
    return (await resp.blob()) as unknown as T
  }
  return (await resp.text()) as unknown as T
}

export const http = {
  get: <T = unknown>(p: string) => request<T>(p),
  post: <T = unknown>(p: string, body?: unknown) =>
    request<T>(p, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  put: <T = unknown>(p: string, body?: unknown) =>
    request<T>(p, {
      method: 'PUT',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: <T = unknown>(p: string, body?: unknown) =>
    request<T>(p, {
      method: 'PATCH',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  delete: <T = unknown>(p: string, body?: unknown) =>
    request<T>(p, {
      method: 'DELETE',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  upload: <T = unknown>(p: string, formData: FormData) =>
    request<T>(p, { method: 'POST', body: formData }),
}
