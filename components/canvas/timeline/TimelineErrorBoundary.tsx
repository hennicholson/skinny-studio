'use client'

// Wraps TimelineEditor so a runtime crash inside the timeline mode shows a
// friendly recoverable message instead of taking down the entire canvas.
// Reachable bugs we want this to catch: undefined .length on legacy timeline
// docs, video element race conditions, FFmpeg.wasm init failures.

import React from 'react'
import { AlertTriangle, RefreshCw, MoveLeft } from 'lucide-react'

interface State {
  error: Error | null
}

interface Props {
  /** When the user clicks "Back to canvas" we call this so the parent shell
   *  can swap modes and reset its own state if it wants to. */
  onSwitchToCanvas?: () => void
  children: React.ReactNode
}

export class TimelineErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log to console for debugging in prod; the deploy doesn't ship sourcemaps
    // so the minified stack from the browser console + this name + the local
    // catch is the only signal an owner has to triage.
    // eslint-disable-next-line no-console
    console.error('[TimelineErrorBoundary]', error, info)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-full w-full items-center justify-center bg-black p-8">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/30">
            <AlertTriangle className="h-6 w-6" />
          </span>
          <h2 className="font-display text-xl uppercase tracking-tight text-white">
            Timeline hit a snag
          </h2>
          <p className="text-sm leading-relaxed text-white/60">
            Something rendered wrong. Your canvas + clips are safe; the timeline
            editor just needs a refresh. If this keeps happening on the same
            project, the timeline document may have an older shape — try
            starting a fresh timeline on this canvas.
          </p>
          <pre className="max-h-32 max-w-full overflow-auto rounded-md border border-white/[0.06] bg-white/[0.02] p-2 text-left text-[11px] leading-snug text-white/40">
            {this.state.error.message}
          </pre>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={this.reset}
              className="inline-flex items-center gap-2 rounded-lg bg-skinny-yellow px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-skinny-yellow/90 outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60"
            >
              <RefreshCw className="h-4 w-4" />
              Try again
            </button>
            {this.props.onSwitchToCanvas && (
              <button
                type="button"
                onClick={() => {
                  this.reset()
                  this.props.onSwitchToCanvas?.()
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/[0.08]"
              >
                <MoveLeft className="h-4 w-4" />
                Back to canvas
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }
}
