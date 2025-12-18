'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, FolderPlus, User, Globe, Box, Palette } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FolderType } from '@/lib/context/folder-context'

interface NewFolderDialogProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (name: string, folderType?: FolderType) => void
  defaultType?: FolderType
}

const FOLDER_TYPES: { type: FolderType; label: string; icon: typeof User; color: string }[] = [
  { type: 'general', label: 'General', icon: FolderPlus, color: 'text-zinc-400' },
  { type: 'character', label: 'Character', icon: User, color: 'text-blue-400' },
  { type: 'world', label: 'World', icon: Globe, color: 'text-green-400' },
  { type: 'object', label: 'Object', icon: Box, color: 'text-orange-400' },
  { type: 'style', label: 'Style', icon: Palette, color: 'text-purple-400' },
]

export function NewFolderDialog({ isOpen, onClose, onCreate, defaultType = 'general' }: NewFolderDialogProps) {
  const [name, setName] = useState('')
  const [folderType, setFolderType] = useState<FolderType>(defaultType)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when dialog opens
  useEffect(() => {
    if (isOpen) {
      setName('')
      setFolderType(defaultType)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen, defaultType])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || isSubmitting) return

    setIsSubmitting(true)
    try {
      await onCreate(name.trim(), folderType)
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <FolderPlus size={18} className="text-skinny-yellow" />
                <h3 className="font-semibold text-white">New Folder</h3>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Folder name"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-skinny-yellow/50 transition-colors"
                maxLength={50}
              />

              {/* Folder Type Selector */}
              <div className="space-y-2">
                <label className="text-xs text-zinc-500 uppercase tracking-wider">Folder Type</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {FOLDER_TYPES.map(({ type, label, icon: Icon, color }) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFolderType(type)}
                      className={cn(
                        "flex flex-col items-center gap-1 p-2 rounded-lg transition-all",
                        "border text-xs",
                        folderType === type
                          ? "bg-zinc-700 border-skinny-yellow/50"
                          : "bg-zinc-800/50 border-zinc-700/50 hover:bg-zinc-700/50"
                      )}
                    >
                      <Icon size={16} className={folderType === type ? color : 'text-zinc-500'} />
                      <span className={folderType === type ? 'text-white' : 'text-zinc-500'}>
                        {label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!name.trim() || isSubmitting}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    name.trim() && !isSubmitting
                      ? "bg-skinny-yellow text-black hover:bg-skinny-green"
                      : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                  )}
                >
                  {isSubmitting ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
