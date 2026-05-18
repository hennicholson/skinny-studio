'use client'

// Audio upload affordance. Drag/drop or click to pick. Validates type,
// probes duration via <audio>, posts to the upload finalize API, then adds
// a TimelineClip + TimelineUpload to the timeline.

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import { Loader2, Music, UploadCloud } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  type Timeline,
  type TimelineClip,
  type TimelineTrack,
  type TimelineUpload,
  newUploadId,
} from '@/lib/timeline/ir'
import { nextClipStartOnTrack } from '@/lib/timeline/use-timeline'

export interface TimelineAudioUploaderProps {
  canvasId: string
  timeline: Timeline
  onUploadAdded(upload: TimelineUpload): void
  onClipAdded(clip: Omit<TimelineClip, 'id'>): void
  /** Whop auth headers — required so /upload + /upload/finalize don't 401. */
  getWhopHeaders: () => Record<string, string>
  /** Optional: receives the imperative "pick file" trigger so other parts
   *  of the editor (e.g. the library panel's + button) can open the picker
   *  without owning a hidden <input>. */
  ref?: MutableRefObject<(() => void) | (() => void)> | { current: () => void }
}

export function TimelineAudioUploader({
  canvasId,
  timeline,
  onUploadAdded,
  onClipAdded,
  getWhopHeaders,
  ref,
}: TimelineAudioUploaderProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const audioTrack: TimelineTrack | undefined = timeline.tracks.find((t) => t.kind === 'audio')

  const onPick = useCallback(() => {
    fileRef.current?.click()
  }, [])

  // Expose the picker to external triggers.
  useEffect(() => {
    if (ref && 'current' in ref) {
      ref.current = onPick
    }
  }, [ref, onPick])

  const handleFile = useCallback(
    async (file: File) => {
      if (!audioTrack) {
        toast.error('No audio track available')
        return
      }
      if (!file.type.startsWith('audio/')) {
        toast.error('Please pick an audio file')
        return
      }
      setBusy(true)
      try {
        // 1) probe duration locally first (need it before finalize).
        const objectUrl = URL.createObjectURL(file)
        const duration = await probeAudioDuration(objectUrl)

        // 2) ask the server to mint a signed upload URL.
        //    Contract: POST /upload {filename, contentType} →
        //    {uploadId, timelineId, bucket, storagePath, signedUrl, token, contentType}
        const initRes = await fetch(`/api/canvas/${canvasId}/timeline/upload`, {
          method: 'POST',
          headers: getWhopHeaders(),
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
          }),
        })
        if (!initRes.ok) {
          const text = await initRes.text().catch(() => '')
          throw new Error(`Upload init failed (${initRes.status}). ${text || ''}`)
        }
        const initJson = (await initRes.json()) as {
          uploadId?: string
          timelineId?: string
          bucket?: string
          storagePath?: string
          signedUrl?: string
        }
        if (!initJson.signedUrl || !initJson.storagePath) {
          throw new Error('Server returned an invalid upload URL.')
        }

        // 3) PUT the file bytes to Supabase Storage at the signed URL.
        const putRes = await fetch(initJson.signedUrl, {
          method: 'PUT',
          headers: { 'content-type': file.type },
          body: file,
        })
        if (!putRes.ok) {
          throw new Error(`Storage upload failed (${putRes.status}).`)
        }

        // 4) finalize — server verifies the bytes landed, inserts the
        //    canvas_timeline_uploads row, returns a signed playback URL.
        //    Contract: POST /upload/finalize
        //    {storagePath, filename, contentType, durationSeconds, sizeBytes}
        //    → {upload: TimelineUpload}
        const finRes = await fetch(`/api/canvas/${canvasId}/timeline/upload/finalize`, {
          method: 'POST',
          headers: getWhopHeaders(),
          body: JSON.stringify({
            storagePath: initJson.storagePath,
            filename: file.name,
            contentType: file.type,
            durationSeconds: duration,
            sizeBytes: file.size,
          }),
        })
        if (!finRes.ok) {
          const text = await finRes.text().catch(() => '')
          throw new Error(`Finalize failed (${finRes.status}). ${text || ''}`)
        }
        const finJson = (await finRes.json()) as { upload?: TimelineUpload }
        if (!finJson.upload) {
          throw new Error('Server confirmed upload but returned no metadata.')
        }
        const upload: TimelineUpload = {
          ...finJson.upload,
          // Backend's TimelineUpload lacks `kind`; tag it audio for the UI.
          kind: 'audio',
        }
        // We can now release the local probe URL.
        URL.revokeObjectURL(objectUrl)

        onUploadAdded(upload)

        // 5) Append a new audio clip at the end of the audio track
        onClipAdded({
          trackId: audioTrack.id,
          source: { kind: 'upload', uploadId: upload.id },
          sourceUrl: upload.url,
          sourceStart: 0,
          sourceEnd: upload.durationSeconds,
          timelineStart: nextClipStartOnTrack(timeline, audioTrack.id),
          volume: 1,
          muted: false,
        })
        toast.success(`Added ${file.name}`)
      } catch (err) {
        console.error('[timeline] audio upload failed', err)
        toast.error('Audio upload failed')
      } finally {
        setBusy(false)
      }
    },
    [audioTrack, canvasId, onClipAdded, onUploadAdded, timeline],
  )

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border border-dashed border-white/10 px-3 py-2',
        'transition-colors',
        dragOver && 'border-skinny-green/60 bg-skinny-green/[0.06]',
      )}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const file = e.dataTransfer.files?.[0]
        if (file) void handleFile(file)
      }}
    >
      <Music className="h-4 w-4 text-white/40" />
      <span className="text-xs text-white/60">Drop audio or</span>
      <button
        type="button"
        onClick={onPick}
        disabled={busy}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-white/80',
          'hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-skinny-green/60 outline-none',
          'disabled:opacity-50',
        )}
        aria-label="Upload audio file"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <UploadCloud className="h-3 w-3" />}
        upload
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleFile(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}

function probeAudioDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement('audio')
    audio.preload = 'metadata'
    audio.src = url
    const onLoaded = () => {
      const d = audio.duration
      cleanup()
      resolve(Number.isFinite(d) ? d : 0)
    }
    const onError = () => {
      cleanup()
      reject(new Error('Could not probe audio'))
    }
    function cleanup() {
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('error', onError)
    }
    audio.addEventListener('loadedmetadata', onLoaded, { once: true })
    audio.addEventListener('error', onError, { once: true })
  })
}
