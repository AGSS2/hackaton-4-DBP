import { Link } from 'react-router'

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center text-slate-900">
      <h1 className="text-4xl font-bold">404</h1>
      <p>Esta pagina no existe en el piso.</p>
      <Link to="/" className="font-medium text-blue-800 underline">
        Volver al inicio
      </Link>
    </main>
  )
}
