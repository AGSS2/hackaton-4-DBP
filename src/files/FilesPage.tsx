import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { z } from 'zod'
import { apiJson } from '../api/http'
import { describeError } from '../api/errors'
import { FilePageSchema, type FilePage } from './schemas'

const SIZES = [10, 25, 50] as const
const SORTS = [
  { value: 'updatedAt,desc', label: 'Mas recientes' },
  { value: 'name,asc', label: 'Nombre (A-Z)' },
  { value: 'progress,desc', label: 'Mayor progreso' },
] as const

// Una URL invalida no rompe la vista: cada parametro cae a su valor por defecto.
const FiltersSchema = z.object({
  page: z.coerce.number().int().min(0).catch(0),
  size: z.coerce
    .number()
    .refine((n) => (SIZES as readonly number[]).includes(n))
    .catch(10),
  status: z.enum(['ACTIVE', 'COMPLETE', '']).catch(''),
  sort: z.enum(['updatedAt,desc', 'name,asc', 'progress,desc']).catch('updatedAt,desc'),
  q: z.string().max(100).catch(''),
})
type Filters = z.infer<typeof FiltersSchema>

function readFilters(params: URLSearchParams): Filters {
  return FiltersSchema.parse({
    page: params.get('page') ?? undefined,
    size: params.get('size') ?? undefined,
    status: params.get('status') ?? '',
    sort: params.get('sort') ?? undefined,
    q: params.get('q') ?? '',
  })
}

export default function FilesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = useMemo(() => readFilters(searchParams), [searchParams])
  const [search, setSearch] = useState(filters.q)
  const [data, setData] = useState<FilePage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  const update = (patch: Partial<Filters>, resetPage = true) => {
    const next = { ...filters, ...(resetPage ? { page: 0 } : {}), ...patch }
    const params = new URLSearchParams()
    if (next.page) params.set('page', String(next.page))
    if (next.size !== 10) params.set('size', String(next.size))
    if (next.status) params.set('status', next.status)
    if (next.sort !== 'updatedAt,desc') params.set('sort', next.sort)
    if (next.q) params.set('q', next.q)
    setSearchParams(params)
  }

  // Si la URL cambia (atras/adelante), el input refleja la busqueda.
  useEffect(() => {
    setSearch(filters.q)
  }, [filters.q])

  // Busqueda sin una request por tecla (debounce 400 ms).
  useEffect(() => {
    if (search.trim() === filters.q) return
    const timer = window.setTimeout(() => update({ q: search.trim() }), 400)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  // Una respuesta vieja nunca pisa a una nueva: cada cambio aborta la request anterior.
  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({
      page: String(filters.page),
      size: String(filters.size),
      sort: filters.sort,
    })
    if (filters.status) params.set('status', filters.status)
    if (filters.q) params.set('q', filters.q)
    setLoading(true)
    setError(null)
    apiJson(`/files?${params.toString()}`, FilePageSchema, { signal: controller.signal })
      .then((page) => {
        if (controller.signal.aborted) return
        setData(page)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setError(describeError(err))
        setLoading(false)
      })
    return () => controller.abort()
  }, [filters, retryKey])

  const totalPages = data?.totalPages ?? 0

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Archivos de datos</h1>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-sm">
          Buscar
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded border border-slate-400 px-3 py-2"
          />
        </label>
        <label className="flex flex-col text-sm">
          Estado
          <select
            value={filters.status}
            onChange={(e) => update({ status: FiltersSchema.shape.status.parse(e.target.value) })}
            className="rounded border border-slate-400 px-3 py-2"
          >
            <option value="">Todos</option>
            <option value="ACTIVE">Activos</option>
            <option value="COMPLETE">Completados</option>
          </select>
        </label>
        <label className="flex flex-col text-sm">
          Orden
          <select
            value={filters.sort}
            onChange={(e) => update({ sort: FiltersSchema.shape.sort.parse(e.target.value) })}
            className="rounded border border-slate-400 px-3 py-2"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-sm">
          Por pagina
          <select
            value={filters.size}
            onChange={(e) => update({ size: Number(e.target.value) })}
            className="rounded border border-slate-400 px-3 py-2"
          >
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}{' '}
          <button type="button" className="underline" onClick={() => setRetryKey((k) => k + 1)}>
            Reintentar
          </button>
        </div>
      )}

      <div aria-busy={loading} className="overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-2">Nombre</th>
              <th className="p-2">Tamano</th>
              <th className="p-2">Estado</th>
              <th className="p-2">Progreso</th>
              <th className="p-2">Accion</th>
            </tr>
          </thead>
          <tbody>
            {data?.content.map((f) => (
              <tr key={f.id} className="border-t border-slate-200">
                <td className="p-2">{f.name}</td>
                <td className="p-2">
                  {f.rows} × {f.cols}
                </td>
                <td className="p-2">{f.status}</td>
                <td className="p-2">{f.progress ? `${Math.round(f.progress.overall * 100)} %` : '—'}</td>
                <td className="p-2">
                  <Link to={`/files/${f.id}/refine`} className="font-medium text-blue-800 underline">
                    Refinar
                  </Link>
                </td>
              </tr>
            ))}
            {data && data.content.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-slate-700">
                  No hay archivos con estos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {loading && <p role="status" className="p-3 text-sm">Cargando...</p>}
      </div>

      <nav aria-label="Paginacion" className="flex items-center gap-3">
        <button
          type="button"
          disabled={filters.page <= 0 || loading}
          onClick={() => update({ page: filters.page - 1 }, false)}
          className="rounded border border-slate-400 px-3 py-1 disabled:opacity-60"
        >
          Anterior
        </button>
        <span className="text-sm">
          Pagina {filters.page + 1} de {Math.max(1, totalPages)}
        </span>
        <button
          type="button"
          disabled={filters.page + 1 >= totalPages || loading}
          onClick={() => update({ page: filters.page + 1 }, false)}
          className="rounded border border-slate-400 px-3 py-1 disabled:opacity-60"
        >
          Siguiente
        </button>
      </nav>
    </section>
  )
}
