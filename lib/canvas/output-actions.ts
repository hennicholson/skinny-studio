// Pure helpers for output-asset side actions (copy URL, download, save to
// library, publish to gallery). These are intentionally framework-agnostic —
// no React, no hooks — so the OutputActions UI layer can stay thin and so
// future surfaces (e.g. a context menu, a keyboard-driven palette, automated
// post-run hooks) can reuse the same primitives.
//
// All async helpers return a discriminated `{ ok, error? }` shape rather than
// throwing for the network ones. Reasoning: the caller is almost always going
// to render a toast either way, and try/catch around each call site creates
// noise. The two purely client-side helpers (copyUrl, downloadAsset) DO throw
// — that's a programmer/permission error worth surfacing to a higher boundary.

/**
 * Copy a URL string to the clipboard via the async Clipboard API.
 *
 * Throws if the Clipboard API is unavailable (older browsers, insecure
 * contexts) or if the user has denied clipboard-write permission. We do NOT
 * fall back to the deprecated `document.execCommand('copy')` path because the
 * Skinny canvas target browsers (Whop iframe, evergreen Chromium) all support
 * the modern API; a thrown error gives the caller cleaner UX hooks than a
 * silent failure.
 */
export async function copyUrl(url: string): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    throw new Error('Clipboard API not available in this environment')
  }
  await navigator.clipboard.writeText(url)
}

/**
 * Download a remote asset by fetching it as a Blob and triggering a synthetic
 * anchor click. Using a blob (vs. setting `a.download` against the remote URL
 * directly) is required for cross-origin URLs — most browsers ignore the
 * `download` attribute when the href is on a different origin, and instead
 * navigate to the URL in a new tab. Blob URLs are same-origin to the page so
 * the rename always sticks.
 *
 * @param url       The asset URL to download.
 * @param filename  Optional filename suggestion. Defaults to the URL's
 *                  pathname basename, or `skinny-asset` if that's empty.
 */
export async function downloadAsset(url: string, filename?: string): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('downloadAsset must run in a browser context')
  }

  const res = await fetch(url, { mode: 'cors' })
  if (!res.ok) {
    throw new Error(`Failed to fetch asset (${res.status})`)
  }
  const blob = await res.blob()
  const blobUrl = URL.createObjectURL(blob)

  try {
    const inferred = (() => {
      try {
        const u = new URL(url)
        const base = u.pathname.split('/').pop()
        return base && base.length > 0 ? decodeURIComponent(base) : null
      } catch {
        return null
      }
    })()
    const finalName = filename || inferred || 'skinny-asset'

    const a = document.createElement('a')
    a.href = blobUrl
    a.download = finalName
    a.rel = 'noopener'
    // Append → click → remove keeps the DOM clean and works around Firefox
    // requiring the element to be in-tree for the click to fire.
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    // Revoke after a microtask so the browser has time to start the download
    // before we yank the blob URL. setTimeout(0) is sufficient.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 0)
  }
}

/**
 * Re-upload an asset URL into the user's Skinny Hub library by POSTing it to
 * `/api/upload-image` with `folder: 'hub'`. The upload route accepts a
 * base64-encoded payload (not a remote URL), so we first fetch the asset and
 * convert the blob to base64 in the browser.
 *
 * The upload route ONLY accepts images (validated MIME types). Videos will be
 * rejected by the server with a 400 — the caller should gate the UI button
 * accordingly.
 */
export async function saveToLibrary(
  url: string,
  headers: Record<string, string>,
): Promise<{ ok: boolean; error?: string; generationId?: string }> {
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) {
      return { ok: false, error: `Failed to fetch asset (${res.status})` }
    }
    const blob = await res.blob()
    const mimeType = blob.type || 'image/png'
    const base64 = await blobToBase64(blob)

    // Filename from the URL path, falling back to a timestamped name.
    const filename = (() => {
      try {
        const u = new URL(url)
        const base = u.pathname.split('/').pop()
        if (base && base.length > 0) return decodeURIComponent(base)
      } catch {
        // ignore
      }
      return `canvas-${Date.now()}.${extFromMime(mimeType)}`
    })()

    const uploadRes = await fetch('/api/upload-image', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        base64,
        mimeType,
        filename,
        folder: 'hub',
      }),
    })

    if (!uploadRes.ok) {
      const errBody = await safeJson(uploadRes)
      return { ok: false, error: errBody?.error || `Upload failed (${uploadRes.status})` }
    }
    const data = await uploadRes.json()
    return { ok: true, generationId: data?.generationId }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Save failed' }
  }
}

/**
 * Publish a generation to the public Creator Gallery via
 * `/api/gallery/publish`. The gallery route requires a `generationId` (NOT a
 * raw URL) — it looks the generation up by id, verifies ownership, and
 * creates a gallery row. So the calling component must already have a
 * `generationId` available (typically from the executor's run metadata, or
 * from a fresh saveToLibrary call which returns one).
 *
 * @param url       The asset URL (currently unused server-side, kept here for
 *                  parity with the other helpers and for forward-compat with
 *                  a future "publish a raw URL" mode).
 * @param payload   Gallery metadata + the required generationId.
 * @param headers   Whop auth headers from `useWhopHeaders()`.
 */
export interface PublishPayload {
  generationId: string
  title?: string
  description?: string
  tags?: string[]
}

export async function publishToGallery(
  // Kept for API symmetry with the other helpers; not currently sent to the
  // server, but useful for caller-side logging and future endpoint variants.
  _url: string,
  payload: PublishPayload,
  headers: Record<string, string>,
): Promise<{ ok: boolean; postId?: string; error?: string }> {
  if (!payload?.generationId) {
    return { ok: false, error: 'Missing generationId — save to library first' }
  }
  try {
    const res = await fetch('/api/gallery/publish', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        generationId: payload.generationId,
        title: payload.title,
        description: payload.description,
        tags: payload.tags,
      }),
    })
    if (!res.ok) {
      const errBody = await safeJson(res)
      return { ok: false, error: errBody?.error || `Publish failed (${res.status})` }
    }
    const data = await res.json()
    return { ok: true, postId: data?.galleryId }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Publish failed' }
  }
}

// ---------- internal utilities ----------

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('FileReader returned non-string result'))
        return
      }
      // Strip the data URL prefix — the upload route expects raw base64.
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error || new Error('FileReader error'))
    reader.readAsDataURL(blob)
  })
}

function extFromMime(mime: string): string {
  if (mime.includes('png')) return 'png'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('gif')) return 'gif'
  if (mime.includes('mp4')) return 'mp4'
  if (mime.includes('webm')) return 'webm'
  return 'jpg'
}

async function safeJson(res: Response): Promise<any> {
  try {
    return await res.json()
  } catch {
    return null
  }
}
