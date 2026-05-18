'use client'

// Timeline state machine + React context.
//
// Owns:
//   - Server fetch + debounced autosave (1s after last change)
//   - Local-first mutations (addClip, updateClip, removeClip, setSettings, ...)
//   - Transport state (playhead, playing) driven by rAF
//   - Undo/redo (50-entry ring buffer, Cmd+Z / Cmd+Shift+Z)
//   - "Force save" + unsaved-change tracking
//
// Boundary:
//   The hook does NOT know about clip-block geometry, pixels, or DOM. Pure
//   model. UI translates pixel deltas → seconds via its zoom factor before
//   calling updateClip.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  blankTimeline,
  clipTimelineEnd,
  deriveDuration,
  newClipId,
  type Timeline,
  type TimelineClip,
  type TimelineUpload,
} from './ir'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TimelineContextValue {
  // Document
  timeline: Timeline | null
  loading: boolean
  saving: boolean
  error: Error | null

  // Selection
  selectedClipId: string | null
  setSelectedClipId(id: string | null): void

  // Mutations
  addClip(clip: Omit<TimelineClip, 'id'>): TimelineClip
  updateClip(clipId: string, patch: Partial<TimelineClip>): void
  removeClip(clipId: string): void
  /** Split a clip at the given timeline-time. Returns the two new clip IDs, or
   *  null if the split point isn't inside the clip. */
  splitClipAt(clipId: string, atTimelineSeconds: number): { left: string; right: string } | null
  addUpload(upload: TimelineUpload): void
  setSettings(settings: Partial<Pick<Timeline, 'fps' | 'width' | 'height'>>): void

  // Transport
  playhead: number
  setPlayhead(t: number): void
  playing: boolean
  play(): void
  pause(): void
  togglePlay(): void
  stepFrame(direction: 1 | -1): void
  stepSecond(direction: 1 | -1): void

  // Undo / redo
  undo(): void
  redo(): void
  canUndo: boolean
  canRedo: boolean

  // Persistence
  hasUnsavedChanges: boolean
  forceSave(): Promise<void>

  // Settings helpers
  canvasId: string
}

const TimelineContext = createContext<TimelineContextValue | null>(null)

const SAVE_DEBOUNCE_MS = 1000
const HISTORY_LIMIT = 50

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function TimelineProvider({
  canvasId,
  getWhopHeaders,
  children,
}: {
  canvasId: string
  /** Returns the Whop auth headers (token + content-type) for every fetch.
   *  Threaded down from CanvasShell. Without this, all timeline API calls
   *  return 401 and the editor silently falls back to local-only state —
   *  user adds clips, "saves," refresh, nothing's there. */
  getWhopHeaders: () => Record<string, string>
  children: React.ReactNode
}) {
  const [timeline, setTimeline] = useState<Timeline | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
  const [playhead, setPlayheadState] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // History
  const undoStack = useRef<Timeline[]>([])
  const redoStack = useRef<Timeline[]>([])
  const [historyTick, setHistoryTick] = useState(0)

  // Save debounce
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestTimelineRef = useRef<Timeline | null>(null)

  // rAF transport
  const rafRef = useRef<number | null>(null)
  const lastTickRef = useRef<number>(0)
  const playheadRef = useRef(0)
  const playingRef = useRef(false)

  useEffect(() => {
    playheadRef.current = playhead
  }, [playhead])
  useEffect(() => {
    playingRef.current = playing
  }, [playing])
  useEffect(() => {
    latestTimelineRef.current = timeline
  }, [timeline])

  // -----------------------------------------------------------------------
  // Initial load
  // -----------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/canvas/${canvasId}/timeline`, { headers: getWhopHeaders() })
      .then(async (res) => {
        if (cancelled) return
        if (res.status === 404) {
          setTimeline(blankTimeline(canvasId))
          return
        }
        if (!res.ok) throw new Error(`Failed to load timeline (${res.status})`)
        const json = (await res.json()) as Timeline
        if (cancelled) return
        setTimeline({
          ...json,
          durationSeconds: deriveDuration(json.clips ?? []),
        })
      })
      .catch((err) => {
        if (cancelled) return
        // Fallback: usable empty timeline so the editor still mounts even when
        // the backend isn't deployed yet (parallel agent work).
        console.warn('[timeline] load failed, using blank', err)
        setTimeline(blankTimeline(canvasId))
        setError(err instanceof Error ? err : new Error(String(err)))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [canvasId, getWhopHeaders])

  // -----------------------------------------------------------------------
  // Save (debounced) + force save
  // -----------------------------------------------------------------------
  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void persistTimeline()
    }, SAVE_DEBOUNCE_MS)
  }, [])

  const persistTimeline = useCallback(async () => {
    const current = latestTimelineRef.current
    if (!current) return
    setSaving(true)
    try {
      const res = await fetch(`/api/canvas/${canvasId}/timeline`, {
        method: 'PUT',
        headers: getWhopHeaders(),
        body: JSON.stringify(current),
      })
      if (!res.ok) throw new Error(`Save failed (${res.status})`)
      setHasUnsavedChanges(false)
      setError(null)
    } catch (err) {
      console.warn('[timeline] save failed', err)
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setSaving(false)
    }
  }, [canvasId, getWhopHeaders])

  const forceSave = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    await persistTimeline()
  }, [persistTimeline])

  // -----------------------------------------------------------------------
  // History helpers
  // -----------------------------------------------------------------------
  const commit = useCallback(
    (mutator: (prev: Timeline) => Timeline) => {
      setTimeline((prev) => {
        if (!prev) return prev
        const next = mutator(prev)
        if (next === prev) return prev
        // Push the *previous* state for undo.
        undoStack.current.push(prev)
        if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift()
        // Any new edit invalidates the redo trail.
        redoStack.current = []
        setHistoryTick((n) => n + 1)
        const withDerived: Timeline = {
          ...next,
          durationSeconds: deriveDuration(next.clips),
          updatedAt: new Date().toISOString(),
        }
        setHasUnsavedChanges(true)
        return withDerived
      })
      scheduleSave()
    },
    [scheduleSave],
  )

  const undo = useCallback(() => {
    const prev = undoStack.current.pop()
    if (!prev) return
    setTimeline((cur) => {
      if (cur) redoStack.current.push(cur)
      return prev
    })
    setHistoryTick((n) => n + 1)
    setHasUnsavedChanges(true)
    scheduleSave()
  }, [scheduleSave])

  const redo = useCallback(() => {
    const next = redoStack.current.pop()
    if (!next) return
    setTimeline((cur) => {
      if (cur) undoStack.current.push(cur)
      return next
    })
    setHistoryTick((n) => n + 1)
    setHasUnsavedChanges(true)
    scheduleSave()
  }, [scheduleSave])

  // Recompute when historyTick changes (memo dependency)
  const canUndo = useMemo(() => undoStack.current.length > 0, [historyTick])
  const canRedo = useMemo(() => redoStack.current.length > 0, [historyTick])

  // -----------------------------------------------------------------------
  // Mutations
  // -----------------------------------------------------------------------
  const addClip = useCallback(
    (clip: Omit<TimelineClip, 'id'>): TimelineClip => {
      const newClip: TimelineClip = { ...clip, id: newClipId() }
      commit((prev) => ({ ...prev, clips: [...prev.clips, newClip] }))
      setSelectedClipId(newClip.id)
      return newClip
    },
    [commit],
  )

  const updateClip = useCallback(
    (clipId: string, patch: Partial<TimelineClip>) => {
      commit((prev) => ({
        ...prev,
        clips: prev.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)),
      }))
    },
    [commit],
  )

  const removeClip = useCallback(
    (clipId: string) => {
      commit((prev) => ({
        ...prev,
        clips: prev.clips.filter((c) => c.id !== clipId),
      }))
      setSelectedClipId((id) => (id === clipId ? null : id))
    },
    [commit],
  )

  /** Split a clip at a timeline-time. Produces two clips that together cover
   *  the same span as the original. Selection follows the LEFT half so users
   *  can keep cutting at the playhead. Returns the two new ids, or null if
   *  the time falls outside the clip (with a small epsilon at the edges so
   *  near-edge splits no-op rather than create zero-length clips). */
  const splitClipAt = useCallback(
    (clipId: string, atTimelineSeconds: number) => {
      const cur = latestTimelineRef.current
      if (!cur) return null
      const clip = cur.clips.find((c) => c.id === clipId)
      if (!clip) return null
      const len = Math.max(0, clip.sourceEnd - clip.sourceStart)
      const localT = atTimelineSeconds - clip.timelineStart
      const EPS = 0.05 // 50ms — don't create zero-length clips
      if (localT <= EPS || localT >= len - EPS) return null

      const splitSource = clip.sourceStart + localT
      const splitTimeline = clip.timelineStart + localT
      const leftId = newClipId()
      const rightId = newClipId()
      const leftClip: TimelineClip = {
        ...clip,
        id: leftId,
        sourceEnd: splitSource,
      }
      const rightClip: TimelineClip = {
        ...clip,
        id: rightId,
        sourceStart: splitSource,
        timelineStart: splitTimeline,
      }
      commit((prev) => ({
        ...prev,
        clips: prev.clips
          .filter((c) => c.id !== clipId)
          .concat([leftClip, rightClip]),
      }))
      setSelectedClipId(leftId)
      return { left: leftId, right: rightId }
    },
    [commit],
  )

  const addUpload = useCallback(
    (upload: TimelineUpload) => {
      commit((prev) => ({ ...prev, uploads: [...prev.uploads, upload] }))
    },
    [commit],
  )

  const setSettings = useCallback(
    (settings: Partial<Pick<Timeline, 'fps' | 'width' | 'height'>>) => {
      commit((prev) => ({ ...prev, ...settings }))
    },
    [commit],
  )

  // -----------------------------------------------------------------------
  // Transport
  // -----------------------------------------------------------------------
  const setPlayhead = useCallback((t: number) => {
    const clamped = Math.max(0, t)
    playheadRef.current = clamped
    setPlayheadState(clamped)
  }, [])

  const pause = useCallback(() => {
    playingRef.current = false
    setPlaying(false)
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  const play = useCallback(() => {
    if (playingRef.current) return
    playingRef.current = true
    setPlaying(true)
    lastTickRef.current = performance.now()

    const tick = (now: number) => {
      if (!playingRef.current) return
      const dt = (now - lastTickRef.current) / 1000
      lastTickRef.current = now
      const tl = latestTimelineRef.current
      const max = tl?.durationSeconds ?? 0
      let next = playheadRef.current + dt
      if (next >= max && max > 0) {
        next = max
        playingRef.current = false
        setPlaying(false)
        playheadRef.current = next
        setPlayheadState(next)
        return
      }
      playheadRef.current = next
      setPlayheadState(next)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  const togglePlay = useCallback(() => {
    if (playingRef.current) pause()
    else play()
  }, [pause, play])

  const stepFrame = useCallback(
    (direction: 1 | -1) => {
      const fps = latestTimelineRef.current?.fps || 30
      const step = direction / fps
      setPlayhead(playheadRef.current + step)
    },
    [setPlayhead],
  )

  const stepSecond = useCallback(
    (direction: 1 | -1) => {
      setPlayhead(playheadRef.current + direction)
    },
    [setPlayhead],
  )

  // Cleanup rAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // -----------------------------------------------------------------------
  // Keyboard shortcuts (global)
  // -----------------------------------------------------------------------
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ignore when typing in an input.
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          target.isContentEditable
        ) {
          return
        }
      }

      const mod = e.metaKey || e.ctrlKey

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void forceSave()
        return
      }
      if (e.key === ' ') {
        e.preventDefault()
        togglePlay()
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (e.shiftKey) stepSecond(-1)
        else stepFrame(-1)
        return
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (e.shiftKey) stepSecond(1)
        else stepFrame(1)
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedClipId) {
          e.preventDefault()
          removeClip(selectedClipId)
        }
        return
      }
      if (e.key === '[' && selectedClipId) {
        e.preventDefault()
        const tl = latestTimelineRef.current
        const clip = tl?.clips.find((c) => c.id === selectedClipId)
        if (clip) {
          const delta = Math.max(
            0,
            Math.min(
              clip.sourceEnd - 0.05,
              clip.sourceStart + (playheadRef.current - clip.timelineStart),
            ),
          )
          updateClip(selectedClipId, { sourceStart: delta })
        }
        return
      }
      if (e.key === ']' && selectedClipId) {
        e.preventDefault()
        const tl = latestTimelineRef.current
        const clip = tl?.clips.find((c) => c.id === selectedClipId)
        if (clip) {
          const newEnd = Math.max(
            clip.sourceStart + 0.05,
            clip.sourceStart + (playheadRef.current - clip.timelineStart),
          )
          updateClip(selectedClipId, { sourceEnd: newEnd })
        }
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    forceSave,
    redo,
    removeClip,
    selectedClipId,
    stepFrame,
    stepSecond,
    togglePlay,
    undo,
    updateClip,
  ])

  // -----------------------------------------------------------------------
  // Context value
  // -----------------------------------------------------------------------
  const value = useMemo<TimelineContextValue>(
    () => ({
      timeline,
      loading,
      saving,
      error,
      selectedClipId,
      setSelectedClipId,
      addClip,
      updateClip,
      removeClip,
      splitClipAt,
      addUpload,
      setSettings,
      playhead,
      setPlayhead,
      playing,
      play,
      pause,
      togglePlay,
      stepFrame,
      stepSecond,
      undo,
      redo,
      canUndo,
      canRedo,
      hasUnsavedChanges,
      forceSave,
      canvasId,
    }),
    [
      timeline,
      loading,
      saving,
      error,
      selectedClipId,
      addClip,
      updateClip,
      removeClip,
      splitClipAt,
      addUpload,
      setSettings,
      playhead,
      setPlayhead,
      playing,
      play,
      pause,
      togglePlay,
      stepFrame,
      stepSecond,
      undo,
      redo,
      canUndo,
      canRedo,
      hasUnsavedChanges,
      forceSave,
      canvasId,
    ],
  )

  return <TimelineContext.Provider value={value}>{children}</TimelineContext.Provider>
}

export function useTimeline(): TimelineContextValue {
  const ctx = useContext(TimelineContext)
  if (!ctx) {
    throw new Error('useTimeline must be used inside <TimelineProvider>')
  }
  return ctx
}

/** Helper for the next-clip insertion point (end of last clip on a track). */
export function nextClipStartOnTrack(
  timeline: Timeline,
  trackId: string,
): number {
  return timeline.clips
    .filter((c) => c.trackId === trackId)
    .reduce((max, c) => Math.max(max, clipTimelineEnd(c)), 0)
}
