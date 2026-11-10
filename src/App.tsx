import { lazy } from 'react'
import { Route, Routes } from 'react-router'
import { AuthProvider } from './auth/AuthContext'
import { ProtectedRoute, PublicOnlyRoute, RequirePermission } from './auth/guards'
import { HealthGate } from './components/HealthGate'
import { AppLayout } from './components/AppLayout'
import { ErrorBoundary } from './components/ErrorBoundary'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import NotFoundPage from './pages/NotFoundPage'

const HomePage = lazy(() => import('./pages/HomePage'))
const EstadoPage = lazy(() => import('./pages/EstadoPage'))
const PlaceholderPage = lazy(() => import('./pages/PlaceholderPage'))
const FilesPage = lazy(() => import('./files/FilesPage'))
const RefinePage = lazy(() => import('./files/RefinePage'))

export default function App() {
  return (
    <ErrorBoundary>
      <HealthGate>
        <AuthProvider>
          <Routes>
            <Route element={<PublicOnlyRoute />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
            </Route>

            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/estado" element={<EstadoPage />} />
                <Route element={<RequirePermission permission="files:read" />}>
                  <Route path="/files" element={<FilesPage />} />
                  <Route path="/files/:id/refine" element={<RefinePage />} />
                </Route>
                <Route element={<RequirePermission permission="refiners:read" />}>
                  <Route path="/refiners/*" element={<PlaceholderPage title="Expedientes" />} />
                </Route>
                <Route element={<RequirePermission permission="incidents:read" />}>
                  <Route path="/incidents/*" element={<PlaceholderPage title="Incidencias" />} />
                </Route>
                <Route element={<RequirePermission permission="team:manage" />}>
                  <Route path="/team/*" element={<PlaceholderPage title="Equipo" />} />
                </Route>
              </Route>
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AuthProvider>
      </HealthGate>
    </ErrorBoundary>
  )
}
