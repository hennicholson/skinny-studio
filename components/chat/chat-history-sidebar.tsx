'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
  MessageSquare,
  Plus,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Edit2,
  Check,
  X,
  Clock
} from 'lucide-react'
import { useChat, Conversation } from '@/lib/context/chat-context'

interface ChatHistorySidebarProps {
  isOpen: boolean
  onToggle: () => void
}

// Format relative time
function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

// Conversation item component
function ConversationItem({
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
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(conversation.title)
  const [showActions, setShowActions] = useState(false)

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
    <div
      className={cn(
        "group relative px-3 py-2.5 rounded-lg cursor-pointer transition-all",
        isActive
          ? "bg-skinny-yellow/20 border border-skinny-yellow/40"
          : "hover:bg-white/[0.05] border border-transparent hover:border-white/[0.08]"
      )}
      onClick={() => !isEditing && onSelect()}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {isEditing ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-skinny-yellow/50"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveRename()
              if (e.key === 'Escape') handleCancelRename()
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={(e) => { e.stopPropagation(); handleSaveRename() }}
            className="p-1 rounded text-skinny-yellow hover:bg-white/10"
          >
            <Check size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleCancelRename() }}
            className="p-1 rounded text-zinc-400 hover:bg-white/10"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-2">
            <MessageSquare size={14} className={cn(
              "mt-0.5 flex-shrink-0",
              isActive ? "text-skinny-yellow" : "text-zinc-500"
            )} />
            <div className="flex-1 min-w-0">
              <p className={cn(
                "text-sm font-medium truncate",
                isActive ? "text-white" : "text-zinc-300"
              )}>
                {conversation.title}
              </p>
              <p className="text-[10px] text-zinc-500 flex items-center gap-1 mt-0.5">
                <Clock size={10} />
                {formatRelativeTime(conversation.updatedAt)}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <AnimatePresence>
            {showActions && !isActive && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1"
              >
                <button
                  onClick={(e) => { e.stopPropagation(); setIsEditing(true) }}
                  className="p-1.5 rounded-md bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
                >
                  <Edit2 size={12} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete() }}
                  className="p-1.5 rounded-md bg-zinc-800 text-zinc-400 hover:text-red-400 hover:bg-zinc-700 transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  )
}

export function ChatHistorySidebar({ isOpen, onToggle }: ChatHistorySidebarProps) {
  const {
    state,
    createNewConversation,
    switchConversation,
    deleteConversation,
    renameConversation
  } = useChat()

  const { conversations, currentConversationId } = state

  return (
    <>
      {/* Sidebar Toggle Button - Always visible on left edge */}
      <button
        onClick={onToggle}
        className={cn(
          "fixed left-0 top-1/2 -translate-y-1/2 z-40",
          "w-6 h-16 rounded-r-lg",
          "bg-zinc-900/90 border border-l-0 border-zinc-800",
          "flex items-center justify-center",
          "text-zinc-400 hover:text-white hover:bg-zinc-800",
          "transition-all duration-200",
          isOpen && "opacity-0 pointer-events-none"
        )}
        title="Open chat history"
      >
        <ChevronRight size={16} />
      </button>

      {/* Sidebar Panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40 md:hidden"
              onClick={onToggle}
            />

            {/* Sidebar */}
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className={cn(
                "fixed left-0 top-0 bottom-0 z-50",
                "w-[280px] bg-zinc-950 border-r border-zinc-800",
                "flex flex-col"
              )}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-800">
                <h2 className="text-sm font-bold uppercase tracking-wide text-white">
                  Chat History
                </h2>
                <button
                  onClick={onToggle}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <ChevronLeft size={18} />
                </button>
              </div>

              {/* New Chat Button */}
              <div className="px-3 py-3">
                <button
                  onClick={() => {
                    createNewConversation()
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2.5 rounded-lg",
                    "bg-skinny-yellow/10 border border-skinny-yellow/30",
                    "text-skinny-yellow hover:bg-skinny-yellow/20",
                    "transition-colors font-medium text-sm"
                  )}
                >
                  <Plus size={16} />
                  <span>New Chat</span>
                </button>
              </div>

              {/* Conversations List */}
              <div className="flex-1 overflow-y-auto px-3 pb-3">
                {conversations.length === 0 ? (
                  <div className="text-center py-8">
                    <MessageSquare size={32} className="mx-auto text-zinc-600 mb-2" />
                    <p className="text-sm text-zinc-500">No conversations yet</p>
                    <p className="text-xs text-zinc-600 mt-1">
                      Start chatting to create history
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {conversations.map((conv) => (
                      <ConversationItem
                        key={conv.id}
                        conversation={conv}
                        isActive={conv.id === currentConversationId}
                        onSelect={() => {
                          switchConversation(conv.id)
                        }}
                        onDelete={() => deleteConversation(conv.id)}
                        onRename={(title) => renameConversation(conv.id, title)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-3 border-t border-zinc-800">
                <p className="text-[10px] text-zinc-600 text-center">
                  {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
