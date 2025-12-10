import type { Metadata } from 'next'
import './globals.css'
import { AppProvider } from '@/lib/context/app-context'
import { GenerationProvider } from '@/lib/context/generation-context'
import { WorkflowProvider } from '@/lib/context/workflow-context'
import { ChatProvider } from '@/lib/context/chat-context'
import { SkillsProvider } from '@/lib/context/skills-context'

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
        <AppProvider>
          <SkillsProvider>
            <ChatProvider>
              <GenerationProvider>
                <WorkflowProvider>
                  {children}
                </WorkflowProvider>
              </GenerationProvider>
            </ChatProvider>
          </SkillsProvider>
        </AppProvider>
      </body>
    </html>
  )
}
