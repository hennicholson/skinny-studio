import type { Metadata } from 'next'
import './globals.css'
import { AppProvider } from '@/lib/context/app-context'
import { GenerationProvider } from '@/lib/context/generation-context'
import { WorkflowProvider } from '@/lib/context/workflow-context'
import { ChatProvider } from '@/lib/context/chat-context'
import { SkillsProvider } from '@/lib/context/skills-context'
import { UserProvider } from '@/lib/context/user-context'
import { Toaster } from 'sonner'

export const metadata: Metadata = {
  title: 'Skinny Studio',
  description: 'AI-Powered Creative Workspace - Chat with your Creative Director AI',
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
          <AppProvider>
            <SkillsProvider>
              <ChatProvider>
                <GenerationProvider>
                  <WorkflowProvider>
                    {children}
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
                  </WorkflowProvider>
                </GenerationProvider>
              </ChatProvider>
            </SkillsProvider>
          </AppProvider>
        </UserProvider>
      </body>
    </html>
  )
}
