import type { Config } from "@netlify/functions"
import { createClient } from '@supabase/supabase-js'
import Replicate from 'replicate'

// Generate UUID (simple version for Netlify functions)
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

export default async (req: Request) => {
  const { next_run } = await req.json()
  console.log("[Poll Pending] Running poll job. Next run:", next_run)

  // Get credentials from environment
  const supabaseUrl = Netlify.env.get('NEXT_PUBLIC_SUPABASE_URL')
  const supabaseServiceKey = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const replicateToken = Netlify.env.get('REPLICATE_API_TOKEN')

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[Poll Pending] Missing Supabase credentials')
    return
  }

  if (!replicateToken) {
    console.error('[Poll Pending] Missing Replicate API token')
    return
  }

  const sbAdmin = createClient(supabaseUrl, supabaseServiceKey)
  const replicate = new Replicate({ auth: replicateToken })

  // Save image from URL to Supabase storage
  async function saveImageToStorage(imageUrl: string, userId?: string): Promise<string | null> {
    try {
      const response = await fetch(imageUrl)
      if (!response.ok) {
        console.error(`[Poll Pending] Failed to fetch image: ${response.status}`)
        return null
      }

      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      const contentType = response.headers.get('content-type') || 'image/webp'
      const ext = contentType.includes('png') ? 'png' : contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'webp'

      const filename = `${generateUUID()}.${ext}`
      const path = userId ? `${userId}/${filename}` : `anonymous/${filename}`

      const { error } = await sbAdmin.storage
        .from('generated-images')
        .upload(path, buffer, {
          contentType,
          upsert: false,
        })

      if (error) {
        console.error('[Poll Pending] Storage upload error:', error)
        return null
      }

      const { data: urlData } = sbAdmin.storage
        .from('generated-images')
        .getPublicUrl(path)

      return urlData.publicUrl
    } catch (error) {
      console.error('[Poll Pending] Error saving image to storage:', error)
      return null
    }
  }

  // Extract URLs from Replicate output
  function extractOutputUrls(output: any): string[] {
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

  try {
    // Find generations stuck in "starting" status that have replicate_prediction_id
    // These are generations where the function timed out
    const { data: pendingGenerations, error: fetchError } = await sbAdmin
      .from('generations')
      .select('id, replicate_prediction_id, whop_user_id, cost_cents')
      .eq('replicate_status', 'starting')
      .not('replicate_prediction_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(20)

    if (fetchError) {
      console.error('[Poll Pending] Error fetching generations:', fetchError)
      return
    }

    if (!pendingGenerations || pendingGenerations.length === 0) {
      console.log('[Poll Pending] No pending generations found')
      return
    }

    console.log(`[Poll Pending] Found ${pendingGenerations.length} pending generations with prediction IDs`)

    let completedCount = 0
    let failedCount = 0
    let stillProcessingCount = 0

    for (const generation of pendingGenerations) {
      if (!generation.replicate_prediction_id) continue

      try {
        // Get prediction status from Replicate
        const prediction = await replicate.predictions.get(generation.replicate_prediction_id)
        console.log(`[Poll Pending] Prediction ${generation.replicate_prediction_id} status: ${prediction.status}`)

        if (prediction.status === 'succeeded') {
          // Extract output URLs
          const outputUrls = extractOutputUrls(prediction.output)

          if (outputUrls.length === 0) {
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
          const permanentUrls: string[] = []
          for (const tempUrl of outputUrls) {
            const permanentUrl = await saveImageToStorage(tempUrl, generation.whop_user_id || undefined)
            permanentUrls.push(permanentUrl || tempUrl)
          }

          // Update generation with success
          await sbAdmin
            .from('generations')
            .update({
              output_urls: permanentUrls,
              replicate_status: 'succeeded',
              completed_at: new Date().toISOString(),
            })
            .eq('id', generation.id)

          console.log(`[Poll Pending] Updated generation ${generation.id} with ${permanentUrls.length} images`)
          completedCount++

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

          console.log(`[Poll Pending] Generation ${generation.id} failed: ${prediction.error}`)
          failedCount++

        } else {
          // Still processing (starting or processing)
          if (prediction.status === 'processing') {
            await sbAdmin
              .from('generations')
              .update({ replicate_status: 'processing' })
              .eq('id', generation.id)
          }
          stillProcessingCount++
        }

      } catch (predError: any) {
        console.error(`[Poll Pending] Error checking prediction ${generation.replicate_prediction_id}:`, predError.message)

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
    }

    console.log(`[Poll Pending] Done. Completed: ${completedCount}, Failed: ${failedCount}, Still processing: ${stillProcessingCount}`)
  } catch (error) {
    console.error('[Poll Pending] Error:', error)
  }
}

export const config: Config = {
  // Run every 2 minutes to catch pending generations quickly
  schedule: "*/2 * * * *"
}
