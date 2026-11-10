export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown
  readonly retryAfter: number | null

  constructor(status: number, code: string, message: string, details: unknown, retryAfter: number | null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
    this.retryAfter = retryAfter
  }
}

export class NetworkError extends Error {
  constructor(message = 'No se pudo conectar con Lumon. Revisa tu conexion e intenta de nuevo.') {
    super(message)
    this.name = 'NetworkError'
  }
}

export class SessionEndedError extends Error {
  constructor(message = 'La sesion termino.') {
    super(message)
    this.name = 'SessionEndedError'
  }
}

/** Retry-After puede venir en segundos o como fecha HTTP. Devuelve segundos. */
export function parseRetryAfter(header: string | null): number | null {
  if (!header) return null
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.max(0, seconds)
  const date = Date.parse(header)
  return Number.isNaN(date) ? null : Math.max(0, (date - Date.now()) / 1000)
}

export async function toApiError(res: Response): Promise<ApiError> {
  let code = `HTTP_${res.status}`
  let message = `Error ${res.status}`
  let details: unknown = null
  try {
    const body: unknown = await res.json()
    if (isRecord(body)) {
      if (typeof body['error'] === 'string') code = body['error']
      if (typeof body['message'] === 'string') message = body['message']
      details = body['details'] ?? null
    }
  } catch {
    // respuesta sin cuerpo JSON
  }
  return new ApiError(res.status, code, message, details, parseRetryAfter(res.headers.get('Retry-After')))
}

/** Errores de validacion por campo: VALIDATION_ERROR (details.fields) o details.field. */
export function fieldErrorsFrom(err: ApiError): Record<string, string> {
  const result: Record<string, string> = {}
  if (!isRecord(err.details)) return result
  const fields = err.details['fields']
  if (isRecord(fields)) {
    for (const [key, value] of Object.entries(fields)) {
      if (typeof value === 'string') result[key] = value
    }
  }
  const field = err.details['field']
  if (typeof field === 'string') result[field] = err.message
  return result
}

/** Mensaje legible para cualquier error. */
export function describeError(err: unknown): string {
  if (err instanceof ApiError) return `${err.message} (${err.code})`
  if (err instanceof Error) return err.message
  return 'Ocurrio un error inesperado.'
}
