'use client'

// QuickConnectController.
//
// Owns the "drag an edge into empty space → pop the node picker → auto-wire"
// flow. Stateless from the outside: returns react-flow callbacks
// (`onConnectStart`, `onConnectEnd`) the canvas can spread onto <ReactFlow>,
// plus a `pickerProps` bundle the orchestrator can use to drive its own
// instance of AddNodeModal (filtered by source-handle compatibility).
//
// Because AddNodeModal is off-limits for editing, we expose `suggestions`
// (the set of NodeTypes / model rows the picker should surface) and let the
// orchestrator decide how to apply the filter — typically by passing a
// filtered `models` prop and rendering a thin wrapper that only shows
// suggested static-node rows. See `useFilteredModelsForSuggestions` below
// for a ready-made helper.
//
// When the user picks an entry, `pickerProps.onAdd` is invoked with:
//   - the chosen NewNodeRequest
//   - the drop position in flow coords
//   - a `pendingConnection` describing the edge to create
// The orchestrator (CanvasShell) handles creation + wiring atomically.

import { useCallback, useMemo, useRef, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import type { OnConnectStart, OnConnectEnd } from '@xyflow/system'
import type { NewNodeRequest } from './AddNodeModal'
import type { StudioModelLite } from './types'
import {
  HandleType,
  NodeType,
  NODE_TYPES,
} from '@/lib/canvas/ir'
import {
  SuggestedNode,
  firstCompatibleInputHandle,
  resolveSourceHandleType,
  suggestedModelNodesForSource,
  suggestedNodeTypesForSource,
} from '@/lib/canvas/connection-suggestions'

// ----- public types -----------------------------------------------------

/**
 * Identifies the dangling edge that needs to be auto-wired once the picker
 * resolves. The orchestrator turns this into a CanvasEdge after creating
 * the new node.
 */
export interface PendingConnection {
  sourceNodeId: string
  sourceHandleId: string
  sourceHandleType: HandleType
}

/**
 * Resolution payload passed to `onAdd` when the user picks a node from the
 * filtered picker. The orchestrator should:
 *   1. Create the new node at `position` (with the optional modelSlug /
 *      modelName from `request`).
 *   2. Compute the target handle id with `firstCompatibleInputHandle`
 *      (or use the convenience `targetHandleId` we provide).
 *   3. Add an edge from `pendingConnection` → new node + target handle.
 */
export interface QuickConnectResolution {
  request: NewNodeRequest
  position: { x: number; y: number }
  pendingConnection: PendingConnection
  /** Pre-resolved compatible input handle on the chosen NodeType. */
  targetHandleId: string | undefined
}

/**
 * Props the orchestrator spreads into its own AddNodeModal wrapper.
 *
 * `suggestions.types` and `suggestions.nodes` are the filtered lists. When
 * `suggestions` is null, the picker should render its full library (this
 * happens when the picker is opened by other means — e.g. the `+` button —
 * and `useQuickConnect` is not driving it).
 */
export interface QuickConnectPickerProps {
  open: boolean
  onClose: () => void
  onAdd: (req: NewNodeRequest) => void
  suggestions: {
    sourceHandleType: HandleType
    types: NodeType[]
    nodes: SuggestedNode[]
  } | null
}

export interface UseQuickConnectArgs {
  /** Studio models available for image-gen / video-gen suggestions. */
  models: StudioModelLite[]
  /**
   * Look up the live NodeType for a react-flow node id. Required because
   * the controller doesn't own the canvas state. Return undefined if the
   * node no longer exists.
   */
  getNodeType: (nodeId: string) => NodeType | undefined
  /**
   * Called when the user picks a suggestion. The orchestrator should
   * create the node + auto-wire the edge here.
   */
  onResolve: (resolution: QuickConnectResolution) => void
}

export interface UseQuickConnectReturn {
  onConnectStart: OnConnectStart
  onConnectEnd: OnConnectEnd
  pickerProps: QuickConnectPickerProps
}

// ----- hook -------------------------------------------------------------

/**
 * Hook that wires react-flow's connection lifecycle into an AddNodeModal
 * filtered by source-handle compatibility.
 */
export function useQuickConnect({
  models,
  getNodeType,
  onResolve,
}: UseQuickConnectArgs): UseQuickConnectReturn {
  const { screenToFlowPosition } = useReactFlow()

  // We hold the in-flight connection info in a ref (so the onConnectEnd
  // closure always sees the latest value without forcing re-renders mid-drag)
  // and mirror just the "modal-visible" bits in state.
  const pendingRef = useRef<PendingConnection | null>(null)
  const dropPosRef = useRef<{ x: number; y: number } | null>(null)
  const [open, setOpen] = useState(false)
  const [sourceHandleType, setSourceHandleType] = useState<HandleType | null>(null)

  // ----- react-flow callbacks ------------------------------------------

  const onConnectStart: OnConnectStart = useCallback(
    (_event, params) => {
      const { nodeId, handleId, handleType } = params
      // We only care about drags that originate from a *source* (output) handle.
      // Drags from target handles aren't a normal authoring action in this app.
      if (handleType !== 'source' || !nodeId || !handleId) {
        pendingRef.current = null
        return
      }
      const nodeType = getNodeType(nodeId)
      const srcType = resolveSourceHandleType(nodeType, handleId)
      if (!srcType) {
        pendingRef.current = null
        return
      }
      pendingRef.current = {
        sourceNodeId: nodeId,
        sourceHandleId: handleId,
        sourceHandleType: srcType,
      }
    },
    [getNodeType],
  )

  const onConnectEnd: OnConnectEnd = useCallback(
    (event, connectionState) => {
      const pending = pendingRef.current
      pendingRef.current = null
      if (!pending) return

      // If the drag landed on a node / handle (i.e. react-flow already
      // resolved a connection target), let the normal onConnect path
      // handle it. We only fire when the drop is on the pane.
      if (connectionState.toNode || connectionState.toHandle) return

      // Determine drop position in flow coords. Prefer the connection
      // state's pointer when available; fall back to the raw event.
      let clientX: number
      let clientY: number
      if (event instanceof MouseEvent) {
        clientX = event.clientX
        clientY = event.clientY
      } else if (
        typeof TouchEvent !== 'undefined' &&
        event instanceof TouchEvent &&
        event.changedTouches.length > 0
      ) {
        clientX = event.changedTouches[0].clientX
        clientY = event.changedTouches[0].clientY
      } else {
        // Older react-flow builds pass a synthetic; bail safely.
        return
      }

      // Verify the drop target is the pane. React-flow tags the pane with
      // the `react-flow__pane` class; a drop on a node/handle/edge would
      // not pass this check. We're permissive: if the class check can't
      // run (target isn't an Element), trust the earlier toNode check.
      const target = event.target
      if (target instanceof Element) {
        const onPane =
          target.classList.contains('react-flow__pane') ||
          // Edge cases: dropping over background dots layer also counts.
          target.classList.contains('react-flow__background') ||
          target.closest('.react-flow__pane') !== null
        if (!onPane) return
      }

      // Translate to flow space, offset to roughly center the spawned
      // node on the cursor (matches CanvasShell's onPaneContextMenu).
      const flowPos = screenToFlowPosition({ x: clientX, y: clientY })
      dropPosRef.current = { x: flowPos.x - 84, y: flowPos.y - 30 }

      setSourceHandleType(pending.sourceHandleType)
      // Stash the pending connection on the ref so the modal's onAdd can
      // read it without going through render state.
      pendingRef.current = pending
      setOpen(true)
    },
    [screenToFlowPosition],
  )

  // ----- picker plumbing ------------------------------------------------

  const close = useCallback(() => {
    setOpen(false)
    setSourceHandleType(null)
    pendingRef.current = null
    dropPosRef.current = null
  }, [])

  const handleAdd = useCallback(
    (req: NewNodeRequest) => {
      const pending = pendingRef.current
      const position = dropPosRef.current
      if (!pending || !position) {
        close()
        return
      }
      const targetHandleId = firstCompatibleInputHandle(
        req.type,
        pending.sourceHandleType,
      )
      onResolve({
        request: req,
        position,
        pendingConnection: pending,
        targetHandleId,
      })
      close()
    },
    [onResolve, close],
  )

  // Build the suggestion bundle once per (handle type, models) tuple. The
  // orchestrator uses this to filter the rows it shows in its AddNodeModal
  // wrapper.
  const suggestions = useMemo(() => {
    if (!sourceHandleType) return null
    return {
      sourceHandleType,
      types: suggestedNodeTypesForSource(sourceHandleType),
      nodes: suggestedModelNodesForSource(sourceHandleType, models),
    }
  }, [sourceHandleType, models])

  const pickerProps: QuickConnectPickerProps = {
    open,
    onClose: close,
    onAdd: handleAdd,
    suggestions,
  }

  return { onConnectStart, onConnectEnd, pickerProps }
}

// ----- helpers for the orchestrator -------------------------------------

/**
 * Convenience helper: filters a `StudioModelLite[]` down to just the models
 * that appear in the active suggestion set. Useful when the orchestrator
 * wants to pass a pre-filtered `models` prop into AddNodeModal so the
 * model-backed rows are pre-narrowed.
 *
 * When `suggestions` is null (picker opened normally), returns `models`
 * unchanged.
 */
export function useFilteredModelsForSuggestions(
  models: StudioModelLite[],
  suggestions: QuickConnectPickerProps['suggestions'],
): StudioModelLite[] {
  return useMemo(() => {
    if (!suggestions) return models
    const allowedCategories = new Set<'image' | 'video'>()
    for (const t of suggestions.types) {
      const cat = NODE_TYPES[t].modelCategory
      if (cat) allowedCategories.add(cat)
    }
    // If no model-backed types are compatible, drop all models so the
    // picker doesn't show generator rows that can't satisfy the edge.
    if (allowedCategories.size === 0) return []
    return models.filter((m) => allowedCategories.has(m.category))
  }, [models, suggestions])
}

/**
 * Convenience helper: returns a `(type: NodeType) => boolean` predicate
 * the orchestrator's modal-wrapper can use to hide non-suggested static
 * node rows.
 *
 * When `suggestions` is null, the predicate returns `true` for every type
 * (no filtering).
 */
export function makeNodeTypePredicate(
  suggestions: QuickConnectPickerProps['suggestions'],
): (type: NodeType) => boolean {
  if (!suggestions) return () => true
  const allowed = new Set(suggestions.types)
  return (type) => allowed.has(type)
}
