'use client'

// Top-level error boundary for errors that escape the root layout itself
// (e.g. a crash in a provider). Per Next 14 conventions, this file MUST
// render its own <html> + <body> because the root layout is not in scope.
//
// Keep this file dependency-light — Tailwind classes only, no shared
// components — so a render failure in a shared dep doesn't break the
// boundary that's supposed to catch it.

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (error.digest) console.error('[skinny-studio:global-error]', error.digest)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          background: '#000',
          color: '#fff',
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Inter, system-ui, sans-serif",
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 420,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 16,
            padding: 28,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              color: '#fca5a5',
              fontSize: 20,
              fontWeight: 700,
            }}
            aria-hidden
          >
            !
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: '-0.01em',
              textTransform: 'uppercase',
              color: '#fafafa',
            }}
          >
            Something went seriously wrong
          </h1>
          <p
            style={{
              margin: '8px 0 0',
              fontSize: 12,
              color: '#a1a1aa',
              lineHeight: 1.6,
            }}
          >
            The app couldn&apos;t recover from an error. Reload and try again —
            if it persists, reach out and we&apos;ll get you back in.
          </p>
          {error.digest && (
            <p
              style={{
                marginTop: 12,
                fontSize: 10,
                color: '#52525b',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}
            >
              ref · {error.digest}
            </p>
          )}
          <div style={{ marginTop: 24, display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                flex: 1,
                minHeight: 44,
                background: '#D6FC51',
                color: '#000',
                border: 'none',
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') window.location.reload()
              }}
              style={{
                flex: 1,
                minHeight: 44,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)',
                color: '#e4e4e7',
                borderRadius: 8,
                fontWeight: 500,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
