import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Catches anything that throws during render, including a code-split chunk that
 * fails to download. Without this, one dropped request on conference wifi takes
 * the whole app to a black screen with no way back — which is exactly when you
 * least want it, in front of judges.
 */
export default class ErrorBoundary extends Component<
  { children: ReactNode; onReset?: () => void },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep it in the console for a developer; the UI explains itself.
    console.error('JACK: Marswalk — render error', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const chunkFailure =
      /dynamically imported module|Importing a module script failed|ChunkLoadError|Failed to fetch/i
        .test(error.message)

    return (
      <div className="screen center grid-bg" style={{ background: 'var(--bg-0)', padding: 24, zIndex: 200 }}>
        <div className="panel clipped brackets" style={{ maxWidth: 620 }}>
          <div className="panel-head">
            <h3>{chunkFailure ? 'Could not load that part of the app' : 'Something broke'}</h3>
          </div>
          <div className="panel-body stack gap12">
            <p style={{ fontSize: 14 }}>
              {chunkFailure
                ? 'A piece of the app failed to download. That is almost always a network blip rather than a fault in the mission — the simulation itself runs entirely in your browser once it has loaded.'
                : 'An unexpected error stopped the screen from rendering. Your mission state is still in memory, so reloading will take you back to the title screen rather than resuming.'}
            </p>
            <pre
              className="mono"
              style={{
                fontSize: 11, color: 'var(--muted)', whiteSpace: 'pre-wrap',
                background: 'rgba(255,255,255,0.03)', padding: 9, margin: 0,
                maxHeight: 160, overflow: 'auto',
              }}
            >
              {error.message}
            </pre>
            <div className="row gap8 wrap">
              <button
                className="btn primary"
                onClick={() => {
                  this.setState({ error: null })
                  this.props.onReset?.()
                }}
              >
                Try again
              </button>
              <button className="btn ghost" onClick={() => window.location.reload()}>
                Reload the app
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }
}
