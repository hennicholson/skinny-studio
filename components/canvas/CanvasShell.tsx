'use client'

// Skinny Studio canvas editor — the orchestrator that composes every piece
// the specialist agents built. Layers, top to bottom:
//
//   TopBar          (back · brand · title · save status · balance · Run)
//   ReactFlow       (the canvas surface — dotted bg + colored edges + nodes)
//   LeftRail        (floating: add node · all canvases · tags)
//   BottomToolbar   (floating: select / marquee · zoom · undo / redo)
//   EmptyCanvasOverlay (when empty + first run)
//   AddNodeModal    (command palette — global)
//   AddNodeModal*2  (quick-connect filtered — pops up when an edge drops on
//                    empty pane to spawn a compatible node)
//   NodeSettingsModal (centered card on node double-click)
//   PreRunCheck     (cost-vs-balance confirm before kicking off a run)
//   CreativeDirectorChat (floating ask-bar wired to /api/chat with canvas context)
//   RunCostTicker   (live spend chip during a run, fades after)
//   ShortcutsOverlay (`?` keyboard help)
//   CanvasTour      (3-step coachmark after picking a template)
//
// Cross-cutting wiring:
//   - executor's onNodeUpdate is wrapped so each `done` patch fires
//     BalanceEventBus.emit + runTracker.recordNodeCompleted + refreshUser()
//   - `run` is gated by PreRunCheck so users see cost vs balance before pulling
//     the trigger.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Connection,
  Edge,
  Node,
  NodeChange,
  EdgeChange,
  useReactFlow,
  SelectionMode,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { toast } from 'sonner'
import {
  Canvas,
  CanvasEdge,
  CanvasNode,
  NodeType,
  NODE_TYPES,
  HandleType,
  handlesCompatible,
  newNode,
  newEdge,
} from '@/lib/canvas/ir'
import { runCanvas, wouldCreateCycle } from '@/lib/canvas/executor'
import { autoLayout } from '@/lib/canvas/auto-layout'
import { estimateCanvasCost } from '@/lib/canvas/cost'
import { buildTemplate, CanvasTemplate } from '@/lib/canvas/templates'
import { StudioModelLite } from './types'
import { TopBar } from './TopBar'
import { LeftRail } from './LeftRail'
import { BottomToolbar } from './BottomToolbar'
import { AddNodeModal, NewNodeRequest } from './AddNodeModal'
import { NodeSettingsModal } from './NodeSettingsModal'
import { SkinnyNode } from './nodes/SkinnyNode'
import { colorFor } from './handle-colors'

// New surfaces from wave-1 + wave-2 agents
import { BalanceEventBus } from '@/lib/canvas/balance-events'
import { runTracker } from '@/lib/canvas/run-tracker'
import { RunCostTicker } from './RunCostTicker'
import { PreRunCheck } from './PreRunCheck'
import { ShortcutsOverlay } from './ShortcutsOverlay'
import { CreativeDirectorChat } from './CreativeDirectorChat'
import { RunHistorySheet } from './RunHistorySheet'
import { EmptyCanvasOverlay } from './EmptyCanvasOverlay'
import { CanvasTour } from './CanvasTour'
import { hasSeenWelcome, markWelcomeSeen, hasSeenTour, markTourSeen } from '@/lib/canvas/first-run'
import {
  useQuickConnect,
  useFilteredModelsForSuggestions,
} from './QuickConnectController'
import { useUser } from '@/lib/context/user-context'
import { CanvasActionsProvider } from '@/lib/canvas/canvas-actions'
import type {
  CanvasAction,
  CanvasActionPayload,
  ActionResult,
} from '@/lib/canvas/director-actions'
import { hasDestructiveAction } from '@/lib/canvas/director-actions'
import { ConfirmActionsCard, type PendingDestructive } from './ConfirmActionsCard'
import { startRun, recordNode, finishRun } from '@/lib/canvas/run-recorder'
import { validateImage, fileToBase64 } from '@/lib/image-utils'
import { analyzeReferenceImage } from '@/lib/canvas/vision'
// Timeline mode (built by timeline agents — additive, does not touch canvas IR)
import { TimelineEditor, type CanvasVideoNodeLite } from './timeline'

interface CanvasShellProps {
  initial: Canvas
  models: StudioModelLite[]
  getWhopHeaders: () => Record<string, string>
  // Demo mode: suppress autosave + network save calls (in-memory only).
  // Used by /canvas/demo so the editor renders without Whop auth.
  demoMode?: boolean
  // Optimistic-locking metadata from the load API. When supplied, the shell
  // sends `expectedVersion` + `sessionId` on every PUT so concurrent edits
  // collide on a 409 (which we surface to the user as a "refreshed in another
  // tab" toast + state replace).
  initialVersion?: number
  initialSession?: string | null
}

// Stable per-tab session id. Used by the save protocol so the server can mark
// `last_edited_by_session` on writes and the client can tell when a 409 came
// from itself vs another tab. Lives in sessionStorage so refreshes keep the
// same id but separate tabs each get their own.
function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return ''
  try {
    const KEY = 'canvas-session-id'
    let id = window.sessionStorage.getItem(KEY)
    if (!id) {
      // Prefer crypto.randomUUID for entropy; fall back to a manual UUIDv4
      // when running in old browsers that lack it.
      id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`
      window.sessionStorage.setItem(KEY, id)
    }
    return id
  } catch {
    // sessionStorage blocked (private mode + safari). Fall back to a process-
    // lifetime random id; we lose persistence across refresh but conflict
    // detection still works for the current tab.
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }
}

// React-Flow types are strict generic-wise; cast through unknown to keep IR clean.
const nodeTypes = { skinny: SkinnyNode as unknown as React.ComponentType<any> }

type Tool = 'select' | 'marquee'

interface HistoryEntry {
  nodes: Node[]
  edges: Edge[]
}

export function CanvasShell(props: CanvasShellProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  )
}

function CanvasInner({
  initial,
  models,
  getWhopHeaders,
  demoMode,
  initialVersion,
  initialSession,
}: CanvasShellProps) {
  // ===== state =====
  const [title, setTitle] = useState(initial.title)
  const [viewport, setViewport] = useState(initial.viewport)
  const [rfNodes, setRfNodes] = useState<Node[]>(() => initial.nodes.map(toRFNode))
  const [rfEdges, setRfEdges] = useState<Edge[]>(() =>
    initial.edges.map((e) => toRFEdge(e, edgeStrokeFor(e, initial.nodes))),
  )
  const [tool, setTool] = useState<Tool>('select')
  const [running, setRunning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(
    initial.updatedAt ? new Date(initial.updatedAt) : null,
  )
  const [addOpen, setAddOpen] = useState(initial.nodes.length === 0 && hasSeenWelcome())
  const [settingsNodeId, setSettingsNodeId] = useState<string | null>(null)
  const [pendingDropPosition, setPendingDropPosition] = useState<{ x: number; y: number } | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [preRunOpen, setPreRunOpen] = useState(false)
  const [welcomeSeen, setWelcomeSeen] = useState(hasSeenWelcome())
  const [tourOpen, setTourOpen] = useState(false)

  // Timeline mode toggle. Default 'canvas'; deep links via `?mode=timeline`.
  const [mode, setMode] = useState<'canvas' | 'timeline'>(() => {
    if (typeof window === 'undefined') return 'canvas'
    try {
      const p = new URLSearchParams(window.location.search)
      return p.get('mode') === 'timeline' ? 'timeline' : 'canvas'
    } catch {
      return 'canvas'
    }
  })

  // ===== version / session (optimistic locking) =====
  // Tracks the canvases.version we last saw from the server. Sent as
  // `expectedVersion` on every PUT — the server returns 409 when stale so we
  // can refetch + replace local state instead of overwriting a peer's edits.
  const versionRef = useRef<number | undefined>(initialVersion)
  const sessionIdRef = useRef<string>(getOrCreateSessionId())
  // We expose initialSession on the props for symmetry but don't currently
  // need it client-side beyond "did someone else last edit". Reserved for a
  // future "edited by <user>" affordance.
  void initialSession

  // ===== refs =====
  const abortRef = useRef<AbortController | null>(null)
  const isFirstAutosave = useRef(true)
  const rfInstance = useReactFlow()
  const { screenToFlowPosition } = rfInstance

  // ===== user (auth detection + balance refresh after run) =====
  // UserProvider wraps the whole app at app/layout.tsx, so useUser() is
  // always available here. `whop` is null when unauthenticated — we use it
  // to gate the Creative Director chat (not `demoMode`, which is about
  // skipping saves, not auth).
  const { refreshUser, whop } = useUser()
  const isAuthed = !!whop

  // ===== undo / redo history =====
  const past = useRef<HistoryEntry[]>([])
  const future = useRef<HistoryEntry[]>([])
  function pushHistory(nodesNow: Node[], edgesNow: Edge[]) {
    past.current.push({ nodes: nodesNow, edges: edgesNow })
    if (past.current.length > 50) past.current.shift()
    future.current = []
  }
  const undo = useCallback(() => {
    const prev = past.current.pop()
    if (!prev) return
    future.current.push({ nodes: rfNodes, edges: rfEdges })
    setRfNodes(prev.nodes)
    setRfEdges(prev.edges)
  }, [rfNodes, rfEdges])
  const redo = useCallback(() => {
    const next = future.current.pop()
    if (!next) return
    past.current.push({ nodes: rfNodes, edges: rfEdges })
    setRfNodes(next.nodes)
    setRfEdges(next.edges)
  }, [rfNodes, rfEdges])

  // ===== derived =====
  const canvas: Canvas = useMemo(
    () => ({
      id: initial.id,
      userId: initial.userId,
      title,
      viewport,
      nodes: rfNodes.map(fromRFNode),
      edges: rfEdges.map(fromRFEdge),
    }),
    [initial.id, initial.userId, title, viewport, rfNodes, rfEdges],
  )

  const modelBySlug = useMemo(() => new Map(models.map((m) => [m.slug, m])), [models])
  const estimatedCost = useMemo(() => estimateCanvasCost(canvas, modelBySlug), [canvas, modelBySlug])
  const selectedNode = useMemo(
    () => (settingsNodeId ? canvas.nodes.find((n) => n.id === settingsNodeId) || null : null),
    [canvas.nodes, settingsNodeId],
  )

  // ===== react-flow handlers =====
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setRfNodes((nds) => applyNodeChanges(changes, nds))
  }, [])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setRfEdges((eds) => applyEdgeChanges(changes, eds))
  }, [])

  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target || !c.sourceHandle || !c.targetHandle) return
      const sourceNode = rfNodes.find((n) => n.id === c.source)
      const targetNode = rfNodes.find((n) => n.id === c.target)
      if (!sourceNode || !targetNode) return
      const srcType = (sourceNode.data as any).nodeType as NodeType
      const tgtType = (targetNode.data as any).nodeType as NodeType
      const srcHandle = NODE_TYPES[srcType].outputs.find((h) => h.id === c.sourceHandle)
      const tgtHandle = NODE_TYPES[tgtType].inputs.find((h) => h.id === c.targetHandle)
      if (!srcHandle || !tgtHandle) return

      if (!handlesCompatible(srcHandle.type as HandleType, tgtHandle.type as HandleType)) {
        toast.error(`Incompatible: ${srcHandle.label} → ${tgtHandle.label}`)
        return
      }
      const irEdges = rfEdges.map(fromRFEdge)
      if (wouldCreateCycle(irEdges, { source: c.source, target: c.target })) {
        toast.error('That connection would create a cycle')
        return
      }

      pushHistory(rfNodes, rfEdges)
      const stroke = colorFor(srcHandle.type as HandleType).stroke
      setRfEdges((eds) =>
        addEdge(
          { ...c, type: 'smoothstep', animated: false, style: { stroke, strokeWidth: 2, opacity: 0.95 } },
          eds,
        ),
      )
    },
    [rfNodes, rfEdges],
  )

  const onNodeDoubleClick = useCallback((_e: React.MouseEvent, n: Node) => {
    setSettingsNodeId(n.id)
  }, [])

  // ===== Add node from palette =====
  const handleAdd = useCallback(
    (req: NewNodeRequest) => {
      const dropAt = pendingDropPosition
        ? pendingDropPosition
        : screenToFlowPosition({
            x: window.innerWidth / 2 + (Math.random() - 0.5) * 60,
            y: window.innerHeight / 2 + (Math.random() - 0.5) * 40,
          })
      const node = newNode(req.type, dropAt, {
        modelSlug: req.modelSlug,
        modelName: req.modelName,
        title: req.modelName,
      })
      pushHistory(rfNodes, rfEdges)
      setRfNodes((nds) => [...nds, toRFNode(node)])
      setSettingsNodeId(node.id)
      setPendingDropPosition(null)
    },
    [rfNodes, rfEdges, screenToFlowPosition, pendingDropPosition],
  )

  // ===== Quick-connect (drop edge on empty pane → suggested-nodes picker) =====
  const getNodeTypeForId = useCallback(
    (id: string): NodeType | undefined => {
      const n = rfNodes.find((rn) => rn.id === id)
      return n ? ((n.data as any).nodeType as NodeType) : undefined
    },
    [rfNodes],
  )

  const {
    onConnectStart: qcOnConnectStart,
    onConnectEnd: qcOnConnectEnd,
    pickerProps: qcPicker,
  } = useQuickConnect({
    models,
    getNodeType: getNodeTypeForId,
    onResolve: ({ request, position, pendingConnection, targetHandleId }) => {
      // Quick-connect requires both endpoints to have handle ids; bail if
      // either is missing (shouldn't happen in practice).
      const sourceHandleId = pendingConnection.sourceHandleId
      if (!sourceHandleId || !targetHandleId) return

      const node = newNode(request.type, position, {
        modelSlug: request.modelSlug,
        modelName: request.modelName,
        title: request.modelName,
      })
      pushHistory(rfNodes, rfEdges)
      setRfNodes((nds) => [...nds, toRFNode(node)])
      const edgeId = newEdge(
        pendingConnection.sourceNodeId,
        sourceHandleId,
        node.id,
        targetHandleId,
      ).id
      const stroke = colorFor(pendingConnection.sourceHandleType as HandleType).stroke
      setRfEdges((eds) => [
        ...eds,
        {
          id: edgeId,
          source: pendingConnection.sourceNodeId,
          sourceHandle: sourceHandleId,
          target: node.id,
          targetHandle: targetHandleId,
          type: 'smoothstep',
          style: { stroke, strokeWidth: 2, opacity: 0.95 },
        },
      ])
      setSettingsNodeId(node.id)
    },
  })
  const qcFilteredModels = useFilteredModelsForSuggestions(models, qcPicker.suggestions)

  // Right-click on empty canvas → open the node picker anchored at the cursor.
  const onPaneContextMenu = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      e.preventDefault()
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      setPendingDropPosition({ x: flowPos.x - 84, y: flowPos.y - 90 })
      setAddOpen(true)
    },
    [screenToFlowPosition],
  )

  const onNodeContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
  }, [])

  // ===== Node parameter updates =====
  const patchNode = useCallback((nodeId: string, patch: Partial<CanvasNode['data']>) => {
    setRfNodes((nds) =>
      nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)),
    )
  }, [])

  // ===== Save (manual + autosave) =====
  //
  // Wire protocol (see lib/supabase/canvas-queries.ts for the server side):
  //   - We send `expectedVersion` (from our local ref) + a stable tab
  //     `sessionId` on every PUT.
  //   - On 200 we adopt the returned `newVersion`.
  //   - On 409 we refetch the canvas, swap local state to the server copy,
  //     and toast — the user's in-flight edits are discarded by design
  //     (last-write-wins is intentional for V1; we can layer in a merge UI
  //     later). This is the contract the audit flagged as a P0.
  //   - On 429 we surface the rate-limit politely.
  const refetchAndReplace = useCallback(async () => {
    try {
      const res = await fetch(`/api/canvas/${initial.id}`, {
        headers: getWhopHeaders(),
      })
      if (!res.ok) return
      const data = (await res.json()) as {
        canvas: Canvas
        version?: number
        lastEditedBySession?: string | null
      }
      if (!data.canvas) return
      setTitle(data.canvas.title)
      setViewport(data.canvas.viewport)
      setRfNodes(data.canvas.nodes.map(toRFNode))
      setRfEdges(
        data.canvas.edges.map((e) => toRFEdge(e, edgeStrokeFor(e, data.canvas.nodes))),
      )
      if (typeof data.version === 'number') {
        versionRef.current = data.version
      }
      setLastSavedAt(new Date())
    } catch {
      // best-effort; the next autosave will retry
    }
  }, [initial.id, getWhopHeaders])

  const save = useCallback(async () => {
    if (demoMode) {
      setLastSavedAt(new Date())
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/canvas/${initial.id}`, {
        method: 'PUT',
        // getWhopHeaders() already sets content-type + whop headers.
        headers: getWhopHeaders(),
        body: JSON.stringify({
          canvas,
          expectedVersion: versionRef.current,
          sessionId: sessionIdRef.current,
        }),
      })

      if (res.status === 409) {
        // Another tab (or peer) bumped the version. Pull the server copy.
        await refetchAndReplace()
        toast.message('Canvas was edited in another tab — refreshed.')
        return
      }

      if (res.status === 429) {
        // Server-side floor (500ms). Autosave will retry on the next change.
        return
      }

      if (!res.ok) {
        throw new Error(`save failed: ${res.status}`)
      }

      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        newVersion?: number
      }
      if (typeof data.newVersion === 'number') {
        versionRef.current = data.newVersion
      } else if (typeof versionRef.current === 'number') {
        // Defensive: keep parity with what the server presumably bumped to.
        versionRef.current = versionRef.current + 1
      }
      setLastSavedAt(new Date())
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Save failed: ${msg}`)
    } finally {
      setSaving(false)
    }
  }, [canvas, initial.id, getWhopHeaders, demoMode, refetchAndReplace])

  // Autosave 1.5s after edits stop.
  useEffect(() => {
    if (running) return
    if (isFirstAutosave.current) {
      isFirstAutosave.current = false
      return
    }
    const t = setTimeout(() => {
      save()
    }, 1500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, rfNodes, rfEdges])

  // ===== Run (full canvas OR a single-node + ancestors subgraph) =====
  // Both paths share `executeSubgraph`. The TopBar Run button calls
  // executeSubgraph(canvas.nodes); each model node's per-node play button
  // calls executeSubgraph(ancestorsOf(node)+node).
  const executeSubgraph = useCallback(
    async (
      subsetNodes: CanvasNode[],
      execOpts?: { forceRerun?: Set<string> },
    ) => {
      if (running) return
      if (subsetNodes.length === 0) {
        toast.error('Nothing to run')
        return
      }
      const subsetIds = new Set(subsetNodes.map((n) => n.id))
      const subsetEdges = canvas.edges.filter(
        (e) => subsetIds.has(e.source) && subsetIds.has(e.target),
      )
      const subsetCost = subsetNodes.reduce((acc, n) => {
        if (!n.data.modelSlug) return acc
        const m = modelBySlug.get(n.data.modelSlug)
        return acc + (m ? estimateCanvasCost({ ...canvas, nodes: [n], edges: [] }, modelBySlug) : 0)
      }, 0)
      setRunning(true)
      runTracker.startRun(canvas.id, subsetCost || estimatedCost)
      abortRef.current = new AbortController()
      // Reset status only on nodes that will ACTUALLY execute this run.
      // Cached gen nodes upstream (not in forceRerun, already have outputUrls)
      // are short-circuited inside executor.executeNode — their saved
      // generations are reused as static inputs. We deliberately leave their
      // 'done' status and outputUrls untouched here so the UI doesn't flash
      // them through idle → done (which looked like a re-run to users).
      const forceRerunIds = execOpts?.forceRerun
      const willActuallyRun = (n: { id: string; type: string; data: any }) => {
        if (!subsetIds.has(n.id)) return false
        // Static input nodes never run; their status stays as-is.
        if (
          n.type === 'text-prompt' ||
          n.type === 'reference-image' ||
          n.type === 'entity' ||
          n.type === 'skill'
        ) {
          return false
        }
        // Cached gen-node short-circuit (mirrors executor.executeNode guard).
        if (
          (n.type === 'image-gen' || n.type === 'video-gen' || n.type === 'fan-out') &&
          !forceRerunIds?.has(n.id) &&
          Array.isArray(n.data?.outputUrls) &&
          n.data.outputUrls.length > 0
        ) {
          return false
        }
        return true
      }
      setRfNodes((nds) =>
        nds.map((n) =>
          willActuallyRun(n as any)
            ? { ...n, data: { ...n.data, status: 'idle', error: undefined } }
            : n,
        ),
      )

      // ===== Run telemetry: start a canvas_runs row =====
      //
      // We *attempt* to create a run row before kicking off the executor.
      // Telemetry is best-effort — if startRun throws (e.g. user is in demo
      // mode, table missing, network blip) we set runIdForTelemetry = null
      // and skip per-node recording without aborting the run itself.
      const runStartedAt = new Date().toISOString()
      let runIdForTelemetry: string | null = null
      let actualSpendCents = 0
      const recordedNodes = new Set<string>()
      if (!demoMode) {
        try {
          const { runId } = await startRun(
            canvas.id,
            subsetCost || estimatedCost,
            subsetNodes.length,
            getWhopHeaders(),
          )
          runIdForTelemetry = runId
        } catch (telemetryErr) {
          // Swallow — `console.warn` only so failures don't block the run.
          // eslint-disable-next-line no-console
          console.warn('[canvas:run] startRun failed (telemetry off):', telemetryErr)
        }
      }

      let didSucceed = false
      let didAbort = false
      try {
        await runCanvas(
          {
            ...canvas,
            nodes: subsetNodes.map((n) => ({ ...n, data: { ...n.data, status: 'idle' } })),
            edges: subsetEdges,
          },
          {
            signal: abortRef.current.signal,
            getWhopHeaders,
            // Per-node Run hot-path: only the explicitly-targeted node(s)
            // re-execute. Cached gen-node outputs upstream are treated as
            // static inputs — no double-billing for re-running images the
            // user already has saved in Skinny Hub.
            forceRerun: execOpts?.forceRerun,
            // Tag each generation with `_skinny_source` via the executor so
            // canvas-run rows in the `generations` table are identifiable
            // and joinable back to the canvas run that produced them.
            canvasId: canvas.id,
            // Wrap per-node patches to fire balance + tracker events at the
            // boundary without modifying the executor.
            onNodeUpdate: (nodeId, patch) => {
              // Cached short-circuit (upstream gen node already had outputs
              // and wasn't in forceRerun). The executor still marks it 'done'
              // so the visual state stays consistent, but nothing was billed
              // — skip the history append, cost tracking, and telemetry.
              if (patch.fromCache) {
                patchNode(nodeId, { status: 'done' })
                return
              }
              // Successful generations also append to per-node history so the
              // user can flip < 1/N > through past runs (Runway-style).
              if (
                patch.status === 'done' &&
                patch.outputUrls &&
                patch.outputUrls.length > 0
              ) {
                setRfNodes((nds) =>
                  nds.map((n) => {
                    if (n.id !== nodeId) return n
                    const data: any = n.data
                    const existing = (data.generationHistory || []) as Array<any>
                    const entry = {
                      urls: patch.outputUrls!,
                      generationId: patch.generationId,
                      costCents: patch.costCents,
                      completedAt: new Date().toISOString(),
                    }
                    return {
                      ...n,
                      data: {
                        ...data,
                        ...patch,
                        generationHistory: [entry, ...existing],
                        historyIndex: 0,
                      },
                    }
                  }),
                )
              } else {
                patchNode(nodeId, patch)
              }

              if (patch.status === 'done') {
                const cost = patch.costCents || 0
                actualSpendCents += cost
                runTracker.recordNodeCompleted(nodeId, cost)
                BalanceEventBus.emit('node-completed', {
                  nodeId,
                  costCents: cost,
                  generationId: patch.generationId,
                })
                refreshUser().catch(() => {})

                // Fire-and-forget per-node telemetry.
                if (runIdForTelemetry && !recordedNodes.has(nodeId)) {
                  recordedNodes.add(nodeId)
                  recordNode(
                    canvas.id,
                    runIdForTelemetry,
                    {
                      clientNodeId: nodeId,
                      generationId: patch.generationId || null,
                      status: 'succeeded',
                      costCents: cost,
                      startedAt: runStartedAt,
                      endedAt: new Date().toISOString(),
                    },
                    getWhopHeaders(),
                  )
                }
              } else if (patch.status === 'error') {
                runTracker.recordNodeFailed(nodeId, patch.error || 'Unknown error')

                if (runIdForTelemetry && !recordedNodes.has(nodeId)) {
                  recordedNodes.add(nodeId)
                  recordNode(
                    canvas.id,
                    runIdForTelemetry,
                    {
                      clientNodeId: nodeId,
                      status: 'failed',
                      error: patch.error || 'Unknown error',
                      startedAt: runStartedAt,
                      endedAt: new Date().toISOString(),
                    },
                    getWhopHeaders(),
                  )
                }
              }
            },
          },
        )
        didSucceed = true
        toast.success('Done')
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        didAbort = msg === 'Aborted'
        if (!didAbort) toast.error(`Run failed: ${msg}`)
      } finally {
        runTracker.endRun(didSucceed)
        setRunning(false)
        abortRef.current = null

        // ===== Finalize run telemetry =====
        // Always fire-and-forget — never block the UI on telemetry.
        if (runIdForTelemetry) {
          const status = didSucceed
            ? 'succeeded'
            : didAbort
              ? 'cancelled'
              : 'failed'
          finishRun(
            canvas.id,
            runIdForTelemetry,
            {
              status,
              actualCostCents: actualSpendCents,
              nodeCount: subsetNodes.length,
              endedAt: new Date().toISOString(),
            },
            getWhopHeaders(),
          )
        }
      }
    },
    [running, canvas, estimatedCost, modelBySlug, patchNode, getWhopHeaders, refreshUser, demoMode],
  )

  // Full-canvas run.
  const doRun = useCallback(() => {
    // Run all = re-execute every gen node explicitly (force-rerun the whole
    // pipeline regardless of cached outputs — that's the contract of the
    // TopBar's Run all button).
    const forceRerun = new Set(
      canvas.nodes
        .filter(
          (n) => n.type === 'image-gen' || n.type === 'video-gen' || n.type === 'fan-out',
        )
        .map((n) => n.id),
    )
    executeSubgraph(canvas.nodes, { forceRerun })
  }, [executeSubgraph, canvas.nodes])

  // Per-node run: target + all transitive ancestors are passed to the executor
  // so the subgraph is visible (downstream needs upstream's emit() output),
  // but `forceRerun` is scoped to ONLY the clicked node. Any upstream gen
  // node with cached outputUrls short-circuits in executor.executeNode — its
  // saved Skinny Hub URL is reused as a static input rather than re-billed.
  // This matches what users expect when wiring "node A output → node B ref":
  // clicking Run on B uses A's existing image; it doesn't re-generate A.
  const doRunFromNode = useCallback(
    (nodeId: string) => {
      const ancestors = ancestorsOf(nodeId, canvas.edges)
      const ids = new Set<string>([nodeId, ...Array.from(ancestors)])
      const subset = canvas.nodes.filter((n) => ids.has(n.id))
      executeSubgraph(subset, { forceRerun: new Set([nodeId]) })
    },
    [canvas.edges, canvas.nodes, executeSubgraph],
  )

  // The TopBar's Run button opens PreRunCheck first; PreRunCheck's onConfirm
  // is what actually fires the run.
  const openRunCheck = useCallback(() => {
    if (running) return
    if (canvas.nodes.length === 0) {
      toast.error('Canvas is empty')
      return
    }
    setPreRunOpen(true)
  }, [running, canvas.nodes.length])

  const stop = useCallback(() => abortRef.current?.abort(), [])

  // Drag-drop: two paths share this handler.
  //
  //   1. NATIVE FILE DROP (from Finder/Explorer/desktop): each dropped image
  //      gets an optimistic reference-image node placed at the drop coords
  //      (subsequent files staggered by +24/+24 px), then is uploaded to
  //      Skinny Hub (folder: 'hub') with bounded concurrency (3) and finally
  //      analyzed by Gemini-vision in the background to populate
  //      visionContext for the Director. Toasts track each file individually.
  //
  //   2. CANVAS-ASSET DROP: when the user drags an image/video out of a
  //      generated node and drops it on the canvas pane, we spawn a new
  //      reference-image node at the cursor with the URL pre-filled. The
  //      SkinnyNode MediaBody sets `application/skinny-asset-url` on
  //      dragstart; we read it here.
  const onAssetDrop = useCallback(
    (e: React.DragEvent) => {
      // Path 1: native file drop. Process every image File on the transfer.
      const files = e.dataTransfer.files
      if (files && files.length > 0) {
        e.preventDefault()

        // Filter to images and validate. Skipped files get a per-file toast
        // so the user knows why nothing landed for that drop entry.
        const imageFiles: File[] = []
        for (let i = 0; i < files.length; i++) {
          const f = files[i]
          // Folder children come through as Files too; filter on type so
          // PDFs/videos/etc. dropped alongside images don't create nodes.
          if (!f.type.startsWith('image/')) {
            toast.error(`Skipped ${f.name || 'file'} — not an image`)
            continue
          }
          const v = validateImage(f)
          if (!v.valid) {
            toast.error(`Skipped ${f.name}: ${v.error || 'invalid image'}`)
            continue
          }
          imageFiles.push(f)
        }
        if (imageFiles.length === 0) return

        // Drop dismisses welcome state if it's still showing — getting an
        // image onto an empty canvas is a clear "I'm ready to work" signal.
        if (!welcomeSeen) {
          markWelcomeSeen()
          setWelcomeSeen(true)
        }

        // Anchor in flow coords; stagger subsequent drops so they don't pile.
        const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
        const baseX = flowPos.x - 84
        const baseY = flowPos.y - 90

        // Build optimistic nodes synchronously so the user sees feedback now,
        // before any network round-trip. Track each node id alongside its
        // file + local thumbnail so the async upload can patch the right one.
        const pending: Array<{
          node: CanvasNode
          file: File
          localUrl: string
        }> = imageFiles.map((file, i) => {
          const localUrl = URL.createObjectURL(file)
          const titleFromName = file.name.replace(/\.[^.]+$/, '')
          const node = newNode(
            'reference-image',
            { x: baseX + i * 24, y: baseY + i * 24 },
            {
              imageUrl: localUrl,
              title: titleFromName,
              // Surface upload progress on the node itself so SkinnyNode can
              // show its uploading/error chrome via the same status field
              // used by model nodes.
              status: 'queued',
            },
          )
          return { node, file, localUrl }
        })

        pushHistory(rfNodes, rfEdges)
        setRfNodes((nds) => [...nds, ...pending.map(({ node }) => toRFNode(node))])

        // Bounded-concurrency uploader (limit=3). Each task uploads, swaps
        // the local objectURL for the HTTPS URL, then fires Gemini analysis
        // in the background. Failures mark the node `status: 'error'` so
        // the user can see + delete + retry.
        const CONCURRENCY = 3
        let cursor = 0
        const runNext = async (): Promise<void> => {
          const i = cursor++
          if (i >= pending.length) return
          const { node, file, localUrl } = pending[i]
          const toastId = toast.loading(`Uploading ${file.name}…`)
          try {
            const dataUrl = await fileToBase64(file)
            // image-utils.fileToBase64 returns a full data URL; the API
            // expects the base64 payload only.
            const comma = dataUrl.indexOf(',')
            const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
            const res = await fetch('/api/upload-image', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...getWhopHeaders(),
              },
              body: JSON.stringify({
                base64,
                mimeType: file.type,
                filename: file.name,
                folder: 'hub',
              }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok || !data?.url) {
              throw new Error(data?.error || `HTTP ${res.status}`)
            }
            const httpsUrl = data.url as string

            // Swap optimistic local URL for the permanent HTTPS one and
            // clear the uploading status in a single patch.
            setRfNodes((nds) =>
              nds.map((rn) =>
                rn.id === node.id
                  ? {
                      ...rn,
                      data: {
                        ...rn.data,
                        imageUrl: httpsUrl,
                        status: 'idle',
                        error: undefined,
                      },
                    }
                  : rn,
              ),
            )
            // Local thumbnail no longer needed once HTTPS resolved.
            try {
              URL.revokeObjectURL(localUrl)
            } catch {
              /* noop */
            }
            toast.success(`Saved ${file.name}`, { id: toastId })

            // Background vision analysis — pure fire-and-forget. We patch
            // visionContext on success and quietly swallow failures
            // (analysis is a nice-to-have; the node itself is usable).
            analyzeReferenceImage(httpsUrl, { getHeaders: getWhopHeaders })
              .then((result) => {
                if (result.ok && result.analysis) {
                  setRfNodes((nds) =>
                    nds.map((rn) =>
                      rn.id === node.id
                        ? {
                            ...rn,
                            data: { ...rn.data, visionContext: result.analysis },
                          }
                        : rn,
                    ),
                  )
                }
              })
              .catch(() => {
                /* analysis failure is non-fatal */
              })
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            setRfNodes((nds) =>
              nds.map((rn) =>
                rn.id === node.id
                  ? {
                      ...rn,
                      data: { ...rn.data, status: 'error', error: msg },
                    }
                  : rn,
              ),
            )
            toast.error(`Upload failed: ${file.name}`, { id: toastId })
          }
          // Pull the next file as soon as this one settles.
          return runNext()
        }
        // Kick off up to CONCURRENCY workers; each chains to the next.
        const workers = Array.from(
          { length: Math.min(CONCURRENCY, pending.length) },
          () => runNext(),
        )
        // We don't await — the drop handler returns synchronously while
        // uploads + analyses progress in the background.
        void Promise.all(workers)
        return
      }

      // Path 2: cross-canvas asset drag (existing flow).
      e.preventDefault()
      const url = e.dataTransfer.getData('application/skinny-asset-url')
      if (!url) return
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      const node = newNode(
        'reference-image',
        { x: flowPos.x - 84, y: flowPos.y - 90 },
        { imageUrl: url, title: 'From canvas' },
      )
      pushHistory(rfNodes, rfEdges)
      setRfNodes((nds) => [...nds, toRFNode(node)])
      toast.success('Saved to canvas as a reference')
    },
    [screenToFlowPosition, rfNodes, rfEdges, getWhopHeaders, welcomeSeen],
  )
  const onAssetDragOver = useCallback((e: React.DragEvent) => {
    // The HTML5 drag API requires preventDefault on dragover for drop to fire.
    // Accept both:
    //   - native file drops from the OS (DataTransfer surfaces these as 'Files')
    //   - cross-canvas asset drops we set on dragstart
    // Other drag flows (e.g. react-flow node drag) carry neither, so they
    // pass through untouched.
    const types = e.dataTransfer.types
    if (
      types.includes('Files') ||
      types.includes('application/skinny-asset-url')
    ) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  // Flip to a different past generation on a model node. Updates the visible
  // outputUrls so MediaBody re-renders with the chosen entry. Wraps around
  // both ends so the user can always navigate.
  const cycleGeneration = useCallback((nodeId: string, delta: number) => {
    setRfNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n
        const data: any = n.data
        const hist: Array<{ urls: string[]; label?: string }> = data.generationHistory || []
        if (hist.length === 0) return n
        const cur = data.historyIndex ?? 0
        const next = (cur + delta + hist.length) % hist.length
        return {
          ...n,
          data: {
            ...data,
            historyIndex: next,
            outputUrls: hist[next].urls,
          },
        }
      }),
    )
  }, [])

  // Rename the currently-displayed generation entry on a node.
  const setGenerationLabel = useCallback((nodeId: string, label: string) => {
    setRfNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n
        const data: any = n.data
        const hist = (data.generationHistory || []).slice() as Array<{
          urls: string[]
          label?: string
          generationId?: string
          costCents?: number
          completedAt: string
        }>
        const idx = data.historyIndex ?? 0
        if (!hist[idx]) return n
        hist[idx] = { ...hist[idx], label: label.trim() || undefined }
        return { ...n, data: { ...data, generationHistory: hist } }
      }),
    )
  }, [])

  // ===== Director tool-use mutations =====
  // The Director's canvas-action blocks come through `applyAction` below;
  // these are the primitive operations it dispatches into. They mirror the
  // existing setRfNodes/setRfEdges patterns (drag, connect, palette-drop)
  // so AI mutations behave identically to manual ones.

  // Append a new node. Returns the real (UUID) id for use in subsequent
  // `connect` actions within the same block.
  //
  // Default position is computed in *flow coords* (not screen coords) by
  // projecting the center of the viewport — otherwise AI-supplied positions
  // like `window.innerWidth/2` would land off-canvas after pan/zoom. The
  // batch dispatcher (applyAction) also calls fitView at the end so new
  // nodes are guaranteed visible.
  const addNode = useCallback(
    (input: {
      nodeType: NodeType
      position?: { x: number; y: number }
      data?: Partial<CanvasNode['data']>
    }): string => {
      const position =
        input.position ||
        rfInstance.screenToFlowPosition({
          x: window.innerWidth / 2 + (Math.random() - 0.5) * 80,
          y: window.innerHeight / 2 + (Math.random() - 0.5) * 60,
        })
      const node = newNode(input.nodeType, position, input.data)
      setRfNodes((nds) => [...nds, toRFNode(node)])
      return node.id
    },
    [rfInstance],
  )

  // Wire two nodes. Mirrors onConnect's validation (handle compat + cycle
  // guard) so the AI can't create invalid edges. Returns ok:false with a
  // reason string so the Director sees the rejection on its next turn.
  const connectNodes = useCallback(
    (
      sourceId: string,
      sourceHandle: string,
      targetId: string,
      targetHandle: string,
    ): { ok: boolean; reason?: string } => {
      const sourceNode = rfNodes.find((n) => n.id === sourceId)
      const targetNode = rfNodes.find((n) => n.id === targetId)
      if (!sourceNode || !targetNode) {
        return { ok: false, reason: 'unknown_node' }
      }
      const srcType = (sourceNode.data as any).nodeType as NodeType
      const tgtType = (targetNode.data as any).nodeType as NodeType
      const srcHandle = NODE_TYPES[srcType].outputs.find((h) => h.id === sourceHandle)
      const tgtHandle = NODE_TYPES[tgtType].inputs.find((h) => h.id === targetHandle)
      if (!srcHandle || !tgtHandle) return { ok: false, reason: 'unknown_handle' }
      if (!handlesCompatible(srcHandle.type as HandleType, tgtHandle.type as HandleType)) {
        return {
          ok: false,
          reason: `incompatible_handles: ${srcHandle.label} (${srcHandle.type}) -> ${tgtHandle.label} (${tgtHandle.type})`,
        }
      }
      const irEdges = rfEdges.map(fromRFEdge)
      if (wouldCreateCycle(irEdges, { source: sourceId, target: targetId })) {
        return { ok: false, reason: 'cycle' }
      }
      const stroke = colorFor(srcHandle.type as HandleType).stroke
      const edgeId = newEdge(sourceId, sourceHandle, targetId, targetHandle).id
      setRfEdges((eds) => [
        ...eds,
        {
          id: edgeId,
          source: sourceId,
          sourceHandle,
          target: targetId,
          targetHandle,
          type: 'smoothstep',
          style: { stroke, strokeWidth: 2, opacity: 0.95 },
        },
      ])
      return { ok: true }
    },
    [rfNodes, rfEdges],
  )

  // Patch a node's data fields (prompt edits, model swap, param changes).
  const updateNodeData = useCallback(
    (id: string, patch: Partial<CanvasNode['data']>) => {
      setRfNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
      )
    },
    [],
  )

  // Move a node to a specific absolute position.
  const moveNode = useCallback((id: string, position: { x: number; y: number }) => {
    setRfNodes((nds) =>
      nds.map((n) => (n.id === id ? { ...n, position } : n)),
    )
  }, [])

  // Set selection to exactly the given ids.
  const selectNodes = useCallback((ids: string[]) => {
    const set = new Set(ids)
    setRfNodes((nds) => nds.map((n) => ({ ...n, selected: set.has(n.id) })))
  }, [])

  // ----- Destructive confirmation gate -----
  // Director-emitted delete/clear actions wait on this card before applying.
  const [pendingDestructive, setPendingDestructive] = useState<PendingDestructive | null>(null)

  /** Resolve any id the Director might emit to a real node id present on
      the canvas. Handles four forms the AI can produce:
        1. A tmp id minted earlier in the same block (`tmp-flux-1`)
        2. A full UUID that matches an existing node exactly
        3. A short-id prefix (4+ chars) as shown in describeCanvasForOrchestrator
        4. A hallucinated full-UUID whose FIRST 4 chars happen to match an
           existing node's short id (the AI sometimes extends `45a5` into
           `45a57a83-abd3-...`). We accept this only when those 4 chars
           uniquely identify a node on the canvas.
      Returns null when nothing resolves — caller turns that into an
      `unknown_node` rejection so the AI sees it on its next turn. */
  const resolveExistingId = useCallback(
    (id: string, tmpIdMap: Map<string, string>): string | null => {
      if (!id) return null
      const mapped = tmpIdMap.get(id)
      if (mapped) return mapped
      // Exact match — happens for real UUIDs the AI copied from earlier turns.
      if (rfNodes.some((n) => n.id === id)) return id
      // Don't try to prefix-match obvious non-canvas ids.
      if (id.startsWith('tmp-')) return null
      // Try prefix match by the first 4 hex chars. This handles:
      //   - bare short ids ("45a5")
      //   - hallucinated UUID extensions ("45a57a83-..." → "45a5...")
      const headLen = Math.min(4, id.length)
      const head = id.slice(0, headLen).toLowerCase()
      const matches = rfNodes.filter((n) => n.id.toLowerCase().startsWith(head))
      if (matches.length === 1) return matches[0].id
      // Ambiguous or no match — refuse rather than guess.
      return null
    },
    [rfNodes],
  )

  /** Apply a single non-destructive CanvasAction. Returns a per-action result
      string so the dispatcher can build a summary. tmpIdMap remaps temp ids
      (e.g. "tmp-flux-1") emitted by the AI to real UUIDs of newly-created
      nodes earlier in the same block. */
  const applyOneAdditive = useCallback(
    (
      action: CanvasAction,
      tmpIdMap: Map<string, string>,
      errors: string[],
    ): boolean => {
      switch (action.type) {
        case 'add_node': {
          // Map the AI's temp id to a real one for downstream `connect`s.
          const realId = addNode({
            nodeType: action.nodeType,
            position: action.position,
            data: action.data,
          })
          tmpIdMap.set(action.id, realId)
          return true
        }
        case 'connect': {
          const src = resolveExistingId(action.source, tmpIdMap)
          const tgt = resolveExistingId(action.target, tmpIdMap)
          if (!src || !tgt) {
            errors.push(
              `connect ${action.source}→${action.target}: unknown_node`,
            )
            return false
          }
          const res = connectNodes(src, action.sourceHandle, tgt, action.targetHandle)
          if (!res.ok) {
            errors.push(`connect ${src}→${tgt}: ${res.reason || 'rejected'}`)
            return false
          }
          return true
        }
        case 'update_node': {
          const id = resolveExistingId(action.id, tmpIdMap)
          if (!id) {
            errors.push(`update_node ${action.id}: unknown_node`)
            return false
          }
          updateNodeData(id, action.patch)
          return true
        }
        case 'move_node': {
          const id = resolveExistingId(action.id, tmpIdMap)
          if (!id) {
            errors.push(`move_node ${action.id}: unknown_node`)
            return false
          }
          moveNode(id, action.position)
          return true
        }
        case 'select': {
          const ids: string[] = []
          for (const raw of action.ids) {
            const r = resolveExistingId(raw, tmpIdMap)
            if (r) ids.push(r)
          }
          selectNodes(ids)
          return true
        }
        default:
          return false
      }
    },
    [addNode, connectNodes, updateNodeData, moveNode, selectNodes, resolveExistingId],
  )

  /** Top-level dispatcher. Snapshots history once, processes the batch in
      order against a synchronous staging buffer (NOT React state — React
      setState is async and the previous implementation had a stale-closure
      bug where the second connect in a batch couldn't see the nodes the
      first add_node "created" because rfNodes hadn't re-rendered yet),
      optionally surfaces a confirmation card for destructive actions, and
      returns a summary string the Director chat echoes to the user. */
  const applyAction = useCallback(
    async (payload: CanvasActionPayload): Promise<ActionResult> => {
      const tmpIdMap = new Map<string, string>()
      const errors: string[] = []
      let applied = 0
      let rejected = 0

      // Snapshot for ⌘Z so the AI's batch is one undo step.
      pushHistory(rfNodes, rfEdges)

      // Surface destructive intent first. If the user cancels, drop the
      // whole block — we don't want to half-apply.
      if (hasDestructiveAction(payload)) {
        const preview = buildDestructivePreview(payload.actions, rfNodes, rfEdges)
        const confirmed = await new Promise<boolean>((resolve) => {
          setPendingDestructive({ actions: payload.actions, resolve, preview })
        })
        setPendingDestructive(null)
        if (!confirmed) {
          return {
            ok: false,
            summary: 'Cancelled — canvas unchanged.',
            applied: 0,
            rejected: payload.actions.length,
            errors: [],
            cancelled: true,
          }
        }
      }

      // Synchronous staging buffers — every action mutates these directly so
      // later actions in the same batch see prior changes. We commit once at
      // the end with setRfNodes/setRfEdges, which also means one re-render
      // for the whole batch instead of N (faster, no flicker).
      let stagingNodes: Node[] = [...rfNodes]
      let stagingEdges: Edge[] = [...rfEdges]

      // Resolver against the live staging buffer (not the stale closure).
      const resolveStaged = (id: string): string | null => {
        if (!id) return null
        const mapped = tmpIdMap.get(id)
        if (mapped) return mapped
        if (stagingNodes.some((n) => n.id === id)) return id
        if (id.startsWith('tmp-')) return null
        const head = id.slice(0, Math.min(4, id.length)).toLowerCase()
        const matches = stagingNodes.filter((n) => n.id.toLowerCase().startsWith(head))
        if (matches.length === 1) return matches[0].id
        return null
      }
      const stagedNodeType = (id: string): NodeType | null => {
        const n = stagingNodes.find((sn) => sn.id === id)
        return n ? ((n.data as any).nodeType as NodeType) : null
      }

      let addedAny = false
      for (const action of payload.actions) {
        if (action.type === 'delete_node') {
          const id = resolveStaged(action.id)
          if (!id) {
            errors.push(`delete_node ${action.id}: unknown_node`)
            rejected++
            continue
          }
          stagingNodes = stagingNodes.filter((n) => n.id !== id)
          stagingEdges = stagingEdges.filter((e) => e.source !== id && e.target !== id)
          applied++
        } else if (action.type === 'delete_edge') {
          stagingEdges = stagingEdges.filter((e) => e.id !== action.id)
          applied++
        } else if (action.type === 'clear_canvas') {
          stagingNodes = []
          stagingEdges = []
          applied++
        } else if (action.type === 'add_node') {
          addedAny = true
          const position =
            action.position ||
            rfInstance.screenToFlowPosition({
              x: window.innerWidth / 2 + (Math.random() - 0.5) * 80,
              y: window.innerHeight / 2 + (Math.random() - 0.5) * 60,
            })
          const node = newNode(action.nodeType, position, action.data)
          stagingNodes = [...stagingNodes, toRFNode(node)]
          tmpIdMap.set(action.id, node.id)
          applied++
        } else if (action.type === 'connect') {
          const src = resolveStaged(action.source)
          const tgt = resolveStaged(action.target)
          if (!src || !tgt) {
            errors.push(`connect ${action.source}→${action.target}: unknown_node`)
            rejected++
            continue
          }
          const srcType = stagedNodeType(src)
          const tgtType = stagedNodeType(tgt)
          if (!srcType || !tgtType) {
            errors.push(`connect ${src}→${tgt}: unknown_node_type`)
            rejected++
            continue
          }
          const srcHandle = NODE_TYPES[srcType].outputs.find((h) => h.id === action.sourceHandle)
          const tgtHandle = NODE_TYPES[tgtType].inputs.find((h) => h.id === action.targetHandle)
          if (!srcHandle || !tgtHandle) {
            errors.push(`connect ${src}→${tgt}: unknown_handle`)
            rejected++
            continue
          }
          if (!handlesCompatible(srcHandle.type as HandleType, tgtHandle.type as HandleType)) {
            errors.push(
              `connect ${src}→${tgt}: incompatible_handles (${srcHandle.type}→${tgtHandle.type})`,
            )
            rejected++
            continue
          }
          const irEdges = stagingEdges.map(fromRFEdge)
          if (wouldCreateCycle(irEdges, { source: src, target: tgt })) {
            errors.push(`connect ${src}→${tgt}: cycle`)
            rejected++
            continue
          }
          const stroke = colorFor(srcHandle.type as HandleType).stroke
          const edgeId = newEdge(src, action.sourceHandle, tgt, action.targetHandle).id
          stagingEdges = [
            ...stagingEdges,
            {
              id: edgeId,
              source: src,
              sourceHandle: action.sourceHandle,
              target: tgt,
              targetHandle: action.targetHandle,
              type: 'smoothstep',
              style: { stroke, strokeWidth: 2, opacity: 0.95 },
            },
          ]
          applied++
        } else if (action.type === 'update_node') {
          const id = resolveStaged(action.id)
          if (!id) {
            errors.push(`update_node ${action.id}: unknown_node`)
            rejected++
            continue
          }
          stagingNodes = stagingNodes.map((n) =>
            n.id === id ? { ...n, data: { ...n.data, ...action.patch } } : n,
          )
          applied++
        } else if (action.type === 'move_node') {
          const id = resolveStaged(action.id)
          if (!id) {
            errors.push(`move_node ${action.id}: unknown_node`)
            rejected++
            continue
          }
          stagingNodes = stagingNodes.map((n) =>
            n.id === id ? { ...n, position: action.position } : n,
          )
          applied++
        } else if (action.type === 'select') {
          const ids = new Set<string>()
          for (const raw of action.ids) {
            const r = resolveStaged(raw)
            if (r) ids.add(r)
          }
          stagingNodes = stagingNodes.map((n) => ({ ...n, selected: ids.has(n.id) }))
          applied++
        } else if (action.type === 'auto_layout') {
          // Compute fresh positions from current staging buffer (so prior
          // add_node/connect actions in the same batch are included in the
          // layout) and patch every node's position. React Flow's smoothstep
          // edges + the node card's transition will animate the move.
          const layoutNodes = stagingNodes.map((n) => ({ id: n.id }))
          const layoutEdges = stagingEdges.map((e) => ({
            source: e.source,
            target: e.target,
          }))
          // Seed origin near the current viewport center so the laid-out
          // graph appears in roughly the place the user was looking; the
          // optional fitAfter call then re-centers to fit.
          const center = rfInstance.screenToFlowPosition({
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
          })
          const result = autoLayout(layoutNodes, layoutEdges, {
            direction: action.direction || 'LR',
            columnGap: action.columnGap,
            rowGap: action.rowGap,
            origin: action.origin || center,
          })
          stagingNodes = stagingNodes.map((n) => {
            const p = result.positions.get(n.id)
            return p ? { ...n, position: p } : n
          })
          // Mark fitView for after commit (default true unless caller opted
          // out). Setting `addedAny` reuses the existing post-batch fitView
          // pathway so we don't run setTimeout twice.
          if (action.fitAfter !== false) addedAny = true
          applied++
        }
      }

      // Commit the staging buffers in a single render.
      setRfNodes(stagingNodes)
      setRfEdges(stagingEdges)

      // If we added nodes (or moved any), fit the viewport so the user
      // actually sees the Director's work. Defer to next tick so React
      // Flow has applied the state update first.
      if (addedAny) {
        setTimeout(() => {
          try {
            rfInstance.fitView({ duration: 400, padding: 0.22 })
          } catch {
            // rfInstance may be torn down mid-stream; ignore
          }
        }, 60)
      }

      // Build a human-readable summary the chat thread can echo + feed back
      // to the AI on its next turn. Be specific so the model can reason.
      const parts: string[] = []
      const added = payload.actions.filter((a) => a.type === 'add_node').length
      const connected = payload.actions.filter((a) => a.type === 'connect').length
      const updated = payload.actions.filter((a) => a.type === 'update_node').length
      const moved = payload.actions.filter((a) => a.type === 'move_node').length
      const tidied = payload.actions.filter((a) => a.type === 'auto_layout').length
      const deleted = payload.actions.filter(
        (a) => a.type === 'delete_node' || a.type === 'delete_edge',
      ).length
      if (added) parts.push(`${added} node${added === 1 ? '' : 's'}`)
      if (connected) parts.push(`${connected} connection${connected === 1 ? '' : 's'}`)
      if (updated) parts.push(`updated ${updated}`)
      if (moved) parts.push(`moved ${moved}`)
      if (tidied) parts.push('tidied layout')
      if (deleted) parts.push(`removed ${deleted}`)
      const summary =
        rejected > 0
          ? `Applied ${parts.join(', ')} — ${rejected} rejected (${errors.join('; ')})`
          : `Applied ${parts.join(', ') || 'no changes'}.`
      return { ok: rejected === 0, summary, applied, rejected, errors }
    },
    [rfNodes, rfEdges, rfInstance],
  )

  // Sign-out: clear the locally-stored Whop dev token + bounce home so the
  // main app re-runs its Whop handshake. Inside the real Whop iframe the
  // token comes from the URL/cookie not localStorage, so this is a no-op
  // there — the user navigates back via the back arrow instead.
  const handleSignOut = useCallback(() => {
    try {
      window.localStorage.removeItem('whop-dev-token')
      window.localStorage.removeItem('whop-dev-user-id')
    } catch {
      // ignore (private mode etc.)
    }
    window.location.href = '/'
  }, [])

  // ===== Empty-state actions (template pick / blank / palette) =====
  const onPickTemplate = useCallback(
    (template: CanvasTemplate) => {
      const { nodes, edges } = buildTemplate(template)
      if (nodes.length === 0) {
        markWelcomeSeen()
        setWelcomeSeen(true)
        return
      }
      pushHistory(rfNodes, rfEdges)
      setRfNodes(nodes.map(toRFNode))
      setRfEdges(
        edges.map((e) => toRFEdge(e, edgeStrokeFor(e, nodes))),
      )
      markWelcomeSeen()
      setWelcomeSeen(true)
      // Show the tour after a beat, once the canvas is wired up.
      if (!hasSeenTour()) {
        setTimeout(() => setTourOpen(true), 250)
      }
    },
    [rfNodes, rfEdges],
  )
  const onStartBlank = useCallback(() => {
    markWelcomeSeen()
    setWelcomeSeen(true)
  }, [])
  const onOpenPaletteFromEmpty = useCallback(() => {
    markWelcomeSeen()
    setWelcomeSeen(true)
    setAddOpen(true)
  }, [])

  // ===== Copy / Paste / Duplicate =====
  // In-memory clipboard (survives across copy+paste within a tab). We also
  // mirror to the OS clipboard so the user can paste between canvases /
  // tabs. Stored as IR shapes so a paste survives ID remapping cleanly.
  const clipboardRef = useRef<{ nodes: CanvasNode[]; edges: CanvasEdge[] } | null>(null)

  const copySelection = useCallback(() => {
    const selectedNodes = rfNodes.filter((n) => n.selected)
    if (selectedNodes.length === 0) return false
    const selectedIds = new Set(selectedNodes.map((n) => n.id))
    // Include edges only when BOTH endpoints are in the selection — so
    // copying a subset doesn't drag dangling refs.
    const selectedEdges = rfEdges.filter(
      (e) => selectedIds.has(e.source) && selectedIds.has(e.target),
    )
    const irNodes = selectedNodes.map(fromRFNode)
    const irEdges = selectedEdges.map(fromRFEdge)
    clipboardRef.current = { nodes: irNodes, edges: irEdges }
    // Best-effort OS clipboard for cross-tab paste. Fail silently — the
    // in-memory ref already works for the common single-tab case.
    try {
      void navigator.clipboard?.writeText?.(
        JSON.stringify({ _skinny: 'canvas-clip', v: 1, nodes: irNodes, edges: irEdges }),
      )
    } catch {
      // ignore
    }
    return true
  }, [rfNodes, rfEdges])

  const pasteClipboard = useCallback(
    async (offset: { x: number; y: number } = { x: 40, y: 40 }) => {
      // Prefer OS clipboard so cross-tab paste works; fall back to ref.
      let clip = clipboardRef.current
      try {
        const txt = await navigator.clipboard?.readText?.()
        if (txt) {
          const parsed = JSON.parse(txt)
          if (parsed?._skinny === 'canvas-clip' && Array.isArray(parsed.nodes)) {
            clip = { nodes: parsed.nodes, edges: parsed.edges || [] }
          }
        }
      } catch {
        // ignore — fall through to ref
      }
      if (!clip || clip.nodes.length === 0) return

      // Remap node IDs to fresh UUIDs so we don't collide with existing
      // nodes (re-paste, paste-from-other-canvas).
      const idMap = new Map<string, string>()
      const newIrNodes: CanvasNode[] = clip.nodes.map((n) => {
        const newId =
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`
        idMap.set(n.id, newId)
        return {
          ...n,
          id: newId,
          position: { x: n.position.x + offset.x, y: n.position.y + offset.y },
          // Reset run state on paste — past outputs shouldn't follow a copy.
          data: {
            ...n.data,
            status: 'idle' as const,
            outputUrls: undefined,
            generationHistory: undefined,
            historyIndex: undefined,
            generationId: undefined,
            error: undefined,
          },
        }
      })
      const newIrEdges: CanvasEdge[] = clip.edges.map((e) => ({
        ...e,
        id:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `e-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        source: idMap.get(e.source) || e.source,
        target: idMap.get(e.target) || e.target,
      }))

      pushHistory(rfNodes, rfEdges)
      // Deselect existing, append new as selected so the user can immediately
      // re-position / re-copy the freshly pasted group.
      setRfNodes((nds) => [
        ...nds.map((n) => ({ ...n, selected: false })),
        ...newIrNodes.map((n) => ({ ...toRFNode(n), selected: true })),
      ])
      setRfEdges((eds) => [
        ...eds.map((e) => ({ ...e, selected: false })),
        ...newIrEdges.map((e) => ({
          ...toRFEdge(e, edgeStrokeFor(e, newIrNodes)),
          selected: true,
        })),
      ])
      toast.success(
        `Pasted ${newIrNodes.length} node${newIrNodes.length === 1 ? '' : 's'}`,
      )
    },
    [rfNodes, rfEdges],
  )

  // Duplicate = copy + paste, all in one tap. Uses an in-line clipboard so
  // we don't clobber the user's actual clipboard ref for a multi-paste flow.
  const duplicateSelection = useCallback(async () => {
    const ok = copySelection()
    if (ok) await pasteClipboard({ x: 40, y: 40 })
  }, [copySelection, pasteClipboard])

  // ===== Keyboard =====
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      const editable = target?.isContentEditable
      if (tag === 'INPUT' || tag === 'TEXTAREA' || editable) return

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setAddOpen(true)
      }
      if (e.key === '/' && !addOpen) {
        e.preventDefault()
        setAddOpen(true)
      }
      if (e.key === '?' && !shortcutsOpen) {
        e.preventDefault()
        setShortcutsOpen(true)
      }
      // 1 / 2 swap surface mode (skipped if any modifier is held so this
      // doesn't clash with browser tab shortcuts).
      if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        if (e.key === '1' && mode !== 'canvas') {
          e.preventDefault()
          setMode('canvas')
        }
        if (e.key === '2' && mode !== 'timeline') {
          e.preventDefault()
          setMode('timeline')
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        openRunCheck()
      }
      // Copy / Paste / Duplicate
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
        const ok = copySelection()
        if (ok) {
          e.preventDefault()
          toast.message('Nodes copied')
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        void pasteClipboard()
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        void duplicateSelection()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    undo,
    redo,
    addOpen,
    shortcutsOpen,
    openRunCheck,
    copySelection,
    pasteClipboard,
    duplicateSelection,
    mode,
  ])

  const showEmpty = canvas.nodes.length === 0 && !addOpen && !welcomeSeen

  return (
    <CanvasActionsProvider
      value={{
        runFromNode: doRunFromNode,
        isRunning: running,
        stopRun: stop,
        cycleGeneration,
        setGenerationLabel,
        addNode,
        connectNodes,
        updateNode: updateNodeData,
        moveNode,
        selectNodes,
        applyAction,
      }}
    >
    <div className="h-[100dvh] w-full flex flex-col bg-black text-white overflow-hidden">
      <TopBar
        title={title}
        onTitleChange={setTitle}
        lastSavedAt={lastSavedAt}
        saving={saving}
        running={running}
        onRun={openRunCheck}
        onStop={stop}
        onHistoryClick={() => setHistoryOpen(true)}
        onShortcutsClick={() => setShortcutsOpen(true)}
        onSignOut={handleSignOut}
        estimatedCostCents={estimatedCost}
        nodeCount={rfNodes.length}
      />

      <div
        className="flex-1 relative overflow-hidden bg-[#0a0a0a]"
        onDragOver={mode === 'canvas' ? onAssetDragOver : undefined}
        onDrop={mode === 'canvas' ? onAssetDrop : undefined}
      >
        <AnimatePresence mode="wait" initial={false}>
          {mode === 'timeline' ? (
            <motion.div
              key="timeline"
              className="absolute inset-0 flex flex-col"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            >
              <TimelineEditor
                canvasId={initial.id}
                onSwitchToCanvas={() => setMode('canvas')}
                canvasVideoNodes={
                  canvas.nodes
                    .filter((n: CanvasNode) => n.type === 'video-gen' && (n.data.outputUrls?.length ?? 0) > 0)
                    .map((n: CanvasNode) => ({
                      id: n.id,
                      type: n.type,
                      data: {
                        title: n.data.title || n.data.modelName,
                        outputUrls: n.data.outputUrls,
                      },
                    })) as CanvasVideoNodeLite[]
                }
                onAddRenderToCanvas={(publicUrl) => {
                  // Drop the rendered MP4 back onto the canvas as an Output node.
                  const node = newNode('output', {
                    x: -viewport.x + 200,
                    y: -viewport.y + 200,
                  })
                  node.data.title = 'Timeline render'
                  node.data.outputUrls = [publicUrl]
                  node.data.status = 'done'
                  setRfNodes((nds) => [...nds, toRFNode(node)])
                  setMode('canvas')
                }}
              />
            </motion.div>
          ) : (
            <motion.div
              key="canvas"
              className="absolute inset-0 flex flex-col"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            >
              <>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectStart={qcOnConnectStart as any}
          onConnectEnd={qcOnConnectEnd as any}
          onNodeDoubleClick={onNodeDoubleClick}
          onPaneContextMenu={onPaneContextMenu}
          onNodeContextMenu={onNodeContextMenu}
          onMove={(_, vp) => setViewport(vp)}
          onInit={(rfi) => {
            if (initial.nodes.length > 0) {
              setTimeout(() => rfi.fitView({ duration: 280, padding: 0.2 }), 50)
            }
          }}
          fitView={initial.nodes.length > 0}
          fitViewOptions={{ padding: 0.2, duration: 0 }}
          minZoom={0.2}
          maxZoom={2}
          panOnDrag={tool === 'select' ? [0, 1] : [1]}
          panOnScroll
          selectionOnDrag={tool === 'marquee'}
          selectionMode={SelectionMode.Partial}
          selectionKeyCode={null}
          deleteKeyCode={['Delete', 'Backspace']}
          nodeDragThreshold={3}
          connectionRadius={26}
          zoomOnScroll={false}
          zoomOnPinch
          panOnScrollSpeed={1}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{
            type: 'smoothstep',
            style: { stroke: '#71717a', strokeWidth: 2, opacity: 0.95 },
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="#2a2a2a" />
        </ReactFlow>

        {/* Empty-canvas welcome — only the FIRST time the user lands on a
            blank canvas in their lifetime (localStorage gated). */}
        {showEmpty && (
          <EmptyCanvasOverlay
            onPickTemplate={onPickTemplate}
            onStartBlank={onStartBlank}
            onOpenPalette={onOpenPaletteFromEmpty}
          />
        )}

        {/* Quiet fallback hint when seen-welcome but graph is empty */}
        {canvas.nodes.length === 0 && !addOpen && welcomeSeen && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center max-w-xs">
              <p className="text-xs uppercase tracking-widest text-zinc-600 mb-3">Empty canvas</p>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Right-click anywhere, press{' '}
                <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] ring-1 ring-white/10 text-[10px] font-mono text-zinc-300">/</kbd>
                , or click the <span className="text-skinny-yellow">+</span> to add a node.
              </p>
            </div>
          </div>
        )}
              </>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Canvas-only floating chrome: rail + toolbar + director chat live
            here. Timeline mode has its own full-bleed editor with its own
            header — these would just stack and clash. */}
        {mode === 'canvas' && (
          <>
            <LeftRail
              onAdd={() => setAddOpen(true)}
              addOpen={addOpen}
              mode={mode}
              setMode={setMode}
            />
            <BottomToolbar
              tool={tool}
              setTool={setTool}
              onUndo={undo}
              onRedo={redo}
              canUndo={past.current.length > 0}
              canRedo={future.current.length > 0}
            />
          </>
        )}

        {/* Live spend ticker — self-mounts via runTracker store. */}
        <RunCostTicker />

        {/* Floating Creative Director chat — canvas-mode only. The timeline
            editor has its own surface and doesn't need an LLM ask-bar yet. */}
        {mode === 'canvas' && (
          <CreativeDirectorChat
            canvas={canvas}
            selectedNodeId={settingsNodeId}
            onApplyPromptToNode={(nodeId, prompt) => patchNode(nodeId, { prompt })}
            getWhopHeaders={getWhopHeaders}
            isAuthed={isAuthed}
          />
        )}
      </div>

      {/* Primary add-node modal (right-click / + button / / / ⌘K) */}
      <AddNodeModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={handleAdd}
        models={models}
      />

      {/* Quick-connect modal (filtered to compatible nodes) — separate
          instance so the "+" picker and the drop-on-pane picker don't fight
          over a single open state. */}
      <AddNodeModal
        open={qcPicker.open}
        onClose={qcPicker.onClose}
        onAdd={qcPicker.onAdd}
        models={qcFilteredModels}
      />

      <NodeSettingsModal
        open={!!settingsNodeId && !!selectedNode}
        node={selectedNode}
        model={selectedNode?.data.modelSlug ? modelBySlug.get(selectedNode.data.modelSlug) : undefined}
        models={models}
        canvas={canvas}
        getWhopHeaders={getWhopHeaders}
        onClose={() => setSettingsNodeId(null)}
        onChange={(patch) => selectedNode && patchNode(selectedNode.id, patch)}
      />

      <PreRunCheck
        open={preRunOpen}
        onClose={() => setPreRunOpen(false)}
        onConfirm={() => {
          setPreRunOpen(false)
          doRun()
        }}
        estimatedCostCents={estimatedCost}
        canvas={canvas}
        onSelectNode={(id) => {
          // "Jump to node" affordance from preflight errors: close the modal
          // and open the node's settings drawer so the user can fix the issue.
          setPreRunOpen(false)
          setSettingsNodeId(id)
        }}
      />

      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      <RunHistorySheet
        canvasId={canvas.id}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />

      <CanvasTour
        open={tourOpen}
        onDone={() => {
          setTourOpen(false)
          markTourSeen()
        }}
      />

      {/* Destructive AI mutations land here first — user confirms / cancels
          before any delete/clear runs. Additive mutations bypass this. */}
      <ConfirmActionsCard pending={pendingDestructive} />
    </div>
    </CanvasActionsProvider>
  )
}

/**
 * Build a preview snapshot for ConfirmActionsCard. We resolve titles + types
 * at confirm time so the card shows what the user is about to lose rather
 * than just raw ids.
 */
function buildDestructivePreview(
  actions: CanvasAction[],
  rfNodes: Node[],
  rfEdges: Edge[],
): PendingDestructive['preview'] {
  const nodes: { id: string; title: string; type: string }[] = []
  const edges: { id: string; sourceTitle: string; targetTitle: string }[] = []
  let isClearAll = false

  const nodeById = new Map(rfNodes.map((n) => [n.id, n]))
  const titleOf = (id: string): string => {
    const n = nodeById.get(id)
    if (!n) return id.slice(0, 6)
    const data: any = n.data
    return data.title || data.modelName || (data.nodeType as string) || id.slice(0, 6)
  }

  for (const action of actions) {
    if (action.type === 'clear_canvas') {
      isClearAll = true
      continue
    }
    if (action.type === 'delete_node') {
      const n = nodeById.get(action.id)
      if (n) {
        const data: any = n.data
        nodes.push({
          id: action.id,
          title: data.title || data.modelName || 'Untitled',
          type: (data.nodeType as string) || 'node',
        })
      }
      continue
    }
    if (action.type === 'delete_edge') {
      const e = rfEdges.find((re) => re.id === action.id)
      if (e) {
        edges.push({
          id: e.id,
          sourceTitle: titleOf(e.source),
          targetTitle: titleOf(e.target),
        })
      }
    }
  }
  return { nodes, edges, isClearAll }
}

/**
 * Compute the set of nodes upstream of `nodeId` (transitive predecessors via
 * the directed edges). Excludes `nodeId` itself; caller can add it.
 */
function ancestorsOf(nodeId: string, edges: CanvasEdge[]): Set<string> {
  const ancestors = new Set<string>()
  const stack = [nodeId]
  while (stack.length) {
    const id = stack.pop()!
    for (const e of edges) {
      if (e.target === id && !ancestors.has(e.source)) {
        ancestors.add(e.source)
        stack.push(e.source)
      }
    }
  }
  return ancestors
}

// ====== IR <-> React-Flow adapters ======

function toRFNode(n: CanvasNode): Node {
  return {
    id: n.id,
    type: 'skinny',
    position: n.position,
    data: { ...n.data, nodeType: n.type },
  }
}

function fromRFNode(n: Node): CanvasNode {
  const data: any = { ...n.data }
  const nodeType = data.nodeType as NodeType
  delete data.nodeType
  return {
    id: n.id,
    type: nodeType,
    position: n.position,
    data,
  }
}

function edgeStrokeFor(e: CanvasEdge, allNodes: CanvasNode[]): string {
  const src = allNodes.find((n) => n.id === e.source)
  if (!src) return '#71717a'
  const handle = NODE_TYPES[src.type]?.outputs.find((h) => h.id === e.sourceHandle)
  return colorFor((handle?.type as HandleType) || 'any').stroke
}

function toRFEdge(e: CanvasEdge, stroke: string): Edge {
  return {
    id: e.id,
    source: e.source,
    sourceHandle: e.sourceHandle,
    target: e.target,
    targetHandle: e.targetHandle,
    type: 'smoothstep',
    style: { stroke, strokeWidth: 2, opacity: 0.95 },
  }
}

function fromRFEdge(e: Edge): CanvasEdge {
  return {
    id: e.id,
    source: e.source,
    sourceHandle: e.sourceHandle || '',
    target: e.target,
    targetHandle: e.targetHandle || '',
  }
}
