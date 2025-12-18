'use client'

import { memo } from 'react'
import { Video, Images, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Generation } from '@/lib/context/generation-context'

// Helper to detect if a URL is a video
function isVideoUrl(url: string): boolean {
  const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv']
  const lowerUrl = url.toLowerCase()
  return videoExtensions.some(ext => lowerUrl.includes(ext))
}

// Helper to detect if a generation is a video
function isVideoGeneration(gen: Generation): boolean {
  if (gen.model_category === 'video') return true
  if (gen.output_urls?.some(url => isVideoUrl(url))) return true
  return false
}

interface GenerationItemProps {
  generation: Generation
  onClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
  dragHandlers: {
    draggable: true
    onDragStart: (e: React.DragEvent) => void
    onDragEnd: (e: React.DragEvent) => void
  }
}

export const GenerationItem = memo(function GenerationItem({
  generation,
  onClick,
  onContextMenu,
  dragHandlers,
}: GenerationItemProps) {
  const hasMultipleOutputs = generation.output_urls?.length > 1
  const isVideo = isVideoGeneration(generation)
  const firstUrl = generation.output_urls?.[0]

  if (hasMultipleOutputs) {
    return (
      <MultiImageItem
        generation={generation}
        onClick={onClick}
        onContextMenu={onContextMenu}
        dragHandlers={dragHandlers}
      />
    )
  }

  return (
    <div
      className="group relative aspect-square cursor-grab active:cursor-grabbing w-full"
      draggable={dragHandlers.draggable}
      onDragStart={dragHandlers.onDragStart}
      onDragEnd={dragHandlers.onDragEnd}
    >
      <div
        className={cn(
          "relative w-full h-full rounded-2xl overflow-hidden",
          "bg-zinc-900",
          "shadow-[0_4px_20px_rgba(0,0,0,0.35)]",
          "hover:shadow-[0_8px_30px_rgba(0,0,0,0.5)]",
          "hover:-translate-y-1",
          "active:scale-[0.98]",
          "transition-all duration-200 ease-out"
        )}
        onClick={onClick}
        onContextMenu={onContextMenu}
      >
        {/* Image/Video content */}
        <div className="absolute inset-0">
          {isVideo || isVideoUrl(firstUrl || '') ? (
            <>
              <video
                src={firstUrl}
                className="w-full h-full object-cover"
                muted
                playsInline
                preload="metadata"
              />
              {/* Video play overlay */}
              <div className="absolute inset-0 flex items-center justify-center bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <div className="w-14 h-14 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center shadow-xl border border-white/10">
                  <Play size={22} className="text-white ml-1" fill="white" />
                </div>
              </div>
            </>
          ) : (
            <img
              src={firstUrl}
              alt={generation.prompt || 'Generated image'}
              className="w-full h-full object-cover"
              loading="lazy"
              draggable={false}
            />
          )}
        </div>

        {/* Top gradient - subtle */}
        <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/40 via-black/20 to-transparent pointer-events-none opacity-80" />

        {/* Video badge */}
        {(isVideo || isVideoUrl(firstUrl || '')) && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/50 backdrop-blur-md shadow-lg border border-white/10">
            <Video size={13} className="text-white" />
            <span className="text-[11px] font-semibold text-white">Video</span>
          </div>
        )}

        {/* Model badge */}
        <div className="absolute top-3 right-3 px-2.5 py-1.5 rounded-lg bg-black/50 backdrop-blur-md shadow-lg border border-white/10">
          <span className="text-[10px] font-semibold text-white/90 uppercase tracking-wide">
            {generation.studio_models?.name || generation.model_slug}
          </span>
        </div>

        {/* Bottom gradient for prompt */}
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

        {/* Prompt text on hover */}
        <div className="absolute bottom-0 left-0 right-0 p-4 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-200 ease-out">
          <p className="text-[13px] text-white line-clamp-2 font-medium leading-relaxed">
            {generation.prompt?.slice(0, 100) || 'Untitled'}
          </p>
        </div>

        {/* Subtle inner border */}
        <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/[0.06] group-hover:ring-white/[0.1] transition-colors duration-200 pointer-events-none" />
      </div>
    </div>
  )
})

// Multi-image generation with 2x2 thumbnail grid
const MultiImageItem = memo(function MultiImageItem({
  generation,
  onClick,
  onContextMenu,
  dragHandlers,
}: GenerationItemProps) {
  const isVideo = isVideoGeneration(generation)
  const urls = generation.output_urls || []

  return (
    <div
      className="group relative aspect-square cursor-grab active:cursor-grabbing w-full"
      draggable={dragHandlers.draggable}
      onDragStart={dragHandlers.onDragStart}
      onDragEnd={dragHandlers.onDragEnd}
    >
      <div
        className={cn(
          "relative w-full h-full rounded-2xl overflow-hidden",
          "bg-zinc-900",
          "shadow-[0_4px_20px_rgba(0,0,0,0.35)]",
          "hover:shadow-[0_8px_30px_rgba(0,0,0,0.5)]",
          "hover:-translate-y-1",
          "active:scale-[0.98]",
          "transition-all duration-200 ease-out"
        )}
        onClick={onClick}
        onContextMenu={onContextMenu}
      >
        {/* 2x2 grid of thumbnails */}
        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-[2px] p-[2px] bg-zinc-800/50">
          {urls.slice(0, 4).map((url, idx) => {
            const urlIsVideo = isVideoUrl(url) || isVideo
            return (
              <div key={idx} className="relative overflow-hidden bg-zinc-900 rounded-sm">
                {urlIsVideo ? (
                  <video
                    src={url}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <img
                    src={url}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                    draggable={false}
                  />
                )}
                {urlIsVideo && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Play size={14} className="text-white" fill="white" />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Top gradient */}
        <div className="absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/50 to-transparent pointer-events-none" />

        {/* Multi-image badge */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-skinny-yellow to-skinny-green shadow-lg">
          <Images size={13} className="text-black" />
          <span className="text-[11px] font-bold text-black">{urls.length}</span>
        </div>

        {/* Model badge */}
        <div className="absolute top-3 right-3 px-2.5 py-1.5 rounded-lg bg-black/50 backdrop-blur-md shadow-lg border border-white/10">
          <span className="text-[10px] font-semibold text-white/90 uppercase tracking-wide">
            {generation.studio_models?.name || generation.model_slug}
          </span>
        </div>

        {/* Video indicator if applicable */}
        {isVideo && (
          <div className="absolute top-12 left-3 flex items-center gap-1 px-2 py-1 rounded-md bg-black/50 backdrop-blur-md border border-white/10">
            <Video size={11} className="text-white" />
          </div>
        )}

        {/* Bottom gradient for prompt */}
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

        {/* Prompt text on hover */}
        <div className="absolute bottom-0 left-0 right-0 p-4 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-200 ease-out">
          <p className="text-[13px] text-white line-clamp-2 font-medium leading-relaxed">
            {generation.prompt?.slice(0, 100) || 'Untitled'}
          </p>
        </div>

        {/* Subtle inner border */}
        <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/[0.06] group-hover:ring-white/[0.1] transition-colors duration-200 pointer-events-none" />
      </div>
    </div>
  )
})
