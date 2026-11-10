import type { z } from 'zod'
import { API_BASE_URL, BUILD_SHA } from '../config'
import { ApiError, NetworkError, toApiError } from './errors'
import {
  endSession,
  getAccessToken,
  refreshAccessToken,
  revokedMessage,
} from '../auth/session'

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
  /** false para rutas publicas (login, register, health). */
  auth?: boolean
  /** Reintentos ante 503/429/red. Por defecto 3 en GET y 0 en el resto. */
  retries?: number
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** Espera creciente con un poco de azar: 0.5s, 1s, 2s, 4s... maximo 30s. */
export function backoffMs(attempt: number): number {
  const base = Math.min(30_000, 500 * 2 ** attempt)
  return base + Math.random() * 250
}

export async function apiRequest(path: string, options: ApiOptions = {}): Promise<Response> {
  const method = options.method ?? 'GET'
  const useAuth = options.auth ?? true
  const maxRetries = options.retries ?? (method === 'GET' ? 3 : 0)
  let attempt = 0
  let alreadyRefreshed = false

  for (;;) {
    const headers = new Headers(options.headers)
    headers.set('X-Lumon-Build', BUILD_SHA)
    if (options.body !== undefined) headers.set('Content-Type', 'application/json')

    let tokenUsed: string | null = null
    if (useAuth) {
      tokenUsed = getAccessToken() ?? (await refreshAccessToken())
      headers.set('Authorization', `Bearer ${tokenUsed}`)
    }

    let res: Response
    try {
      res = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: options.signal,
      })
    } catch (error) {
      if (options.signal?.aborted) throw error
      if (attempt < maxRetries) {
        await sleep(backoffMs(attempt), options.signal)
        attempt += 1
        continue
      }
      throw new NetworkError()
    }

    if (res.ok) return res

    const err = await toApiError(res)

    if (useAuth && res.status === 401 && err.code === 'TOKEN_EXPIRED' && !alreadyRefreshed) {
      alreadyRefreshed = true
      // Si otra request ya renovo el token mientras esta volaba, solo se reintenta.
      if (getAccessToken() === tokenUsed) {
        await refreshAccessToken()
      }
      continue
    }

    if (useAuth && res.status === 401 && (err.code === 'SESSION_REVOKED' || err.code === 'TOKEN_INVALID')) {
      endSession('revoked', revokedMessage(err.code))
      throw err
    }

    if ((res.status === 503 || res.status === 429) && attempt < maxRetries) {
      const waitMs = err.retryAfter !== null ? err.retryAfter * 1000 : backoffMs(attempt)
      await sleep(waitMs, options.signal)
      attempt += 1
      continue
    }

    throw err
  }
}

export async function apiJson<T>(path: string, schema: z.ZodType<T>, options?: ApiOptions): Promise<T> {
  const res = await apiRequest(path, options)
  const data: unknown = await res.json()
  return schema.parse(data)
}

export { ApiError }
