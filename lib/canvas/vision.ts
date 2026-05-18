// Canvas vision-context helper.
//
// When the user adds a reference image to a canvas node — by upload, by URL
// paste, by Hub pick, or by drag-from-another-node — we run it through the
// existing `/api/analyze-image` Gemini-vision endpoint so the Director chat
// SEES what the image contains, not just its URL. The result is stored on
// the node's `data.visionContext` and surfaced in the canvas description
// fed to the Director on every turn.
//
// /api/analyze-image is cached server-side by (url, purpose) so re-analyzing
// the same Skinny Hub asset across multiple canvases is a cheap lookup.

export type VisionPurpose =
  | 'reference'
  | 'starting_frame'
  | 'edit_target'
  | 'last_frame'
  | 'analyze'

export async function analyzeReferenceImage(
  url: string,
  opts: {
    getHeaders: () => Record<string, string>
    /** Defaults to 'reference' — the canvas reference-image node is most
        commonly a style/content guide, not a starting frame. The Director
        can disambiguate via wiring + node title. */
    purpose?: VisionPurpose
    signal?: AbortSignal
  },
): Promise<{ ok: true; analysis: string; cached: boolean } | { ok: false; error: string }> {
  if (!url) return { ok: false, error: 'No URL' }
  try {
    const res = await fetch('/api/analyze-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...opts.getHeaders() },
      body: JSON.stringify({ imageUrl: url, purpose: opts.purpose || 'reference' }),
      signal: opts.signal,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data?.success) {
      return { ok: false, error: data?.error || `HTTP ${res.status}` }
    }
    return {
      ok: true,
      analysis: typeof data.analysis === 'string' ? data.analysis : '',
      cached: !!data.cached,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}
