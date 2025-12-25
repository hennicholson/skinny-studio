/**
 * Skinny Sense - Contextual Intelligence Service
 *
 * Analyzes user behavior, generations, and chat to proactively suggest:
 * - Relevant skills based on detected intent
 * - Session organization when patterns emerge
 * - Saving effective prompts as skills
 */

import { ChatMessage } from '@/lib/context/chat-context'
import { Skill } from '@/lib/types'
import { Generation } from '@/lib/context/generation-context'

// Session types that can be suggested
export type SessionType = 'product-drop' | 'album-drop' | 'brand-sprint' | 'content-week'

export interface SkinnySenseContext {
  // Skill suggestions based on current activity
  suggestedSkills: Skill[]

  // Session suggestions based on generation patterns
  suggestSession: boolean
  sessionType?: SessionType
  sessionReason?: string

  // Save as skill suggestions
  suggestSaveSkill: boolean
  saveSkillReason?: string

  // Pattern detection messages
  patternDetected?: string
  patternCount?: number
}

interface ModelPattern {
  model: string
  count: number
  prompts: string[]
}

/**
 * Analyze recent generations to detect patterns
 */
function analyzeGenerationPatterns(generations: Generation[]): ModelPattern[] {
  const patterns: Map<string, ModelPattern> = new Map()

  // Only look at recent generations (last 24 hours)
  const recentCutoff = Date.now() - 24 * 60 * 60 * 1000
  const recentGens = generations.filter(g =>
    new Date(g.created_at).getTime() > recentCutoff &&
    g.replicate_status === 'succeeded'
  )

  for (const gen of recentGens) {
    const existing = patterns.get(gen.model_slug)
    if (existing) {
      existing.count++
      existing.prompts.push(gen.prompt)
    } else {
      patterns.set(gen.model_slug, {
        model: gen.model_slug,
        count: 1,
        prompts: [gen.prompt],
      })
    }
  }

  return Array.from(patterns.values()).sort((a, b) => b.count - a.count)
}

/**
 * Detect keywords in prompts that suggest session types
 */
function detectSessionType(prompts: string[]): SessionType | null {
  const combined = prompts.join(' ').toLowerCase()

  // Product-related keywords
  const productKeywords = ['product', 'e-commerce', 'ecommerce', 'shop', 'store', 'listing', 'amazon', 'shopify', 'merchandise']
  if (productKeywords.some(k => combined.includes(k))) {
    return 'product-drop'
  }

  // Music/album keywords
  const albumKeywords = ['album', 'cover', 'music', 'artist', 'single', 'ep', 'track', 'spotify', 'vinyl']
  if (albumKeywords.some(k => combined.includes(k))) {
    return 'album-drop'
  }

  // Brand/marketing keywords
  const brandKeywords = ['brand', 'logo', 'identity', 'marketing', 'campaign', 'advertisement', 'ad']
  if (brandKeywords.some(k => combined.includes(k))) {
    return 'brand-sprint'
  }

  // Social/content keywords
  const socialKeywords = ['instagram', 'tiktok', 'social', 'content', 'post', 'story', 'reel', 'thumbnail']
  if (socialKeywords.some(k => combined.includes(k))) {
    return 'content-week'
  }

  return null
}

/**
 * Check if a prompt represents effective AI technique worth saving
 */
function detectEffectiveTechnique(prompt: string): boolean {
  const effectiveIndicators = [
    // Specific lighting descriptions
    /\b(rim lighting|key light|fill light|backlight|three-point|golden hour|blue hour|Rembrandt)\b/i,
    // Camera specifications
    /\b(\d+mm|f\/\d+(\.\d)?|depth of field|shallow dof|bokeh|wide angle|telephoto)\b/i,
    // Style references
    /\b(in the style of|inspired by|aesthetic of|mood of)\b/i,
    // Detailed composition
    /\b(rule of thirds|leading lines|symmetry|framing|foreground|background|mid-ground)\b/i,
    // Advanced prompting patterns
    /\b(cinematic|dramatic|volumetric|atmospheric|ethereal|moody)\b/i,
  ]

  let matchCount = 0
  for (const pattern of effectiveIndicators) {
    if (pattern.test(prompt)) matchCount++
  }

  // Consider effective if 3+ indicators present
  return matchCount >= 3
}

/**
 * Main analysis function - analyzes context and returns suggestions
 */
export function analyzeContext(
  messages: ChatMessage[],
  currentInput: string,
  recentGenerations: Generation[],
  allSkills: Skill[]
): SkinnySenseContext {
  const result: SkinnySenseContext = {
    suggestedSkills: [],
    suggestSession: false,
    suggestSaveSkill: false,
  }

  // 1. Analyze generation patterns for session suggestion
  const patterns = analyzeGenerationPatterns(recentGenerations)
  if (patterns.length > 0) {
    const topPattern = patterns[0]

    // Suggest session if 4+ generations of same type
    if (topPattern.count >= 4) {
      const sessionType = detectSessionType(topPattern.prompts)
      if (sessionType) {
        result.suggestSession = true
        result.sessionType = sessionType
        result.sessionReason = `You've created ${topPattern.count} ${topPattern.model.replace(/-/g, ' ')} images with similar themes.`
        result.patternDetected = `${topPattern.count} similar ${topPattern.model.replace(/-/g, ' ')} generations`
        result.patternCount = topPattern.count
      }
    }
  }

  // 2. Check recent AI messages for effective techniques to save
  const recentAssistantMessages = messages
    .filter(m => m.role === 'assistant')
    .slice(-5)

  for (const msg of recentAssistantMessages) {
    if (msg.generation?.result?.prompt) {
      if (detectEffectiveTechnique(msg.generation.result.prompt)) {
        result.suggestSaveSkill = true
        result.saveSkillReason = 'The AI used advanced prompting techniques in this generation that could be saved as a skill.'
        break
      }
    }
  }

  // 3. Suggest skills based on current input intent
  if (currentInput.length > 10) {
    const inputLower = currentInput.toLowerCase()

    // Find skills that match current intent but aren't already mentioned
    const alreadyMentioned = new Set(
      currentInput.match(/@\w+/g)?.map(m => m.slice(1)) || []
    )

    const suggestions = allSkills.filter(skill => {
      // Skip if already mentioned or no shortcut
      if (!skill.shortcut) return false
      if (alreadyMentioned.has(skill.shortcut)) return false
      if (!skill.isActive) return false

      // Check if skill tags match intent
      const tags = skill.tags.map(t => t.toLowerCase())
      return tags.some(tag => inputLower.includes(tag)) ||
             skill.name.toLowerCase().split(' ').some(word => inputLower.includes(word))
    }).slice(0, 3) // Max 3 suggestions

    result.suggestedSkills = suggestions
  }

  return result
}

/**
 * Get human-readable session type name
 */
export function getSessionTypeName(type: SessionType): string {
  const names: Record<SessionType, string> = {
    'product-drop': 'Product Drop',
    'album-drop': 'Album Drop',
    'brand-sprint': 'Brand Sprint',
    'content-week': 'Content Week',
  }
  return names[type] || type
}

/**
 * Get session type icon
 */
export function getSessionTypeIcon(type: SessionType): string {
  const icons: Record<SessionType, string> = {
    'product-drop': '📦',
    'album-drop': '🎵',
    'brand-sprint': '🎯',
    'content-week': '📱',
  }
  return icons[type] || '📋'
}
