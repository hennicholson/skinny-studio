import type { Metadata } from 'next'
import './globals.css'
import { AppProvider } from '@/lib/context/app-context'
import { GenerationProvider } from '@/lib/context/generation-context'
import { FolderProvider } from '@/lib/context/folder-context'
import { WorkflowProvider } from '@/lib/context/workflow-context'
import { ChatProvider } from '@/lib/context/chat-context'
import { SkillsProvider } from '@/lib/context/skills-context'
import { UserProvider } from '@/lib/context/user-context'
import { GiftProvider } from '@/lib/context/gift-context'
import { StoryboardProvider } from '@/lib/context/storyboard-context'
import { GlobalModals } from '@/components/modals/global-modals'
import { Toaster } from 'sonner'

export const metadata: Metadata = {
  title: 'Skinny Studio',
  description: 'AI-Powered Creative Workspace - Chat with your Creative Director AI',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    viewportFit: 'cover',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-black text-white antialiased">
        <UserProvider>
          <GiftProvider>
            <AppProvider>
              <SkillsProvider>
                <ChatProvider>
                  <GenerationProvider>
                    <FolderProvider>
                      <WorkflowProvider>
                        <StoryboardProvider>
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
