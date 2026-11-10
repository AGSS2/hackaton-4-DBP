import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { apiJson } from '../api/http'
import { ApiError, describeError, isRecord } from '../api/errors'
import { useAuth } from '../auth/useAuth'
import {
  BIN_CODES,
  FileDetailSchema,
  RefineResultSchema,
  RulesSchema,
  type BinCode,
  type FileDetail,
  type Progress,
  type Rules,
} from './schemas'
import { BIN_CHAR, binFor, isNoise, neighbors, type Cell } from './binning'
import { TileStore, tileKey } from './tileStore'

const CELL = 32
const MAX_DOM_CELLS = 2400
const MAX_GROUP_SCAN = 5000

const BIN_NAMES: Record<BinCode, string> = { WO: 'WO', FC: 'FC', DR: 'DR', MA: 'MA' }
const CHAR_TO_BIN: Record<string, BinCode> = { W: 'WO', F: 'FC', D: 'DR', M: 'MA' }

interface Group {
  cells: Cell[]
  keys: Set<string>
  bin: BinCode
  noise: boolean
  refined: boolean
}

const cellKey = (r: number, c: number) => `${r},${c}`

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function parseCoord(value: string | null, max: number): number {
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 ? Math.min(n, max - 1) : 0
}

function groupErrorMessage(err: ApiError): string {
  const details = isRecord(err.details) ? err.details : {}
  if (err.code === 'WRONG_BIN') return 'Caja incorrecta: Lumon anoto un error. Revisa la regla del archivo y elige otra caja.'
  if (err.code === 'ALREADY_REFINED') return 'Parte de este grupo ya estaba refinado. Se actualizaron los bloques; elige otro grupo.'
  if (err.code === 'GROUP_CLAIMED') {
    const holder = isRecord(details['holder']) ? details['holder']['displayName'] : null
    return `Este grupo esta reservado por ${typeof holder === 'string' ? holder : 'otro refinador'}. Elige otro grupo.`
  }
  if (err.code === 'GROUP_INVALID') {
    switch (details['reason']) {
      case 'INCOMPLETE':
        return 'El grupo esta incompleto. Vuelve a seleccionarlo para cargar todas sus celdas.'
      case 'NOT_CONNECTED':
        return 'Las celdas no estan conectadas. Vuelve a seleccionar el grupo.'
      case 'BELOW_THRESHOLD':
        return 'El grupo incluye celdas que no dan miedo. Vuelve a seleccionarlo.'
      case 'SIZE_OUT_OF_RANGE':
        return 'Ese grupo es ruido: su tamano esta fuera del rango permitido.'
      default:
        return describeError(err)
    }
  }
  return describeError(err)
}

export default function RefinePage() {
  const { id } = useParams()
  const fileId = Number(id)
  const validId = Number.isInteger(fileId) && fileId > 0
  const [searchParams, setSearchParams] = useSearchParams()
  const { hasPermission } = useAuth()
  const canRefine = hasPermission('files:refine')

  const [file, setFile] = useState<FileDetail | null>(null)
  const [rules, setRules] = useState<Rules | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [store, setStore] = useState<TileStore | null>(null)
  const [, setTick] = useState(0)

  const [viewport, setViewport] = useState({ top: 0, left: 0, width: 800, height: 560 })
  const [focus, setFocus] = useState<Cell>({ r: 0, c: 0 })
  const [group, setGroup] = useState<Group | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [mistakes, setMistakes] = useState(0)
  const [completed, setCompleted] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [refining, setRefining] = useState(false)
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const refiningRef = useRef(false)
  const selectSeq = useRef(0)
  const initialPosApplied = useRef(false)
  const urlTimer = useRef<number | null>(null)

  // ---------- carga del archivo y reglas ----------
  useEffect(() => {
    if (!validId) return
    const controller = new AbortController()
    const { signal } = controller
    setLoadError(null)
    Promise.all([
      apiJson(`/files/${fileId}`, FileDetailSchema, { signal }),
      apiJson(`/files/${fileId}/rules`, RulesSchema, { signal }),
    ])
      .then(([fileData, rulesData]) => {
        if (signal.aborted) return
        setFile(fileData)
        setRules(rulesData)
        setProgress(fileData.progress)
        setMistakes(fileData.mistakes)
        setCompleted(fileData.status === 'COMPLETE' || fileData.progress.overall >= 1)
      })
      .catch((err: unknown) => {
        if (!signal.aborted) setLoadError(describeError(err))
      })
    return () => controller.abort()
  }, [fileId, validId])

  useEffect(() => {
    if (!file) return
    const tileStore = new TileStore(file.id, file.tileSize)
    const unsubscribe = tileStore.subscribe(() => setTick((t) => t + 1))
    setStore(tileStore)
    return () => {
      unsubscribe()
      tileStore.dispose()
    }
  }, [file])

  // ---------- tamano del viewport ----------
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      setViewport((v) => ({ ...v, width: el.clientWidth, height: el.clientHeight }))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [file])

  // ---------- posicion inicial desde ?r=&c= ----------
  useEffect(() => {
    if (!file || initialPosApplied.current) return
    const el = scrollRef.current
    if (!el) return
    initialPosApplied.current = true
    const r = parseCoord(searchParams.get('r'), file.rows)
    const c = parseCoord(searchParams.get('c'), file.cols)
    setFocus({ r, c })
    el.scrollTop = r * CELL
    el.scrollLeft = c * CELL
    setViewport((v) => ({ ...v, top: el.scrollTop, left: el.scrollLeft }))
  }, [file, searchParams])

  const syncUrl = useCallback(
    (r: number, c: number) => {
      if (urlTimer.current !== null) window.clearTimeout(urlTimer.current)
      urlTimer.current = window.setTimeout(() => {
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev)
            next.set('r', String(r))
            next.set('c', String(c))
            return next
          },
          { replace: true },
        )
      }, 300)
    },
    [setSearchParams],
  )

  useEffect(
    () => () => {
      if (urlTimer.current !== null) window.clearTimeout(urlTimer.current)
    },
    [],
  )

  const onScroll = () => {
    const el = scrollRef.current
    if (!el || !file) return
    setViewport((v) => ({ ...v, top: el.scrollTop, left: el.scrollLeft }))
    syncUrl(Math.floor(el.scrollTop / CELL), Math.floor(el.scrollLeft / CELL))
  }

  // ---------- ventana visible (virtualizacion) ----------
  const range = useMemo(() => {
    if (!file) return null
    let visibleRows = Math.ceil(viewport.height / CELL) + 2
    let visibleCols = Math.ceil(viewport.width / CELL) + 2
    while (visibleRows * visibleCols > MAX_DOM_CELLS) {
      if (visibleCols > visibleRows) visibleCols -= 1
      else visibleRows -= 1
    }
    const r0 = clamp(Math.floor(viewport.top / CELL) - 1, 0, Math.max(0, file.rows - 1))
    const c0 = clamp(Math.floor(viewport.left / CELL) - 1, 0, Math.max(0, file.cols - 1))
    const r1 = Math.min(file.rows - 1, r0 + visibleRows - 1)
    const c1 = Math.min(file.cols - 1, c0 + visibleCols - 1)
    return { r0, c0, r1, c1 }
  }, [file, viewport])

  // ---------- pedir solo los bloques visibles ----------
  useEffect(() => {
    if (!store || !file || !range) return
    const keys = new Set<string>()
    const ts = file.tileSize
    for (let tr = Math.floor(range.r0 / ts); tr <= Math.floor(range.r1 / ts); tr += 1) {
      for (let tc = Math.floor(range.c0 / ts); tc <= Math.floor(range.c1 / ts); tc += 1) {
        keys.add(tileKey(tr, tc))
      }
    }
    store.setWanted(keys)
  }, [store, file, range])

  // ---------- seleccion del grupo completo (aunque cruce bloques) ----------
  const selectGroupAt = useCallback(
    async (start: Cell) => {
      if (!store || !file || !rules) return
      const startData = store.getCell(start.r, start.c)
      if (!startData || startData.tremor < rules.tremorThreshold) {
        setGroup(null)
        return
      }
      const seq = ++selectSeq.current
      setSelecting(true)
      setMessage(null)
      try {
        const ts = file.tileSize
        const seen = new Set<string>([cellKey(start.r, start.c)])
        const cells: Cell[] = []
        const queue: Cell[] = [start]
        while (queue.length > 0 && cells.length <= MAX_GROUP_SCAN) {
          const cell = queue.shift()
          if (!cell) break
          let data = store.getCell(cell.r, cell.c)
          if (!data) {
            await store.ensure(Math.floor(cell.r / ts), Math.floor(cell.c / ts))
            data = store.getCell(cell.r, cell.c)
          }
          if (!data || data.tremor < rules.tremorThreshold) continue
          cells.push(cell)
          for (const n of neighbors(cell, rules.connectivity)) {
            if (n.r < 0 || n.c < 0 || n.r >= file.rows || n.c >= file.cols) continue
            const key = cellKey(n.r, n.c)
            if (seen.has(key)) continue
            seen.add(key)
            queue.push(n)
          }
        }
        if (seq !== selectSeq.current) return
        const digits = cells.map((cell) => store.getCell(cell.r, cell.c)?.value ?? 0)
        const refined = cells.some((cell) => (store.getCell(cell.r, cell.c)?.bin ?? '.') !== '.')
        setGroup({
          cells,
          keys: new Set(cells.map((cell) => cellKey(cell.r, cell.c))),
          bin: binFor(digits, rules),
          noise: isNoise(cells.length, rules),
          refined,
        })
      } catch (err) {
        if (seq === selectSeq.current) setMessage({ kind: 'error', text: describeError(err) })
      } finally {
        if (seq === selectSeq.current) setSelecting(false)
      }
    },
    [store, file, rules],
  )

  // ---------- refinar (idempotente) ----------
  const refine = useCallback(
    async (bin: BinCode) => {
      if (!group || !file || !store || refiningRef.current) return
      if (group.noise) {
        setMessage({ kind: 'error', text: 'Este grupo es ruido: no se puede refinar.' })
        return
      }
      if (group.refined) {
        setMessage({ kind: 'error', text: 'Este grupo ya fue refinado.' })
        return
      }
      refiningRef.current = true
      setRefining(true)
      setMessage(null)
      const idempotencyKey = crypto.randomUUID() // una key por intencion del usuario
      const cells = group.cells.map(({ r, c }) => ({ r, c }))
      try {
        const result = await apiJson(`/files/${file.id}/refinements`, RefineResultSchema, {
          method: 'POST',
          body: { bin, cells },
          headers: { 'Idempotency-Key': idempotencyKey },
          retries: 4, // reintentos con la MISMA key (red / 503)
        })
        store.markBins(cells, BIN_CHAR[bin])
        setProgress(result.file.progress)
        setMistakes(result.file.mistakes)
        setGroup(null)
        setMessage({ kind: 'ok', text: `Grupo de ${cells.length} celdas llevado a ${bin}.` })
        if (result.file.status === 'COMPLETE' || result.file.progress.overall >= 1) setCompleted(true)
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.code === 'WRONG_BIN' && isRecord(err.details) && typeof err.details['mistakes'] === 'number') {
            setMistakes(err.details['mistakes'])
          }
          if (err.code === 'ALREADY_REFINED' || err.code === 'GROUP_INVALID') {
            const tiles = isRecord(err.details) ? err.details['tiles'] : null
            const keys = Array.isArray(tiles)
              ? tiles.filter((t): t is [number, number] => Array.isArray(t) && t.length === 2).map(([tr, tc]) => tileKey(tr, tc))
              : [...new Set(cells.map(({ r, c }) => tileKey(Math.floor(r / file.tileSize), Math.floor(c / file.tileSize))))]
            store.invalidate(keys)
            setGroup(null)
          }
          setMessage({ kind: 'error', text: groupErrorMessage(err) })
        } else {
          setMessage({ kind: 'error', text: describeError(err) })
        }
      } finally {
        refiningRef.current = false
        setRefining(false)
      }
    },
    [group, file, store],
  )

  // ---------- arrastre con Pointer Events ----------
  useEffect(() => {
    if (!drag) return
    const onMove = (event: PointerEvent) => setDrag({ x: event.clientX, y: event.clientY })
    const onUp = (event: PointerEvent) => {
      setDrag(null)
      const target = document.elementFromPoint(event.clientX, event.clientY)
      const binEl = target instanceof Element ? target.closest('[data-bin]') : null
      const bin = binEl?.getAttribute('data-bin')
      if (bin && (BIN_CODES as readonly string[]).includes(bin)) void refine(bin as BinCode)
    }
    const onCancel = () => setDrag(null)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
  }, [drag, refine])

  const onCellPointerDown = (event: ReactPointerEvent<HTMLDivElement>, r: number, c: number) => {
    setFocus({ r, c })
    if (group && group.keys.has(cellKey(r, c)) && canRefine && !group.noise && !group.refined) {
      event.preventDefault()
      setDrag({ x: event.clientX, y: event.clientY })
    } else {
      void selectGroupAt({ r, c })
    }
  }

  // ---------- teclado ----------
  const moveFocus = useCallback(
    (r: number, c: number) => {
      if (!file) return
      const nr = clamp(r, 0, file.rows - 1)
      const nc = clamp(c, 0, file.cols - 1)
      setFocus({ r: nr, c: nc })
      const el = scrollRef.current
      if (el) {
        if (nr * CELL < el.scrollTop) el.scrollTop = nr * CELL
        else if ((nr + 1) * CELL > el.scrollTop + el.clientHeight) el.scrollTop = (nr + 1) * CELL - el.clientHeight
        if (nc * CELL < el.scrollLeft) el.scrollLeft = nc * CELL
        else if ((nc + 1) * CELL > el.scrollLeft + el.clientWidth) el.scrollLeft = (nc + 1) * CELL - el.clientWidth
      }
    },
    [file],
  )

  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!file) return
    const page = Math.max(1, Math.floor(viewport.height / CELL) - 1)
    const { r, c } = focus
    let handled = true
    switch (event.key) {
      case 'ArrowUp':
        moveFocus(r - 1, c)
        break
      case 'ArrowDown':
        moveFocus(r + 1, c)
        break
      case 'ArrowLeft':
        moveFocus(r, c - 1)
        break
      case 'ArrowRight':
        moveFocus(r, c + 1)
        break
      case 'PageUp':
        moveFocus(r - page, c)
        break
      case 'PageDown':
        moveFocus(r + page, c)
        break
      case 'Home':
        moveFocus(event.ctrlKey ? 0 : r, 0)
        break
      case 'End':
        moveFocus(event.ctrlKey ? file.rows - 1 : r, file.cols - 1)
        break
      case 'Enter':
      case ' ':
        if (!selecting) void selectGroupAt(focus)
        break
      case '1':
      case '2':
      case '3':
      case '4':
        if (group) void refine(BIN_CODES[Number(event.key) - 1] ?? 'WO')
        break
      case 'Escape':
        setGroup(null)
        break
      default:
        handled = false
    }
    if (handled) event.preventDefault()
  }

  // La celda con foco siempre esta en el DOM y recibe el foco real.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !el.contains(document.activeElement)) return
    const target = el.querySelector<HTMLElement>(`[data-cell="${focus.r},${focus.c}"]`)
    target?.focus({ preventScroll: true })
  }, [focus, viewport])

  // ---------- render ----------
  if (!validId) {
    return <p role="alert">Archivo invalido. <Link to="/files" className="underline">Volver a archivos</Link></p>
  }
  if (loadError) {
    return (
      <div role="alert" className="rounded border border-red-200 bg-red-50 p-4 text-red-800">
        <p>{loadError}</p>
        <Link to="/files" className="underline">Volver a archivos</Link>
      </div>
    )
  }
  if (!file || !rules || !range) return <p role="status">Cargando archivo...</p>

  if (completed) {
    return (
      <section className="mx-auto max-w-lg rounded-lg border border-green-300 bg-green-50 p-6 text-green-900">
        <h1 className="text-2xl font-semibold">Archivo completado</h1>
        <p className="mt-2">{file.name} llego al 100 %. Errores de refinamiento: {mistakes}.</p>
        <Link to="/files" className="mt-4 inline-block font-medium underline">Volver a archivos</Link>
      </section>
    )
  }

  const rowsToRender: number[] = []
  for (let r = range.r0; r <= range.r1; r += 1) rowsToRender.push(r)
  const focusOutside = focus.r < range.r0 || focus.r > range.r1 || focus.c < range.c0 || focus.c > range.c1
  if (focusOutside && !rowsToRender.includes(focus.r)) rowsToRender.push(focus.r)

  const renderCell = (r: number, c: number) => {
    const data = store?.getCell(r, c) ?? null
    const isFocus = r === focus.r && c === focus.c
    const inGroup = group?.keys.has(cellKey(r, c)) ?? false
    const scary = data !== null && data.tremor >= rules.tremorThreshold
    const binCode = data && data.bin !== '.' ? CHAR_TO_BIN[data.bin] : undefined
    const intensity = data ? Math.max(0, (data.tremor - rules.tremorThreshold) / Math.max(1, 100 - rules.tremorThreshold)) : 0
    let className = 'absolute flex items-center justify-center font-mono text-sm select-none '
    if (!data) className += 'bg-slate-200 text-slate-500'
    else if (binCode) className += 'bg-slate-300 text-slate-700'
    else if (inGroup) className += 'bg-blue-200 text-blue-950 font-bold'
    else if (scary) className += 'mdr-scary text-slate-950 font-bold underline'
    else className += 'text-slate-800'
    if (isFocus) className += ' outline outline-2 outline-blue-700 z-10'
    return (
      <div
        key={c}
        role="gridcell"
        aria-colindex={c + 1}
        aria-selected={inGroup}
        aria-label={data ? `Fila ${r + 1}, columna ${c + 1}: ${data.value}${scary ? ', da miedo' : ''}${binCode ? `, refinado en ${binCode}` : ''}` : `Fila ${r + 1}, columna ${c + 1}: cargando`}
        tabIndex={isFocus ? 0 : -1}
        data-cell={`${r},${c}`}
        className={className}
        style={
          {
            left: c * CELL,
            top: 0,
            width: CELL,
            height: CELL,
            '--mdr-shake': `${(0.5 + intensity * 2).toFixed(2)}px`,
            '--mdr-speed': `${(0.6 - intensity * 0.4).toFixed(2)}s`,
          } as CSSProperties
        }
        onPointerDown={(e) => onCellPointerDown(e, r, c)}
      >
        {data ? (binCode ? binCode[0] : data.value) : ''}
      </div>
    )
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{file.name}</h1>
        <Link to="/files" className="text-sm underline">Volver a archivos</Link>
      </div>
      <p className="text-sm text-slate-700">
        Umbral {rules.tremorThreshold} · conectividad {rules.connectivity} · grupos de {rules.minGroupSize} a{' '}
        {rules.maxGroupSize} · {rules.binning.strategy} ({rules.binning.order.join(', ')}) · errores: {mistakes}
      </p>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        onKeyDown={onGridKeyDown}
        role="grid"
        aria-label={`Grilla de ${file.name}`}
        aria-rowcount={file.rows}
        aria-colcount={file.cols}
        className="relative h-[60vh] w-full overflow-auto rounded border border-slate-300 bg-white"
      >
        <div style={{ height: file.rows * CELL, width: file.cols * CELL, position: 'relative' }}>
          {rowsToRender.map((r) => {
            const cols: number[] = []
            for (let c = range.c0; c <= range.c1; c += 1) cols.push(c)
            if (r === focus.r && (focus.c < range.c0 || focus.c > range.c1)) cols.push(focus.c)
            return (
              <div key={r} role="row" aria-rowindex={r + 1} className="absolute left-0" style={{ top: r * CELL, height: CELL }}>
                {cols.map((c) => renderCell(r, c))}
              </div>
            )
          })}
        </div>
      </div>

      <div aria-live="polite" className="min-h-6 text-sm">
        {selecting && <span>Buscando el grupo completo...</span>}
        {!selecting && group && (
          <span>
            Grupo de <strong>{group.cells.length}</strong> celdas ·{' '}
            {group.refined ? 'ya refinado' : group.noise ? <strong>ruido (no se puede refinar)</strong> : <>caja segun las reglas: <strong>{group.bin}</strong></>}
            {canRefine && !group.noise && !group.refined && ' · arrastralo a una caja o pulsa 1-4'}
          </span>
        )}
        {!selecting && !group && <span>Elige una celda que da miedo (clic o Enter) para seleccionar su grupo.</span>}
      </div>

      {message && (
        <p role={message.kind === 'error' ? 'alert' : 'status'} className={message.kind === 'error' ? 'text-sm text-red-700' : 'text-sm text-green-800'}>
          {message.text}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {BIN_CODES.map((bin, index) => {
          const value = progress ? progress[bin] : 0
          const disabled = !canRefine || !group || group.noise || group.refined || refining
          return (
            <button
              key={bin}
              type="button"
              data-bin={bin}
              disabled={disabled}
              onClick={() => void refine(bin)}
              className={`rounded-lg border-2 p-3 text-left ${drag ? 'border-blue-700' : 'border-slate-300'} bg-white disabled:opacity-70`}
              aria-label={`Caja ${BIN_NAMES[bin]} (tecla ${index + 1}), progreso ${Math.round(value * 100)} %`}
            >
              <span className="font-semibold">{index + 1}. {bin}</span>
              <span className="mt-2 block h-2 w-full rounded bg-slate-200" aria-hidden="true">
                <span className="block h-2 rounded bg-blue-700" style={{ width: `${Math.round(value * 100)}%` }} />
              </span>
              <span className="mt-1 block text-xs text-slate-700">{Math.round(value * 100)} %</span>
            </button>
          )
        })}
      </div>
      <p className="text-sm text-slate-700">Progreso total: {progress ? Math.round(progress.overall * 100) : 0} %</p>
      {!canRefine && <p className="text-sm text-amber-800">Tu rol no tiene permiso para refinar (files:refine).</p>}

      {drag && group && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 rounded bg-blue-700 px-2 py-1 text-sm text-white shadow"
          style={{ left: drag.x + 12, top: drag.y + 12 }}
        >
          Grupo de {group.cells.length}
        </div>
      )}
    </section>
  )
}
