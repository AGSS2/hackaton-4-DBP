import { useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { ApiError, describeError, fieldErrorsFrom } from '../api/errors'
import { TextField } from '../components/TextField'

export default function LoginPage() {
  const { login, notice, clearNotice } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)
    setFieldErrors({})
    clearNotice()
    try {
      await login(email.trim(), password)
      // PublicOnlyRoute redirige a la ruta original (location.state.from).
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_CREDENTIALS') {
        setError('Email o contrasena incorrectos.')
      } else if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
        setFieldErrors(fieldErrorsFrom(err))
        setError('Revisa los datos ingresados.')
      } else {
        setError(describeError(err))
      }
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Entrar al piso</h1>
        {notice && (
          <p role="alert" className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {notice}
          </p>
        )}
        <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 flex flex-col gap-4" noValidate>
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldErrors['email']}
          />
          <TextField
            label="Contrasena"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrors['password']}
          />
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 disabled:opacity-60"
          >
            {submitting ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
        <p className="mt-4 text-sm text-slate-700">
          ¿Cuadrilla nueva?{' '}
          <Link to="/register" state={location.state} className="font-medium text-blue-800 underline">
            Registrarla
          </Link>
        </p>
      </div>
    </main>
  )
}
