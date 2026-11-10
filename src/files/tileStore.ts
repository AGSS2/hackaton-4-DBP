import { apiJson } from '../api/http'
import { ApiError } from '../api/errors'
import { TileSchema } from './schemas'

export interface Tile {
  tileRow: number
  tileCol: number
  originRow: number
  originCol: number
  rows: number
  cols: number
  values: string
  tremor: Uint8Array
  bins: string[]
  version: number
}

export interface CellData {
  value: number
  tremor: number
  bin: string
}

function decodeBase64(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export const tileKey = (tileRow: number, tileCol: number) => `${tileRow}:${tileCol}`

interface Waiter {
  resolve: (tile: Tile) => void
  reject: (error: unknown) => void
}

/*
 * Cache de bloques:
 * - nunca hay dos requests en vuelo para el mismo bloque,
 * - los bloques que salen de la vista se cancelan (si aun no respondieron),
 * - 429: no se pide NADA hasta que pase Retry-After,
 * - 503 / red: reintento con espera creciente.
 */
export class TileStore {
  private readonly fileId: number
  private readonly tileSize: number
  private readonly cache = new Map<string, Tile>()
  private readonly inFlight = new Map<string, AbortController>()
  private readonly queue: string[] = []
  private readonly waiters = new Map<string, Waiter[]>()
  private readonly failures = new Map<string, number>()
  private wanted = new Set<string>()
  private pinned = new Set<string>()
  private blockedUntil = 0
  private pumpTimer: number | null = null
  private readonly listeners = new Set<() => void>()
  private readonly maxConcurrent = 4
  private disposed = false

  constructor(fileId: number, tileSize: number) {
    this.fileId = fileId
    this.tileSize = tileSize
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }

  getTile(tileRow: number, tileCol: number): Tile | undefined {
    return this.cache.get(tileKey(tileRow, tileCol))
  }

  getCell(r: number, c: number): CellData | null {
    const tile = this.cache.get(tileKey(Math.floor(r / this.tileSize), Math.floor(c / this.tileSize)))
    if (!tile) return null
    const index = (r - tile.originRow) * tile.cols + (c - tile.originCol)
    return { value: Number(tile.values[index]), tremor: tile.tremor[index] ?? 0, bin: tile.bins[index] ?? '.' }
  }

  /** Bloques visibles. Lo que estaba en cola o en vuelo y ya no se ve, se cancela. */
  setWanted(keys: Set<string>): void {
    this.wanted = keys
    for (const key of keys) this.enqueue(key)
    this.cancelUnwanted()
    this.pump()
  }

  /** Pide un bloque aunque no este visible (para completar un grupo). */
  ensure(tileRow: number, tileCol: number): Promise<Tile> {
    const key = tileKey(tileRow, tileCol)
    const cached = this.cache.get(key)
    if (cached) return Promise.resolve(cached)
    this.pinned.add(key)
    const promise = new Promise<Tile>((resolve, reject) => {
      const list = this.waiters.get(key) ?? []
      list.push({ resolve, reject })
      this.waiters.set(key, list)
    })
    this.enqueue(key)
    this.pump()
    return promise
  }

  /** Vuelve a pedir bloques (por ejemplo tras 409 ALREADY_REFINED). */
  invalidate(keys: string[]): void {
    for (const key of keys) {
      this.cache.delete(key)
      this.enqueue(key)
    }
    this.notify()
    this.pump()
  }

  markBins(cells: { r: number; c: number }[], binChar: string): void {
    for (const { r, c } of cells) {
      const tile = this.cache.get(tileKey(Math.floor(r / this.tileSize), Math.floor(c / this.tileSize)))
      if (!tile) continue
      tile.bins[(r - tile.originRow) * tile.cols + (c - tile.originCol)] = binChar
    }
    this.notify()
  }

  dispose(): void {
    this.disposed = true
    for (const controller of this.inFlight.values()) controller.abort()
    this.inFlight.clear()
    this.queue.length = 0
    if (this.pumpTimer !== null) window.clearTimeout(this.pumpTimer)
    this.listeners.clear()
  }

  private isNeeded(key: string): boolean {
    return this.wanted.has(key) || this.pinned.has(key)
  }

  private enqueue(key: string): void {
    if (this.cache.has(key) || this.inFlight.has(key) || this.queue.includes(key)) return
    this.queue.push(key)
  }

  private cancelUnwanted(): void {
    for (let i = this.queue.length - 1; i >= 0; i -= 1) {
      const key = this.queue[i]
      if (key !== undefined && !this.isNeeded(key)) this.queue.splice(i, 1)
    }
    for (const [key, controller] of this.inFlight) {
      if (!this.isNeeded(key)) {
        controller.abort()
        this.inFlight.delete(key)
      }
    }
  }

  private schedulePump(delayMs: number): void {
    if (this.pumpTimer !== null) window.clearTimeout(this.pumpTimer)
    this.pumpTimer = window.setTimeout(() => {
      this.pumpTimer = null
      this.pump()
    }, delayMs)
  }

  private pump(): void {
    if (this.disposed) return
    const now = Date.now()
    if (now < this.blockedUntil) {
      this.schedulePump(this.blockedUntil - now)
      return
    }
    while (this.inFlight.size < this.maxConcurrent && this.queue.length > 0) {
      const key = this.queue.shift()
      if (key === undefined) break
      if (!this.isNeeded(key) || this.cache.has(key) || this.inFlight.has(key)) continue
      void this.fetchTile(key)
    }
  }

  private async fetchTile(key: string): Promise<void> {
    const [tileRow, tileCol] = key.split(':').map(Number)
    const controller = new AbortController()
    this.inFlight.set(key, controller)
    try {
      const dto = await apiJson(`/files/${this.fileId}/tiles/${tileRow}/${tileCol}`, TileSchema, {
        signal: controller.signal,
        retries: 0,
      })
      if (this.inFlight.get(key) !== controller) return
      this.inFlight.delete(key)
      const tile: Tile = { ...dto, tremor: decodeBase64(dto.tremor), bins: dto.bins.split('') }
      this.cache.set(key, tile)
      this.failures.delete(key)
      this.pinned.delete(key)
      for (const waiter of this.waiters.get(key) ?? []) waiter.resolve(tile)
      this.waiters.delete(key)
      this.notify()
    } catch (error) {
      if (this.inFlight.get(key) === controller) this.inFlight.delete(key)
      if (controller.signal.aborted || this.disposed) return
      if (error instanceof ApiError && error.status === 429) {
        this.blockedUntil = Date.now() + (error.retryAfter ?? 2) * 1000
        this.queue.unshift(key)
      } else if (error instanceof ApiError && error.status !== 503) {
        for (const waiter of this.waiters.get(key) ?? []) waiter.reject(error)
        this.waiters.delete(key)
        this.pinned.delete(key)
      } else {
        // 503 o red: espera creciente
        const failures = (this.failures.get(key) ?? 0) + 1
        this.failures.set(key, failures)
        const waitMs =
          error instanceof ApiError && error.retryAfter !== null
            ? error.retryAfter * 1000
            : Math.min(30_000, 500 * 2 ** failures)
        this.blockedUntil = Math.max(this.blockedUntil, Date.now() + waitMs)
        this.queue.push(key)
      }
    } finally {
      this.pump()
    }
  }
}
