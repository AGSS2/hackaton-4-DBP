import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// VERCEL_GIT_COMMIT_SHA lo pone Vercel al construir; asi el SHA se inyecta en tiempo de build.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  envPrefix: ['VITE_', 'VERCEL_GIT_COMMIT_SHA'],
})
