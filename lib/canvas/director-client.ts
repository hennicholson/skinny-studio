// Client helper for the Canvas-mode Creative Director. Wraps the existing
// `/api/chat` SSE endpoint, but feeds it a Canvas-aware system prompt built
// from the current graph. The chat API still owns Gemini, auth, and token
// accounting — this module only concerns itself with the canvas wrapping
// and stream parsing.
//
// We forward the conversation history (user/assistant) so multi-turn
// refinement works the same way it does in the main chat. The system prompt
// itself is injected via the FIRST user message (as a `[CANVAS CONTEXT]`
// preamble) rather than via a real `system` role — the chat route already
// generates its own system prompt via `generateSystemPrompt()` and exposes
// no override hook. This keeps us additive without touching the route.
//
// NOTE on streaming: the chat route uses standard `text/event-stream` with
// `data: {json}\n\n` frames and a final `data: [DONE]\n\n`. We surface only
// the assistant text deltas to the caller (we ignore generation/skill
// events here — Canvas Director is advisory, not a generation trigger).

import { Canvas } from './ir'
import { generateCanvasSystemPrompt } from '@/lib/orchestrator/system-prompt'
import { describeCanvasForOrchestrator } from './orchestrator-bridge'
import type { CanvasActionPayload } from './director-actions'
import { classifyIntent, type IntentMatch } from './intent-classifier'

// `ValidationIssue` is owned by `lib/canvas/action-validator.ts`, which is
// being authored by a parallel agent. We avoid a hard module dependency
// (and a broken typecheck if that file isn't on disk yet) by defining a
// structurally-identical local type as a fallback. If the validator
// module later exports a richer type, the structural overlap means
// callers can still flow the value through with no changes here.
export interface ValidationIssue {
  level: 'error' | 'warning' | 'fixed'
  actionIndex: number
  code: string
  message: string
  fix?: string
}

export interface DirectorMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Reference attached to a Director turn. We send these to /api/chat under
 * the same shape the main chat uses (`messages[i].attachments[j]`), so the
 * existing route handler picks them up without any server-side changes.
 *
 * `kind` is forward-looking — today the chat route handles `image` only,
 * but we surface video chips in the picker so the director can at least
 * acknowledge them in text. Server treats `video` like `image` (URL-only)
 * which is harmless: Gemini just sees the URL string in context.
 */
export interface DirectorAttachmentRef {
  url: string
  kind: 'image' | 'video'
  /** Display name; chat route ignores beyond debugging. */
  name?: string
}

export interface AskDirectorOptions {
  canvas: Canvas
  selectedNodeId?: string | null
  history?: DirectorMessage[]
  userMessage: string
  attachments?: DirectorAttachmentRef[]
  getHeaders: () => Record<string, string>
  signal?: AbortSignal
}

export type DirectorChunk =
  | { type: 'delta'; delta: string }
  | { type: 'done'; full: string }
  | { type: 'error'; error: string; code?: string }
  // Server-side `parseCanvasActionBlock` extracted a JSON action block from
  // the model reply. The Director consumer (CreativeDirectorChat) dispatches
  // these through `useCanvasActions().applyAction()` to mutate the canvas.
  // `issues` is populated when the server-side validator caught problems
  // (auto-fixed renames, dropped invalid actions, etc.); UI surfaces these
  // as inline notes alongside the apply summary.
  | {
      type: 'tool-call'
      id: string
      name: 'canvas-action'
      args: CanvasActionPayload
      issues?: ValidationIssue[]
    }
  // Server stripped the JSON block out of the displayed text. Consumer
  // replaces the live assistant message with this cleaner content so the
  // raw ``` block doesn't linger in the thread.
  | { type: 'clean-content'; content: string }
  // CLIENT-SIDE optimistic hint. Yielded by `askDirector` BEFORE the fetch
  // when the user's message scored >=0.7 on the intent classifier. Lets the
  // UI render an instant "Building <intent>…" pill instead of waiting for
  // the model to start streaming. Cleared once the real tool-call arrives.
  | { type: 'optimistic'; intent: IntentMatch }

/**
 * Build the canvas-aware preamble that we prepend to the user's message.
 * We inject the system prompt this way because the chat route doesn't
 * accept a custom system instruction — but it does send the entire
 * message history to Gemini, so a leading context block is just as
 * effective and is purely additive.
 */
function buildCanvasPreamble(canvas: Canvas, selectedNodeId?: string | null): string {
  const description = describeCanvasForOrchestrator(canvas)
  const directives = generateCanvasSystemPrompt(description)

  let selectionLine = ''
  if (selectedNodeId) {
    const node = canvas.nodes.find((n) => n.id === selectedNodeId)
    if (node) {
      const short = selectedNodeId.slice(0, 4)
      selectionLine = `\n\nThe user currently has Node[${short}] (${node.type}) selected. Tailor suggestions to that node where relevant.`
    }
  }

  return `[CANVAS DIRECTOR MODE]\n${directives}${selectionLine}\n\n[USER MESSAGE]\n`
}

/**
 * Async iterable that yields assistant text deltas as they stream in.
 * Falls back to a single `delta` chunk containing the whole reply if the
 * server doesn't stream (network/proxy collapses SSE).
 */
export async function* askDirector(
  opts: AskDirectorOptions,
): AsyncGenerator<DirectorChunk, void, void> {
  const {
    canvas,
    selectedNodeId,
    history = [],
    userMessage,
    attachments = [],
    getHeaders,
    signal,
  } = opts

  // OPTIMISTIC HINT — fire BEFORE the network roundtrip. The classifier is a
  // pure regex sweep so this is sub-millisecond. The UI uses confidence>=0.7
  // to decide whether to render the "Building <intent>…" pill; we yield
  // every match here and let the consumer threshold it (keeps policy in one
  // place, lets the chunk be useful for telemetry too).
  try {
    const canvasShortIds = canvas?.nodes?.map((n) => n.id.slice(0, 4)) ?? []
    const intent = classifyIntent(userMessage, canvasShortIds)
    if (intent.confidence >= 0.7) {
      yield { type: 'optimistic', intent }
    }
  } catch {
    // Classifier failures must never break the chat — swallow and move on.
  }

  const preamble = buildCanvasPreamble(canvas, selectedNodeId)

  // If the user attached references, lightly hint to the model that they
  // exist alongside their text. The route's own `convertMessageToParts`
  // also injects an `[Image N: REFERENCE IMAGE]` block, so this is just
  // a humanised lead-in (and a hedge in case the model ignores raw URLs).
  let attachmentsHint = ''
  if (attachments.length > 0) {
    const lines = attachments.map((a, i) => `  ${i + 1}. ${a.kind}: ${a.url}`).join('\n')
    attachmentsHint = `\n\n[ATTACHED REFERENCES] (${attachments.length})\n${lines}\n`
  }

  const wrappedUserMessage = `${preamble}${userMessage}${attachmentsHint}`

  // Map attachment refs into the shape `app/api/chat/route.ts` already
  // understands: `{ type: 'image' | 'reference', url, name }`. We use
  // `reference` for canvas/hub-sourced URLs and `image` for fresh
  // uploads & ad-hoc URLs — both branches are accepted by the route's
  // `(a.type === 'image' || a.type === 'reference')` filter.
  const apiAttachments = attachments.map((a) => ({
    type: 'reference' as const,
    url: a.url,
    name: a.name || a.url,
    purpose: 'reference' as const,
  }))

  // Build the messages array. We replace the LAST user message's content
  // with our wrapped version so the canvas context is always fresh in
  // the conversation (rather than baked into history forever).
  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    {
      role: 'user' as const,
      content: wrappedUserMessage,
      ...(apiAttachments.length > 0 ? { attachments: apiAttachments } : {}),
    },
  ]

  let response: Response
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getHeaders(),
      },
      body: JSON.stringify({
        messages,
        // apiKey is consumed server-side via getEffectiveGeminiApiKey;
        // empty string lets the platform key path take over when active.
        apiKey: '',
        modelId: 'gemini-2.5-flash',
        // Force consultant-style behaviour: the canvas director is
        // advisory only, no generation should be triggered from here.
        selectedGenerationModelId: 'creative-consultant',
        // Snapshot of the live canvas IR — read server-side by the action
        // validator (full id resolution + auto-wire) and by the intent
        // classifier (BUILD HINT injection naming real short ids the AI
        // must use literally instead of fabricating placeholders).
        canvas: {
          nodes: canvas.nodes.map((n) => ({
            id: n.id,
            type: n.type,
            data: {
              modelSlug: n.data.modelSlug,
              prompt: n.data.prompt,
              imageUrl: n.data.imageUrl,
              title: n.data.title,
              outputUrls: n.data.outputUrls,
              visionContext: (n.data as any).visionContext,
            },
          })),
          edges: canvas.edges.map((e) => ({
            id: e.id,
            source: e.source,
            sourceHandle: e.sourceHandle,
            target: e.target,
            targetHandle: e.targetHandle,
          })),
        },
        // Provider settings — read from localStorage at call time so a user
        // who flips between Qwen and Gemini mid-session sees it land on the
        // very next turn without a page reload. Default is Qwen-Omni (the
        // server has a platform DashScope key as fallback); user-supplied
        // key wins so they can run on their own free credits. The key lives
        // ONLY in the user's browser localStorage.
        ...(typeof window !== 'undefined'
          ? (() => {
              const stored = window.localStorage.getItem('skinny:director:provider')
              // Default = qwen. Only the explicit 'gemini' string opts out.
              const provider = stored === 'gemini' ? 'gemini' : 'qwen'
              if (provider === 'gemini') {
                return { directorProvider: 'gemini' as const }
              }
              const qwenKey = (window.localStorage.getItem('skinny:director:qwen-key') || '').trim()
              const qwenModel = (window.localStorage.getItem('skinny:director:qwen-model') || '').trim()
              return {
                directorProvider: 'qwen' as const,
                ...(qwenKey ? { directorUserKey: qwenKey } : {}),
                ...(qwenModel ? { directorQwenModel: qwenModel } : {}),
              }
            })()
          : { directorProvider: 'qwen' as const }),
      }),
      signal,
    })
  } catch (err: any) {
    yield { type: 'error', error: err?.message || 'Network error' }
    return
  }

  if (!response.ok) {
    let errMsg = `HTTP ${response.status}`
    let errCode: string | undefined
    try {
      const data = await response.json()
      errMsg = data?.error || errMsg
      errCode = data?.code
    } catch {
      // ignore — we'll just surface the status
    }
    yield { type: 'error', error: errMsg, code: errCode }
    return
  }

  // Stream the SSE response. If there's no body we degrade to text fallback.
  if (!response.body) {
    try {
      const text = await response.text()
      yield { type: 'delta', delta: text }
      yield { type: 'done', full: text }
    } catch {
      yield { type: 'error', error: 'Empty response' }
    }
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // SSE frames are separated by a blank line.
      let idx: number
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        const line = frame.startsWith('data: ') ? frame.slice(6) : frame
        if (!line) continue
        if (line === '[DONE]') {
          yield { type: 'done', full }
          return
        }
        try {
          const parsed = JSON.parse(line)
          if (parsed.content && typeof parsed.content === 'string') {
            full += parsed.content
            yield { type: 'delta', delta: parsed.content }
          } else if (parsed.toolCall && parsed.toolCall.name === 'canvas-action') {
            // Director emitted a ```canvas-action block — pass through to
            // the consumer so it can dispatch via useCanvasActions().
            // The server may attach `issues` from action-validator (auto-
            // fixed renames, dropped invalids, warnings); plumb them
            // through unchanged for the UI to render as inline notes.
            const rawIssues = parsed.toolCall.issues
            const issues: ValidationIssue[] | undefined = Array.isArray(rawIssues)
              ? (rawIssues as ValidationIssue[])
              : undefined
            yield {
              type: 'tool-call',
              id: parsed.toolCall.id,
              name: 'canvas-action',
              args: parsed.toolCall.args as CanvasActionPayload,
              ...(issues ? { issues } : {}),
            }
          } else if (parsed.cleanContent && typeof parsed.cleanContent === 'string') {
            // Server already stripped the action block out of the response;
            // consumer replaces the live assistant message with this.
            yield { type: 'clean-content', content: parsed.cleanContent }
          } else if (parsed.error) {
            yield { type: 'error', error: parsed.error, code: parsed.code }
          }
          // Ignore generation / skillCreation / directorsNotes events —
          // those belong to the main chat surface, not the canvas director.
        } catch {
          // Non-JSON frame; ignore.
        }
      }
    }
  } catch (err: any) {
    yield { type: 'error', error: err?.message || 'Stream interrupted' }
    return
  } finally {
    try {
      reader.releaseLock()
    } catch {
      // already released
    }
  }

  // Stream ended without an explicit [DONE]; emit done with whatever we have.
  yield { type: 'done', full }
}

/**
 * Heuristic to pull a suggested prompt out of an assistant reply. The
 * canvas director system prompt asks the model to surface rewritten
 * prompts clearly; we look for:
 *   1. A fenced ``` block (any language)
 *   2. A line starting with `Try:` / `Prompt:` / `Rewrite:`
 *   3. A double-quoted string of substantial length
 *
 * Returns the cleanest candidate or null. UI uses this to surface an
 * "Apply to selected node" button.
 */
export function extractSuggestedPrompt(reply: string): string | null {
  if (!reply) return null

  // Fenced code block (skip the language tag if present)
  const fence = reply.match(/```(?:[\w-]*)\n([\s\S]*?)\n```/)
  if (fence) {
    const inner = fence[1].trim()
    // Skip generate/directors-notes/etc. JSON blobs — we only want prose.
    if (!inner.startsWith('{') && inner.length > 8) return inner
  }

  // Labelled prompt line — capture the rest of the paragraph (until blank line).
  const labelled = reply.match(/(?:^|\n)(?:Try|Prompt|Rewrite|Suggested prompt)\s*[:\-]\s*([^\n]+(?:\n(?!\n)[^\n]+)*)/i)
  if (labelled) {
    const captured = labelled[1].trim().replace(/^["']|["']$/g, '')
    if (captured.length > 8) return captured
  }

  // Quoted string (smart or straight quotes, must be substantial).
  const quoted = reply.match(/["“]([^"”]{16,})["”]/)
  if (quoted) return quoted[1].trim()

  return null
}
