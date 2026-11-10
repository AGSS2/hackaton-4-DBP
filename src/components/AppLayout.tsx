import { Suspense, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { ErrorBoundary } from './ErrorBoundary'

const NAV_ITEMS: { to: string; label: string; permission: string | null }[] = [
  { to: '/', label: 'Inicio', permission: null },
  { to: '/files', label: 'Archivos', permission: 'files:read' },
  { to: '/refiners', label: 'Expedientes', permission: 'refiners:read' },
  { to: '/incidents', label: 'Incidencias', permission: 'incidents:read' },
  { to: '/estado', label: 'Estado', permission: null },
]

export function AppLayout() {
  const { me, logout, hasPermission } = useAuth()
  const location = useLocation()
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await logout()
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:bg-white focus:p-2">
        Saltar al contenido
      </a>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="font-semibold">Consola MDR</p>
            {me && (
              <p className="text-sm text-slate-700">
                {me.team.name} ({me.team.code}) · {me.role.name}
              </p>
            )}
          </div>
          <nav aria-label="Principal">
            <ul className="flex flex-wrap gap-1">
              {NAV_ITEMS.filter((item) => item.permission === null || hasPermission(item.permission)).map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      `rounded px-3 py-2 text-sm ${isActive ? 'bg-blue-700 text-white' : 'text-slate-800 hover:bg-slate-100'}`
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={loggingOut}
            className="rounded border border-slate-400 px-3 py-2 text-sm hover:bg-slate-100 disabled:opacity-60"
          >
            {loggingOut ? 'Saliendo...' : 'Cerrar sesion'}
          </button>
        </div>
      </header>
      <main id="contenido" className="mx-auto max-w-6xl px-4 py-6">
        <ErrorBoundary key={location.pathname}>
          <Suspense fallback={<p role="status">Cargando...</p>}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  )
}
