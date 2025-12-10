'use client'

import { motion } from 'framer-motion'
import { Images, Search, FolderPlus, Grid, List } from 'lucide-react'

export function LibraryView() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 sm:px-6 py-4 border-b border-zinc-800">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h2 className="text-xl font-bold text-white uppercase tracking-tight">Library</h2>
          <div className="flex items-center gap-2">
            <button className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors">
              <Grid size={18} />
            </button>
            <button className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors">
              <List size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex-shrink-0 px-4 sm:px-6 py-3">
        <div className="max-w-6xl mx-auto">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search your generations..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-skinny-yellow/50 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-6xl mx-auto flex flex-col items-center justify-center py-20 text-center"
        >
          <div className="w-20 h-20 rounded-2xl bg-zinc-900 border-2 border-zinc-800 flex items-center justify-center mb-6">
            <Images size={32} className="text-zinc-600" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Your Library is Empty</h3>
          <p className="text-zinc-500 mb-6 max-w-md">
            Start a conversation to generate images. All your creations will appear here.
          </p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-skinny-yellow text-black font-bold uppercase hover:bg-skinny-green transition-colors"
          >
            <FolderPlus size={18} />
            Create Project
          </motion.button>
        </motion.div>
      </div>
    </div>
  )
}
