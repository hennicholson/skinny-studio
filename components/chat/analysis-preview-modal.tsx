'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { X, Image as ImageIcon, Video, Pencil, Film, RefreshCw, Check, Sparkles, Loader2 } from 'lucide-react'
import { ImagePurpose, IMAGE_PURPOSE_LABELS } from '@/lib/context/chat-context'
import { cn } from '@/lib/utils'

interface AnalysisPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (purpose: ImagePurpose) => void
  onReanalyze: () => void
  imageUrl: string
  imageName: string
  analysis: string
  isLoading?: boolean
}

// Final purpose options (excludes 'analyze' since we're past that step)
const FINAL_PURPOSE_OPTIONS: Array<{
  purpose: ImagePurpose
  key: string
  icon: typeof ImageIcon
  color: string
  label: string
}> = [
  { purpose: 'reference', key: 'R', icon: ImageIcon, color: 'text-blue-400 bg-blue-500/10 border-blue-500/30', label: 'Reference' },
  { purpose: 'starting_frame', key: 'S', icon: Video, color: 'text-purple-400 bg-purple-500/10 border-purple-500/30', label: 'Start Frame' },
  { purpose: 'edit_target', key: 'E', icon: Pencil, color: 'text-orange-400 bg-orange-500/10 border-orange-500/30', label: 'Edit' },
  { purpose: 'last_frame', key: 'L', icon: Film, color: 'text-green-400 bg-green-500/10 border-green-500/30', label: 'End Frame' },
]

export function AnalysisPreviewModal({
  isOpen,
  onClose,
  onConfirm,
  onReanalyze,
  imageUrl,
  imageName,
  analysis,
  isLoading = false,
}: AnalysisPreviewModalProps) {

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal Container - Full screen flex centering */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', duration: 0.3 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col w-full max-w-lg max-h-[85vh] pointer-events-auto">
              {/* Header */}
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Sparkles size={18} className="text-cyan-400" />
                  <h3 className="text-white font-semibold">Image Analysis</h3>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  <X size={18} className="text-zinc-400" />
                </button>
              </div>

              {/* Content - Scrollable */}
              <div className="flex-1 overflow-y-auto">
                {/* Image Preview */}
                <div className="p-4 flex justify-center border-b border-zinc-800">
                  <div className="relative w-32 h-32 rounded-xl overflow-hidden bg-zinc-800">
                    <img
                      src={imageUrl}
                      alt={imageName}
                      className="w-full h-full object-cover"
                    />
                    {isLoading && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <Loader2 size={24} className="text-cyan-400 animate-spin" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Analysis Result */}
                <div className="p-4 border-b border-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-cyan-400 uppercase tracking-wide">Analysis</span>
                    <button
                      onClick={onReanalyze}
                      disabled={isLoading}
                      className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
                    >
                      <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
                      Re-analyze
                    </button>
                  </div>
                  {isLoading ? (
                    <div className="flex items-center gap-2 text-zinc-400 py-4">
                      <Loader2 size={16} className="animate-spin" />
                      <span className="text-sm">Analyzing image...</span>
                    </div>
                  ) : (
                    <div className="bg-zinc-800/50 rounded-xl p-3 max-h-48 overflow-y-auto">
                      <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
                        {analysis || 'No analysis available.'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Purpose Selection */}
                <div className="p-4">
                  <p className="text-xs font-medium text-zinc-400 mb-3">
                    Choose how to use this analyzed image:
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {FINAL_PURPOSE_OPTIONS.map((option) => {
                      const Icon = option.icon
                      return (
                        <button
                          key={option.purpose}
                          onClick={() => onConfirm(option.purpose)}
                          disabled={isLoading}
                          className={cn(
                            "p-3 rounded-xl border transition-all",
                            "hover:scale-[1.02] active:scale-[0.98]",
                            "flex items-center gap-2",
                            "disabled:opacity-50 disabled:cursor-not-allowed",
                            option.color
                          )}
                        >
                          <Icon size={16} />
                          <span className="font-medium text-white text-sm">
                            {option.label}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-4 py-3 border-t border-zinc-800 shrink-0">
                <p className="text-xs text-zinc-500 text-center">
                  The analysis will be included with your image for smarter prompt generation.
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
