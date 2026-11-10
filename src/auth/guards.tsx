import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './useAuth'
import { FullScreenMessage } from '../components/FullScreenMessage'
import NoPermissionPage from '../pages/NoPermissionPage'

/** Ruta de retorno guardada en location.state.from (solo rutas internas). */
export function readFrom(state: unknown): string | null {
  if (typeof state !== 'object' || state === null) return null
  const from = (state as { from?: unknown }).from
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) return null
  return from
}

export function ProtectedRoute() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <FullScreenMessage title="Verificando sesion..." />
  if (status === 'anonymous') {
    const from = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to="/login" replace state={{ from }} />
  }
  return <Outlet />
}

export function PublicOnlyRoute() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <FullScreenMessage title="Verificando sesion..." />
  if (status === 'authenticated') {
    return <Navigate to={readFrom(location.state) ?? '/'} replace />
  }
  return <Outlet />
}

export function RequirePermission({ permission }: { permission: string }) {
  const { hasPermission } = useAuth()
  if (!hasPermission(permission)) return <NoPermissionPage permission={permission} />
  return <Outlet />
}
