'use client'

// Auth-less preview of the canvas editor — also doubles as our "DB not
// linked yet" fallback. The workflows page POSTs to /api/canvas to create
// a row; if that fails (e.g. canvases table doesn't exist), it bounces
// here with `?template=<key>` so the user can still open a usable canvas.
//
// Save is a no-op (demoMode={true}) so this stays in-memory. Whop auth
// headers ARE forwarded though, so /api/generate calls the user's real
// account — balance and generations behave exactly like prod.

import { useEffect, useMemo, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { CanvasShell } from '@/components/canvas/CanvasShell'
import { Canvas, newEdge, newNode } from '@/lib/canvas/ir'
import { buildTemplate, CanvasTemplate } from '@/lib/canvas/templates'
import { StudioModelLite } from '@/components/canvas/types'
import { useWhopHeaders } from '@/lib/hooks/use-whop-headers'

// Original 5-node showcase canvas — used when no template is requested.
function buildShowcaseCanvas(): Canvas {
  const promptNode = newNode('text-prompt', { x: 0, y: 0 }, {
    prompt: 'cinematic portrait of a futuristic biker, dramatic backlight, photoreal',
    title: 'Prompt',
  })
  const refNode = newNode('reference-image', { x: 0, y: 320 }, {
    imageUrl: 'https://picsum.photos/seed/skinny1/512/512',
    title: 'Style reference',
  })
  const imgNode = newNode('image-gen', { x: 340, y: 140 }, {
    modelSlug: 'flux-schnell',
    modelName: 'Flux Schnell',
    title: 'Flux Schnell',
  })
  const videoNode = newNode('video-gen', { x: 680, y: 140 }, {
    modelSlug: 'veo-3.1-fast',
    modelName: 'Veo 3.1 Fast',
    title: 'Veo 3.1',
    params: { duration: 5, resolution: '720p', generate_audio: true },
  })
  const outputNode = newNode('output', { x: 1020, y: 160 }, { title: 'Final' })

  return {
    id: 'demo',
    userId: 'demo',
    title: 'Demo canvas',
    viewport: { x: 0, y: 0, zoom: 0.9 },
    nodes: [promptNode, refNode, imgNode, videoNode, outputNode],
    edges: [
      newEdge(promptNode.id, 'out:prompt', imgNode.id, 'in:prompt'),
      newEdge(refNode.id, 'out:image', imgNode.id, 'in:ref'),
      newEdge(imgNode.id, 'out:image', videoNode.id, 'in:start'),
      newEdge(promptNode.id, 'out:prompt', videoNode.id, 'in:prompt'),
      newEdge(videoNode.id, 'out:video', outputNode.id, 'in:asset'),
    ],
  }
}

const TEMPLATE_TITLES: Record<CanvasTemplate, string> = {
  image: 'Single image (preview)',
  video: 'Single video (preview)',
  variations: '4 variations (preview)',
  'image-to-video': 'Image → animated (preview)',
  'ai-commercial': 'AI commercial w/ Seedance (preview)',
  blank: 'Blank canvas (preview)',
}

function isCanvasTemplate(v: string | null): v is CanvasTemplate {
  return (
    v === 'image' ||
    v === 'video' ||
    v === 'variations' ||
    v === 'image-to-video' ||
    v === 'ai-commercial' ||
    v === 'blank'
  )
}

function CanvasDemoInner() {
  const params = useSearchParams()
  const templateParam = params.get('template')
  const requestedTemplate = isCanvasTemplate(templateParam) ? templateParam : null

  const initial = useMemo<Canvas>(() => {
    if (!requestedTemplate) return buildShowcaseCanvas()
    const { nodes, edges } = buildTemplate(requestedTemplate)
    return {
      id: 'demo',
      userId: 'demo',
      title: TEMPLATE_TITLES[requestedTemplate],
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes,
      edges,
    }
  }, [requestedTemplate])

  const [models, setModels] = useState<StudioModelLite[]>([])
  const getRealHeaders = useWhopHeaders()

  useEffect(() => {
    fetch('/api/models')
      .then((r) => r.json())
      .then((d) => {
        const list = (d.models || []).map((m: any) => ({
          slug: m.slug,
          name: m.name,
          category: m.category,
          pricing_type: m.pricing_type,
          cost_per_run_cents: m.cost_per_run_cents,
          cost_per_second_cents: m.cost_per_second_cents,
          resolution_multipliers: m.resolution_multipliers,
          parameter_schema: m.parameter_schema,
        }))
        setModels(list)
      })
      .catch(() => {})
  }, [])

  // Forward the user's real Whop dev token / cookie / iframe token if any —
  // this means /api/generate will use the signed-in user's account and
  // balance. Save still no-ops via demoMode so we don't write to the
  // (potentially non-existent) canvases table.
  return (
    <CanvasShell
      key={requestedTemplate || 'showcase'}
      initial={initial}
      models={models}
      getWhopHeaders={getRealHeaders}
      demoMode
    />
  )
}

export default function CanvasDemoPage() {
  return (
    <Suspense fallback={<DemoFallback />}>
      <CanvasDemoInner />
    </Suspense>
  )
}

function DemoFallback() {
  return (
    <main className="h-[100dvh] bg-black text-white flex items-center justify-center">
      <p className="text-xs text-zinc-500">Loading canvas…</p>
    </main>
  )
}
