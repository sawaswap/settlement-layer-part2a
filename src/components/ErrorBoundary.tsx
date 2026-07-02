import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * App-level error boundary — a render error shows a recoverable message rather
 * than a blank page. No telemetry (Agreement C.5.i); the error is logged to the
 * browser console only.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Operator Console error boundary:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto mt-16 max-w-md rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-800">
          <h1 className="text-base font-semibold">Something went wrong</h1>
          <p className="mt-1">
            The Console hit an unexpected error. Reloading usually clears it.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded bg-red-600 px-3 py-2 font-medium text-white hover:bg-red-700"
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
