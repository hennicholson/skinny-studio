/**
 * Session Templates - Pre-defined creative missions
 *
 * Each template defines a structured workflow with specific assets,
 * model recommendations, and skill associations.
 */

import { SessionTemplate, SessionAssetTemplate } from '@/lib/types'

// Product Drop - E-commerce & Product Launch Assets
const productDropAssets: SessionAssetTemplate[] = [
  {
    id: 'pd-hero',
    name: 'Hero Shot',
    description: 'Main product image, clean background, professional lighting',
    aspectRatio: '1:1',
    modelSuggestion: 'seedream-4.5',
    skills: ['product'],
    required: true,
  },
  {
    id: 'pd-lifestyle',
    name: 'Lifestyle Shot',
    description: 'Product in use or styled environment',
    aspectRatio: '4:5',
    modelSuggestion: 'flux-2-pro',
    skills: ['product'],
    required: true,
  },
  {
    id: 'pd-stories',
    name: 'Instagram Stories',
    description: 'Vertical format for social stories',
    aspectRatio: '9:16',
    modelSuggestion: 'seedream-4.5',
    skills: ['social', 'product'],
    required: false,
  },
  {
    id: 'pd-thumbnail',
    name: 'Video Thumbnail',
    description: 'Eye-catching thumbnail for product videos',
    aspectRatio: '16:9',
    modelSuggestion: 'flux-2-pro',
    skills: ['text', 'product'],
    required: false,
  },
]

// Album Drop - Music Release Assets
const albumDropAssets: SessionAssetTemplate[] = [
  {
    id: 'ad-cover',
    name: 'Album Cover',
    description: 'Main square album artwork',
    aspectRatio: '1:1',
    modelSuggestion: 'flux-2-pro',
    skills: ['creative-vision'],
    required: true,
  },
  {
    id: 'ad-banner',
    name: 'Spotify Banner',
    description: 'Wide banner for streaming platforms',
    aspectRatio: '16:9',
    modelSuggestion: 'seedream-4.5',
    skills: ['creative-vision'],
    required: true,
  },
  {
    id: 'ad-promo',
    name: 'Social Promo',
    description: 'Square promotional image for social posts',
    aspectRatio: '1:1',
    modelSuggestion: 'flux-2-pro',
    skills: ['social', 'text'],
    required: false,
  },
  {
    id: 'ad-visualizer',
    name: 'Visualizer Loop',
    description: 'Short video loop for music videos',
    aspectRatio: '16:9',
    modelSuggestion: 'veo-3.1',
    skills: ['cinematic'],
    required: false,
  },
]

// Brand Sprint - Brand Identity Assets
const brandSprintAssets: SessionAssetTemplate[] = [
  {
    id: 'bs-hero',
    name: 'Brand Hero',
    description: 'Main brand visual / key art',
    aspectRatio: '16:9',
    modelSuggestion: 'flux-2-pro',
    skills: ['creative-vision'],
    required: true,
  },
  {
    id: 'bs-social-square',
    name: 'Social Profile',
    description: 'Square image for profile pictures',
    aspectRatio: '1:1',
    modelSuggestion: 'seedream-4.5',
    skills: ['consistency'],
    required: true,
  },
  {
    id: 'bs-banner',
    name: 'Website Banner',
    description: 'Wide banner for website headers',
    aspectRatio: '21:9',
    modelSuggestion: 'flux-2-pro',
    skills: ['creative-vision'],
    required: false,
  },
  {
    id: 'bs-pattern',
    name: 'Brand Pattern',
    description: 'Repeatable pattern for backgrounds',
    aspectRatio: '1:1',
    modelSuggestion: 'seedream-4.5',
    skills: ['consistency'],
    required: false,
  },
]

// Content Week - Social Media Content Pack
const contentWeekAssets: SessionAssetTemplate[] = [
  {
    id: 'cw-feed-1',
    name: 'Feed Post 1',
    description: 'Square post for Instagram/Facebook feed',
    aspectRatio: '1:1',
    modelSuggestion: 'seedream-4.5',
    skills: ['social'],
    required: true,
  },
  {
    id: 'cw-feed-2',
    name: 'Feed Post 2',
    description: 'Portrait post for feeds',
    aspectRatio: '4:5',
    modelSuggestion: 'seedream-4.5',
    skills: ['social'],
    required: true,
  },
  {
    id: 'cw-story',
    name: 'Story/Reel Cover',
    description: 'Vertical format for stories and reels',
    aspectRatio: '9:16',
    modelSuggestion: 'seedream-4.5',
    skills: ['social'],
    required: true,
  },
  {
    id: 'cw-thumbnail',
    name: 'YouTube Thumbnail',
    description: 'Wide thumbnail with text space',
    aspectRatio: '16:9',
    modelSuggestion: 'flux-2-pro',
    skills: ['social', 'text'],
    required: false,
  },
  {
    id: 'cw-carousel',
    name: 'Carousel Set',
    description: 'Multiple slides for carousel posts',
    aspectRatio: '1:1',
    modelSuggestion: 'seedream-4.5',
    skills: ['social', 'consistency'],
    required: false,
  },
]

// Icon names map to lucide icons (not emojis)
export const sessionTemplates: SessionTemplate[] = [
  {
    id: 'product-drop',
    name: 'Product Drop',
    description: 'Complete asset pack for product launches: hero shots, lifestyle images, social content',
    icon: 'Package',
    type: 'product-drop',
    assets: productDropAssets,
    defaultSkills: ['product', 'consistency'],
  },
  {
    id: 'album-drop',
    name: 'Album Drop',
    description: 'Music release visuals: cover art, banners, promotional images, visualizers',
    icon: 'Music',
    type: 'album-drop',
    assets: albumDropAssets,
    defaultSkills: ['creative-vision', 'cinematic'],
  },
  {
    id: 'brand-sprint',
    name: 'Brand Sprint',
    description: 'Brand identity essentials: hero visuals, social profiles, website assets',
    icon: 'Target',
    type: 'brand-sprint',
    assets: brandSprintAssets,
    defaultSkills: ['consistency', 'creative-vision'],
  },
  {
    id: 'content-week',
    name: 'Content Week',
    description: 'Social media content pack: feed posts, stories, thumbnails, carousels',
    icon: 'Smartphone',
    type: 'content-week',
    assets: contentWeekAssets,
    defaultSkills: ['social', 'text'],
  },
]

/**
 * Get a session template by ID
 */
export function getSessionTemplate(id: string): SessionTemplate | undefined {
  return sessionTemplates.find(t => t.id === id)
}

/**
 * Get session template by type
 */
export function getSessionTemplateByType(type: string): SessionTemplate | undefined {
  return sessionTemplates.find(t => t.type === type)
}

/**
 * Get required assets count for a template
 */
export function getRequiredAssetsCount(template: SessionTemplate): number {
  return template.assets.filter(a => a.required).length
}

/**
 * Get total assets count for a template
 */
export function getTotalAssetsCount(template: SessionTemplate): number {
  return template.assets.length
}
