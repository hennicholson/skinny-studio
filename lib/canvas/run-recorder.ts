// Client-side helper for recording canvas runs.
//
// The executor wraps each run in:
//
//   const headers = getWhopHeaders();
//   const { runId } = await startRun(canvasId, estimate, undefined, headers);
//   for each node:
//     recordNode(canvasId, runId, payload, headers);   // fire-and-forget
//   await finishRun(canvasId, runId, payload, headers); // fire-and-forget
//
// `headers` should be the object returned by `useWhopHeaders()` so the API
// routes can verify the Whop user. Errors are swallowed: telemetry must
// never break a generation.

import { resolveWhopAuth } from '@/lib/hooks/use-whop-headers'

function defaultHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  // Best-effort: pull whop auth from localStorage / cookie / URL.
  try {
    const { token, userId } = resolveWhopAuth()
    if (token) headers['x-whop-user-token'] = token
    if (userId) headers['x-whop-user-id'] = userId
  } catch {
    // resolveWhopAuth tolerates missing window; this is double-belt-and-braces.
  }
  return headers
}

function mergeHeaders(extra?: Record<string, string>): Record<string, string> {
  const base = defaultHeaders()
  return extra ? { ...base, ...extra } : base
}

export type RunNodeStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'skipped'

export type RunStatus = 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface RecordNodePayload {
  canvasNodeId?: string | null
  clientNodeId: string
  generationId?: string | null
  status?: RunNodeStatus
  costCents?: number
  startedAt?: string | null
  endedAt?: string | null
  error?: string | null
}

export interface FinishRunPayload {
  status: RunStatus
  actualCostCents?: number
  nodeCount?: number
  endedAt?: string | null
}

async function postJson(
  url: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: mergeHeaders(headers),
    body: JSON.stringify(body ?? {}),
  })
}

async function patchJson(
  url: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<Response> {
  return fetch(url, {
    method: 'PATCH',
    credentials: 'include',
    headers: mergeHeaders(headers),
    body: JSON.stringify(body ?? {}),
  })
}

/** Start a new run. Throws if the API rejects — the caller should fall back to
 *  running without telemetry rather than blocking the user. */
export async function startRun(
  canvasId: string,
  estimatedCostCents: number,
  nodeCount?: number,
  headers?: Record<string, string>,
): Promise<{ runId: string }> {
  const res = await postJson(
    `/api/canvas/${canvasId}/runs`,
    { estimatedCostCents, nodeCount },
    headers,
  )
  if (!res.ok) {
    throw new Error(`startRun failed: ${res.status}`)
  }
  const json = (await res.json()) as { run: { id: string } }
  return { runId: json.run.id }
}

/** Fire-and-forget per-node recording. Errors are logged and swallowed. */
export function recordNode(
  canvasId: string,
  runId: string,
  payload: RecordNodePayload,
  headers?: Record<string, string>,
): Promise<void> {
  return postJson(
    `/api/canvas/${canvasId}/runs/${runId}/nodes`,
    payload,
    headers,
  )
    .then(async (res) => {
      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.warn('[run-recorder] recordNode non-2xx:', res.status)
      }
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[run-recorder] recordNode failed:', err)
    })
}

/** Fire-and-forget run finalization. Errors are logged and swallowed. */
export function finishRun(
  canvasId: string,
  runId: string,
  payload: FinishRunPayload,
  headers?: Record<string, string>,
): Promise<void> {
  return patchJson(
    `/api/canvas/${canvasId}/runs/${runId}`,
    payload,
    headers,
  )
    .then(async (res) => {
      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.warn('[run-recorder] finishRun non-2xx:', res.status)
      }
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[run-recorder] finishRun failed:', err)
    })
}

// ---------------------------------------------------------------------------
// Read helpers (for the history sheet)
// ---------------------------------------------------------------------------

export interface CanvasRunSummary {
  id: string
  canvas_id: string
  user_id: string
  status: RunStatus
  started_at: string
  ended_at: string | null
  estimated_cost_cents: number
  actual_cost_cents: number
  node_count: number
}

export interface CanvasRunNodeDetail {
  id: string
  run_id: string
  canvas_node_id: string | null
  client_node_id: string
  generation_id: string | null
  status: RunNodeStatus
  cost_cents: number
  started_at: string | null
  ended_at: string | null
  error: string | null
}

export interface CanvasRunDetail {
  run: CanvasRunSummary
  nodes: CanvasRunNodeDetail[]
  generations: Record<
    string,
    {
      id: string
      output_urls: string[] | null
      replicate_status: string | null
      cost_cents: number | null
    }
  >
}

export async function listRuns(
  canvasId: string,
  headers?: Record<string, string>,
): Promise<CanvasRunSummary[]> {
  const res = await fetch(`/api/canvas/${canvasId}/runs`, {
    credentials: 'include',
    headers: mergeHeaders(headers),
  })
  if (!res.ok) throw new Error(`listRuns failed: ${res.status}`)
  const json = (await res.json()) as { runs: CanvasRunSummary[] }
  return json.runs || []
}

export async function getRun(
  canvasId: string,
  runId: string,
  headers?: Record<string, string>,
): Promise<CanvasRunDetail> {
  const res = await fetch(`/api/canvas/${canvasId}/runs/${runId}`, {
    credentials: 'include',
    headers: mergeHeaders(headers),
  })
  if (!res.ok) throw new Error(`getRun failed: ${res.status}`)
  return (await res.json()) as CanvasRunDetail
}
