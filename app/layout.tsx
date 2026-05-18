import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ViewportFit } from '@/components/ui/viewport-fit'
import { AppProvider } from '@/lib/context/app-context'
import { GenerationProvider } from '@/lib/context/generation-context'
import { FolderProvider } from '@/lib/context/folder-context'
import { WorkflowProvider } from '@/lib/context/workflow-context'
import { ChatProvider } from '@/lib/context/chat-context'
import { SkillsProvider } from '@/lib/context/skills-context'
import { UserProvider } from '@/lib/context/user-context'
import { GiftProvider } from '@/lib/context/gift-context'
import { StoryboardProvider } from '@/lib/context/storyboard-context'
import { SessionsProvider } from '@/lib/context/sessions-context'
import { SavedPromptsProvider } from '@/lib/context/saved-prompts-context'
import { MotionProvider } from '@/lib/context/motion-context'
import { GlobalModals } from '@/components/modals/global-modals'
import { Toaster } from 'sonner'

export const metadata: Metadata = {
  title: 'Skinny Studio',
  description: 'AI-Powered Creative Workspace - Chat with your Creative Director AI',
}

// Next 14 moved viewport out of `metadata`. Allow user-scale so the platform's
// pinch-to-zoom works on phones — our auto-fit only kicks in on the narrow
// desktop band (768-1280px), never on phones.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-black text-white antialiased">
        <ViewportFit />
        <UserProvider>
          <GiftProvider>
            <AppProvider>
              <SkillsProvider>
                <ChatProvider>
                  <GenerationProvider>
                    <FolderProvider>
                      <WorkflowProvider>
                        <StoryboardProvider>
                          <SessionsProvider>
                            <SavedPromptsProvider>
                              <MotionProvider>
                                {children}
                                <GlobalModals />
                              <Toaster
                                theme="dark"
                                position="bottom-right"
                                toastOptions={{
                                  style: {
                                    background: 'rgba(39, 39, 42, 0.95)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    color: '#fff',
                                  },
                                }}
                              />
                              </MotionProvider>
                            </SavedPromptsProvider>
                          </SessionsProvider>
                        </StoryboardProvider>
                      </WorkflowProvider>
                    </FolderProvider>
                  </GenerationProvider>
                </ChatProvider>
              </SkillsProvider>
            </AppProvider>
          </GiftProvider>
        </UserProvider>
      </body>
    </html>
  )
}
