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
        // 1) probe duration locally
        const objectUrl = URL.createObjectURL(file)
        const duration = await probeAudioDuration(objectUrl)

        // 2) request signed upload (backend agent owns this route)
        let uploadUrl: string | undefined
        let publicUrl = objectUrl // fallback if server unavailable
        try {
          const initRes = await fetch(`/api/canvas/${canvasId}/timeline/upload`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              filename: file.name,
              contentType: file.type,
              kind: 'audio',
            }),
          })
          if (initRes.ok) {
            const json = (await initRes.json()) as { uploadUrl?: string; publicUrl?: string }
            uploadUrl = json.uploadUrl
            if (json.publicUrl) publicUrl = json.publicUrl
          }
        } catch {
          /* backend not ready yet — degrade to local object URL */
        }

        // 3) put bytes (if we got a signed URL)
        if (uploadUrl) {
          try {
            await fetch(uploadUrl, {
              method: 'PUT',
              headers: { 'content-type': file.type },
              body: file,
            })
          } catch (err) {
            console.warn('[timeline] direct upload failed', err)
          }
        }

        // 4) finalize
        let upload: TimelineUpload = {
          id: newUploadId(),
          kind: 'audio',
          url: publicUrl,
          filename: file.name,
          durationSeconds: duration,
          createdAt: new Date().toISOString(),
          sizeBytes: file.size,
        }
        try {
          const finRes = await fetch(`/api/canvas/${canvasId}/timeline/upload/finalize`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(upload),
          })
          if (finRes.ok) {
            const json = (await finRes.json()) as { upload?: TimelineUpload }
            if (json.upload) upload = json.upload
          }
        } catch {
          /* keep local upload record */
        }

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
