'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle2,
  Download,
  Share2,
  ArrowLeft,
  Sparkles,
  ImageIcon,
  Video,
  ExternalLink,
  Package,
  Music,
  Target,
  Smartphone,
  LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Session, SessionAsset } from '@/lib/types'
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

interface SessionCompleteViewProps {
  session: Session
  onBack: () => void
  onContinue?: () => void
}

/**
 * Session Complete Gallery View
 *
 * Beautiful grid display of all completed assets from a session.
 * Features:
 * - Animated entry with celebration effects
 * - Grid of completed assets with thumbnails
 * - Download individual or all assets
 * - Share session link
 * - Option to continue with optional assets
 */
export function SessionCompleteView({ session, onBack, onContinue }: SessionCompleteViewProps) {
  const [selectedAsset, setSelectedAsset] = useState<SessionAsset | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)

  const template = getSessionTemplate(session.templateId)
  const completedAssets = session.assets.filter(a => a.status === 'completed' && a.outputUrl)
  const pendingOptional = session.assets.filter(a => a.status === 'pending')

  // Get template info for each asset
  const getAssetTemplate = (asset: SessionAsset) => {
    return template?.assets.find(a => a.id === asset.templateAssetId)
  }

  const handleDownloadAll = async () => {
    if (isDownloading) return
    setIsDownloading(true)

    try {
      // Download each asset
      for (const asset of completedAssets) {
        if (asset.outputUrl) {
          const response = await fetch(asset.outputUrl)
          const blob = await response.blob()
          const url = window.URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `${session.title.replace(/[^a-z0-9]/gi, '_')}_${asset.name.replace(/[^a-z0-9]/gi, '_')}.${blob.type.includes('video') ? 'mp4' : 'png'}`
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          window.URL.revokeObjectURL(url)
          // Small delay between downloads
          await new Promise(r => setTimeout(r, 500))
        }
      }
      toast.success('All assets downloaded!')
    } catch (error) {
      console.error('Download error:', error)
      toast.error('Failed to download some assets')
    } finally {
      setIsDownloading(false)
    }
  }

  const handleDownloadSingle = async (asset: SessionAsset) => {
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
      console.error('Download error:', error)
      toast.error('Failed to download asset')
    }
  }

  const handleShare = async () => {
    try {
      // For now, just copy a summary to clipboard
      const summary = `🎨 ${session.title}\n\nCreated ${completedAssets.length} assets with Skinny Studio:\n${completedAssets.map(a => `• ${a.name}`).join('\n')}\n\nMade with ✨ skinny.studio`
      await navigator.clipboard.writeText(summary)
      toast.success('Session summary copied to clipboard!')
    } catch (error) {
      toast.error('Failed to copy')
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-black overflow-hidden">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-shrink-0 border-b border-white/[0.04] bg-zinc-900/80 backdrop-blur-xl"
      >
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/[0.05] transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            {(() => {
              const iconName = template?.icon || 'Package'
              const Icon = getIcon(iconName)
              return (
                <div className="p-3 rounded-xl bg-gradient-to-br from-green-500/20 to-green-600/10 border border-green-500/20">
                  <Icon size={24} className="text-green-400" />
                </div>
              )
            })()}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-white">{session.title}</h1>
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs font-medium">
                  <CheckCircle2 size={12} />
                  <span>Complete</span>
                </div>
              </div>
              <p className="text-sm text-white/50">
                {completedAssets.length} assets created • {template?.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleShare}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-white/70 hover:text-white hover:bg-white/[0.05] transition-all"
            >
              <Share2 size={16} />
              <span className="text-sm">Share</span>
            </button>
            <button
              onClick={handleDownloadAll}
              disabled={isDownloading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-skinny-yellow text-black font-medium hover:bg-skinny-lime transition-all shadow-lg shadow-skinny-yellow/20 disabled:opacity-50"
            >
              <Download size={16} />
              <span className="text-sm">{isDownloading ? 'Downloading...' : 'Download All'}</span>
            </button>
          </div>
        </div>
      </motion.div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Celebration Banner */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="mb-8 p-6 rounded-2xl bg-gradient-to-r from-green-500/10 via-skinny-yellow/5 to-green-500/10 border border-green-500/20"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-full bg-green-500/20">
              <Sparkles size={24} className="text-green-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Session Complete!</h2>
              <p className="text-white/60">
                You've created all required assets for your {template?.name || 'creative project'}.
                {pendingOptional.length > 0 && ` You can still create ${pendingOptional.length} optional asset${pendingOptional.length > 1 ? 's' : ''}.`}
              </p>
            </div>
            {pendingOptional.length > 0 && onContinue && (
              <button
                onClick={onContinue}
                className="ml-auto px-4 py-2 rounded-lg bg-white/[0.05] border border-white/[0.1] text-white hover:bg-white/[0.08] transition-all"
              >
                Continue Creating
              </button>
            )}
          </div>
        </motion.div>

        {/* Asset Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <AnimatePresence>
            {completedAssets.map((asset, index) => {
              const assetTemplate = getAssetTemplate(asset)
              const isVideo = assetTemplate?.modelSuggestion?.includes('veo') || assetTemplate?.modelSuggestion?.includes('wan')

              return (
                <motion.div
                  key={asset.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + index * 0.05 }}
                  className={cn(
                    "group relative rounded-2xl overflow-hidden bg-zinc-900/50 border border-white/[0.06] transition-all duration-300",
                    "hover:border-skinny-yellow/30 hover:shadow-xl hover:shadow-skinny-yellow/10",
                    selectedAsset?.id === asset.id && "ring-2 ring-skinny-yellow"
                  )}
                  onClick={() => setSelectedAsset(asset)}
                >
                  {/* Thumbnail */}
                  <div className="relative aspect-square">
                    {asset.outputUrl && (
                      isVideo ? (
                        <video
                          src={asset.outputUrl}
                          className="w-full h-full object-cover"
                          muted
                          loop
                          playsInline
                          onMouseEnter={(e) => e.currentTarget.play()}
                          onMouseLeave={(e) => {
                            e.currentTarget.pause()
                            e.currentTarget.currentTime = 0
                          }}
                        />
                      ) : (
                        <img
                          src={asset.outputUrl}
                          alt={asset.name}
                          className="w-full h-full object-cover"
                        />
                      )
                    )}

                    {/* Type Badge */}
                    <div className="absolute top-3 left-3">
                      <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-black/60 backdrop-blur-sm text-white/80 text-xs">
                        {isVideo ? <Video size={12} /> : <ImageIcon size={12} />}
                        <span>{assetTemplate?.aspectRatio}</span>
                      </div>
                    </div>

                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDownloadSingle(asset)
                        }}
                        className="p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
                      >
                        <Download size={20} className="text-white" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (asset.outputUrl) {
                            window.open(asset.outputUrl, '_blank')
                          }
                        }}
                        className="p-3 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
                      >
                        <ExternalLink size={20} className="text-white" />
                      </button>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <h3 className="font-medium text-white truncate">{asset.name}</h3>
                    <p className="text-xs text-white/40 mt-1 truncate">
                      {assetTemplate?.modelSuggestion}
                    </p>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>

        {/* Optional Assets Section */}
        {pendingOptional.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-8 pt-8 border-t border-white/[0.06]"
          >
            <h3 className="text-lg font-medium text-white/70 mb-4">Optional Assets</h3>
            <div className="flex flex-wrap gap-3">
              {pendingOptional.map((asset) => {
                const assetTemplate = getAssetTemplate(asset)
                return (
                  <div
                    key={asset.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.06] text-white/50"
                  >
                    <ImageIcon size={14} />
                    <span className="text-sm">{asset.name}</span>
                    <span className="text-xs text-white/30">{assetTemplate?.aspectRatio}</span>
                  </div>
                )
              })}
            </div>
            {onContinue && (
              <button
                onClick={onContinue}
                className="mt-4 px-4 py-2 rounded-lg bg-skinny-yellow/10 text-skinny-yellow hover:bg-skinny-yellow/20 transition-all"
              >
                Create Optional Assets
              </button>
            )}
          </motion.div>
        )}
      </div>

      {/* Selected Asset Modal */}
      <AnimatePresence>
        {selectedAsset && selectedAsset.outputUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-8"
            onClick={() => setSelectedAsset(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-4xl max-h-[80vh] rounded-2xl overflow-hidden bg-zinc-900 border border-white/[0.1] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {getAssetTemplate(selectedAsset)?.modelSuggestion?.includes('veo') || getAssetTemplate(selectedAsset)?.modelSuggestion?.includes('wan') ? (
                <video
                  src={selectedAsset.outputUrl}
                  className="max-w-full max-h-[70vh] object-contain"
                  controls
                  autoPlay
                  loop
                />
              ) : (
                <img
                  src={selectedAsset.outputUrl}
                  alt={selectedAsset.name}
                  className="max-w-full max-h-[70vh] object-contain"
                />
              )}
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-white">{selectedAsset.name}</h3>
                    <p className="text-xs text-white/50">{getAssetTemplate(selectedAsset)?.description}</p>
                  </div>
                  <button
                    onClick={() => handleDownloadSingle(selectedAsset)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-skinny-yellow text-black font-medium hover:bg-skinny-lime transition-all"
                  >
                    <Download size={16} />
                    Download
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default SessionCompleteView
