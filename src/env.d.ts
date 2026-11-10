/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_WS_BASE_URL?: string
  readonly VERCEL_GIT_COMMIT_SHA?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
