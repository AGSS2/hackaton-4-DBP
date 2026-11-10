import { API_BASE_URL, BUILD_SHA } from '../config'
import { NetworkError, SessionEndedError, toApiError } from '../api/errors'
import { TokenPairSchema, type TokenPair } from '../api/schemas'

/*
 * Reglas:
 * - El access token vive SOLO en memoria (esta variable).
 * - El refresh token (de un solo uso) se guarda en localStorage.
 * - Todos los refresh de todas las pestanas pasan por un Web Lock, y cada uno lee el refresh
 *   token MAS NUEVO dentro del lock: asi nunca se presenta dos veces el mismo (REFRESH_REUSED).
 * - BroadcastChannel avisa a las demas pestanas cuando la sesion termina (logout o revocacion).
 */

const REFRESH_KEY = 'lumon.refreshToken'
const LOCK_NAME = 'lumon-refresh'

let accessToken: string | null = null

export function getAccessToken(): string | null {
  return accessToken
}

export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY)
  } catch {
    return null
  }
}

function storeRefreshToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(REFRESH_KEY, token)
    else localStorage.removeItem(REFRESH_KEY)
  } catch {
    // almacenamiento no disponible
  }
}

export function applyTokens(tokens: TokenPair): void {
  accessToken = tokens.accessToken
  storeRefreshToken(tokens.refreshToken)
}

// ---------- fin de sesion (todas las pestanas) ----------

export type EndReason = 'logout' | 'revoked'
type EndListener = (reason: EndReason, message: string | null) => void
const listeners = new Set<EndListener>()

export function onSessionEnded(listener: EndListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function emit(reason: EndReason, message: string | null): void {
  for (const listener of listeners) listener(reason, message)
}

interface EndedMessage {
  type: 'ended'
  reason: EndReason
  message: string | null
}

function isEndedMessage(value: unknown): value is EndedMessage {
  return typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'ended'
}

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('lumon-session') : null

channel?.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (isEndedMessage(event.data)) {
    accessToken = null
    emit(event.data.reason, event.data.message)
  }
})

// Respaldo por si BroadcastChannel no existe: el evento storage avisa cuando otra pestana borra el token.
window.addEventListener('storage', (event: StorageEvent) => {
  if (event.key === REFRESH_KEY && event.newValue === null && accessToken !== null) {
    accessToken = null
    emit('logout', null)
  }
})

export function endSession(reason: EndReason, message: string | null): void {
  accessToken = null
  storeRefreshToken(null)
  const payload: EndedMessage = { type: 'ended', reason, message }
  channel?.postMessage(payload)
  emit(reason, message)
}

export function revokedMessage(code: string): string {
  switch (code) {
    case 'REFRESH_REUSED':
      return 'Se detecto un uso repetido de tu sesion y Lumon la cerro en todas las pestanas por seguridad. Inicia sesion de nuevo.'
    case 'SESSION_REVOKED':
      return 'Tu sesion fue revocada. Inicia sesion de nuevo.'
    case 'TOKEN_INVALID':
      return 'Tu sesion no es valida. Inicia sesion de nuevo.'
    default:
      return 'Tu sesion vencio. Inicia sesion de nuevo.'
  }
}

// ---------- refresh coordinado ----------

let refreshInFlight: Promise<string> | null = null

async function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && 'locks' in navigator) {
    return (await navigator.locks.request(LOCK_NAME, () => task())) as T
  }
  return task()
}

async function performRefresh(): Promise<string> {
  return withRefreshLock(async () => {
    const refreshToken = getRefreshToken()
    if (!refreshToken) {
      accessToken = null
      throw new SessionEndedError()
    }
    let res: Response
    try {
      res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Lumon-Build': BUILD_SHA },
        body: JSON.stringify({ refreshToken }),
      })
    } catch {
      throw new NetworkError()
    }
    if (res.ok) {
      const tokens = TokenPairSchema.parse(await res.json())
      applyTokens(tokens)
      return tokens.accessToken
    }
    const err = await toApiError(res)
    if (res.status === 401) {
      endSession('revoked', revokedMessage(err.code))
      throw new SessionEndedError(revokedMessage(err.code))
    }
    throw err
  })
}

/** Un solo POST /auth/refresh a la vez por pestana; las demas requests esperan el mismo resultado. */
export function refreshAccessToken(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}
