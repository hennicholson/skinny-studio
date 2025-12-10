'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Image from 'next/image'
import { ModeSwitcher, Mode } from '@/components/ui/mode-switcher'
import { ChatView } from '@/components/chat/chat-view'
import { GalleryView } from '@/components/gallery/gallery-view'
import { SettingsView } from '@/components/settings/settings-view'
import { ToastContainer } from '@/components/ui/toast'
import { User, Wallet, Settings } from 'lucide-react'
import { useApp } from '@/lib/context/app-context'

export default function Home() {
  // Mode state - start with chat
  const [mode, setMode] = useState<Mode>('chat')

  // Get toast from app context
  const { showToast } = useApp()

  return (
    <main className="h-screen bg-black flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 px-4 sm:px-6 py-3 border-b border-zinc-900">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2"
          >
            <div className="w-8 h-8 relative">
              <Image
                src="/skinny-logo.svg"
                alt="Skinny Studio"
                width={32}
                height={32}
                className="w-full h-full"
              />
            </div>
            <span className="text-white font-bold text-sm uppercase tracking-wide hidden sm:inline">
              Skinny Studio
            </span>
          </motion.div>

          {/* Mode Switcher */}
          <ModeSwitcher mode={mode} setMode={setMode} />

          {/* Account / Balance */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2"
          >
            {/* Balance */}
            <button className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors">
              <Wallet size={14} className="text-skinny-yellow" />
              <span className="text-xs font-medium text-zinc-300">$10.00</span>
            </button>

            {/* Settings */}
            <button
              onClick={() => setMode('settings')}
              className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center hover:border-zinc-700 transition-colors"
            >
              <Settings size={16} className="text-zinc-400" />
            </button>

            {/* User Avatar */}
            <button className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center hover:border-zinc-600 transition-colors">
              <User size={16} className="text-zinc-400" />
            </button>
          </motion.div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          {mode === 'chat' && (
            <motion.div
              key="chat"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex flex-col overflow-hidden"
            >
              <ChatView />
            </motion.div>
          )}

          {mode === 'library' && (
            <motion.div
              key="library"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex flex-col overflow-hidden"
            >
              <GalleryView />
            </motion.div>
          )}

          {mode === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex flex-col overflow-hidden"
            >
              <SettingsView />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Toast Notifications */}
      <ToastContainer />
    </main>
  )
}
