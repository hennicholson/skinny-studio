import { NextResponse } from 'next/server'
import { sbAdmin } from '@/lib/supabaseAdmin'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'

export const runtime = 'nodejs'

// Verify Replicate webhook signature (HMAC-SHA256)
function verifyReplicateSignature(body: string, signature: string | null, secret: string): boolean {
  if (!secret || !signature) return false

  try {
    // Replicate uses HMAC-SHA256 for webhook signing
    const hmac = crypto.createHmac('sha256', secret)
    hmac.update(body)
    const expected = 'sha256=' + hmac.digest('hex')

    // Use timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    )
  } catch {
    return false
  }
}

// Replicate webhook payload type
interface ReplicateWebhookPayload {
  id: string
  version: string
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
  output: any
  error: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  metrics?: {
    predict_time?: number
  }
}

// Helper to extract URLs from Replicate output
// Handles various output formats: string URLs, arrays, FileOutput objects
function extractOutputUrls(output: any): string[] {
  if (!output) return []

  // Handle array of URLs or FileOutput objects
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

  // Handle single URL
  if (typeof output === 'string' && output.startsWith('http')) {
    return [output]
  }

  // Handle object with url property
  if (output?.url && typeof output.url === 'string') {
    return [output.url]
  }

  return []
}

// Save image from URL to Supabase storage
async function saveImageToStorage(imageUrl: string, userId?: string): Promise<string | null> {
  try {
    const response = await fetch(imageUrl)
    if (!response.ok) {
      console.error(`[Webhook] Failed to fetch image: ${response.status}`)
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
      console.error('[Webhook] Storage upload error:', error)
      return null
    }

    const { data: urlData } = sbAdmin.storage
      .from('generated-images')
      .getPublicUrl(path)

    return urlData.publicUrl
  } catch (error) {
    console.error('[Webhook] Error saving image to storage:', error)
    return null
  }
}

export async function POST(request: Request) {
  try {
    // Read body as text first for signature verification
    const body = await request.text()
    const signature = request.headers.get('webhook-signature') ||
                      request.headers.get('x-replicate-signature')
    const secret = process.env.REPLICATE_WEBHOOK_SECRET

    // Verify signature if secret is configured (fail closed)
    if (secret) {
      if (!verifyReplicateSignature(body, signature, secret)) {
        console.error('[Replicate Webhook] Invalid signature')
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }

    const payload: ReplicateWebhookPayload = JSON.parse(body)
    console.log('[Replicate Webhook] Received:', payload.id, 'Status:', payload.status)

    // Find the generation record by replicate_prediction_id
    const { data: generation, error: fetchError } = await sbAdmin
      .from('generations')
      .select('*')
      .eq('replicate_prediction_id', payload.id)
      .single()

    if (fetchError || !generation) {
      console.error('[Replicate Webhook] Generation not found for prediction:', payload.id)
      return NextResponse.json({ error: 'Generation not found' }, { status: 404 })
    }

    console.log('[Replicate Webhook] Found generation:', generation.id)

    // Handle different statuses
    if (payload.status === 'succeeded') {
      // Extract output URLs
      const outputUrls = extractOutputUrls(payload.output)
      console.log('[Replicate Webhook] Output URLs:', outputUrls.length)

      if (outputUrls.length === 0) {
        console.error('[Replicate Webhook] No output URLs found')
        await sbAdmin
          .from('generations')
          .update({
            replicate_status: 'failed',
            replicate_error: 'No output URLs returned',
            completed_at: new Date().toISOString(),
          })
          .eq('id', generation.id)

        return NextResponse.json({ success: false, error: 'No output URLs' })
      }

      // Upload images to permanent storage
      const permanentUrls: string[] = []
      for (const tempUrl of outputUrls) {
        const permanentUrl = await saveImageToStorage(tempUrl, generation.whop_user_id || undefined)
        if (permanentUrl) {
          permanentUrls.push(permanentUrl)
        } else {
          // Fall back to temp URL if upload fails
          permanentUrls.push(tempUrl)
        }
      }

      // Update generation with success
      const { error: updateError } = await sbAdmin
        .from('generations')
        .update({
          output_urls: permanentUrls,
          replicate_status: 'succeeded',
          completed_at: new Date().toISOString(),
          output_metadata: {
            predict_time: payload.metrics?.predict_time,
            original_urls: outputUrls,
          },
        })
        .eq('id', generation.id)

      if (updateError) {
        console.error('[Replicate Webhook] Failed to update generation:', updateError)
        return NextResponse.json({ error: 'Failed to update generation' }, { status: 500 })
      }

      console.log('[Replicate Webhook] Generation updated successfully:', generation.id)
      return NextResponse.json({ success: true, generationId: generation.id })

    } else if (payload.status === 'failed' || payload.status === 'canceled') {
      // Handle failure
      await sbAdmin
        .from('generations')
        .update({
          replicate_status: payload.status,
          replicate_error: payload.error || 'Unknown error',
          completed_at: new Date().toISOString(),
        })
        .eq('id', generation.id)

      console.log('[Replicate Webhook] Generation failed:', generation.id, payload.error)
      return NextResponse.json({ success: false, error: payload.error })

    } else if (payload.status === 'processing') {
      // Update status to processing
      await sbAdmin
        .from('generations')
        .update({
          replicate_status: 'processing',
          started_at: payload.started_at || new Date().toISOString(),
        })
        .eq('id', generation.id)

      console.log('[Replicate Webhook] Generation processing:', generation.id)
      return NextResponse.json({ success: true, status: 'processing' })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Replicate Webhook] Error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

// Replicate sends GET requests to verify the webhook URL
export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'replicate-webhook' })
}
