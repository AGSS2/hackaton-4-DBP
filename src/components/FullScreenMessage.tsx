import type { ReactNode } from 'react'

export function FullScreenMessage({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm" role="status" aria-live="polite">
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {children && <div className="mt-4 text-slate-700">{children}</div>}
      </div>
    </main>
  )
}
