import { useCallback, useEffect, useState } from 'react'
import { BUILD_SHA } from '../config'
import { apiJson, apiRequest } from '../api/http'
import { ClearanceSchema, IntegrationsSchema, type Check, type Clearance, type Integrations } from '../api/schemas'
import { describeError } from '../api/errors'
import { useAuth } from '../auth/useAuth'

type HealthStatus = 'checking' | 'up' | 'down'

function formatDetail(detail: unknown): string {
  if (detail === undefined || detail === null) return ''
  return typeof detail === 'string' ? detail : JSON.stringify(detail)
}

function ChecksList({ checks }: { checks: Check[] }) {
  if (checks.length === 0) return <p className="text-sm text-slate-700">Sin comprobaciones todavia.</p>
  return (
    <ul className="mt-2 flex flex-col gap-1">
      {checks.map((check) => (
        <li key={check.name} className="text-sm">
          <span className={check.passed ? 'font-semibold text-green-800' : 'font-semibold text-red-700'}>
            {check.passed ? '✔ Aprobado' : '✘ Pendiente'}
          </span>{' '}
          <strong>{check.name}</strong> {formatDetail(check.detail)}
        </li>
      ))}
    </ul>
  )
}

export default function EstadoPage() {
  const { reloadMe } = useAuth()
  const [health, setHealth] = useState<HealthStatus>('checking')
  const [integrations, setIntegrations] = useState<Integrations | null>(null)
  const [clearance, setClearance] = useState<Clearance | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    setLoadError(null)
    setHealth('checking')
    apiRequest('/meta/health', { auth: false, signal, retries: 0 })
      .then(() => {
        if (!signal.aborted) setHealth('up')
      })
      .catch(() => {
        if (!signal.aborted) setHealth('down')
      })
    Promise.all([
      apiJson('/integrations/status', IntegrationsSchema, { signal }),
      apiJson('/clearance', ClearanceSchema, { signal }),
    ])
      .then(([integrationsData, clearanceData]) => {
        if (signal.aborted) return
        setIntegrations(integrationsData)
        setClearance(clearanceData)
      })
      .catch((err: unknown) => {
        if (!signal.aborted) setLoadError(describeError(err))
      })
    return () => controller.abort()
  }, [reloadKey])

  const runCheck = useCallback(async () => {
    setChecking(true)
    setCheckError(null)
    try {
      const result = await apiJson('/clearance/check', ClearanceSchema, { method: 'POST' })
      setClearance((prev) => ({ ...(prev ?? {}), ...result }))
      if (result.granted) await reloadMe()
    } catch (err) {
      setCheckError(describeError(err))
    } finally {
      setChecking(false)
    }
  }, [reloadMe])

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Estado</h1>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="rounded border border-slate-400 px-3 py-2 text-sm hover:bg-slate-100"
        >
          Actualizar
        </button>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Build y API</h2>
        <p className="mt-2 text-sm">
          Build desplegado: <code>{BUILD_SHA}</code>
        </p>
        <p className="text-sm">
          API:{' '}
          {health === 'checking' ? 'comprobando...' : health === 'up' ? 'responde ✔' : 'no responde ✘'}
        </p>
      </div>

      {loadError && (
        <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {loadError}
        </p>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Integraciones</h2>
        {integrations ? (
          <div className="mt-2 text-sm">
            <p>
              Dominio: {integrations.deploy?.origin ?? 'sin verificar'}{' '}
              {integrations.deploy?.verifiedAt ? '✔ verificado' : '✘ sin verificar'}
            </p>
            <p>Ultimo build visto por Lumon: {integrations.deploy?.lastBuildSeen ?? '—'}</p>
            <p className="mt-2">
              Storage: {integrations.storage?.provider ?? 'sin configurar'}{' '}
              {integrations.storage?.verifiedAt ? '✔ verificado' : '✘ sin verificar'}
            </p>
            <ChecksList checks={integrations.storage?.checks ?? []} />
          </div>
        ) : (
          !loadError && <p className="text-sm">Cargando...</p>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Piso de Pruebas (clearance)</h2>
        {clearance ? (
          <>
            <p className="mt-2 text-sm">{clearance.granted ? 'Abierto ✔' : 'Cerrado ✘'}</p>
            <ChecksList checks={clearance.checks ?? []} />
          </>
        ) : (
          !loadError && <p className="text-sm">Cargando...</p>
        )}
        <button
          type="button"
          onClick={() => void runCheck()}
          disabled={checking}
          className="mt-4 rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 disabled:opacity-60"
        >
          {checking ? 'Revisando...' : 'Abrir el Piso de Pruebas'}
        </button>
        {checkError && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {checkError}
          </p>
        )}
      </div>
    </section>
  )
}
