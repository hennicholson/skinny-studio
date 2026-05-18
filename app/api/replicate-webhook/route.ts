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
        .select('id, whop_user_id, user_id, model_slug, model_category, prompt, cost_cents, replicate_status, billing_status')
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

    console.log('[Webhook] Found generation:', generation.id, 'model:', generation.model_slug, 'billing_status:', generation.billing_status)

    // Skip if already settled. billing_status is the authoritative source post-migration.
    // (The RPC also fast-paths this — checking here saves an unnecessary call.)
    if (
      generation.billing_status === 'charged' ||
      generation.billing_status === 'waived' ||
      generation.billing_status === 'refunded'
    ) {
      console.log('[Webhook] Generation already settled:', generation.id, generation.billing_status)
      return NextResponse.json({ ok: true, message: 'Already settled' })
    }

    // Skip if Replicate itself already failed.
    if (generation.replicate_status === 'failed') {
      console.log('[Webhook] Generation already failed:', generation.id)
      return NextResponse.json({ ok: true, message: 'Already failed' })
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
            // Note: billing flags (billing_complete / completed_via_webhook) are
            // no longer written here — generations.billing_status is the source
            // of truth and is set by complete_generation_billing() below.
          },
        })
        .eq('id', generation.id)

      if (updateError) {
        console.error('[Webhook] Error updating generation:', updateError)
      } else {
        console.log('[Webhook] Successfully updated generation:', generation.id)
      }

      // === ATOMIC BILLING (debit + tx + flag in one RPC) ===
      // Idempotent: if generate route or poll function already billed, RPC
      // fast-paths to 'already_billed'. Concurrent caller -> 'already_billed_race'.
      if (generation.user_id) {
        const extraMetadata: Record<string, any> = {
          prompt: generation.prompt,
          images_generated: numImagesGenerated,
          completed_via: 'webhook',
          ...(generation.model_slug === 'seedream-4.5' && numImagesGenerated > 1 && {
            sequential_mode: true,
            cost_per_image_cents: generation.cost_cents,
            total_cost_cents: finalCostCents,
          }),
        }

        const { data: billingResult, error: billingError } = await sbAdmin.rpc(
          'complete_generation_billing',
          {
            p_generation_id: generation.id,
            p_user_profile_id: generation.user_id,
            p_whop_user_id: generation.whop_user_id,
            p_amount_cents: finalCostCents,
            p_model_slug: generation.model_slug,
            p_model_category: generation.model_category,
            p_preview_url: permanentUrls[0] || null,
            p_extra_metadata: extraMetadata,
            p_path: 'webhook',
          }
        )

        if (billingError) {
          console.error('[Webhook] complete_generation_billing RPC error:', billingError)
          // Return 200 — Replicate retries on 5xx and the next retry will hit
          // the billing_status fast-path or re-attempt cleanly.
          return NextResponse.json({ ok: true, billing: 'error' })
        }

        const billingStatus = (billingResult as any)?.status
        switch (billingStatus) {
          case 'charged':
          case 'waived':
            console.log(`[Webhook] Billing ${billingStatus} for ${generation.id}: tx ${(billingResult as any).tx_id}, billed ${(billingResult as any).billed_amount_cents}¢`)
            break
          case 'already_billed':
          case 'already_billed_race':
            console.log(`[Webhook] Billing ${billingStatus} for ${generation.id} — converged on prior result.`)
            break
          case 'insufficient_balance':
            // Generation is marked 'failed' in DB by the RPC. Don't 5xx —
            // Replicate would retry forever and we'd just keep landing here.
            console.warn(`[Webhook] Insufficient balance billing ${generation.id}: have ${(billingResult as any).balance_cents}, need ${(billingResult as any).required_cents}. Marked billing_status=failed.`)
            break
          case 'user_not_found':
          case 'generation_not_found':
          case 'invalid_args':
          default:
            console.error(`[Webhook] complete_generation_billing returned ${billingStatus} for ${generation.id}:`, billingResult)
            break
        }
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
