function requiredUrl(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}`)
  }
  return value.replace(/\/+$/, '')
}

export const API_BASE_URL = requiredUrl('VITE_API_BASE_URL', import.meta.env.VITE_API_BASE_URL)
export const WS_BASE_URL = requiredUrl('VITE_WS_BASE_URL', import.meta.env.VITE_WS_BASE_URL)

const commitSha = import.meta.env.VERCEL_GIT_COMMIT_SHA
export const BUILD_SHA: string =
  commitSha && /^[0-9a-f]{7,40}$/.test(commitSha) ? commitSha.slice(0, 7) : 'dev'
