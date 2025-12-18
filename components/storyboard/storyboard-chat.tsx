'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Sparkles, Loader2, Film, User, Globe, Box, Palette } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStoryboard } from '@/lib/context/storyboard-context'
import { useUser } from '@/lib/context/user-context'
import { EntityTypeBadge } from './entity-type-badge'
import { StoryboardShot, StoryboardEntity, CreateShotInput, EntityType } from '@/lib/types'
import { toast } from 'sonner'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: Date
}

// Parse shot-list blocks from AI response
function parseShotListBlock(text: string): CreateShotInput[] | null {
  const shotListMatch = text.match(/```shot-list\s*([\s\S]*?)```/)
  if (!shotListMatch) return null

  try {
    const jsonStr = shotListMatch[1].trim()
    const parsed = JSON.parse(jsonStr)
    if (parsed.shots && Array.isArray(parsed.shots)) {
      return parsed.shots.map((shot: any) => ({
        title: shot.title || '',
        description: shot.description || '',
        cameraAngle: shot.camera_angle || shot.cameraAngle,
        cameraMovement: shot.camera_movement || shot.cameraMovement,
        durationSeconds: shot.duration_seconds || shot.durationSeconds || 5,
        mediaType: shot.media_type || shot.mediaType || 'image',
        aiSuggestedPrompt: shot.suggested_prompt || shot.aiSuggestedPrompt,
        aiNotes: shot.notes || shot.aiNotes,
      }))
    }
  } catch (e) {
    console.error('Failed to parse shot-list block:', e)
  }
  return null
}

// Parse entity-suggestion blocks from AI response
function parseEntitySuggestionBlock(text: string): { name: string; type: EntityType; description: string }[] | null {
  const entityMatch = text.match(/```entity-suggestion\s*([\s\S]*?)```/)
  if (!entityMatch) return null

  try {
    const jsonStr = entityMatch[1].trim()
    const parsed = JSON.parse(jsonStr)
    if (parsed.entities && Array.isArray(parsed.entities)) {
      return parsed.entities.map((e: any) => ({
        name: e.name,
        type: e.type as EntityType,
        description: e.description,
      }))
    }
  } catch (e) {
    console.error('Failed to parse entity-suggestion block:', e)
  }
  return null
}

// Remove code blocks from display text
function cleanDisplayText(text: string): string {
  return text
    .replace(/```shot-list[\s\S]*?```/g, '')
    .replace(/```entity-suggestion[\s\S]*?```/g, '')
    .trim()
}

export function StoryboardChat() {
  const {
    currentStoryboard,
    shots,
    entities,
    addShotsFromAI,
  } = useStoryboard()

  const { whop } = useUser()

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [suggestedShots, setSuggestedShots] = useState<CreateShotInput[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Initial greeting when storyboard is loaded
  useEffect(() => {
    if (currentStoryboard && messages.length === 0) {
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: `Welcome to your storyboard "${currentStoryboard.title}"! I'm here to help you plan your shots and maintain visual consistency.\n\nYou have ${entities.length} entities defined and ${shots.length} shots planned.\n\nWhat would you like to work on? You can:\n- Ask me to generate shot ideas for your project\n- Describe a scene and I'll help break it down into shots\n- Discuss your entities and how they should appear`,
        createdAt: new Date(),
      }])
    }
  }, [currentStoryboard, entities.length, shots.length])

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading || !currentStoryboard) return

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      createdAt: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      // Build entity context for the system prompt
      const entityContext = entities.map(e => ({
        name: e.entityName,
        type: e.entityType,
        description: e.visionContext || e.entityDescription || 'No description',
        hasImage: !!e.primaryImageUrl,
      }))

      const shotContext = shots.map(s => ({
        number: s.shotNumber,
        title: s.title || `Shot ${s.shotNumber}`,
        description: s.description,
        status: s.status,
      }))

      // Build storyboard context for the system prompt
      const storyboardSystemContext = `

## STORYBOARD MODE ACTIVE
You are helping plan shots for a storyboard project.

Project: "${currentStoryboard.title}"
${currentStoryboard.description ? `Description: ${currentStoryboard.description}` : ''}
${currentStoryboard.genre ? `Genre: ${currentStoryboard.genre}` : ''}
${currentStoryboard.mood ? `Mood: ${currentStoryboard.mood}` : ''}

### Defined Entities (${entityContext.length})
${entityContext.length > 0 ? entityContext.map(e => `- ${e.name} (${e.type}): ${e.description}`).join('\n') : 'No entities defined yet.'}

### Current Shots (${shotContext.length})
${shotContext.length > 0 ? shotContext.map(s => `- Shot ${s.number}: ${s.title} - ${s.description} [${s.status}]`).join('\n') : 'No shots planned yet.'}

When suggesting shots, you can use this format to create a shot list:
\`\`\`shot-list
{
  "shots": [
    {
      "title": "Shot title",
      "description": "Visual description",
      "cameraAngle": "wide|medium|close-up|etc",
      "cameraMovement": "static|pan|tilt|dolly|etc",
      "mediaType": "image|video",
      "suggestedPrompt": "Detailed generation prompt"
    }
  ]
}
\`\`\`

Focus on helping the user plan their visual story with consistent characters and settings.
`

      // Call the chat API - it returns SSE stream
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(whop?.id && { 'X-Whop-User-Id': whop.id }),
        },
        body: JSON.stringify({
          messages: [
            // Inject storyboard context as a system-like message
            { role: 'user', content: storyboardSystemContext + '\n\n---\n\n' + userMessage.content },
          ],
          modelId: 'gemini-2.5-flash',
          selectedGenerationModelId: 'creative-consultant', // Disable generation in storyboard chat
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Chat API error:', errorText)
        throw new Error('Failed to get response')
      }

      // Parse SSE stream
      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response body')
      }

      const decoder = new TextDecoder()
      let assistantContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue

            try {
              const parsed = JSON.parse(data)
              if (parsed.content) {
                assistantContent += parsed.content
              }
              if (parsed.error) {
                throw new Error(parsed.error)
              }
            } catch (e) {
              // Ignore parse errors for partial chunks
            }
          }
        }
      }

      // Parse any structured blocks
      const parsedShots = parseShotListBlock(assistantContent)
      const parsedEntities = parseEntitySuggestionBlock(assistantContent)

      if (parsedShots && parsedShots.length > 0) {
        setSuggestedShots(parsedShots)
      }

      const cleanContent = cleanDisplayText(assistantContent)

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: cleanContent || assistantContent,
        createdAt: new Date(),
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error('Chat error:', error)
      toast.error('Failed to send message')
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, currentStoryboard, messages, entities, shots, whop])

  const handleAddSuggestedShots = useCallback(async () => {
    if (suggestedShots.length === 0) return

    try {
      await addShotsFromAI(suggestedShots)
      toast.success(`Added ${suggestedShots.length} shots to your storyboard!`)
      setSuggestedShots([])
    } catch (error) {
      toast.error('Failed to add shots')
    }
  }, [suggestedShots, addShotsFromAI])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!currentStoryboard) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-500">
        <p className="text-sm">Select a storyboard to start chatting</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <AnimatePresence>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={cn(
                "flex gap-3",
                message.role === 'user' ? "justify-end" : "justify-start"
              )}
            >
              {message.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-skinny-yellow/20 flex items-center justify-center flex-shrink-0">
                  <Sparkles size={14} className="text-skinny-yellow" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-3",
                  message.role === 'user'
                    ? "bg-skinny-yellow text-black"
                    : "bg-zinc-800 text-white"
                )}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Loading indicator */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-skinny-yellow/20 flex items-center justify-center">
              <Loader2 size={14} className="text-skinny-yellow animate-spin" />
            </div>
            <div className="bg-zinc-800 rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-zinc-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-zinc-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-zinc-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </motion.div>
        )}

        {/* Suggested shots card */}
        <AnimatePresence>
          {suggestedShots.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-zinc-800 rounded-xl p-4 border border-skinny-yellow/30"
            >
              <div className="flex items-center gap-2 mb-3">
                <Film size={16} className="text-skinny-yellow" />
                <span className="text-sm font-medium text-white">
                  {suggestedShots.length} shots suggested
                </span>
              </div>
              <div className="space-y-2 mb-4">
                {suggestedShots.slice(0, 3).map((shot, i) => (
                  <div key={i} className="text-xs text-zinc-400 flex items-start gap-2">
                    <span className="text-skinny-yellow">{i + 1}.</span>
                    <span className="line-clamp-1">{shot.title || shot.description}</span>
                  </div>
                ))}
                {suggestedShots.length > 3 && (
                  <p className="text-xs text-zinc-500">+{suggestedShots.length - 3} more</p>
                )}
              </div>
              <button
                onClick={handleAddSuggestedShots}
                className="w-full py-2 rounded-lg bg-skinny-yellow text-black text-sm font-medium hover:bg-skinny-green transition-colors"
              >
                Add All Shots
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-zinc-800 p-4">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe your scene or ask for shot ideas..."
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-500 resize-none min-h-[48px] max-h-[150px] focus:outline-none focus:border-skinny-yellow/50"
            rows={1}
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className={cn(
              "p-3 rounded-xl transition-colors",
              input.trim() && !isLoading
                ? "bg-skinny-yellow text-black hover:bg-skinny-green"
                : "bg-zinc-800 text-zinc-500"
            )}
          >
            {isLoading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Send size={18} />
            )}
          </button>
        </div>

        {/* Entity chips */}
        {entities.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-xs text-zinc-500">Entities:</span>
            {entities.slice(0, 5).map((entity) => (
              <EntityTypeBadge
                key={entity.id}
                type={entity.entityType}
                size="sm"
                name={entity.entityName}
              />
            ))}
            {entities.length > 5 && (
              <span className="text-xs text-zinc-500">+{entities.length - 5} more</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
