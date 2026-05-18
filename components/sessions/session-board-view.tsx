'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ImageIcon,
  Video,
  Download,
  RefreshCw,
  Check,
  Circle,
  Loader2,
  Play,
  Package,
  Music,
  Target,
  Smartphone,
  LucideIcon,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Session, SessionAsset, SessionAssetTemplate } from '@/lib/types'
import { getSessionTemplate } from '@/lib/sessions/session-templates'
import { toast } from 'sonner'

// Map icon names to lucide components
const iconMap: Record<string, LucideIcon> = {
  Package,
  Music,
  Target,
  Smartphone,
}

function getIcon(iconName: string): LucideIcon {
  return iconMap[iconName] || Package
}

interface SessionBoardViewProps {
  session: Session
  selectedAssetId: string | null
  onSelectAsset: (asset: SessionAsset) => void
  onDownloadAsset?: (asset: SessionAsset) => void
  onRegenerateAsset?: (asset: SessionAsset) => void
}

/**
 * Session Board View - Interactive Visual Grid
 *
 * Displays all session assets in a visual grid layout with:
 * - Completed assets showing generated images
 * - Pending assets showing placeholders with aspect ratio info
 * - Generating assets showing spinner
 * - Hover actions for download/regenerate
 * - Click to focus on asset in chat
 */
export function SessionBoardView({
  session,
  selectedAssetId,
  onSelectAsset,
  onDownloadAsset,
  onRegenerateAsset,
}: SessionBoardViewProps) {
  const [hoveredAssetId, setHoveredAssetId] = useState<string | null>(null)

  const template = getSessionTemplate(session.templateId)

  // Get template info for each asset
  const getAssetTemplate = (asset: SessionAsset): SessionAssetTemplate | undefined => {
    return template?.assets.find(a => a.id === asset.templateAssetId)
  }

  // Determine grid columns based on aspect ratios
  const aspectRatioClass = (ratio: string | undefined) => {
    switch (ratio) {
      case '9:16': return 'aspect-[9/16]'
      case '4:5': return 'aspect-[4/5]'
      case '3:4': return 'aspect-[3/4]'
      case '16:9': return 'aspect-video'
      case '21:9': return 'aspect-[21/9]'
      case '1:1':
      default: return 'aspect-square'
    }
  }

  const handleDownload = async (e: React.MouseEvent, asset: SessionAsset) => {
    e.stopPropagation()
    if (!asset.outputUrl) return

    try {
      const response = await fetch(asset.outputUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${asset.name.replace(/[^a-z0-9]/gi, '_')}.${blob.type.includes('video') ? 'mp4' : 'png'}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      toast.success(`${asset.name} downloaded!`)
    } catch (error) {
      toast.error('Failed to download')
    }
  }

  const handleRegenerate = (e: React.MouseEvent, asset: SessionAsset) => {
    e.stopPropagation()
    onRegenerateAsset?.(asset)
  }

  // Count completed and total
  const completed = session.assets.filter(a => a.status === 'completed').length
  const total = session.assets.length
  const required = template?.assets.filter(a => a.required).length || 0
  const requiredCompleted = session.assets.filter(a => {
    const tpl = getAssetTemplate(a)
    return tpl?.required && a.status === 'completed'
  }).length

  return (
    <div className="flex flex-col h-full">
      {/* Progress Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-white/[0.04]">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-white/70">Session Progress</h3>
          <span className="text-xs text-white/50">
            {completed}/{total} assets
          </span>
        </div>
        <div className="w-full h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(completed / total) * 100}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="h-full bg-gradient-to-r from-skinny-yellow to-skinny-lime rounded-full"
          />
        </div>
        <div className="flex items-center gap-4 mt-2">
          <span className="text-xs text-white/40">
            Required: {requiredCompleted}/{required}
          </span>
          {requiredCompleted === required && (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <Check size={12} />
              Session complete
            </span>
          )}
        </div>
      </div>

      {/* Asset Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {session.assets.map((asset) => {
            const assetTemplate = getAssetTemplate(asset)
            const isSelected = selectedAssetId === asset.id
            const isHovered = hoveredAssetId === asset.id
            const isVideo = assetTemplate?.mediaType === 'video'

            return (
              <motion.div
                key={asset.id}
                layoutId={asset.id}
                onClick={() => onSelectAsset(asset)}
                onMouseEnter={() => setHoveredAssetId(asset.id)}
                onMouseLeave={() => setHoveredAssetId(null)}
                className={cn(
                  "relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-200",
                  "bg-white/[0.03] border",
                  asset.status === 'completed' && "border-green-500/20",
                  asset.status === 'pending' && "border-white/[0.06]",
                  asset.status === 'generating' && "border-skinny-yellow/30",
                  isSelected && "ring-2 ring-skinny-yellow ring-offset-2 ring-offset-black",
                  isHovered && !isSelected && "border-white/[0.15] scale-[1.02]"
                )}
              >
                {/* Asset Content */}
                <div className={cn("w-full", aspectRatioClass(assetTemplate?.aspectRatio))}>
                  {/* Completed: Show generated image/video */}
                  {asset.status === 'completed' && asset.outputUrl && (
                    <div className="relative w-full h-full">
                      {isVideo ? (
                        <video
                          src={asset.outputUrl}
                          className="w-full h-full object-cover"
                          loop
                          muted
                          playsInline
                          onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
                          onMouseLeave={(e) => {
                            const video = e.target as HTMLVideoElement
                            video.pause()
                            video.currentTime = 0
                          }}
                        />
                      ) : (
                        <img
                          src={asset.outputUrl}
                          alt={asset.name}
                          className="w-full h-full object-cover"
                        />
                      )}
                      {/* Completed checkmark */}
                      <div className="absolute top-2 right-2 p-1.5 rounded-full bg-green-500/90">
                        <Check size={12} className="text-white" />
                      </div>
                    </div>
                  )}

                  {/* Pending: Show placeholder */}
                  {asset.status === 'pending' && (
                    <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                      <div className="w-12 h-12 rounded-xl bg-white/[0.05] flex items-center justify-center mb-3">
                        {isVideo ? (
                          <Video size={24} className="text-white/30" />
                        ) : (
                          <ImageIcon size={24} className="text-white/30" />
                        )}
                      </div>
                      <p className="text-sm font-medium text-white/70 mb-1">
                        {assetTemplate?.name || asset.name}
                      </p>
                      <p className="text-xs text-white/40">
                        {assetTemplate?.aspectRatio}
                      </p>
                      {assetTemplate?.required && (
                        <span className="mt-2 px-2 py-0.5 text-[10px] bg-skinny-yellow/10 text-skinny-yellow rounded-full">
                          Required
                        </span>
                      )}
                    </div>
                  )}

                  {/* Generating: Show spinner */}
                  {asset.status === 'generating' && (
                    <div className="flex flex-col items-center justify-center h-full p-4">
                      <Loader2 size={32} className="animate-spin text-skinny-yellow mb-3" />
                      <p className="text-sm font-medium text-white/70">Generating...</p>
                      <p className="text-xs text-white/40">{assetTemplate?.name}</p>
                    </div>
                  )}
                </div>

                {/* Hover Overlay with Actions */}
                <AnimatePresence>
                  {isHovered && asset.status !== 'generating' && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center gap-2"
                    >
                      {asset.status === 'completed' && (
                        <>
                          <button
                            onClick={(e) => handleDownload(e, asset)}
                            className="p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
                            title="Download"
                          >
                            <Download size={18} className="text-white" />
                          </button>
                          {onRegenerateAsset && (
                            <button
                              onClick={(e) => handleRegenerate(e, asset)}
                              className="p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
                              title="Regenerate"
                            >
                              <RefreshCw size={18} className="text-white" />
                            </button>
                          )}
                        </>
                      )}
                      {asset.status === 'pending' && (
                        <button
                          onClick={() => onSelectAsset(asset)}
                          className="px-4 py-2 rounded-xl bg-skinny-yellow text-black font-medium text-sm flex items-center gap-2 hover:bg-skinny-lime transition-colors"
                        >
                          <Sparkles size={16} />
                          Start Creating
                        </button>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
