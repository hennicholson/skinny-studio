'use client'

import { useState, useCallback, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
  MessageSquare,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Sparkles,
  Layers,
  Package,
  Music,
  Target,
  Smartphone,
  LucideIcon,
} from 'lucide-react'
import { useChat, Conversation } from '@/lib/context/chat-context'
import { useSessions } from '@/lib/context/sessions-context'
import { useApp } from '@/lib/context/app-context'
import { mockModels, Session } from '@/lib/types'
import {
  Sidebar,
  SidebarBody,
  SidebarSection,
  SidebarLogo,
  useSidebar,
} from '@/components/ui/sidebar'

// Map icon names to lucide components for sessions
const sessionIconMap: Record<string, LucideIcon> = {
  Package,
  Music,
  Target,
  Smartphone,
}

function getSessionIcon(iconName: string): LucideIcon {
  return sessionIconMap[iconName] || Layers
}

// Smooth spring animation config
const smoothSpring = {
  type: "spring" as const,
  stiffness: 300,
  damping: 30,
}

// Format relative time
function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays < 7) return `${diffDays}d`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Conversation item component - memoized for performance
const ConversationItem = memo(function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onDelete,
  onRename
}: {
  conversation: Conversation
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
  onRename: (title: string) => void
}) {
  const { open, animate } = useSidebar()
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(conversation.title)

  const handleSaveRename = useCallback(() => {
    if (editTitle.trim()) {
      onRename(editTitle.trim())
    }
    setIsEditing(false)
  }, [editTitle, onRename])

  const handleCancelRename = useCallback(() => {
    setEditTitle(conversation.title)
    setIsEditing(false)
  }, [conversation.title])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={smoothSpring}
      className={cn(
        "relative group/conv rounded-xl cursor-pointer",
        "transition-colors duration-150 ease-out",
        isActive
          ? "bg-white/[0.06]"
          : "hover:bg-white/[0.03]"
      )}
      onClick={() => !isEditing && onSelect()}
    >
      {isEditing && open ? (
        <div className="flex items-center gap-2 px-3 py-2">
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="flex-1 bg-zinc-800/80 border border-zinc-700/50 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-skinny-yellow/40 transition-colors"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveRename()
              if (e.key === 'Escape') handleCancelRename()
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={(e) => { e.stopPropagation(); handleSaveRename() }}
            className="p-1.5 rounded-md text-skinny-green hover:bg-white/10 transition-colors"
          >
            <Check size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleCancelRename() }}
            className="p-1.5 rounded-md text-zinc-500 hover:bg-white/10 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          {/* Active indicator - smooth pill on left */}
          <motion.div
            className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] rounded-full bg-gradient-to-b from-skinny-yellow to-skinny-green"
            initial={{ height: 0, opacity: 0 }}
            animate={{
              height: isActive ? 16 : 0,
              opacity: isActive ? 1 : 0
            }}
            transition={smoothSpring}
          />

          {/* Icon with subtle glow when active */}
          <div className={cn(
            "flex items-center justify-center shrink-0 w-7 h-7 rounded-lg transition-all duration-200",
            isActive
              ? "bg-skinny-yellow/10 text-skinny-yellow"
              : "text-zinc-600 group-hover/conv:text-zinc-400"
          )}>
            <MessageSquare size={14} strokeWidth={1.5} />
          </div>

          {/* Content */}
          <motion.div
            animate={{
              display: animate ? (open ? "flex" : "none") : "flex",
              opacity: animate ? (open ? 1 : 0) : 1,
            }}
            transition={{ duration: 0.15 }}
            className="flex-1 min-w-0 flex items-center justify-between gap-2"
          >
            <p className={cn(
              "text-[13px] font-medium truncate transition-colors duration-150",
              isActive ? "text-white" : "text-zinc-400 group-hover/conv:text-zinc-300"
            )}>
              {conversation.title}
            </p>

            {/* Time badge - subtle */}
            <span className="text-[10px] text-zinc-600 tabular-nums shrink-0">
              {formatRelativeTime(conversation.updatedAt)}
            </span>
          </motion.div>

          {/* Action buttons - fade in on hover */}
          {open && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover/conv:opacity-100 transition-opacity duration-150">
              <button
                onClick={(e) => { e.stopPropagation(); setIsEditing(true) }}
                className="p-1.5 rounded-md text-zinc-600 hover:text-white hover:bg-white/10 transition-colors"
              >
                <Edit2 size={12} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete() }}
                className="p-1.5 rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 size={12} />
              </button>
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
})

// Session item component - memoized for performance
const SessionItem = memo(function SessionItem({
  session,
  isActive,
  onSelect,
  onDelete,
  templateIcon,
}: {
  session: Session
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
  templateIcon: string
}) {
  const { open, animate } = useSidebar()
  const Icon = getSessionIcon(templateIcon)

  // Get status badge color
  const statusColors = {
    planning: 'text-amber-400',
    in_progress: 'text-blue-400',
    completed: 'text-green-400',
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={smoothSpring}
      className={cn(
        "relative group/session rounded-xl cursor-pointer",
        "transition-colors duration-150 ease-out",
        isActive
          ? "bg-white/[0.06]"
          : "hover:bg-white/[0.03]"
      )}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        {/* Active indicator - smooth pill on left with different color */}
        <motion.div
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] rounded-full bg-gradient-to-b from-purple-400 to-pink-400"
          initial={{ height: 0, opacity: 0 }}
          animate={{
            height: isActive ? 16 : 0,
            opacity: isActive ? 1 : 0
          }}
          transition={smoothSpring}
        />

        {/* Icon with subtle glow when active - uses session template icon */}
        <div className={cn(
          "flex items-center justify-center shrink-0 w-7 h-7 rounded-lg transition-all duration-200",
          isActive
            ? "bg-purple-500/10 text-purple-400"
            : "text-zinc-600 group-hover/session:text-zinc-400"
        )}>
          <Icon size={14} strokeWidth={1.5} />
        </div>

        {/* Content */}
        <motion.div
          animate={{
            display: animate ? (open ? "flex" : "none") : "flex",
            opacity: animate ? (open ? 1 : 0) : 1,
          }}
          transition={{ duration: 0.15 }}
          className="flex-1 min-w-0 flex items-center justify-between gap-2"
        >
          <div className="flex-1 min-w-0">
            <p className={cn(
              "text-[13px] font-medium truncate transition-colors duration-150",
              isActive ? "text-white" : "text-zinc-400 group-hover/session:text-zinc-300"
            )}>
              {session.title}
            </p>
            {/* Status badge */}
            <p className={cn(
              "text-[10px] truncate",
              statusColors[session.status]
            )}>
              {session.status === 'in_progress' ? 'In Progress' :
               session.status.charAt(0).toUpperCase() + session.status.slice(1)}
            </p>
          </div>

          {/* Time badge - subtle */}
          <span className="text-[10px] text-zinc-600 tabular-nums shrink-0">
            {formatRelativeTime(session.updatedAt)}
          </span>
        </motion.div>

        {/* Action buttons - fade in on hover */}
        {open && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover/session:opacity-100 transition-opacity duration-150">
            <button
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              className="p-1.5 rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>
    </motion.div>
  )
})

// Inner content component
function ChatSidebarContent() {
  const { open } = useSidebar()
  const {
    state,
    createNewConversation,
    switchConversation,
    deleteConversation,
    renameConversation
  } = useChat()
  const {
    sessions,
    currentSession,
    loadSession,
    deleteSession,
    getTemplate,
  } = useSessions()
  const { setSelectedModel } = useApp()

  const { conversations, currentConversationId } = state

  // Get session-mode model for switching to session view
  const sessionModeModel = mockModels.find(m => m.id === 'session-mode')

  // Handle clicking on a session - load it and switch to session mode
  const handleSelectSession = useCallback((sessionId: string) => {
    loadSession(sessionId)
    if (sessionModeModel) {
      setSelectedModel(sessionModeModel)
    }
  }, [loadSession, sessionModeModel, setSelectedModel])

  return (
    <SidebarBody className="justify-between gap-6">
      <div className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto">
        {/* Logo */}
        <SidebarLogo
          icon={
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-skinny-yellow to-skinny-green flex items-center justify-center shadow-lg shadow-skinny-yellow/20">
              <Sparkles size={16} className="text-black" />
            </div>
          }
          title="Skinny Studio"
          subtitle="AI Creation"
        />

        {/* New Chat Button */}
        <div className="px-1 mb-4">
          <motion.button
            onClick={createNewConversation}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl",
              "bg-gradient-to-r from-skinny-yellow/10 to-skinny-green/10",
              "border border-skinny-yellow/20",
              "text-skinny-yellow hover:from-skinny-yellow/20 hover:to-skinny-green/20",
              "transition-all duration-200 font-medium text-[13px]"
            )}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Plus size={16} strokeWidth={2.5} />
            <motion.span
              animate={{
                display: open ? "inline-block" : "none",
                opacity: open ? 1 : 0,
              }}
              transition={{ duration: 0.2, delay: open ? 0.1 : 0 }}
            >
              New Chat
            </motion.span>
          </motion.button>
        </div>

        {/* Sessions Section */}
        {sessions.length > 0 && (
          <SidebarSection title="Sessions">
            <div className="space-y-1">
              {sessions.map((session) => {
                const template = getTemplate(session.templateId)
                return (
                  <SessionItem
                    key={session.id}
                    session={session}
                    isActive={currentSession?.id === session.id}
                    onSelect={() => handleSelectSession(session.id)}
                    onDelete={() => deleteSession(session.id)}
                    templateIcon={template?.icon || 'Layers'}
                  />
                )
              })}
            </div>
          </SidebarSection>
        )}

        {/* Conversations Section */}
        <SidebarSection title="Chats">
          {conversations.length === 0 ? (
            open && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="px-3 py-6 text-center"
              >
                <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-zinc-800/50 flex items-center justify-center">
                  <MessageSquare size={18} className="text-zinc-600" />
                </div>
                <p className="text-[12px] text-zinc-600">No conversations yet</p>
                <p className="text-[11px] text-zinc-700 mt-1">Start chatting to create history</p>
              </motion.div>
            )
          ) : (
            <div className="space-y-1">
              {conversations.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  isActive={conv.id === currentConversationId}
                  onSelect={() => switchConversation(conv.id)}
                  onDelete={() => deleteConversation(conv.id)}
                  onRename={(title) => renameConversation(conv.id, title)}
                />
              ))}
            </div>
          )}
        </SidebarSection>
      </div>

      {/* Footer */}
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="px-4 py-3 border-t border-white/[0.04]"
        >
          <p className="text-[11px] sm:text-[10px] text-zinc-600 text-center">
            {sessions.length > 0 && (
              <span>{sessions.length} session{sessions.length !== 1 ? 's' : ''} &bull; </span>
            )}
            {conversations.length} chat{conversations.length !== 1 ? 's' : ''}
          </p>
        </motion.div>
      )}
    </SidebarBody>
  )
}

// Main export
export function ChatHistorySidebar() {
  const [open, setOpen] = useState(false)

  return (
    <Sidebar open={open} setOpen={setOpen} variant="overlay">
      <ChatSidebarContent />
    </Sidebar>
  )
}
