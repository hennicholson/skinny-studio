'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Upload, ImageIcon, Loader2, X, ChevronLeft, Search } from 'lucide-react'
import { ChatAttachment } from '@/lib/context/chat-context'

interface Generation {
  id: string
  prompt: string
  output_urls: string[]
  created_at: string
  model_slug: string
  studio_models?: {
    name: string
  }
}

interface ImageSourcePickerProps {
  isOpen: boolean
  onClose: () => void
  onSelectLocalFile: () => void
  onSelectImage: (attachment: ChatAttachment) => void
  supportsVision: boolean
}

export function ImageSourcePicker({
  isOpen,
  onClose,
  onSelectLocalFile,
  onSelectImage,
  supportsVision,
}: ImageSourcePickerProps) {
  const [view, setView] = useState<'menu' | 'hub'>('menu')
  const [generations, setGenerations] = useState<Generation[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Fetch user's generations when hub view is opened
  useEffect(() => {
    if (view === 'hub' && generations.length === 0) {
      fetchGenerations()
    }
  }, [view])

  // Reset view when picker is closed
  useEffect(() => {
    if (!isOpen) {
      setView('menu')
      setSearchQuery('')
    }
  }, [isOpen])

  const fetchGenerations = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/generations?category=image&limit=50')
      if (res.ok) {
        const data = await res.json()
        setGenerations(data.generations || [])
      } else if (res.status === 401) {
        setError('Sign in to access your Skinny Hub')
      } else {
        setError('Failed to load images')
      }
    } catch (err) {
      setError('Failed to load images')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelectFromHub = (generation: Generation, imageUrl: string) => {
    const attachment: ChatAttachment = {
      id: `hub_${generation.id}_${Date.now()}`,
      type: 'reference',
      url: imageUrl,
      name: generation.prompt?.slice(0, 30) || 'Hub Image',
    }
    onSelectImage(attachment)
    onClose()
  }

  const filteredGenerations = searchQuery
    ? generations.filter(g =>
        g.prompt?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        g.model_slug?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : generations

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

        {/* Content */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "relative bg-zinc-950 rounded-2xl border border-white/[0.1] shadow-2xl overflow-hidden",
            view === 'menu' ? "w-full max-w-xs" : "w-full max-w-2xl max-h-[80vh]"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
            <div className="flex items-center gap-2">
              {view === 'hub' && (
                <button
                  onClick={() => setView('menu')}
                  className="p-1 rounded-lg text-white/60 hover:text-white hover:bg-white/[0.05] transition-colors"
                >
                  <ChevronLeft size={18} />
                </button>
              )}
              <h3 className="text-sm font-medium text-white">
                {view === 'menu' ? 'Add Image' : 'Skinny Hub'}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.05] transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Menu View */}
          {view === 'menu' && (
            <div className="p-2">
              <button
                onClick={() => {
                  onSelectLocalFile()
                  onClose()
                }}
                disabled={!supportsVision}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                  supportsVision
                    ? "hover:bg-white/[0.05] text-white"
                    : "text-white/30 cursor-not-allowed"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  supportsVision ? "bg-blue-500/20 text-blue-400" : "bg-white/[0.03] text-white/20"
                )}>
                  <Upload size={20} />
                </div>
                <div className="text-left">
                  <div className="text-sm font-medium">Local Computer</div>
                  <div className="text-xs text-white/40">Upload from your device</div>
                </div>
              </button>

              <button
                onClick={() => setView('hub')}
                disabled={!supportsVision}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                  supportsVision
                    ? "hover:bg-white/[0.05] text-white"
                    : "text-white/30 cursor-not-allowed"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  supportsVision ? "bg-skinny-yellow/20 text-skinny-yellow" : "bg-white/[0.03] text-white/20"
                )}>
                  <ImageIcon size={20} />
                </div>
                <div className="text-left">
                  <div className="text-sm font-medium">Skinny Hub</div>
                  <div className="text-xs text-white/40">Your previous generations</div>
                </div>
              </button>

              {!supportsVision && (
                <p className="px-4 py-2 text-xs text-white/40 text-center">
                  Vision not supported with current model
                </p>
              )}
            </div>
          )}

          {/* Hub View */}
          {view === 'hub' && (
            <div className="flex flex-col max-h-[70vh]">
              {/* Search */}
              <div className="p-3 border-b border-white/[0.05]">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search your generations..."
                    className="w-full pl-9 pr-4 py-2 bg-white/[0.03] border border-white/[0.05] rounded-lg text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/[0.1]"
                  />
                </div>
              </div>

              {/* Grid */}
              <div className="flex-1 overflow-y-auto p-3">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 size={24} className="text-skinny-yellow animate-spin" />
                  </div>
                ) : error ? (
                  <div className="text-center py-12">
                    <p className="text-white/40 text-sm">{error}</p>
                    <button
                      onClick={fetchGenerations}
                      className="mt-4 px-4 py-2 bg-white/[0.05] hover:bg-white/[0.1] rounded-lg text-sm text-white transition-colors"
                    >
                      Try again
                    </button>
                  </div>
                ) : filteredGenerations.length === 0 ? (
                  <div className="text-center py-12">
                    <ImageIcon size={32} className="mx-auto text-white/20 mb-3" />
                    <p className="text-white/40 text-sm">
                      {searchQuery ? 'No matching images' : 'No generations yet'}
                    </p>
                    <p className="text-white/30 text-xs mt-1">
                      Create some images to see them here
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {filteredGenerations.map((gen) =>
                      gen.output_urls?.map((url, idx) => (
                        <button
                          key={`${gen.id}-${idx}`}
                          onClick={() => handleSelectFromHub(gen, url)}
                          className="group relative aspect-square rounded-lg overflow-hidden bg-white/[0.03] border border-transparent hover:border-skinny-yellow/50 transition-all duration-200"
                        >
                          <img
                            src={url}
                            alt={gen.prompt || 'Generated image'}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                          <div className="absolute inset-x-0 bottom-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <p className="text-[10px] text-white/80 line-clamp-2">
                              {gen.prompt?.slice(0, 60) || 'Untitled'}
                            </p>
                          </div>
                          <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="px-1.5 py-0.5 rounded bg-skinny-yellow text-black text-[9px] font-medium">
                              Select
                            </span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
