import { useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { ApiError, describeError, fieldErrorsFrom } from '../api/errors'
import { TextField } from '../components/TextField'

const MESSAGES: Record<string, { field: string; text: string }> = {
  EMAIL_TAKEN: { field: 'email', text: 'Ese email ya esta registrado.' },
  TEAM_NAME_TAKEN: { field: 'teamName', text: 'Ya existe una cuadrilla con ese nombre.' },
}

export default function RegisterPage() {
  const { register } = useAuth()
  const location = useLocation()
  const [teamName, setTeamName] = useState('')
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
    try {
      await register({ teamName: teamName.trim(), email: email.trim(), password })
    } catch (err) {
      if (err instanceof ApiError) {
        const known = MESSAGES[err.code]
        const fields = fieldErrorsFrom(err)
        if (known) fields[known.field] = known.text
        setFieldErrors(fields)
        setError(Object.keys(fields).length > 0 ? 'Revisa los campos marcados.' : describeError(err))
      } else {
        setError(describeError(err))
      }
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Registrar cuadrilla</h1>
        <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 flex flex-col gap-4" noValidate>
          <TextField
            label="Nombre del equipo"
            autoComplete="organization"
            required
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            error={fieldErrors['teamName']}
          />
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
            autoComplete="new-password"
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
            {submitting ? 'Registrando...' : 'Registrar y entrar'}
          </button>
        </form>
        <p className="mt-4 text-sm text-slate-700">
          ¿Ya tienen cuenta?{' '}
          <Link to="/login" state={location.state} className="font-medium text-blue-800 underline">
            Entrar
          </Link>
        </p>
      </div>
    </main>
  )
}
