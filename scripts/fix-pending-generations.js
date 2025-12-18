#!/usr/bin/env node

/**
 * Fix pending generations - check Replicate status and update database
 *
 * Run with: node scripts/fix-pending-generations.js
 * Requires env vars to be set or passed inline
 */

const Replicate = require('replicate')
const { createClient } = require('@supabase/supabase-js')
const { v4: uuidv4 } = require('uuid')
const fs = require('fs')
const path = require('path')

// Load env vars from .env.local manually
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=')
    if (key && valueParts.length > 0) {
      const value = valueParts.join('=').trim()
      if (!process.env[key.trim()]) {
        process.env[key.trim()] = value
      }
    }
  })
}

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!REPLICATE_API_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const replicate = new Replicate({ auth: REPLICATE_API_TOKEN })
const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Save image to Supabase storage
async function saveImageToStorage(imageUrl, userId) {
  try {
    const response = await fetch(imageUrl)
    if (!response.ok) {
      console.error(`Failed to fetch image: ${response.status}`)
      return null
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const contentType = response.headers.get('content-type') || 'image/webp'
    const ext = contentType.includes('png') ? 'png' : contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'webp'

    const filename = `${uuidv4()}.${ext}`
    const path = userId ? `${userId}/${filename}` : `anonymous/${filename}`

    const { error } = await sbAdmin.storage
      .from('generated-images')
      .upload(path, buffer, {
        contentType,
        upsert: false,
      })

    if (error) {
      console.error('Storage upload error:', error)
      return null
    }

    const { data: urlData } = sbAdmin.storage
      .from('generated-images')
      .getPublicUrl(path)

    return urlData.publicUrl
  } catch (error) {
    console.error('Error saving image to storage:', error)
    return null
  }
}

// Extract URLs from Replicate output
function extractOutputUrls(output) {
  if (!output) return []

  if (Array.isArray(output)) {
    return output.map(item => {
      if (typeof item === 'string') return item
      if (item && typeof item.url === 'function') return item.url()
      if (item && item.href) return item.href
      if (item && typeof item.toString === 'function') return item.toString()
      return String(item)
    }).filter(url => url && url.startsWith('http'))
  }

  if (typeof output === 'string' && output.startsWith('http')) {
    return [output]
  }

  if (output && output.url) {
    return [typeof output.url === 'function' ? output.url() : output.url]
  }

  return []
}

async function main() {
  console.log('Fetching pending generations from database...')

  // Find generations stuck in "starting" status that have replicate_prediction_id
  const { data: pendingGenerations, error: fetchError } = await sbAdmin
    .from('generations')
    .select('id, replicate_prediction_id, whop_user_id, cost_cents, prompt')
    .eq('replicate_status', 'starting')
    .not('replicate_prediction_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50)

  if (fetchError) {
    console.error('Error fetching generations:', fetchError)
    process.exit(1)
  }

  if (!pendingGenerations || pendingGenerations.length === 0) {
    console.log('No pending generations found')
    return
  }

  console.log(`Found ${pendingGenerations.length} pending generations with prediction IDs`)

  let completedCount = 0
  let failedCount = 0
  let stillProcessingCount = 0

  for (const generation of pendingGenerations) {
    if (!generation.replicate_prediction_id) continue

    console.log(`\nChecking generation ${generation.id}...`)
    console.log(`  Prompt: ${generation.prompt?.slice(0, 50)}...`)
    console.log(`  Prediction ID: ${generation.replicate_prediction_id}`)

    try {
      // Get prediction status from Replicate
      const prediction = await replicate.predictions.get(generation.replicate_prediction_id)
      console.log(`  Replicate status: ${prediction.status}`)
      console.log(`  Raw output:`, JSON.stringify(prediction.output, null, 2)?.slice(0, 500))

      if (prediction.status === 'succeeded') {
        // Extract output URLs
        const outputUrls = extractOutputUrls(prediction.output)
        console.log(`  Output URLs: ${outputUrls.length}`)

        if (outputUrls.length === 0) {
          console.log('  No output URLs - marking as failed')
          await sbAdmin
            .from('generations')
            .update({
              replicate_status: 'failed',
              replicate_error: 'No output URLs returned',
              completed_at: new Date().toISOString(),
            })
            .eq('id', generation.id)
          failedCount++
          continue
        }

        // Upload images to permanent storage
        console.log('  Uploading to storage...')
        const permanentUrls = []
        for (const tempUrl of outputUrls) {
          const permanentUrl = await saveImageToStorage(tempUrl, generation.whop_user_id || undefined)
          permanentUrls.push(permanentUrl || tempUrl)
        }

        // Update generation with success
        const { error: updateError } = await sbAdmin
          .from('generations')
          .update({
            output_urls: permanentUrls,
            replicate_status: 'succeeded',
            completed_at: new Date().toISOString(),
          })
          .eq('id', generation.id)

        if (updateError) {
          console.error('  Error updating generation:', updateError)
        } else {
          console.log(`  SUCCESS - Updated with ${permanentUrls.length} images`)
          completedCount++
        }

      } else if (prediction.status === 'failed' || prediction.status === 'canceled') {
        // Handle failure
        await sbAdmin
          .from('generations')
          .update({
            replicate_status: prediction.status,
            replicate_error: prediction.error || 'Unknown error',
            completed_at: new Date().toISOString(),
          })
          .eq('id', generation.id)

        console.log(`  FAILED: ${prediction.error || 'Unknown error'}`)
        failedCount++

      } else {
        // Still processing
        if (prediction.status === 'processing') {
          await sbAdmin
            .from('generations')
            .update({ replicate_status: 'processing' })
            .eq('id', generation.id)
        }
        console.log('  Still processing...')
        stillProcessingCount++
      }

    } catch (predError) {
      console.error(`  Error checking prediction:`, predError.message)

      // If prediction not found, mark as failed
      if (predError.message?.includes('not found') || predError.message?.includes('404')) {
        await sbAdmin
          .from('generations')
          .update({
            replicate_status: 'failed',
            replicate_error: 'Prediction not found',
            completed_at: new Date().toISOString(),
          })
          .eq('id', generation.id)
        failedCount++
      }
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  console.log(`\n=== Summary ===`)
  console.log(`Completed: ${completedCount}`)
  console.log(`Failed: ${failedCount}`)
  console.log(`Still processing: ${stillProcessingCount}`)
}

main().catch(console.error)
