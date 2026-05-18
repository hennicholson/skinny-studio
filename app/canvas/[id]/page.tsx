'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { CanvasShell } from '@/components/canvas/CanvasShell'
import { MobileViewer } from '@/components/canvas/MobileViewer'
import { AuthGate } from '@/components/canvas/AuthGate'
import { useWhopHeaders } from '@/lib/hooks/use-whop-headers'
import { StudioModelLite } from '@/components/canvas/types'
import { Canvas } from '@/lib/canvas/ir'
import { useBreakpoint } from '@/lib/canvas/breakpoints'
import { toast } from 'sonner'

export default function CanvasEditorPage() {
  return (
    <AuthGate skeleton={<EditorSkeleton />}>
      <CanvasEditorContent />
    </AuthGate>
  )
}

function EditorSkeleton() {
  return (
    <main className="h-[100dvh] bg-black text-white flex flex-col">
      <div className="h-14 border-b border-white/[0.04] bg-black/85 flex items-center px-4 gap-3">
        <div className="w-8 h-8 rounded bg-white/[0.04] animate-pulse" />
        <div className="h-3 w-32 rounded bg-white/[0.04] animate-pulse" />
        <div className="ml-auto flex items-center gap-1.5">
          <div className="h-8 w-20 rounded-md bg-white/[0.03] animate-pulse" />
          <div className="h-8 w-16 rounded-md bg-white/[0.03] animate-pulse" />
        </div>
      </div>
      <div className="flex-1 flex">
        <div className="w-56 border-r border-white/[0.04] p-3 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-9 rounded-md bg-white/[0.02] animate-pulse" />
          ))}
        </div>
        <div className="flex-1 bg-[#0a0a0a]" />
      </div>
    </main>
  )
}

function CanvasEditorContent() {
  const params = useParams<{ id: string }>()
  const getHeaders = useWhopHeaders()
  const [canvas, setCanvas] = useState<Canvas | null>(null)
  const [initialVersion, setInitialVersion] = useState<number | undefined>(undefined)
  const [initialSession, setInitialSession] = useState<string | null>(null)
  const [models, setModels] = useState<StudioModelLite[]>([])
  const [error, setError] = useState<string | null>(null)
  // useBreakpoint returns 'phone' | 'tablet' | 'desktop'; phone + tablet
  // both route to MobileViewer (2-col on tablet) so the canvas stays
  // usable below desktop widths.
  const bp = useBreakpoint()

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [canvasRes, modelsRes] = await Promise.all([
          fetch(`/api/canvas/${params.id}`, { headers: getHeaders() }),
          fetch('/api/models'),
        ])
        const canvasData = await canvasRes.json()
        const modelsData = await modelsRes.json()
        if (cancelled) return
        if (!canvasRes.ok || !canvasData.canvas) {
          setError(canvasData.error || 'Canvas not found')
          return
        }
        setCanvas(canvasData.canvas)
        // Optimistic-locking metadata from the API. Falls back to undefined/null
        // when an older deploy that hasn't been migrated returns just `canvas`.
        setInitialVersion(
          typeof canvasData.version === 'number' ? canvasData.version : undefined,
        )
        setInitialSession(
          typeof canvasData.lastEditedBySession === 'string'
            ? canvasData.lastEditedBySession
            : null,
        )
        const lite: StudioModelLite[] = (modelsData.models || []).map((m: any) => ({
          slug: m.slug,
          name: m.name,
          category: m.category,
          pricing_type: m.pricing_type,
          cost_per_run_cents: m.cost_per_run_cents,
          cost_per_second_cents: m.cost_per_second_cents,
          resolution_multipliers: m.resolution_multipliers,
          parameter_schema: m.parameter_schema,
        }))
        setModels(lite)
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err)
          setError(msg)
          toast.error(`Load failed: ${msg}`)
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [params.id, getHeaders])

  if (error) {
    return (
      <main className="h-[100dvh] bg-black text-white flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <h2 className="text-sm font-semibold text-red-400 mb-2">Could not load canvas</h2>
          <p className="text-xs text-zinc-500">{error}</p>
        </div>
      </main>
    )
  }

  if (!canvas) {
    return (
      <main className="h-[100dvh] bg-black text-white flex items-center justify-center">
        <p className="text-xs text-zinc-500">Loading canvas…</p>
      </main>
    )
  }

  // Only true phones (< 768px) fall back to the read-only MobileViewer.
  // Tablets and the Whop iframe at typical desktop widths get the real
  // CanvasShell — the editor's fitView will auto-zoom the graph to the
  // available viewport so narrow desktop windows display correctly.
  if (bp === 'phone') {
    return <MobileViewer initial={canvas} getWhopHeaders={getHeaders} models={models} />
  }

  return (
    <CanvasShell
      initial={canvas}
      models={models}
      getWhopHeaders={getHeaders}
      initialVersion={initialVersion}
      initialSession={initialSession}
    />
  )
}
