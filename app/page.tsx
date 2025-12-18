'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Image from 'next/image'
import { ModeSwitcher, Mode } from '@/components/ui/mode-switcher'
import { ChatView } from '@/components/chat/chat-view'
import { ChatHistorySidebar } from '@/components/chat/chat-history-sidebar'
import { LibraryView } from '@/components/library/library-view'
import { SettingsView } from '@/components/settings/settings-view'
import { CreatorGallery } from '@/components/gallery/creator-gallery'
import { ToastContainer } from '@/components/ui/toast'
import { BottomNavigation } from '@/components/ui/bottom-navigation'
import { User, Wallet, Settings } from 'lucide-react'
import { useApp } from '@/lib/context/app-context'
import { useUser } from '@/lib/context/user-context'

// Check if we're in storyboard mode (to hide chat sidebar)
function useIsStoryboardMode() {
  const { selectedModel } = useApp()
  return selectedModel?.id === 'storyboard-mode'
}

// Wrapper to conditionally render chat sidebar (hidden in storyboard mode)
function ChatHistorySidebarWrapper() {
  const isStoryboardMode = useIsStoryboardMode()

  // Don't render sidebar in storyboard mode - it interferes with storyboard selector
  if (isStoryboardMode) {
    return null
  }

  return <ChatHistorySidebar />
}

// Smooth transition config for view switching
const viewTransition = {
  duration: 0.25,
  ease: [0.4, 0, 0.2, 1] as const
}

export default function Home() {
  // Mode state - start with chat
  const [mode, setMode] = useState<Mode>('chat')
  // Settings panel state - which panel to show when entering settings
  const [settingsPanel, setSettingsPanel] = useState<'main' | 'profile' | 'balance'>('main')

  // Get toast from app context
  const { showToast } = useApp()

  // Get user data and balance
  const { balanceDollars, isLoading: userLoading, whop } = useUser()

  // Navigate to settings with balance panel
  const goToBalanceSettings = () => {
    setSettingsPanel('balance')
    setMode('settings')
  }

  return (
    <main className="h-[100dvh] bg-black flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 px-4 sm:px-6 py-3 border-b border-zinc-900">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          {/* Exclusively on Whop Badge */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <a
              href="https://whop.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.08] hover:border-white/[0.12] transition-all"
            >
              <Image
                src="https://docs.whop.com/favicon.png"
                alt="Whop"
                width={18}
                height={18}
                className="rounded-sm"
              />
              <span className="text-xs font-medium text-white/70">
                Exclusively on <span className="text-white font-semibold">Whop</span>
              </span>
            </a>
          </motion.div>

          {/* Mode Switcher - desktop only, mobile uses bottom nav */}
          <div className="hidden md:block">
            <ModeSwitcher mode={mode} setMode={setMode} />
          </div>

          {/* Account / Balance */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2"
          >
            {/* Balance - clickable to go to balance/usage settings */}
            <button
              onClick={goToBalanceSettings}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-skinny-yellow/50 hover:bg-zinc-800 transition-colors"
            >
              <Wallet size={14} className="text-skinny-yellow" />
              <span className="text-xs font-medium text-zinc-300">
                {userLoading ? '...' : `$${balanceDollars}`}
              </span>
            </button>

            {/* Settings - desktop only, mobile uses bottom nav */}
            <button
              onClick={() => {
                setSettingsPanel('main')
                setMode('settings')
              }}
              className="hidden md:flex w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 items-center justify-center hover:border-zinc-700 transition-colors"
            >
              <Settings size={16} className="text-zinc-400" />
            </button>

            {/* User Avatar - goes to profile settings */}
            <button
              onClick={() => {
                setSettingsPanel('profile')
                setMode('settings')
              }}
              className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center hover:border-skinny-yellow/50 hover:bg-zinc-700 transition-colors"
            >
              <User size={16} className="text-zinc-400" />
            </button>
          </motion.div>
        </div>
      </header>

      {/* Main Content - pb for bottom nav on mobile */}
      <div className="flex-1 flex flex-col overflow-hidden pb-[calc(58px+env(safe-area-inset-bottom))] md:pb-0">
        <AnimatePresence mode="popLayout">
          {mode === 'chat' && (
            <motion.div
              key="chat"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={viewTransition}
              className="flex-1 flex overflow-hidden will-change-[opacity]"
            >
              <ChatHistorySidebarWrapper />
              <ChatView />
            </motion.div>
          )}

          {mode === 'library' && (
            <motion.div
              key="library"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={viewTransition}
              className="flex-1 flex flex-col overflow-hidden will-change-[opacity]"
            >
              <LibraryView />
            </motion.div>
          )}

          {mode === 'gallery' && (
            <motion.div
              key="gallery"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={viewTransition}
              className="flex-1 flex flex-col overflow-hidden will-change-[opacity]"
            >
              <CreatorGallery />
            </motion.div>
          )}

          {mode === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={viewTransition}
              className="flex-1 flex flex-col overflow-hidden will-change-[opacity]"
            >
              <SettingsView initialPanel={settingsPanel} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Navigation - mobile only */}
      <BottomNavigation mode={mode} setMode={setMode} />

      {/* Toast Notifications */}
      <ToastContainer />
    </main>
  )
}
