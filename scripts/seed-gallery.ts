/**
 * Seed Gallery Script
 *
 * This script populates the gallery table with existing images from Supabase storage.
 * Run with: npx ts-node scripts/seed-gallery.ts
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bkbcoxyumovpqiqfcxoa.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrYmNveHl1bW92cHFpcWZjeG9hIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjUyMTIwMiwiZXhwIjoyMDcyMDk3MjAyfQ.YEgmQVN54dlgJCMomOgKRTOn49baOCdOuQVjI0S24OQ'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const BUCKET_NAME = 'gallery'
const STORAGE_PATH = 'creator-gallery'

// System user ID for seeded content (admin/platform user)
const SYSTEM_WHOP_USER_ID = 'system_gallery_seed'

interface StorageFile {
  name: string
  id: string
  created_at: string
}

function extractPromptFromFilename(filename: string): string {
  // Remove extension
  const nameWithoutExt = filename.replace(/\.(jpeg|jpg|png|webp)$/i, '')

  // Replace underscores with spaces
  const withSpaces = nameWithoutExt.replace(/_/g, ' ')

  // Remove trailing timestamp (12 digits)
  const withoutTimestamp = withSpaces.replace(/\s*\d{12}$/, '')

  // Capitalize first letter
  const cleaned = withoutTimestamp.trim()
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

function getRandomLikes(): number {
  // Initial likes between 10-150 for seeded content
  return Math.floor(Math.random() * 140) + 10
}

function getRandomViews(): number {
  // Initial views between 50-500 for seeded content
  return Math.floor(Math.random() * 450) + 50
}

async function seedGallery() {
  console.log('🌱 Starting gallery seed...\n')

  // 1. List all files from storage
  console.log('📁 Fetching files from storage...')
  const { data: files, error: listError } = await supabase.storage
    .from(BUCKET_NAME)
    .list(STORAGE_PATH, {
      limit: 200,
      sortBy: { column: 'created_at', order: 'desc' }
    })

  if (listError) {
    console.error('❌ Error listing files:', listError)
    process.exit(1)
  }

  if (!files || files.length === 0) {
    console.log('⚠️ No files found in storage')
    process.exit(0)
  }

  const imageFiles = files.filter((f: StorageFile) =>
    f.name.match(/\.(jpeg|jpg|png|webp)$/i)
  )

  console.log(`Found ${imageFiles.length} images in storage\n`)

  // 2. Check existing gallery entries
  const { data: existingGallery } = await supabase
    .from('gallery')
    .select('title')

  const existingTitles = new Set(existingGallery?.map(g => g.title) || [])

  let created = 0
  let skipped = 0

  // 3. Create gallery entries for each image
  for (const file of imageFiles) {
    const prompt = extractPromptFromFilename(file.name)
    const imageUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${STORAGE_PATH}/${file.name}`

    // Skip if already exists (by title)
    if (existingTitles.has(prompt)) {
      skipped++
      continue
    }

    // Create gallery entry without generation_id (storage-only image)
    const galleryEntry = {
      generation_id: null, // No linked generation for seeded images
      whop_user_id: SYSTEM_WHOP_USER_ID,
      user_id: null,
      title: prompt,
      description: prompt,
      image_url: imageUrl, // Store direct URL for seeded images
      tags: ['community', 'featured'],
      view_count: getRandomViews(),
      like_count: getRandomLikes(),
      remix_count: 0,
      is_featured: Math.random() > 0.7, // 30% chance of being featured
      is_hidden: false,
    }

    const { error: insertError } = await supabase
      .from('gallery')
      .insert(galleryEntry)

    if (insertError) {
      console.error(`❌ Failed to create entry for ${file.name}:`, insertError.message)
    } else {
      created++
      console.log(`✅ [${created}] Created: "${prompt.slice(0, 50)}..."`)
    }
  }

  console.log('\n--- Seed Complete ---')
  console.log(`✅ Created: ${created}`)
  console.log(`⏭️ Skipped (already exists): ${skipped}`)
  console.log(`📊 Total in gallery: ${created + (existingGallery?.length || 0)}`)

  // 4. Show sample of what was created
  const { data: sample } = await supabase
    .from('gallery')
    .select('id, title, like_count, view_count, is_featured')
    .order('created_at', { ascending: false })
    .limit(5)

  if (sample && sample.length > 0) {
    console.log('\n--- Sample Gallery Items ---')
    sample.forEach((item, i) => {
      console.log(`${i + 1}. ${item.title}`)
      console.log(`   Likes: ${item.like_count} | Views: ${item.view_count} | Featured: ${item.is_featured}`)
    })
  }
}

// Run the seed
seedGallery()
  .then(() => {
    console.log('\n🎉 Gallery seeding complete!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Seed failed:', error)
    process.exit(1)
  })
