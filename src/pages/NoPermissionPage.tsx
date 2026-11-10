import { Link } from 'react-router'

export default function NoPermissionPage({ permission }: { permission: string }) {
  return (
    <section role="alert" className="mx-auto max-w-lg rounded-lg border border-amber-300 bg-amber-50 p-6 text-amber-900">
      <h1 className="text-xl font-semibold">Sin permiso</h1>
      <p className="mt-2">
        Tu rol no tiene el permiso <code>{permission}</code> para ver esta pagina.
      </p>
      <Link to="/" className="mt-4 inline-block font-medium underline">
        Volver al inicio
      </Link>
    </section>
  )
}
