import { NextRequest, NextResponse } from 'next/server'
import { sbAdmin } from '@/lib/supabaseAdmin'
import { hasWhopAuth, getWhopAuthFromHeaders, verifyWhopTokenAndGetProfile } from '@/lib/whop'
import Replicate from 'replicate'
import { v4 as uuidv4 } from 'uuid'

export const runtime = 'nodejs'

// Initialize Replicate client for fallback polling
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

// Determine if a URL or content type is video
function isVideoContent(url: string, contentType?: string): boolean {
  const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv']
  const videoMimeTypes = ['video/mp4', 'video/webm', 'video/quicktime']
  const urlLower = url.toLowerCase()
  if (videoExtensions.some(ext => urlLower.includes(ext))) return true
  if (contentType && videoMimeTypes.some(mime => contentType.includes(mime))) return true
  return false
}

// Get file extension from content type
function getExtensionFromContentType(contentType: string, isVideo: boolean): string {
  if (isVideo) {
    if (contentType.includes('mp4')) return 'mp4'
    if (contentType.includes('webm')) return 'webm'
    return 'mp4'
  }
  if (contentType.includes('png')) return 'png'
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg'
  return 'webp'
}

// Download media and upload to Supabase storage
async function saveMediaToStorage(mediaUrl: string, userId?: string): Promise<string> {
  try {
    const response = await fetch(mediaUrl)
    if (!response.ok) return mediaUrl

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const contentType = response.headers.get('content-type') || 'image/webp'
    const isVideo = isVideoContent(mediaUrl, contentType)
    const ext = getExtensionFromContentType(contentType, isVideo)
    const bucket = isVideo ? 'generated-videos' : 'generated-images'

    const filename = `${uuidv4()}.${ext}`
    const path = userId ? `${userId}/${filename}` : `anonymous/${filename}`

    const { error } = await sbAdmin.storage
      .from(bucket)
      .upload(path, buffer, { contentType, upsert: false })

    if (error) return mediaUrl

    const { data: urlData } = sbAdmin.storage.from(bucket).getPublicUrl(path)
    return urlData.publicUrl
  } catch {
    return mediaUrl
  }
}

// Extract URLs from Replicate output
// Handles various output formats: string URLs, arrays, FileOutput objects
function extractOutputUrls(output: any): string[] {
  if (!output) return []

  if (Array.isArray(output)) {
    return output.flatMap(item => {
      // Direct string URL
      if (typeof item === 'string' && item.startsWith('http')) {
        return [item]
      }
      // FileOutput object with url property (most common for Replicate)
      if (item?.url && typeof item.url === 'string') {
        return [item.url]
      }
      // Some formats use href
      if (item?.href && typeof item.href === 'string') {
        return [item.href]
      }
      // Try toString() as last resort - but check if it gives a valid URL
      const stringified = String(item)
      if (stringified.startsWith('http')) {
        return [stringified]
      }
      return []
    })
  }

  // Single string URL
  if (typeof output === 'string' && output.startsWith('http')) {
    return [output]
  }

  // Single FileOutput object
  if (output?.url && typeof output.url === 'string') {
    return [output.url]
  }

  return []
}

// GET /api/generations/[id] - Get a single generation by ID (for polling)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const isAuthenticated = await hasWhopAuth()
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { token, hintedId } = await getWhopAuthFromHeaders()
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId)
    if (!whop) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: generation, error } = await sbAdmin
      .from('generations')
      .select('id, replicate_status, output_urls, prompt, replicate_error, model_slug, replicate_prediction_id, whop_user_id, user_id, cost_cents, model_category, output_metadata, billing_status')
      .eq('id', params.id)
      .eq('whop_user_id', whop.id)  // Only user's own generations
      .single()

    if (error || !generation) {
      console.error('Generation fetch error:', error)
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // FALLBACK: If still starting/processing, check Replicate directly
    // This handles cases where the webhook failed to update the database
    if (
      (generation.replicate_status === 'starting' || generation.replicate_status === 'processing') &&
      generation.replicate_prediction_id
    ) {
      try {
        console.log('[Generations API] Fallback check for prediction:', generation.replicate_prediction_id)
        const prediction = await replicate.predictions.get(generation.replicate_prediction_id)

        if (prediction.status === 'succeeded' && prediction.output) {
          console.log('[Generations API] Prediction succeeded! Updating database...')

          // Extract and save output URLs
          const outputUrls = extractOutputUrls(prediction.output)
          if (outputUrls.length > 0) {
            const permanentUrls: string[] = []
            for (const tempUrl of outputUrls) {
              const permanentUrl = await saveMediaToStorage(tempUrl, generation.whop_user_id || undefined)
              permanentUrls.push(permanentUrl)
            }

            // Update database with status
            await sbAdmin
              .from('generations')
              .update({
                output_urls: permanentUrls,
                replicate_status: 'succeeded',
                completed_at: new Date().toISOString(),
              })
              .eq('id', generation.id)

            // Seedream 4.5 sequential generation multiplies cost by image count.
            const numImagesGenerated = permanentUrls.length
            let finalCostCents = generation.cost_cents || 0
            if (generation.model_slug === 'seedream-4.5' && numImagesGenerated > 1) {
              finalCostCents = (generation.cost_cents || 0) * numImagesGenerated
              console.log(`[Generations API] Seedream 4.5 sequential: ${numImagesGenerated} images × ${generation.cost_cents}¢ = ${finalCostCents}¢`)
            }

            // === BILLING via atomic RPC ===
            // Fast-path skip when billing_status is already terminal.
            const terminalBillingStatuses = ['charged', 'waived', 'refunded']
            const alreadyBilled = terminalBillingStatuses.includes(
              (generation.billing_status as string) || 'pending'
            )

            // Note: we call the RPC even when finalCostCents === 0. The RPC handles the
            // zero-cost case by recording a $0 charged tx and marking billing_status
            // terminal — keeps state machines consistent across paths.
            if (!alreadyBilled && generation.user_id) {
              const { data: billResult, error: billError } = await sbAdmin.rpc(
                'complete_generation_billing',
                {
                  p_generation_id: generation.id,
                  p_user_profile_id: generation.user_id,
                  p_whop_user_id: generation.whop_user_id,
                  p_amount_cents: finalCostCents,
                  p_model_slug: generation.model_slug,
                  p_model_category: generation.model_category,
                  p_preview_url: permanentUrls[0] || null,
                  p_extra_metadata: {
                    prompt: generation.prompt,
                    images_generated: numImagesGenerated,
                    ...(generation.model_slug === 'seedream-4.5' && numImagesGenerated > 1 && {
                      sequential_mode: true,
                      cost_per_image_cents: generation.cost_cents,
                      total_cost_cents: finalCostCents,
                    }),
                  },
                  p_path: 'poll',
                }
              )

              if (billError) {
                console.error('[Generations API] Billing RPC error:', billError)
              } else {
                console.log(`[Generations API] Billing RPC: ${billResult?.status}`, billResult)
                if (billResult?.status === 'insufficient_balance') {
                  console.warn(`[Generations API] Insufficient balance for gen ${generation.id}; marked billing_status=failed`)
                }
              }
            }

            // Record the final cost on the generation row (separate from billed_amount_cents owned by RPC).
            if (finalCostCents !== generation.cost_cents) {
              await sbAdmin
                .from('generations')
                .update({ cost_cents: finalCostCents })
                .eq('id', generation.id)
            }

            // Return updated generation
            return NextResponse.json({
              id: generation.id,
              replicate_status: 'succeeded',
              output_urls: permanentUrls,
              prompt: generation.prompt,
              replicate_error: null,
              model_slug: generation.model_slug,
            })
          }
        } else if (prediction.status === 'failed' || prediction.status === 'canceled') {
          console.log('[Generations API] Prediction failed:', prediction.error)

          await sbAdmin
            .from('generations')
            .update({
              replicate_status: prediction.status,
              replicate_error: prediction.error || 'Unknown error',
              completed_at: new Date().toISOString(),
            })
            .eq('id', generation.id)

          return NextResponse.json({
            id: generation.id,
            replicate_status: prediction.status,
            output_urls: [],
            prompt: generation.prompt,
            replicate_error: prediction.error || 'Unknown error',
            model_slug: generation.model_slug,
          })
        }
        // Still processing - return current state
      } catch (replicateError) {
        console.error('[Generations API] Replicate fallback check failed:', replicateError)
        // Continue with returning current database state
      }
    }

    return NextResponse.json({
      id: generation.id,
      replicate_status: generation.replicate_status,
      output_urls: generation.output_urls,
      prompt: generation.prompt,
      replicate_error: generation.replicate_error,
      model_slug: generation.model_slug,
    })
  } catch (error) {
    console.error('Generation fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch generation' }, { status: 500 })
  }
}
