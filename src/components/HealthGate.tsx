import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { API_BASE_URL, BUILD_SHA } from '../config'
import { FullScreenMessage } from './FullScreenMessage'

type HealthState = 'checking' | 'ok' | 'down'

/** Si /meta/health no responde, muestra "Conectando con Lumon..." y reintenta con espera creciente. */
export function HealthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HealthState>('checking')
  const [secondsLeft, setSecondsLeft] = useState(0)
  const attemptRef = useRef(0)
  const timerRef = useRef<number | null>(null)

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const check = useCallback(async () => {
    clearTimer()
    setState('checking')
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 10_000)
    try {
      const res = await fetch(`${API_BASE_URL}/meta/health`, {
        headers: { 'X-Lumon-Build': BUILD_SHA },
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      attemptRef.current = 0
      setState('ok')
    } catch {
      const wait = Math.min(30, 2 ** attemptRef.current)
      attemptRef.current += 1
      setState('down')
      setSecondsLeft(wait)
      timerRef.current = window.setInterval(() => {
        setSecondsLeft((s) => s - 1)
      }, 1000)
    } finally {
      window.clearTimeout(timeout)
    }
  }, [])

  useEffect(() => {
    void check()
    return clearTimer
  }, [check])

  useEffect(() => {
    if (state === 'down' && secondsLeft <= 0) void check()
  }, [state, secondsLeft, check])

  if (state === 'ok') return <>{children}</>

  return (
    <FullScreenMessage title="Conectando con Lumon...">
      {state === 'checking' ? (
        <p>Comprobando el servicio...</p>
      ) : (
        <>
          <p>Lumon no responde. Reintentando en {Math.max(0, secondsLeft)} s.</p>
          <button
            type="button"
            onClick={() => {
              attemptRef.current = 0
              void check()
            }}
            className="mt-4 rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            Reintentar ahora
          </button>
        </>
      )}
    </FullScreenMessage>
  )
}
