import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/** Un error de render en una ruta no deja la app en blanco. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Error de render', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div role="alert" className="mx-auto max-w-lg rounded-lg border border-red-200 bg-red-50 p-6 text-red-900">
          <h2 className="text-lg font-semibold">Algo salio mal en esta pagina</h2>
          <p className="mt-2 text-sm">{this.state.error.message}</p>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              className="rounded bg-red-700 px-3 py-2 text-white hover:bg-red-800"
              onClick={() => this.setState({ error: null })}
            >
              Reintentar
            </button>
            <a href="/" className="rounded border border-red-700 px-3 py-2 text-red-800 hover:bg-red-100">
              Volver al inicio
            </a>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
