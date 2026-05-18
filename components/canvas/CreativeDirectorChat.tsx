'use client'

// Canvas Creative Director — right-side slide-in panel on desktop,
// bottom-sheet on mobile.
//
// Collapsed state: small floating tab on the right edge of the canvas area.
// Click → slide a 400px panel in from the right, full available height
// (above the BottomToolbar). Click outside or chevron to collapse.
//
// Mobile: collapsed = pill at bottom-right above the BottomToolbar.
//         expanded = bottom sheet up to 70vh.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles,
  Send,
  Loader2,
  Wand2,
  Lightbulb,
  X,
  Plus,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Settings,
} from 'lucide-react'
import {
  DirectorSettingsPopover,
  readDirectorSettings,
  type DirectorProvider,
} from './director/DirectorSettingsPopover'
import { Canvas } from '@/lib/canvas/ir'
import {
  askDirector,
  extractSuggestedPrompt,
  type DirectorMessage,
  type DirectorAttachmentRef,
  type ValidationIssue,
} from '@/lib/canvas/director-client'
import { intentLabel, type IntentMatch } from '@/lib/canvas/intent-classifier'
import { cn } from '@/lib/utils'
import { useCanvasActions } from '@/lib/canvas/canvas-actions'
import { validateImage, fileToBase64 } from '@/lib/image-utils'
import {
  AttachmentChips,
  type DirectorAttachment,
} from './director/AttachmentChips'
import { AttachmentPickerModal } from './director/AttachmentPickerModal'
import { SkinnyLottie } from '@/components/ui/SkinnyLottie'

const MAX_ATTACHMENTS = 4

export interface CreativeDirectorChatProps {
  canvas: Canvas
  selectedNodeId: string | null
  onApplyPromptToNode: (nodeId: string, prompt: string) => void
  getWhopHeaders: () => Record<string, string>
  /** When false, the panel renders a disabled "sign in" state. */
  isAuthed?: boolean
  /** Optional callback for collapsed-state telemetry / focus. */
  onExpand?: () => void
}

interface ThreadMessage extends DirectorMessage {
  id: string
  pending?: boolean
  // Set on the live assistant message when the client-side intent
  // classifier returns a high-confidence match BEFORE the LLM has emitted
  // anything. Cleared once the real tool-call arrives (so the pill goes
  // away the moment nodes actually appear on the canvas).
  optimisticIntent?: IntentMatch
  // Validation issues attached to the apply-summary bubble. Populated
  // from the server's `toolCall.issues` field (see action-validator).
  issues?: ValidationIssue[]
}

// Empty-state suggestion chips. Tuned for the two most common starts:
// (a) the canvas is blank → user wants to spin something up,
// (b) a node is selected → user wants to act on it.
const QUICK_CHIPS: Array<{ label: string; prompt: string; requiresSelection: boolean }> = [
  { label: 'sharpen this prompt', prompt: 'Rewrite the prompt on the selected node to be sharper, more visual, and model-ready. Return only the rewritten prompt.', requiresSelection: true },
  { label: 'suggest a next node', prompt: 'Looking at the canvas, what is the most useful next node to add? Name the node type and how to wire it.', requiresSelection: false },
  { label: 'make a storyboard', prompt: 'Build a 4-shot storyboard from a text-prompt to four image-gen nodes via a fan-out. Pick a strong image model.', requiresSelection: false },
  { label: 'animate this', prompt: 'Take the selected image-gen output and add a video-gen node that animates it with a tasteful camera move.', requiresSelection: true },
]

const INPUT_SOFT_LIMIT = 1500
const INPUT_HARD_LIMIT = 4000

export function CreativeDirectorChat({
  canvas,
  selectedNodeId,
  onApplyPromptToNode,
  getWhopHeaders,
  isAuthed = true,
  onExpand,
}: CreativeDirectorChatProps) {
  const [expanded, setExpanded] = useState(false)
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<DirectorAttachment[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [isDraggingOverPanel, setIsDraggingOverPanel] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Re-read settings on mount + whenever the popover signals a change so the
  // header label + the request body stay current. Default is Qwen-Omni now.
  const [provider, setProvider] = useState<DirectorProvider>('qwen')
  useEffect(() => {
    const s = readDirectorSettings()
    setProvider(s.provider)
  }, [])
  const providerLabel = provider === 'qwen' ? 'qwen-omni' : 'gemini'

  // Director tool-use: pulls applyAction() so canvas-action blocks from the
  // model mutate the canvas live. Null when mounted outside CanvasShell.
  const canvasActions = useCanvasActions()

  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const dragDepthRef = useRef(0)
  // Tracks the element that triggered expansion so we can restore focus on
  // close (a11y: never strand keyboard users in the document body).
  const triggerRef = useRef<HTMLElement | null>(null)
  // True while the user is scrolled away from the bottom — autoscroll yields
  // to them and waits until they return on their own.
  const autoScrollPinnedRef = useRef(true)

  useEffect(() => {
    setMessages([])
    setInput('')
    setError(null)
    setExpanded(false)
    setAttachments([])
    setPickerOpen(false)
    abortRef.current?.abort()
    abortRef.current = null
  }, [canvas.id])

  // Autoscroll on new content, but only when the user is already pinned to
  // the bottom (within 32px). If they've scrolled up to read history we
  // leave them alone — yanking them down feels broken.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (autoScrollPinnedRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  // Track whether the thread is pinned to the bottom. Cheap scroll listener;
  // updates a ref (not state) so we don't re-render on every scroll tick.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !expanded) return
    const onScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      autoScrollPinnedRef.current = distanceFromBottom < 32
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    // Initial state — if there's history we may already be scrolled up.
    onScroll()
    return () => el.removeEventListener('scroll', onScroll)
  }, [expanded])

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`
  }, [input])

  useEffect(() => () => abortRef.current?.abort(), [])

  // Esc closes the panel when expanded.
  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  const selectedNode = useMemo(
    () => (selectedNodeId ? canvas.nodes.find((n) => n.id === selectedNodeId) : undefined),
    [canvas.nodes, selectedNodeId],
  )

  /* ===== Attachments =================================================== */

  // Upsert by id so the picker can call us twice for the same upload chip
  // (once with status='uploading' + object URL, once with status='ready' +
  // https URL). Caps at MAX_ATTACHMENTS to defend against the picker.
  const upsertAttachment = useCallback(
    (att: Omit<DirectorAttachment, 'status'> & { status?: DirectorAttachment['status'] }) => {
      setAttachments((prev) => {
        const next: DirectorAttachment = {
          ...att,
          status: att.status ?? 'ready',
        }
        const existingIdx = prev.findIndex((a) => a.id === next.id)
        if (existingIdx >= 0) {
          const updated = [...prev]
          updated[existingIdx] = next
          return updated
        }
        if (prev.length >= MAX_ATTACHMENTS) return prev
        return [...prev, next]
      })
    },
    [],
  )

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id)
      // Free any object URL we created locally for in-progress uploads.
      if (target?.url?.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(target.url)
        } catch {
          /* ignore */
        }
      }
      return prev.filter((a) => a.id !== id)
    })
  }, [])

  // Promote a freshly-dropped or pasted file to an attachment chip and
  // upload it to /api/upload-image (folder=temp). Mirrors the upload tab
  // logic in AttachmentPickerModal so paste/drop work without opening it.
  const handleLocalFile = useCallback(
    async (file: File) => {
      if (attachments.length >= MAX_ATTACHMENTS) return
      const validation = validateImage(file)
      if (!validation.valid) {
        setError(validation.error || 'Invalid image')
        return
      }
      const tempId = `up_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const localUrl = URL.createObjectURL(file)
      upsertAttachment({
        id: tempId,
        url: localUrl,
        kind: 'image',
        name: file.name,
        source: 'upload',
        status: 'uploading',
      })
      try {
        const base64DataUrl = await fileToBase64(file)
        const base64 = base64DataUrl.split(',')[1]
        const res = await fetch('/api/upload-image', {
          method: 'POST',
          headers: getWhopHeaders(),
          body: JSON.stringify({
            base64,
            mimeType: file.type,
            filename: file.name,
            folder: 'temp',
          }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data?.error || `Upload failed (${res.status})`)
        }
        const data = await res.json()
        if (!data?.url) throw new Error('Upload returned no URL')
        upsertAttachment({
          id: tempId,
          url: data.url,
          kind: 'image',
          name: file.name,
          source: 'upload',
          status: 'ready',
        })
      } catch (err: any) {
        upsertAttachment({
          id: tempId,
          url: localUrl,
          kind: 'image',
          name: file.name,
          source: 'upload',
          status: 'error',
          error: err?.message || 'Upload failed',
        })
        setError(err?.message || 'Upload failed')
      }
    },
    [attachments.length, upsertAttachment, getWhopHeaders],
  )

  // Paste handler — only active when the panel is expanded and authed,
  // and only consumes images so we don't steal paste from text inputs
  // when pasting plain text.
  useEffect(() => {
    if (!expanded || !isAuthed) return
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (!file) continue
          e.preventDefault()
          void handleLocalFile(file)
          return
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [expanded, isAuthed, handleLocalFile])

  // Cleanup any leftover object URLs on unmount.
  useEffect(() => {
    return () => {
      for (const a of attachments) {
        if (a.url.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(a.url)
          } catch {
            /* ignore */
          }
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      // Allow sending with attachments only (the model still needs *some*
      // intent though, so we synthesise a default question for that case).
      const readyAttachments = attachments.filter((a) => a.status === 'ready')
      if ((!trimmed && readyAttachments.length === 0) || isStreaming || !isAuthed) return

      // Block while uploads are still in flight — sending an unresolved
      // blob: URL to the server would just look like a 404 to Gemini.
      const inFlight = attachments.some((a) => a.status === 'uploading')
      if (inFlight) {
        setError('Wait for uploads to finish before sending')
        return
      }

      const effectiveText =
        trimmed ||
        (readyAttachments.length > 0
          ? 'Describe these references and how I might use them in this canvas.'
          : '')

      setError(null)
      const userMsg: ThreadMessage = {
        id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        role: 'user',
        content: effectiveText,
      }
      const assistantMsg: ThreadMessage = {
        id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        role: 'assistant',
        content: '',
        pending: true,
      }
      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setInput('')
      // Snapshot + clear attachments so the next turn starts fresh, mirror-
      // ing the main chat composer's behaviour.
      const refsForTurn: DirectorAttachmentRef[] = readyAttachments.map((a) => ({
        url: a.url,
        kind: a.kind,
        name: a.name,
      }))
      // Free any leftover blob URLs (errored uploads).
      for (const a of attachments) {
        if (a.url.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(a.url)
          } catch {
            /* ignore */
          }
        }
      }
      setAttachments([])
      setIsStreaming(true)

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const historyForApi: DirectorMessage[] = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }))
        const iter = askDirector({
          canvas,
          selectedNodeId,
          history: historyForApi,
          userMessage: effectiveText,
          attachments: refsForTurn,
          getHeaders: getWhopHeaders,
          signal: controller.signal,
        })
        for await (const chunk of iter) {
          if (chunk.type === 'delta') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsg.id ? { ...m, content: m.content + chunk.delta } : m,
              ),
            )
          } else if (chunk.type === 'optimistic') {
            // Pre-LLM hint from the client-side intent classifier. Stamp it
            // onto the live assistant bubble so it can render the
            // "Building <intent>…" pill while we wait for real content.
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsg.id ? { ...m, optimisticIntent: chunk.intent } : m,
              ),
            )
          } else if (chunk.type === 'clean-content') {
            // Server stripped the ```canvas-action JSON out of the visible
            // reply — swap the live assistant message to the clean version.
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsg.id ? { ...m, content: chunk.content } : m,
              ),
            )
          } else if (chunk.type === 'tool-call' && chunk.name === 'canvas-action') {
            // Director proposed a canvas mutation. Dispatch through the
            // CanvasActions context (additive = silent + history push,
            // destructive = ConfirmActionsCard). The summary feeds back
            // into the thread + the AI's next turn.
            if (!canvasActions) {
              setError('Canvas actions unavailable in this context')
              continue
            }
            // Clear the optimistic pill — the real action has arrived, the
            // user will see the canvas mutate on the very next paint.
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsg.id ? { ...m, optimisticIntent: undefined } : m,
              ),
            )
            try {
              const result = await canvasActions.applyAction(chunk.args)
              // Append a small system bubble so the user sees what happened.
              // We attach `issues` here (not on the streaming assistant
              // bubble) because the issues describe the APPLIED outcome —
              // they belong next to the summary line.
              const summaryMsg: ThreadMessage = {
                id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                role: 'assistant',
                content: `_${result.summary}_`,
                issues: chunk.issues,
              }
              setMessages((prev) => [...prev, summaryMsg])
              // Tail the assistant message with the result so the model sees
              // its own outcome on the next turn (the message goes into
              // `history` and reaches the next /api/chat call).
              if (chunk.args.explanation) {
                // explanation was the prose the AI wrote; keep it visible.
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              setError(`Tool-call failed: ${msg}`)
            }
          } else if (chunk.type === 'done') {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMsg.id ? { ...m, pending: false } : m)),
            )
          } else if (chunk.type === 'error') {
            setError(chunk.error)
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsg.id
                  ? { ...m, pending: false, content: m.content || `_${chunk.error}_` }
                  : m,
              ),
            )
          }
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') setError(err?.message || 'Something went wrong')
      } finally {
        setIsStreaming(false)
        abortRef.current = null
      }
    },
    [canvas, selectedNodeId, getWhopHeaders, isAuthed, isStreaming, messages, attachments],
  )

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault()
      void sendMessage(input)
    },
    [input, sendMessage],
  )

  // Enter sends (Shift+Enter inserts a newline). Cmd/Ctrl+Enter also sends —
  // it's the documented hint we surface in the footer, and a hardened path
  // for users who hold a modifier out of habit on chat surfaces.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) return // newline
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleExpand = useCallback(
    (e?: React.MouseEvent | React.KeyboardEvent) => {
      if (!isAuthed) return
      // Remember what we're returning focus to on close.
      const t = e?.currentTarget
      if (t instanceof HTMLElement) triggerRef.current = t
      setExpanded(true)
      onExpand?.()
      requestAnimationFrame(() => textareaRef.current?.focus())
    },
    [onExpand, isAuthed],
  )

  const handleCollapse = useCallback(() => {
    setExpanded(false)
    abortRef.current?.abort()
    // Return focus to the trigger so keyboard users don't lose place.
    requestAnimationFrame(() => triggerRef.current?.focus())
  }, [])

  const handleQuickChip = (prompt: string) => {
    setExpanded(true)
    requestAnimationFrame(() => void sendMessage(prompt))
  }

  const lastAssistant = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (m.role === 'assistant' && !m.pending && m.content) return m
    }
    return null
  }, [messages])

  const suggestedPrompt = useMemo(
    () => (lastAssistant ? extractSuggestedPrompt(lastAssistant.content) : null),
    [lastAssistant],
  )
  const canApply = !!(suggestedPrompt && selectedNodeId)

  return (
    <>
      {/* === Collapsed trigger ============================================
          Desktop: vertical tab anchored to the right edge, mid-height.
          Mobile: bottom-right pill above the BottomToolbar.
          AnimatePresence so the tab fades out cleanly as the panel slides
          in, instead of vanishing instantly under the panel. */}
      <AnimatePresence>
        {!expanded && <CollapsedTrigger key="director-trigger" isAuthed={isAuthed} onClick={handleExpand} />}
      </AnimatePresence>

      {/* === Attachment picker modal ====================================== */}
      <AttachmentPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onAttach={(att) => upsertAttachment(att)}
        remainingSlots={MAX_ATTACHMENTS - attachments.length}
        canvas={canvas}
        getHeaders={getWhopHeaders}
      />

      {/* === Expanded panel =============================================== */}
      <AnimatePresence>
        {expanded && (
          <>
            {/* Mobile-only backdrop. Desktop panel doesn't block the canvas. */}
            <motion.div
              key="director-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="sm:hidden fixed inset-0 z-40 bg-black/40"
              onClick={handleCollapse}
            />

            <motion.aside
              key="director-panel"
              // Slide-out-from-the-tab feel. Smooth tween (NOT spring) — the
              // earlier spring with stiffness 320 overshot the target and
              // briefly bounced past zero, which made React Flow's ResizeObs
              // recompute mid-animation and visibly jitter the canvas camera.
              // outExpo-ish cubic-bezier produces an emergent feel without
              // overshoot. Origin pinned to the right edge so the transform
              // pivots from where the tab sits.
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{
                duration: 0.32,
                ease: [0.22, 1, 0.36, 1],
              }}
              style={{
                transformOrigin: 'right center',
                willChange: 'transform',
              }}
              role="dialog"
              aria-modal="false"
              aria-labelledby="director-panel-title"
              onDragEnter={(e) => {
                if (!isAuthed) return
                if (Array.from(e.dataTransfer?.types || []).includes('Files')) {
                  dragDepthRef.current += 1
                  setIsDraggingOverPanel(true)
                }
              }}
              onDragOver={(e) => {
                if (!isAuthed) return
                if (Array.from(e.dataTransfer?.types || []).includes('Files')) {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'copy'
                }
              }}
              onDragLeave={() => {
                if (!isAuthed) return
                dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
                if (dragDepthRef.current === 0) setIsDraggingOverPanel(false)
              }}
              onDrop={(e) => {
                if (!isAuthed) return
                e.preventDefault()
                dragDepthRef.current = 0
                setIsDraggingOverPanel(false)
                const files = Array.from(e.dataTransfer?.files || [])
                for (const f of files) {
                  if (attachments.length >= MAX_ATTACHMENTS) break
                  if (!f.type.startsWith('image/')) continue
                  void handleLocalFile(f)
                }
              }}
              className={cn(
                // Desktop: full-height right-edge drawer flush against the
                // viewport, slightly inset from the TopBar. Anchored at
                // right-0 so the slide-in emerges from the same edge the
                // Director tab lives on (no visual gap between tab and
                // panel during the transition).
                'absolute z-40 flex flex-col',
                'right-0 top-3 bottom-3 sm:top-4 sm:bottom-4',
                'w-[calc(100%-1.5rem)] sm:w-[420px]',
                // Round only the LEFT side (drawer pulled from the right
                // edge). Right side meets the viewport flush.
                'rounded-l-2xl',
                'bg-zinc-950/95 backdrop-blur-xl ring-1 ring-white/[0.08]',
                // Soft outer shadow that points LEFTWARD into the canvas.
                'shadow-[-12px_0_32px_-8px_rgba(0,0,0,0.5)]',
                'overflow-hidden',
              )}
            >
              <PanelHeader
                canvas={canvas}
                selectedNode={selectedNode}
                selectedNodeId={selectedNodeId}
                onClose={handleCollapse}
                onOpenSettings={() => setSettingsOpen(true)}
                providerLabel={providerLabel}
              />
              <DirectorSettingsPopover
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                onChange={() => {
                  const s = readDirectorSettings()
                  setProvider(s.provider)
                }}
              />

              {!isAuthed ? (
                <AuthGateBody />
              ) : (
                <>
                  <div
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0"
                  >
                    {messages.length === 0 && (
                      <Welcome
                        selectedNodeId={selectedNodeId}
                        onPick={(p) => void sendMessage(p)}
                        disabled={isStreaming}
                      />
                    )}
                    {messages.map((m) => (
                      <MessageBubble key={m.id} message={m} />
                    ))}
                    {error && (
                      <div
                        role="alert"
                        className="flex items-start gap-2 text-[11px] text-rose-300/90 bg-rose-500/10 ring-1 ring-rose-500/20 rounded-lg px-3 py-2"
                      >
                        <AlertTriangle size={11} className="shrink-0 mt-[2px]" aria-hidden="true" />
                        <div className="flex-1 leading-relaxed">{error}</div>
                        <button
                          type="button"
                          onClick={() => setError(null)}
                          aria-label="Dismiss error"
                          className="shrink-0 text-rose-300/70 hover:text-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60 rounded"
                        >
                          <X size={10} aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </div>

                  <AnimatePresence>
                    {suggestedPrompt && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="border-t border-white/[0.05] overflow-hidden shrink-0"
                      >
                        <div className="px-4 py-2.5 flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5">
                              suggested prompt
                            </div>
                            <div className="text-[11px] text-zinc-300 truncate font-mono">
                              {suggestedPrompt}
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={!canApply}
                            onClick={() => {
                              if (canApply && selectedNodeId && suggestedPrompt) {
                                onApplyPromptToNode(selectedNodeId, suggestedPrompt)
                              }
                            }}
                            className={cn(
                              'shrink-0 h-8 px-3 rounded-md text-[11px] font-semibold transition-all',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60',
                              canApply
                                ? 'bg-skinny-yellow text-black hover:brightness-110 active:brightness-95 shadow-md shadow-skinny-yellow/20'
                                : 'bg-white/[0.04] text-zinc-500 cursor-not-allowed',
                            )}
                            title={
                              canApply
                                ? 'apply this prompt to the selected node'
                                : 'select a node first to apply this prompt'
                            }
                          >
                            apply to node
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <AttachmentChips
                    attachments={attachments}
                    onRemove={removeAttachment}
                    visibleCap={MAX_ATTACHMENTS}
                  />

                  {/* "Describe what's in these references" chip — only when
                      attachments are present. Sends a synthesised prompt
                      so the model focuses on the refs. */}
                  {attachments.some((a) => a.status === 'ready') && !isStreaming && (
                    <div className="px-3 pb-2 shrink-0 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          void sendMessage(
                            "Describe what's in these references. Note style, subject, palette, and lighting — anything I should preserve when I prompt with them.",
                          )
                        }
                        className={cn(
                          'px-2.5 py-1 rounded-full text-[11px]',
                          'bg-skinny-yellow/15 ring-1 ring-skinny-yellow/30',
                          'text-skinny-yellow hover:bg-skinny-yellow/20 hover:ring-skinny-yellow/50',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60',
                          'transition-colors',
                        )}
                      >
                        describe these references
                      </button>
                    </div>
                  )}

                  {/* Char counter — only surfaces once we're past the soft
                      limit so the composer stays clean for normal prompts. */}
                  {input.length > INPUT_SOFT_LIMIT && (
                    <div className="px-3 pt-1 shrink-0 flex justify-end">
                      <span
                        className={cn(
                          'text-[10px] tabular-nums transition-colors',
                          input.length >= INPUT_HARD_LIMIT
                            ? 'text-rose-300'
                            : input.length > INPUT_HARD_LIMIT - 200
                              ? 'text-amber-300/90'
                              : 'text-zinc-500',
                        )}
                        aria-live="polite"
                      >
                        {input.length.toLocaleString()} / {INPUT_HARD_LIMIT.toLocaleString()}
                      </span>
                    </div>
                  )}

                  <form
                    onSubmit={handleSubmit}
                    className="border-t border-white/[0.05] px-3 py-2.5 flex items-end gap-2 pb-[max(env(safe-area-inset-bottom),0.625rem)] shrink-0"
                  >
                    <button
                      type="button"
                      onClick={() => setPickerOpen(true)}
                      disabled={attachments.length >= MAX_ATTACHMENTS}
                      title={
                        attachments.length >= MAX_ATTACHMENTS
                          ? 'attachment limit reached'
                          : 'attach a reference (upload, URL, hub, or canvas)'
                      }
                      aria-label={
                        attachments.length >= MAX_ATTACHMENTS
                          ? 'Attachment limit reached'
                          : 'Attach a reference'
                      }
                      className={cn(
                        'shrink-0 h-9 w-9 rounded-md flex items-center justify-center transition-all',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50',
                        attachments.length >= MAX_ATTACHMENTS
                          ? 'bg-white/[0.03] text-zinc-700 cursor-not-allowed'
                          : 'bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] hover:text-white',
                      )}
                    >
                      <Plus size={14} aria-hidden="true" />
                    </button>

                    <div className="flex-1 min-w-0">
                      <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => {
                          const next = e.target.value
                          // Hard cap so we never ship absurd prompts to the API.
                          if (next.length > INPUT_HARD_LIMIT) {
                            setInput(next.slice(0, INPUT_HARD_LIMIT))
                            return
                          }
                          setInput(next)
                        }}
                        onKeyDown={handleKeyDown}
                        rows={1}
                        placeholder={
                          attachments.length > 0
                            ? 'ask about these references — or just send'
                            : selectedNodeId
                              ? 'ask for a rewrite, a new node, or anything…'
                              : 'describe what to build — or pick a chip above'
                        }
                        aria-label="Message Creative Director"
                        aria-describedby="director-input-hint"
                        disabled={isStreaming}
                        maxLength={INPUT_HARD_LIMIT}
                        className={cn(
                          // 16px on mobile prevents iOS Safari's zoom-on-focus;
                          // 13px on desktop matches the panel's denser scale.
                          'w-full resize-none bg-transparent text-base sm:text-[13px] leading-snug',
                          'text-zinc-100 placeholder:text-zinc-600',
                          'focus:outline-none',
                          'min-h-[36px] max-h-[120px]',
                          'disabled:opacity-60',
                        )}
                      />
                      <span id="director-input-hint" className="sr-only">
                        Press Enter to send. Shift+Enter for a new line. Escape closes the panel.
                      </span>
                    </div>

                    <button
                      type="submit"
                      disabled={
                        (!input.trim() && attachments.filter((a) => a.status === 'ready').length === 0) ||
                        attachments.some((a) => a.status === 'uploading') ||
                        isStreaming
                      }
                      title={
                        isStreaming
                          ? 'sending…'
                          : attachments.some((a) => a.status === 'uploading')
                            ? 'wait for uploads to finish'
                            : 'send (Enter)'
                      }
                      className={cn(
                        'shrink-0 h-9 w-9 rounded-md flex items-center justify-center transition-all',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60',
                        (input.trim() || attachments.some((a) => a.status === 'ready')) &&
                          !isStreaming &&
                          !attachments.some((a) => a.status === 'uploading')
                          ? 'bg-skinny-yellow text-black hover:brightness-110 active:brightness-95'
                          : 'bg-white/[0.04] text-zinc-600 cursor-not-allowed',
                      )}
                      aria-label={isStreaming ? 'Sending' : 'Send message'}
                    >
                      {isStreaming ? (
                        <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                      ) : (
                        <Send size={14} aria-hidden="true" />
                      )}
                    </button>
                  </form>

                  {/* Drag-over overlay (covers panel body so user can drop
                      anywhere). Only renders during an active drag. */}
                  <AnimatePresence>
                    {isDraggingOverPanel && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center bg-skinny-yellow/10 ring-2 ring-skinny-yellow/40 rounded-2xl"
                      >
                        <div className="text-skinny-yellow text-sm font-semibold">
                          drop to attach
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

/* ===== sub-components ==================================================== */

function CollapsedTrigger({
  isAuthed,
  onClick,
}: {
  isAuthed: boolean
  onClick: (e: React.MouseEvent) => void
}) {
  return (
    <>
      {/* Desktop: liquid-glass vertical tab, flush to the right viewport edge.
          The wrap stays positioned + carries the soft outer shadow; the inner
          button gets the frosted backdrop, gradient, inset highlights, and
          edge-flush curved-left rounding. */}
      <motion.div
        initial={{ x: 12, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 12, opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        style={{ willChange: 'transform, opacity' }}
        className={cn(
          'liquid-glass-wrap hidden sm:flex',
          'absolute right-0 top-1/2 -translate-y-1/2 z-30',
        )}
      >
        <button
          type="button"
          onClick={onClick}
          disabled={!isAuthed}
          aria-label={isAuthed ? 'Open Creative Director' : 'Sign in to use Creative Director'}
          title={isAuthed ? 'Creative Director' : 'Sign in to use Creative Director'}
          className={cn(
            'liquid-glass liquid-glass-edge-right',
            'flex flex-col items-center gap-2.5 py-4 pl-2.5 pr-2',
            'text-zinc-200 hover:text-white',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50',
            !isAuthed && 'opacity-50 cursor-not-allowed',
          )}
        >
          <span
            className={cn(
              'liquid-glass-text',
              'flex h-7 w-7 items-center justify-center rounded-full',
              'bg-gradient-to-br from-skinny-yellow/35 to-skinny-yellow/10',
              'ring-1 ring-skinny-yellow/40 shadow-[0_0_12px_rgba(214,252,81,0.25)]',
            )}
          >
            <Sparkles size={13} className="text-skinny-yellow" />
          </span>
          <span
            className="liquid-glass-text text-[10px] font-semibold tracking-[0.20em] uppercase text-white/85"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            Director
          </span>
        </button>
        <div className="liquid-glass-shadow liquid-glass-edge-right" />
      </motion.div>

      {/* Mobile: bottom-right pill above the BottomToolbar */}
      <motion.button
        type="button"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        onClick={onClick}
        disabled={!isAuthed}
        aria-label={isAuthed ? 'Open Creative Director' : 'Sign in to use Creative Director'}
        className={cn(
          'sm:hidden absolute z-30 right-3 bottom-[calc(env(safe-area-inset-bottom)+88px)]',
          // 44px min-height for touch; comfortable horizontal padding.
          'flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] rounded-full',
          'bg-zinc-950/95 backdrop-blur-md ring-1 ring-white/[0.08] shadow-xl',
          'text-zinc-200 transition-all',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50',
          !isAuthed && 'opacity-60 cursor-not-allowed',
        )}
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-skinny-yellow/30 to-skinny-yellow/10 ring-1 ring-skinny-yellow/30">
          <Sparkles size={10} className="text-skinny-yellow" />
        </span>
        <span className="text-[11px] font-medium">Director</span>
      </motion.button>
    </>
  )
}

function PanelHeader({
  canvas,
  selectedNode,
  selectedNodeId,
  onClose,
  onOpenSettings,
  providerLabel,
}: {
  canvas: Canvas
  selectedNode: ReturnType<Canvas['nodes']['find']> | undefined
  selectedNodeId: string | null
  onClose: () => void
  onOpenSettings: () => void
  providerLabel: string
}) {
  return (
    <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-skinny-yellow/30 to-skinny-yellow/10 ring-1 ring-skinny-yellow/30 shrink-0">
          <Sparkles size={13} className="text-skinny-yellow" />
        </span>
        <div className="min-w-0">
          <div
            id="director-panel-title"
            className="text-[13px] font-semibold text-white leading-tight"
          >
            Creative Director
          </div>
          <div className="text-[10px] text-zinc-500 leading-tight truncate">
            <span className="text-zinc-400">{providerLabel}</span>
            {' · '}
            {canvas.nodes.length} node{canvas.nodes.length === 1 ? '' : 's'}
            {selectedNode && (
              <>
                {' · '}selected: <span className="text-zinc-300">{selectedNode.type}</span>{' '}
                <span className="text-zinc-600">[{selectedNodeId?.slice(0, 4)}]</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="shrink-0 flex items-center gap-1">
        <button
          type="button"
          onClick={onOpenSettings}
          className="relative h-8 w-8 inline-flex items-center justify-center rounded-md text-zinc-500 hover:text-white hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50 transition-colors after:absolute after:-inset-1.5 after:content-[''] sm:after:inset-0"
          aria-label="Director settings (provider, API key)"
          title="Director settings"
        >
          <Settings size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="relative h-8 w-8 inline-flex items-center justify-center rounded-md text-zinc-500 hover:text-white hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50 transition-colors after:absolute after:-inset-1.5 after:content-[''] sm:after:inset-0"
          aria-label="Close Director (Esc)"
          title="Close (Esc)"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

function AuthGateBody() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2.5 px-6 py-10 text-center">
      <div className="h-10 w-10 rounded-full bg-skinny-yellow/10 ring-1 ring-skinny-yellow/20 flex items-center justify-center">
        <Wand2 size={18} className="text-skinny-yellow" aria-hidden="true" />
      </div>
      <p className="text-sm text-zinc-200 font-medium">sign in to chat with the Director</p>
      <p className="text-[11px] text-zinc-500 max-w-[26ch] leading-relaxed">
        we use your Whop account to charge runs to your balance and save what you build.
      </p>
    </div>
  )
}

function Welcome({
  selectedNodeId,
  onPick,
  disabled,
}: {
  selectedNodeId: string | null
  onPick: (prompt: string) => void
  disabled: boolean
}) {
  const chips = QUICK_CHIPS.filter((c) => !c.requiresSelection || selectedNodeId)
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="flex flex-col items-start gap-3 py-2"
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5 text-[13px] text-zinc-200 font-medium">
          <Sparkles size={12} className="text-skinny-yellow" />
          <span>What are we building?</span>
        </div>
        <p className="text-[11px] text-zinc-500 leading-relaxed max-w-[28ch]">
          Describe the shot, the style, or the workflow.
          I&rsquo;ll add the nodes and wire them up.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={() => onPick(chip.prompt)}
            disabled={disabled}
            className={cn(
              'px-2.5 py-1 rounded-full text-[11px]',
              'bg-white/[0.04] ring-1 ring-white/[0.06]',
              'text-zinc-300 hover:text-white hover:bg-white/[0.07] hover:ring-skinny-yellow/30',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50',
              'transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>
      {!selectedNodeId && (
        <div className="flex items-center gap-1.5 text-[10px] text-zinc-600">
          <Lightbulb size={9} />
          <span>tip: select a node first to unlock node-aware actions</span>
        </div>
      )}
    </motion.div>
  )
}

function MessageBubble({ message }: { message: ThreadMessage }) {
  const isUser = message.role === 'user'
  const showOptimistic =
    !isUser && !!message.optimisticIntent && message.optimisticIntent.confidence >= 0.7
  // System-style summary bubbles arrive wrapped in `_underscores_`. Render
  // those as a hushed system note (zinc-400, smaller, italic), not as the
  // usual chatty bubble — they're the "Applied X nodes" affirmations.
  const isSystemNote =
    !isUser &&
    !message.pending &&
    typeof message.content === 'string' &&
    message.content.trim().startsWith('_') &&
    message.content.trim().endsWith('_') &&
    message.content.trim().length > 2

  const isStreaming = !isUser && message.pending && message.content.length > 0
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      /* silent — clipboard can be blocked in iframes */
    }
  }, [message.content])

  if (isSystemNote) {
    const body = message.content.trim().slice(1, -1)
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="flex flex-col gap-1 self-start max-w-[92%]"
      >
        <div className="text-[11px] italic text-zinc-400 leading-relaxed">{body}</div>
        {message.issues && message.issues.length > 0 && (
          <div className="flex flex-col gap-0.5">
            {message.issues.map((iss, i) => (
              <IssueNote key={i} issue={iss} />
            ))}
          </div>
        )}
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={cn('flex w-full group', isUser ? 'justify-end' : 'justify-start')}
    >
      <div className="max-w-[88%] flex flex-col gap-1">
        <div
          className={cn(
            'relative rounded-2xl px-3 py-2 text-[12.5px] leading-relaxed whitespace-pre-wrap break-words',
            isUser
              ? 'bg-skinny-yellow/15 text-zinc-100 ring-1 ring-skinny-yellow/20'
              : 'bg-zinc-800/60 text-zinc-200 ring-1 ring-white/[0.04]',
          )}
        >
          {message.content ? (
            <>
              {message.content}
              {isStreaming && (
                // Subtle blinking caret while streaming, anchored after the
                // last glyph. Keeps the bubble feeling alive.
                <span
                  aria-hidden="true"
                  className="inline-block align-baseline w-[2px] h-[0.95em] -mb-[2px] ml-[2px] bg-skinny-yellow/80 animate-pulse"
                />
              )}
            </>
          ) : (
            <span className="inline-flex items-center gap-2 text-zinc-500">
              {/* Skinny lime pulse — replaces the generic spinner. Reads as
                  the Director "thinking" rather than a generic loading. */}
              <SkinnyLottie variant="pulse" className="w-6 -my-1" ariaLabel="Director thinking" />
              <span className="text-[11px]">thinking…</span>
            </span>
          )}

          {/* Copy button — only on completed assistant messages, hover-reveal.
              Touch devices show it always (hover:none media query). */}
          {!isUser && !message.pending && message.content && (
            <button
              type="button"
              onClick={handleCopy}
              aria-label={copied ? 'Copied' : 'Copy message'}
              title={copied ? 'Copied' : 'Copy'}
              className={cn(
                'absolute -bottom-2 right-1 h-5 px-1.5 rounded-md',
                'bg-zinc-900/90 ring-1 ring-white/10 text-[9px] font-medium',
                'text-zinc-400 hover:text-white hover:bg-zinc-800',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/50',
                'opacity-0 group-hover:opacity-100 transition-opacity',
                '[@media(hover:none)]:opacity-100',
              )}
            >
              {copied ? 'copied' : 'copy'}
            </button>
          )}
        </div>
        {showOptimistic && message.optimisticIntent && (
          // Tiny status pill anchored to the assistant bubble. Disappears
          // the moment the real tool-call lands (we null this out above).
          <motion.div
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="inline-flex items-center gap-1.5 self-start px-2 py-0.5 rounded-full bg-skinny-yellow/10 ring-1 ring-skinny-yellow/25 text-skinny-yellow text-[10px] font-medium"
          >
            <Loader2 size={9} className="animate-spin" aria-hidden="true" />
            <span>building {intentLabel(message.optimisticIntent.intent)}…</span>
          </motion.div>
        )}
        {!isUser && message.issues && message.issues.length > 0 && (
          <div className="flex flex-col gap-0.5 self-start">
            {message.issues.map((iss, i) => (
              <IssueNote key={i} issue={iss} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

function IssueNote({ issue }: { issue: ValidationIssue }) {
  // One-line inline note under the summary bubble. Tone-mapped by level:
  //   fixed   → soft green (auto-fix applied, user can keep moving)
  //   warning → amber (worth glancing at, didn't block)
  //   error   → red (action was rejected by validator)
  const palette =
    issue.level === 'fixed'
      ? 'text-emerald-300/90'
      : issue.level === 'warning'
        ? 'text-amber-300/90'
        : 'text-rose-300/90'
  const label =
    issue.level === 'fixed' ? 'Auto-fixed' : issue.level === 'warning' ? 'Heads-up' : 'Skipped'
  const text = issue.fix || issue.message
  const Icon =
    issue.level === 'fixed'
      ? CheckCircle2
      : issue.level === 'warning'
        ? AlertTriangle
        : XCircle
  return (
    <div className={cn('flex items-start gap-1.5 text-[11px] mt-0.5 leading-snug', palette)}>
      <Icon size={11} className="shrink-0 mt-[2px]" aria-hidden="true" />
      <div>
        <span className="font-semibold">{label}:</span> {text}
      </div>
    </div>
  )
}
