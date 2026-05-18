'use client'

import { useState, useEffect, Suspense } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Image from 'next/image'
import { useSearchParams, useRouter } from 'next/navigation'
import { ModeSwitcher, Mode } from '@/components/ui/mode-switcher'
import { ChatView } from '@/components/chat/chat-view'
import { ChatHistorySidebar } from '@/components/chat/chat-history-sidebar'
import { LibraryView } from '@/components/library/library-view'
import { SettingsView } from '@/components/settings/settings-view'
import { CreatorGallery } from '@/components/gallery/creator-gallery'
import { CanvasLandingView } from '@/components/canvas-landing/CanvasLandingView'
import { ToastContainer } from '@/components/ui/toast'
import { BottomNavigation } from '@/components/ui/bottom-navigation'
import { User, Wallet, Settings } from 'lucide-react'
import { useApp } from '@/lib/context/app-context'
import { useUser } from '@/lib/context/user-context'

// Check if we're in a special mode (to hide chat sidebar)
function useIsSpecialMode() {
  const { selectedModel } = useApp()
  return selectedModel?.id === 'storyboard-mode' || selectedModel?.id === 'session-mode'
}

// Wrapper to conditionally render chat sidebar — hidden in storyboard/session
// mode (which have their own UI) AND hidden when mode isn't chat (Canvas /
// Library / Gallery / Settings don't share chat history).
function ChatHistorySidebarWrapper({ mode }: { mode: Mode }) {
  const isSpecialMode = useIsSpecialMode()

  if (mode !== 'chat' || isSpecialMode) {
    return null
  }

  return <ChatHistorySidebar />
}

// Modes the shell knows how to render.
const VALID_MODES: readonly Mode[] = ['chat', 'canvas', 'library', 'gallery', 'settings']

// Smooth transition config for view switching
const viewTransition = {
  duration: 0.25,
  ease: [0.4, 0, 0.2, 1] as const
}

// Component that handles URL params - needs to be wrapped in Suspense.
// Also reads `?mode=` so deep-links from /canvas (and friends) can preset
// which shell view is active, then strips the param from the URL so the
// user doesn't see it.
function UrlParamHandler({ setMode }: { setMode: (m: Mode) => void }) {
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    const devToken = searchParams.get('whop-dev-user-token')
    const modeParam = searchParams.get('mode')

    let shouldCleanUrl = false

    if (devToken) {
      localStorage.setItem('whop-dev-token', devToken)

      try {
        const parts = devToken.split('.')
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]))
          console.log('Whop dev token payload:', payload)
          localStorage.setItem('whop-dev-user-id', payload.sub || '')
        }
      } catch (e) {
        console.error('Failed to decode dev token:', e)
      }
      shouldCleanUrl = true
    }

    if (modeParam && (VALID_MODES as readonly string[]).includes(modeParam)) {
      setMode(modeParam as Mode)
      shouldCleanUrl = true
    }

    if (shouldCleanUrl) {
      router.replace('/')
    }
  }, [searchParams, router, setMode])

  return null
}

export default function Home() {
  // Mode state - start with chat
  const [mode, setMode] = useState<Mode>('chat')
  // Settings panel state - which panel to show when entering settings
  const [settingsPanel, setSettingsPanel] = useState<'main' | 'profile' | 'balance'>('main')

  // Get toast from app context
  const { showToast } = useApp()

  // Get user data and balance
  const { balanceDollars, isLoading: userLoading, whop, refreshUser } = useUser()

  // Refresh user data after token is stored
  useEffect(() => {
    const devToken = localStorage.getItem('whop-dev-token')
    if (devToken && !whop) {
      refreshUser()
    }
  }, [whop, refreshUser])

  // Navigate to settings with balance panel
  const goToBalanceSettings = () => {
    setSettingsPanel('balance')
    setMode('settings')
  }

  return (
    <main className="h-[100dvh] bg-black flex flex-col overflow-hidden">
      {/* Handle Whop dev token + ?mode= deep-links from URL */}
      <Suspense fallback={null}>
        <UrlParamHandler setMode={setMode} />
      </Suspense>

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

          {/* Mode Switcher - desktop only, mobile uses bottom nav. Canvas
              is now a first-class tab inside the switcher, so the legacy
              admin-only "Canvas beta" pill + mobile FAB have been removed. */}
          <div className="hidden md:flex items-center gap-2">
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
              <ChatHistorySidebarWrapper mode={mode} />
              <ChatView />
            </motion.div>
          )}

          {mode === 'canvas' && (
            <motion.div
              key="canvas"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={viewTransition}
              className="flex-1 flex flex-col overflow-hidden will-change-[opacity]"
            >
              <CanvasLandingView />
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
