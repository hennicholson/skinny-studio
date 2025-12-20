# Skinny Studio Fresh - Development Guide

## Project Overview
Skinny Studio is an AI-powered creative workspace built with Next.js 14, Supabase, and Whop integration. It features storyboard creation, AI image generation via Replicate, and a chat-based creative director interface.

## Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Database**: Supabase (PostgreSQL)
- **Auth**: Whop SDK
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion
- **AI Generation**: Replicate API (Flux models)
- **Deployment**: Netlify

## Quick Start
```bash
npm install
npm run dev
# Opens on http://localhost:3000
```

## Project Structure
```
app/                    # Next.js App Router pages
  api/                  # API routes
  admin/                # Admin dashboard
  skinny-demo/          # UI component demo page
components/
  storyboard/           # Storyboard feature components
  gallery/              # Gallery/explore components
  ui/                   # Reusable UI components
  modals/               # Modal components
lib/
  context/              # React context providers
  supabase/             # Supabase client & queries
packages/
  skinny-ui/            # Design system package (WIP)
```

## Key Features

### Storyboard System
- **Shot Editor**: Edit shots with AI generation, reference images
- **Entity System**: Characters, Worlds, Objects, Styles that can be referenced
- **Timeline**: Visual shot arrangement
- **Slideshow Preview**: Present storyboards with overlay chat

### AI Generation
- Uses Replicate API with Flux models
- Supports reference images for style consistency
- Cost estimation before generation

### Chat Interface
- Gemini 2.5 Flash for creative direction
- Context-aware suggestions
- Can modify storyboards via natural language

## Environment Variables
Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
REPLICATE_API_TOKEN=
WHOP_API_KEY=
GOOGLE_AI_API_KEY=
```

## Common Tasks

### Adding a New Component
1. Create in `components/ui/` or feature folder
2. Use Tailwind + Framer Motion
3. Follow glass styling patterns from existing components

### Modifying Storyboard Features
Key files:
- `components/storyboard/shot-edit-modal.tsx` - Shot editing
- `components/storyboard/storyboard-view.tsx` - Main view
- `lib/context/storyboard-context.tsx` - State management
- `app/api/storyboards/` - API routes

### Working with Entities
- Entities: Characters, Worlds, Objects, Styles
- Stored in Supabase `entities` table
- Used as references in shot generation

## Design Patterns

### Glass Styling
```tsx
// Standard glass card
className="bg-white/[0.03] backdrop-blur-md border border-white/[0.05] rounded-xl"

// Glass with hover
className="hover:bg-white/[0.05] hover:border-skinny-lime/20"
```

### Brand Colors
- Primary: `skinny-lime` (#D6FC51)
- Secondary: `skinny-green` (#B8FF00)

### Animation Pattern
```tsx
import { motion } from 'framer-motion';

<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.2 }}
/>
```

## Recent Changes
- Added entity reference selection to shot editor
- Removed chat model selector (now uses Gemini 2.5 Flash)
- Added slideshow preview modal
- Started @skinny/ui design system package

## Notes
- Always use `'use client'` for components with hooks/interactivity
- Supabase queries use service role key server-side
- Whop handles authentication and user verification
