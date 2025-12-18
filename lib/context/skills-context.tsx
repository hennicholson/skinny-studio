'use client'

import { createContext, useContext, useReducer, useCallback, ReactNode, useEffect } from 'react'
import { Skill, SkillCategory, builtInSkills } from '@/lib/types'
import { saveToStorage, loadFromStorage } from '@/lib/storage'

const STORAGE_KEY = 'skinny_skills'

// Generate unique ID
function generateId() {
  return `skill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Initialize built-in skills with IDs
function initializeBuiltInSkills(): Skill[] {
  return builtInSkills.map((skill, index) => ({
    ...skill,
    id: `builtin_${index}`,
    createdAt: new Date('2024-01-01'),
    usageCount: 0,
  }))
}

interface SkillsState {
  skills: Skill[]
  activeSkillIds: string[]  // Skills currently enabled
  isLoaded: boolean
}

type SkillsAction =
  | { type: 'LOAD_SKILLS'; payload: Skill[] }
  | { type: 'ADD_SKILL'; payload: Skill }
  | { type: 'UPDATE_SKILL'; payload: { id: string; updates: Partial<Skill> } }
  | { type: 'DELETE_SKILL'; payload: string }
  | { type: 'TOGGLE_SKILL'; payload: string }
  | { type: 'INCREMENT_USAGE'; payload: string }
  | { type: 'SET_LOADED' }

const initialState: SkillsState = {
  skills: [],
  activeSkillIds: [],
  isLoaded: false,
}

function skillsReducer(state: SkillsState, action: SkillsAction): SkillsState {
  switch (action.type) {
    case 'LOAD_SKILLS':
      const activeIds = action.payload.filter(s => s.isActive).map(s => s.id)
      return {
        ...state,
        skills: action.payload,
        activeSkillIds: activeIds,
        isLoaded: true,
      }

    case 'ADD_SKILL':
      return {
        ...state,
        skills: [...state.skills, action.payload],
        activeSkillIds: action.payload.isActive
          ? [...state.activeSkillIds, action.payload.id]
          : state.activeSkillIds,
      }

    case 'UPDATE_SKILL':
      return {
        ...state,
        skills: state.skills.map(skill =>
          skill.id === action.payload.id
            ? { ...skill, ...action.payload.updates, updatedAt: new Date() }
            : skill
        ),
      }

    case 'DELETE_SKILL':
      return {
        ...state,
        skills: state.skills.filter(s => s.id !== action.payload),
        activeSkillIds: state.activeSkillIds.filter(id => id !== action.payload),
      }

    case 'TOGGLE_SKILL':
      const skill = state.skills.find(s => s.id === action.payload)
      if (!skill) return state

      const newIsActive = !skill.isActive
      return {
        ...state,
        skills: state.skills.map(s =>
          s.id === action.payload ? { ...s, isActive: newIsActive } : s
        ),
        activeSkillIds: newIsActive
          ? [...state.activeSkillIds, action.payload]
          : state.activeSkillIds.filter(id => id !== action.payload),
      }

    case 'INCREMENT_USAGE':
      return {
        ...state,
        skills: state.skills.map(skill =>
          skill.id === action.payload
            ? { ...skill, usageCount: skill.usageCount + 1 }
            : skill
        ),
      }

    case 'SET_LOADED':
      return { ...state, isLoaded: true }

    default:
      return state
  }
}

// Intent-to-skill mapping for AI suggestions
// Comprehensive mapping of user intents to relevant skill shortcuts
const INTENT_SKILL_MAP: Record<string, string[]> = {
  // Video & Motion intents
  video: ['cinematic', 'veo', 'motion', 'animation'],
  cinematic: ['cinematic', 'veo', 'motion'],
  movie: ['cinematic', 'veo', 'motion'],
  film: ['cinematic', 'veo', 'motion'],
  animation: ['veo', 'motion', 'animation'],
  motion: ['veo', 'cinematic', 'motion'],
  clip: ['veo', 'cinematic', 'social'],
  reel: ['social', 'veo', 'cinematic'],

  // Product & Commercial intents
  product: ['product-photo', 'product', 'ecommerce', 'commercial'],
  ecommerce: ['product-photo', 'ecommerce', 'commercial'],
  commercial: ['product-photo', 'commercial'],
  advertising: ['product-photo', 'commercial', 'social'],
  marketing: ['product-photo', 'commercial', 'social', 'text'],
  brand: ['product-photo', 'commercial', 'text'],

  // Portrait & People intents
  portrait: ['portrait', 'headshot', 'face', 'character'],
  headshot: ['portrait', 'headshot'],
  face: ['portrait', 'headshot'],
  person: ['portrait', 'character'],
  character: ['portrait', 'character', 'anime'],
  selfie: ['portrait', 'social'],

  // Social Media intents
  social: ['social', 'instagram', 'tiktok', 'reels'],
  instagram: ['social', 'instagram'],
  tiktok: ['social', 'tiktok', 'veo'],
  reels: ['social', 'veo', 'cinematic'],
  post: ['social', 'instagram'],
  story: ['social', 'instagram'],

  // Text & Typography intents
  text: ['text', 'typography', 'logo'],
  typography: ['text', 'typography'],
  logo: ['text', 'logo'],
  poster: ['text', 'typography', 'cinematic'],
  banner: ['text', 'typography', 'social'],
  sign: ['text', 'typography'],
  title: ['text', 'typography', 'cinematic'],

  // Artistic Style intents
  anime: ['anime', 'manga', 'illustration'],
  manga: ['anime', 'manga'],
  illustration: ['anime', 'illustration', 'artistic'],
  cartoon: ['anime', 'illustration'],
  artistic: ['artistic', 'creative', 'abstract'],
  creative: ['artistic', 'creative', 'abstract'],

  // Environment & Scene intents
  landscape: ['landscape', 'nature', 'scenic'],
  nature: ['landscape', 'nature', 'scenic'],
  scenic: ['landscape', 'scenic', 'cinematic'],
  environment: ['landscape', 'cinematic'],
  background: ['landscape', 'scenic'],

  // Abstract & Experimental intents
  abstract: ['abstract', 'artistic', 'creative'],
  experimental: ['abstract', 'artistic', 'creative'],
  surreal: ['abstract', 'artistic', 'creative'],

  // Sequential & Multi-image intents
  storyboard: ['storyboard', 'sequential', 'multi-image', 'comic', 'narrative'],
  sequential: ['storyboard', 'sequential', 'variations'],
  variations: ['storyboard', 'sequential', 'variations'],
  series: ['storyboard', 'sequential'],
  comic: ['storyboard', 'comic', 'anime'],
  narrative: ['storyboard', 'narrative', 'cinematic'],
  multiple: ['storyboard', 'sequential', 'variations'],

  // Editing intents
  edit: ['edit', 'retouch'],
  modify: ['edit', 'retouch'],
  change: ['edit'],
  remove: ['edit'],
  'background-edit': ['edit', 'product-photo'],
}

interface SkillsContextValue {
  state: SkillsState
  // CRUD operations
  addSkill: (skill: Omit<Skill, 'id' | 'createdAt' | 'usageCount'>) => string
  updateSkill: (id: string, updates: Partial<Skill>) => void
  deleteSkill: (id: string) => void
  toggleSkill: (id: string) => void
  incrementUsage: (id: string) => void
  // Queries
  getSkillById: (id: string) => Skill | undefined
  getSkillByShortcut: (shortcut: string) => Skill | undefined
  getActiveSkills: () => Skill[]
  getSkillsByCategory: (category: SkillCategory) => Skill[]
  searchSkills: (query: string) => Skill[]
  // Intent-based skill discovery
  getSkillsByIntent: (intent: string) => Skill[]
  getSkillExplanation: (shortcut: string) => string | null
  // For chat integration
  parseSkillReferences: (text: string) => { text: string; skills: Skill[] }
  getSkillsContext: () => string  // Returns formatted skills for system prompt
}

const SkillsContext = createContext<SkillsContextValue | null>(null)

export function SkillsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(skillsReducer, initialState)

  // Load skills from storage on mount
  useEffect(() => {
    const loadSkills = () => {
      const stored = loadFromStorage<Skill[]>(STORAGE_KEY)
      if (stored && stored.length > 0) {
        // Merge with built-in skills (in case new ones were added)
        const builtIns = initializeBuiltInSkills()
        const userSkills = stored.filter(s => !s.isBuiltIn)
        const storedBuiltIns = stored.filter(s => s.isBuiltIn)

        // Update built-in skills but preserve user's active state
        const mergedBuiltIns = builtIns.map(bi => {
          const existing = storedBuiltIns.find(s => s.shortcut === bi.shortcut)
          return existing ? { ...bi, isActive: existing.isActive, usageCount: existing.usageCount } : bi
        })

        dispatch({ type: 'LOAD_SKILLS', payload: [...mergedBuiltIns, ...userSkills] })
      } else {
        // First load - initialize with built-in skills
        dispatch({ type: 'LOAD_SKILLS', payload: initializeBuiltInSkills() })
      }
    }
    loadSkills()
  }, [])

  // Save to storage whenever skills change
  useEffect(() => {
    if (state.isLoaded && state.skills.length > 0) {
      saveToStorage(STORAGE_KEY, state.skills)
    }
  }, [state.skills, state.isLoaded])

  const addSkill = useCallback((skillData: Omit<Skill, 'id' | 'createdAt' | 'usageCount'>) => {
    const id = generateId()
    const skill: Skill = {
      ...skillData,
      id,
      createdAt: new Date(),
      usageCount: 0,
    }
    dispatch({ type: 'ADD_SKILL', payload: skill })
    return id
  }, [])

  const updateSkill = useCallback((id: string, updates: Partial<Skill>) => {
    dispatch({ type: 'UPDATE_SKILL', payload: { id, updates } })
  }, [])

  const deleteSkill = useCallback((id: string) => {
    // Prevent deleting built-in skills
    const skill = state.skills.find(s => s.id === id)
    if (skill?.isBuiltIn) return
    dispatch({ type: 'DELETE_SKILL', payload: id })
  }, [state.skills])

  const toggleSkill = useCallback((id: string) => {
    dispatch({ type: 'TOGGLE_SKILL', payload: id })
  }, [])

  const incrementUsage = useCallback((id: string) => {
    dispatch({ type: 'INCREMENT_USAGE', payload: id })
  }, [])

  const getSkillById = useCallback((id: string) => {
    return state.skills.find(s => s.id === id)
  }, [state.skills])

  const getSkillByShortcut = useCallback((shortcut: string) => {
    return state.skills.find(s => s.shortcut === shortcut && s.isActive)
  }, [state.skills])

  const getActiveSkills = useCallback(() => {
    return state.skills.filter(s => s.isActive)
  }, [state.skills])

  const getSkillsByCategory = useCallback((category: SkillCategory) => {
    return state.skills.filter(s => s.category === category)
  }, [state.skills])

  const searchSkills = useCallback((query: string) => {
    const lower = query.toLowerCase()
    return state.skills.filter(s =>
      s.name.toLowerCase().includes(lower) ||
      s.description.toLowerCase().includes(lower) ||
      s.tags.some(t => t.toLowerCase().includes(lower)) ||
      s.shortcut?.toLowerCase().includes(lower)
    )
  }, [state.skills])

  // Get skills relevant to a user intent (e.g., "video", "product", "portrait")
  const getSkillsByIntent = useCallback((intent: string): Skill[] => {
    const lowerIntent = intent.toLowerCase()

    // Get relevant keywords for this intent
    const keywords = INTENT_SKILL_MAP[lowerIntent] || [lowerIntent]

    // Find active skills that match any of these keywords
    return state.skills.filter(skill => {
      if (!skill.isActive) return false

      // Check shortcut match
      if (keywords.some(k => skill.shortcut?.toLowerCase().includes(k))) return true

      // Check name match
      if (keywords.some(k => skill.name.toLowerCase().includes(k))) return true

      // Check tags match
      if (skill.tags.some(tag => keywords.some(k => tag.toLowerCase().includes(k)))) return true

      // Check description match (less strict)
      if (keywords.some(k => skill.description.toLowerCase().includes(k))) return true

      return false
    })
  }, [state.skills])

  // Get a formatted explanation of a skill for display or AI response
  const getSkillExplanation = useCallback((shortcut: string): string | null => {
    const skill = state.skills.find(s => s.shortcut === shortcut)
    if (!skill) return null

    // Extract first 3-5 bullet points or lines from content
    const contentLines = skill.content.split('\n').filter(line => line.trim())
    const keyPoints = contentLines.slice(0, 5)

    let explanation = `**@${skill.shortcut}** - ${skill.description}\n\n`
    explanation += `Key techniques:\n`
    keyPoints.forEach(point => {
      // Clean up the point formatting
      const cleanPoint = point.replace(/^[-•*]\s*/, '').trim()
      if (cleanPoint) {
        explanation += `- ${cleanPoint}\n`
      }
    })

    if (skill.examples && skill.examples.length > 0) {
      explanation += `\nExample: \`${skill.examples[0]}\``
    }

    return explanation
  }, [state.skills])

  // Parse @skill references in text and return the skills found
  const parseSkillReferences = useCallback((text: string) => {
    const skillRegex = /@([\w-]+)/g
    const foundSkills: Skill[] = []
    let match: RegExpExecArray | null

    while ((match = skillRegex.exec(text)) !== null) {
      const shortcut = match[1]
      const skill = state.skills.find(s => s.shortcut === shortcut && s.isActive)
      if (skill && !foundSkills.find(s => s.id === skill.id)) {
        foundSkills.push(skill)
        // Increment usage
        dispatch({ type: 'INCREMENT_USAGE', payload: skill.id })
      }
    }

    return { text, skills: foundSkills }
  }, [state.skills])

  // Get formatted skills context for system prompt
  const getSkillsContext = useCallback(() => {
    const activeSkills = state.skills.filter(s => s.isActive)
    if (activeSkills.length === 0) return ''

    let context = '\n\n## Active Skills & Guides\n'
    context += 'The user has the following skills/guides available. When they reference @shortcut, apply that skill\'s guidance:\n\n'

    for (const skill of activeSkills) {
      context += `### ${skill.icon || '📌'} ${skill.name} (@${skill.shortcut})\n`
      context += `${skill.content}\n\n`
    }

    return context
  }, [state.skills])

  const value: SkillsContextValue = {
    state,
    addSkill,
    updateSkill,
    deleteSkill,
    toggleSkill,
    incrementUsage,
    getSkillById,
    getSkillByShortcut,
    getActiveSkills,
    getSkillsByCategory,
    searchSkills,
    getSkillsByIntent,
    getSkillExplanation,
    parseSkillReferences,
    getSkillsContext,
  }

  return <SkillsContext.Provider value={value}>{children}</SkillsContext.Provider>
}

export function useSkills() {
  const context = useContext(SkillsContext)
  if (!context) {
    throw new Error('useSkills must be used within a SkillsProvider')
  }
  return context
}
