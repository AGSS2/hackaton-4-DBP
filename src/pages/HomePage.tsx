import { useAuth } from '../auth/useAuth'

export default function HomePage() {
  const { me } = useAuth()
  if (!me) return null
  return (
    <section>
      <h1 className="text-2xl font-semibold">Bienvenido, {me.displayName}</h1>
      <dl className="mt-4 grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-slate-700">Equipo</dt>
          <dd>
            {me.team.name} ({me.team.code})
          </dd>
        </div>
        <div>
          <dt className="text-sm text-slate-700">Rol</dt>
          <dd>{me.role.name}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-700">Piso de Pruebas</dt>
          <dd>{me.clearance.granted ? 'Abierto' : 'Cerrado'}</dd>
        </div>
      </dl>
      <h2 className="mt-6 text-lg font-semibold">Permisos</h2>
      <ul className="mt-2 flex flex-wrap gap-2">
        {me.permissions.map((permission) => (
          <li key={permission} className="rounded bg-slate-200 px-2 py-1 text-sm">
            {permission}
          </li>
        ))}
      </ul>
    </section>
  )
}
