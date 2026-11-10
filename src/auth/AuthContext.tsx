import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiJson, apiRequest } from '../api/http'
import { MeSchema, TokenPairSchema, type Me } from '../api/schemas'
import { SessionEndedError } from '../api/errors'
import { applyTokens, endSession, getRefreshToken, onSessionEnded } from './session'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export interface RegisterInput {
  teamName: string
  email: string
  password: string
}

export interface AuthValue {
  status: AuthStatus
  me: Me | null
  notice: string | null
  clearNotice: () => void
  login: (email: string, password: string) => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  logout: () => Promise<void>
  reloadMe: () => Promise<void>
  hasPermission: (permission: string) => boolean
}

export const AuthContext = createContext<AuthValue | null>(null)

function fetchMe(signal?: AbortSignal): Promise<Me> {
  return apiJson('/auth/me', MeSchema, { signal })
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [me, setMe] = useState<Me | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Restaurar la sesion al recargar (sin mostrar el login mientras tanto).
  useEffect(() => {
    const controller = new AbortController()
    if (!getRefreshToken()) {
      setStatus('anonymous')
      return () => controller.abort()
    }
    fetchMe(controller.signal)
      .then((data) => {
        setMe(data)
        setStatus('authenticated')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (!(error instanceof SessionEndedError)) {
          setNotice('No se pudo restaurar la sesion. Inicia sesion de nuevo.')
        }
        setMe(null)
        setStatus('anonymous')
      })
    return () => controller.abort()
  }, [])

  // Logout o revocacion en esta u otra pestana.
  useEffect(
    () =>
      onSessionEnded((reason, message) => {
        setMe(null)
        setStatus('anonymous')
        setNotice(reason === 'revoked' ? message : null)
      }),
    [],
  )

  const startSession = useCallback(async (body: unknown, path: '/auth/login' | '/auth/register') => {
    const res = await apiRequest(path, { method: 'POST', body, auth: false })
    const tokens = TokenPairSchema.parse(await res.json())
    applyTokens(tokens)
    const data = await fetchMe()
    setMe(data)
    setNotice(null)
    setStatus('authenticated')
  }, [])

  const login = useCallback(
    (email: string, password: string) => startSession({ email, password }, '/auth/login'),
    [startSession],
  )

  const register = useCallback(
    (input: RegisterInput) => startSession(input, '/auth/register'),
    [startSession],
  )

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken()
    try {
      if (refreshToken) {
        await apiRequest('/auth/logout', { method: 'POST', body: { refreshToken }, auth: false })
      }
    } finally {
      endSession('logout', null)
    }
  }, [])

  const reloadMe = useCallback(async () => {
    const data = await fetchMe()
    setMe(data)
  }, [])

  const hasPermission = useCallback(
    (permission: string) => me?.permissions.includes(permission) ?? false,
    [me],
  )

  const clearNotice = useCallback(() => setNotice(null), [])

  const value = useMemo<AuthValue>(
    () => ({ status, me, notice, clearNotice, login, register, logout, reloadMe, hasPermission }),
    [status, me, notice, clearNotice, login, register, logout, reloadMe, hasPermission],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
