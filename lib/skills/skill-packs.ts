/**
 * Skill Packs System
 *
 * Pre-curated collections of skills for common creative workflows.
 * Users can activate a pack to enable multiple related skills at once.
 */

export interface SkillPack {
  id: string
  name: string
  description: string
  icon: string
  skills: string[]  // Array of skill shortcuts
  color: string     // Tailwind color class for styling
}

export const skillPacks: SkillPack[] = [
  {
    id: 'product-pack',
    name: 'Product Photography',
    description: 'Professional product shots, e-commerce, lifestyle imagery',
    icon: '📦',
    skills: ['product', 'flux2', 'consistency', 'seedream'],
    color: 'amber',
  },
  {
    id: 'video-pack',
    name: 'Video Creator',
    description: 'AI video generation, motion, cinematic techniques',
    icon: '🎬',
    skills: ['veo', 'wan', 'kling', 'camera', 'cinematic'],
    color: 'purple',
  },
  {
    id: 'portrait-pack',
    name: 'Portrait Master',
    description: 'Professional portraits, realistic skin, creative lighting',
    icon: '👤',
    skills: ['portrait', 'skin-realism', 'creative-vision', 'flux2'],
    color: 'rose',
  },
  {
    id: 'social-pack',
    name: 'Social Media',
    description: 'Platform-optimized content with text overlay mastery',
    icon: '📱',
    skills: ['social', 'text', 'seedream', 'nano'],
    color: 'sky',
  },
  {
    id: 'storytelling-pack',
    name: 'Visual Storytelling',
    description: 'Storyboards, sequential art, narrative visuals',
    icon: '📖',
    skills: ['storyboard', 'cinematic', 'camera', 'consistency'],
    color: 'emerald',
  },
  {
    id: 'quality-pack',
    name: 'Quality Control',
    description: 'Anti-slop, consistency, professional output',
    icon: '✨',
    skills: ['anti-slop', 'consistency', 'creative-vision'],
    color: 'yellow',
  },
]

/**
 * Get a skill pack by ID
 */
export function getSkillPackById(id: string): SkillPack | undefined {
  return skillPacks.find(pack => pack.id === id)
}

/**
 * Get all skill shortcuts from a pack
 */
export function getPackSkillShortcuts(packId: string): string[] {
  const pack = getSkillPackById(packId)
  return pack?.skills || []
}
