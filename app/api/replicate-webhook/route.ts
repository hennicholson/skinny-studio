import { NextResponse } from 'next/server'
import { sbAdmin } from '@/lib/supabaseAdmin'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'

export const runtime = 'nodejs'

// Verify Replicate webhook signature (HMAC-SHA256)
// Docs: https://replicate.com/docs/topics/webhooks/signing
function verifyReplicateSignature(
  body: string,
  webhookId: string | null,
  webhookTimestamp: string | null,
  webhookSignature: string | null,
  secret: string
): boolean {
  if (!secret || !webhookId || !webhookTimestamp || !webhookSignature) return false

  try {
    // Construct signed content: id.timestamp.body
    const signedContent = `${webhookId}.${webhookTimestamp}.${body}`

    // Extract base64 key from secret (remove 'whsec_' prefix if present)
    const secretKey = secret.startsWith('whsec_') ? secret.slice(6) : secret

    // Compute expected signature
    const hmac = crypto.createHmac('sha256', Buffer.from(secretKey, 'base64'))
    hmac.update(signedContent)
    const expectedSignature = hmac.digest('base64')

    // Parse signatures from header (format: "v1,signature1 v1,signature2")
    const signatures = webhookSignature.split(' ')
    for (const sig of signatures) {
      const [version, signatureValue] = sig.split(',')
      if (version === 'v1' && signatureValue) {
        try {
          if (crypto.timingSafeEqual(
            Buffer.from(signatureValue),
            Buffer.from(expectedSignature)
          )) {
            return true
          }
        } catch {
          // Length mismatch, continue to next signature
        }
      }
    }
    return false
  } catch (err) {
    console.error('[Webhook] Signature verification error:', err)
    return false
  }
}

// Determine if a URL or content type is video
function isVideoContent(url: string, contentType?: string): boolean {
  const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv']
  const videoMimeTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska']

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
    if (contentType.includes('quicktime') || contentType.includes('mov')) return 'mov'
    if (contentType.includes('avi')) return 'avi'
    if (contentType.includes('matroska') || contentType.includes('mkv')) return 'mkv'
    return 'mp4' // default for video
  } else {
    if (contentType.includes('png')) return 'png'
    if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg'
    if (contentType.includes('gif')) return 'gif'
    return 'webp' // default for image
  }
}

// Download media from URL and upload to Supabase storage (handles both images and videos)
async function saveMediaToStorage(mediaUrl: string, userId?: string): Promise<string> {
  try {
    const response = await fetch(mediaUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch media: ${response.status}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const contentType = response.headers.get('content-type') || 'image/webp'
    const isVideo = isVideoContent(mediaUrl, contentType)
    const ext = getExtensionFromContentType(contentType, isVideo)
    const bucket = isVideo ? 'generated-videos' : 'generated-images'

    const filename = `${uuidv4()}.${ext}`
    const path = userId ? `${userId}/${filename}` : `anonymous/${filename}`

    console.log(`[Webhook] Uploading ${isVideo ? 'video' : 'image'} to ${bucket}: ${path}`)

    const { error } = await sbAdmin.storage
      .from(bucket)
      .upload(path, buffer, {
        contentType,
        upsert: false,
      })

    if (error) {
      console.error('[Webhook] Storage upload error:', error)
      return mediaUrl
    }

    const { data: urlData } = sbAdmin.storage
      .from(bucket)
      .getPublicUrl(path)

    console.log(`[Webhook] Successfully uploaded to storage: ${urlData.publicUrl}`)
    return urlData.publicUrl
  } catch (error) {
    console.error('[Webhook] Error saving media to storage:', error)
    return mediaUrl
  }
}

// Extract URLs from Replicate output
// Handles various output formats: string URLs, arrays, FileOutput objects
function extractOutputUrls(output: any): string[] {
  if (!output) return []

  console.log('[Webhook] extractOutputUrls input type:', typeof output, Array.isArray(output) ? `array[${output.length}]` : '')

  if (Array.isArray(output)) {
    const urls = output.flatMap(item => {
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
      console.log('[Webhook] Could not extract URL from item:', typeof item, item)
      return []
    })
    console.log('[Webhook] Extracted', urls.length, 'URLs from array')
    return urls
  }

  // Single string URL
  if (typeof output === 'string' && output.startsWith('http')) {
    return [output]
  }

  // Single FileOutput object
  if (output?.url && typeof output.url === 'string') {
    return [output.url]
  }

  console.log('[Webhook] Could not extract URLs from output:', typeof output)
  return []
}

// POST /api/replicate-webhook - Called by Replicate when a prediction completes
export async function POST(request: Request) {
  try {
    // Read body as text first for signature verification
    const bodyText = await request.text()

    // Get webhook signature headers (per Replicate docs)
    const webhookId = request.headers.get('webhook-id')
    const webhookTimestamp = request.headers.get('webhook-timestamp')
    const webhookSignature = request.headers.get('webhook-signature')
    const secret = process.env.REPLICATE_WEBHOOK_SECRET

    console.log('[Webhook] Received request:', {
      hasWebhookId: !!webhookId,
      hasTimestamp: !!webhookTimestamp,
      hasSignature: !!webhookSignature,
      hasSecret: !!secret,
      bodyLength: bodyText.length,
    })

    // Verify signature if secret is configured (fail closed)
    if (secret) {
      if (!verifyReplicateSignature(bodyText, webhookId, webhookTimestamp, webhookSignature, secret)) {
        console.error('[Webhook] Invalid Replicate signature - verification failed')
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
      console.log('[Webhook] Signature verified successfully')
    }

    const body = JSON.parse(bodyText)

    console.log('[Webhook] Received Replicate webhook:', {
      id: body.id,
      status: body.status,
      hasOutput: !!body.output,
    })

    const predictionId = body.id
    const status = body.status // 'succeeded', 'failed', 'canceled'
    const output = body.output
    const error = body.error

    if (!predictionId) {
      console.error('[Webhook] No prediction ID in webhook')
      return NextResponse.json({ error: 'No prediction ID' }, { status: 400 })
    }

    // Find the generation by prediction ID (include all billing-related fields)
    let generation = null
    let fetchError = null

    // Try to find the generation - may need retry due to race condition
    // (webhook can arrive before generate route saves the prediction ID)
    for (let attempt = 1; attempt <= 3; attempt++) {
      const result = await sbAdmin
        .from('generations')
        .select('id, whop_user_id, user_id, model_slug, model_category, prompt, cost_cents, replicate_status, output_metadata')
        .eq('replicate_prediction_id', predictionId)
        .maybeSingle()

      generation = result.data
      fetchError = result.error

      if (generation || fetchError) {
        break
      }

      // Wait before retry (race condition - prediction ID might not be saved yet)
      if (attempt < 3) {
        console.log(`[Webhook] Generation not found, retrying in 2s (attempt ${attempt}/3)`)
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }

    if (fetchError || !generation) {
      console.log('[Webhook] No generation found for prediction after retries:', predictionId)
      // Not an error - might be a prediction we didn't create
      return NextResponse.json({ ok: true, message: 'No matching generation' })
    }

    console.log('[Webhook] Found generation:', generation.id, 'model:', generation.model_slug)

    // Check existing metadata for billing status
    const existingMetadata = generation.output_metadata as Record<string, any> || {}

    // Skip if failed
    if (generation.replicate_status === 'failed') {
      console.log('[Webhook] Generation already failed:', generation.id)
      return NextResponse.json({ ok: true, message: 'Already failed' })
    }

    // Skip if succeeded AND billing was already completed by generate route
    if (generation.replicate_status === 'succeeded' && existingMetadata.billing_complete) {
      console.log('[Webhook] Generation already processed with billing:', generation.id)
      return NextResponse.json({ ok: true, message: 'Already processed with billing' })
    }

    // If status is succeeded but no billing, we need to handle billing (recovery case)
    const needsBillingOnly = generation.replicate_status === 'succeeded' && !existingMetadata.billing_complete

    // Handle billing-only recovery case (generate route succeeded but didn't bill)
    if (needsBillingOnly) {
      console.log('[Webhook] Recovery mode: Generation succeeded but billing incomplete, processing billing only')

      // Get the existing output_urls from the generation record
      const { data: fullGen } = await sbAdmin
        .from('generations')
        .select('output_urls, cost_cents')
        .eq('id', generation.id)
        .single()

      const permanentUrls = fullGen?.output_urls || []
      const numImagesGenerated = permanentUrls.length || 1
      const finalCostCents = generation.model_slug === 'seedream-4.5' && numImagesGenerated > 1
        ? (generation.cost_cents || 0) * numImagesGenerated
        : (generation.cost_cents || 0)

      // Do billing
      if (generation.user_id && finalCostCents > 0) {
        const { data: userProfile } = await sbAdmin
          .from('user_profiles')
          .select('id, lifetime_access')
          .eq('id', generation.user_id)
          .single()

        const hasLifetimeAccess = userProfile?.lifetime_access || false

        if (!hasLifetimeAccess) {
          const { data: deductResult, error: deductError } = await sbAdmin.rpc(
            'deduct_balance_safely',
            { p_user_id: generation.user_id, p_amount: finalCostCents }
          )
          if (deductError) {
            console.error('[Webhook] Recovery billing failed:', deductError)
          } else {
            console.log('[Webhook] Recovery billing succeeded:', finalCostCents, 'cents')
          }
        }

        // Log transaction
        const effectiveCost = hasLifetimeAccess ? 0 : finalCostCents
        await sbAdmin.from('credit_transactions').insert({
          user_id: generation.whop_user_id,
          type: 'PersonaForge',
          amount: -effectiveCost / 100,
          amount_charged: effectiveCost / 100,
          app_name: 'Skinny Studio',
          task: generation.model_category === 'video' ? 'Video Generation' : 'Image Generation',
          status: 'completed',
          preview: permanentUrls[0],
          metadata: { model: generation.model_slug, recovery_billing: true },
        })

        // Mark billing complete and update cost_cents to final amount
        await sbAdmin
          .from('generations')
          .update({
            cost_cents: finalCostCents, // Update to actual charged amount
            output_metadata: {
              ...existingMetadata,
              images_generated: numImagesGenerated,
              billing_complete: true,
              billed_at: new Date().toISOString(),
              billed_via: 'webhook_recovery',
              billed_amount_cents: effectiveCost,
              // Seedream 4.5 sequential info
              ...(generation.model_slug === 'seedream-4.5' && numImagesGenerated > 1 && {
                sequential_mode: true,
                cost_per_image_cents: generation.cost_cents,
              }),
            },
          })
          .eq('id', generation.id)
      }

      return NextResponse.json({ ok: true, message: 'Recovery billing completed' })
    }

    if (status === 'succeeded') {
      // Extract output URLs
      const outputUrls = extractOutputUrls(output)
      console.log('[Webhook] Extracted URLs:', outputUrls.length)

      if (outputUrls.length === 0) {
        console.error('[Webhook] No output URLs in succeeded prediction')
        await sbAdmin
          .from('generations')
          .update({
            replicate_status: 'failed',
            replicate_error: 'No output URLs returned',
            completed_at: new Date().toISOString(),
          })
          .eq('id', generation.id)
        return NextResponse.json({ ok: true })
      }

      // Upload media to permanent storage (handles both images and videos)
      console.log('[Webhook] Uploading media to storage...')
      const permanentUrls: string[] = []
      for (const tempUrl of outputUrls) {
        const permanentUrl = await saveMediaToStorage(tempUrl, generation.whop_user_id || undefined)
        permanentUrls.push(permanentUrl)
      }

      // Update generation with success
      const numImagesGenerated = permanentUrls.length
      const finalCostCents = generation.model_slug === 'seedream-4.5' && numImagesGenerated > 1
        ? (generation.cost_cents || 0) * numImagesGenerated
        : (generation.cost_cents || 0)

      const { error: updateError } = await sbAdmin
        .from('generations')
        .update({
          output_urls: permanentUrls,
          replicate_status: 'succeeded',
          completed_at: new Date().toISOString(),
          cost_cents: finalCostCents,
          total_cost_cents: finalCostCents,
          output_metadata: {
            images_generated: numImagesGenerated,
            completed_via_webhook: true,
          },
        })
        .eq('id', generation.id)

      if (updateError) {
        console.error('[Webhook] Error updating generation:', updateError)
      } else {
        console.log('[Webhook] Successfully updated generation:', generation.id)
      }

      // === BILLING: Deduct balance and log transaction ===
      if (generation.user_id && finalCostCents > 0) {
        // RACE CONDITION FIX: Check if a transaction already exists for this generation
        // This prevents double-billing when webhook and polling run simultaneously
        const { data: existingTx } = await sbAdmin
          .from('credit_transactions')
          .select('id')
          .eq('user_id', generation.whop_user_id)
          .contains('metadata', { generation_id: generation.id })
          .maybeSingle()

        if (existingTx) {
          console.log('[Webhook] Billing already processed by polling, skipping:', generation.id)
        } else {
          // Get user profile to check for lifetime access
          const { data: userProfile } = await sbAdmin
            .from('user_profiles')
            .select('id, lifetime_access, balance_cents')
            .eq('id', generation.user_id)
            .single()

          const hasLifetimeAccess = userProfile?.lifetime_access || false

          // Deduct balance if not a lifetime user
          if (!hasLifetimeAccess) {
            const { data: deductResult, error: deductError } = await sbAdmin.rpc(
              'deduct_balance_safely',
              {
                p_user_id: generation.user_id,
                p_amount: finalCostCents
              }
            )

            if (deductError) {
              console.error('[Webhook] Failed to deduct balance:', deductError)
            } else if (!deductResult?.success) {
              console.error('[Webhook] Balance deduction failed:', deductResult?.error)
            } else {
              console.log('[Webhook] Successfully deducted', finalCostCents, 'cents. New balance:', deductResult.new_balance)
            }
          }

          // Log the transaction - include generation_id for race condition detection
          const effectiveCost = hasLifetimeAccess ? 0 : finalCostCents
          const amountInDollars = effectiveCost / 100

          const { error: txError } = await sbAdmin.from('credit_transactions').insert({
            user_id: generation.whop_user_id,
            type: 'PersonaForge',  // Use PersonaForge type to avoid app_id constraint
            amount: -amountInDollars,
            amount_charged: amountInDollars,
            app_name: 'Skinny Studio',
            task: generation.model_category === 'video' ? 'Video Generation' : 'Image Generation',
            status: 'completed',
            preview: permanentUrls[0],
            metadata: {
              generation_id: generation.id, // For race condition detection
              model: generation.model_slug,
              prompt: generation.prompt,
              category: generation.model_category,
              is_lifetime_user: hasLifetimeAccess,
              images_generated: numImagesGenerated,
              completed_via_webhook: true,
            },
          })

          if (txError) {
            console.error('[Webhook] Failed to log transaction:', txError)
          } else {
            console.log('[Webhook] Successfully logged transaction')
          }

          // === MARK BILLING AS COMPLETE ===
          // This prevents duplicate billing if webhook is called again
          await sbAdmin
            .from('generations')
            .update({
              output_metadata: {
                images_generated: numImagesGenerated,
                completed_via_webhook: true,
                billing_complete: true,
                billed_at: new Date().toISOString(),
                billed_amount_cents: hasLifetimeAccess ? 0 : finalCostCents,
                // Seedream 4.5 sequential info
                ...(generation.model_slug === 'seedream-4.5' && numImagesGenerated > 1 && {
                  sequential_mode: true,
                  cost_per_image_cents: generation.cost_cents,
                }),
              },
            })
            .eq('id', generation.id)

          console.log(`[Webhook] Marked billing as complete for generation ${generation.id}: ${finalCostCents}¢`)
        } // end else (no existing transaction)
      }

    } else if (status === 'failed' || status === 'canceled') {
      await sbAdmin
        .from('generations')
        .update({
          replicate_status: status,
          replicate_error: error || 'Unknown error',
          completed_at: new Date().toISOString(),
        })
        .eq('id', generation.id)
      console.log('[Webhook] Marked generation as failed:', generation.id)
    }

    return NextResponse.json({ ok: true })

  } catch (err) {
    console.error('[Webhook] Error processing webhook:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
