import { NextResponse } from 'next/server'
import { sbAdmin } from '@/lib/supabaseAdmin'
import { getWhopAuthFromHeaders, verifyWhopTokenAndGetProfile, hasWhopAuth } from '@/lib/whop'
import { v4 as uuidv4 } from 'uuid'

export const runtime = 'nodejs'
export const maxDuration = 30 // 30 seconds for upload

interface UploadRequest {
  base64: string      // Base64 encoded image data (without data URL prefix)
  mimeType: string    // MIME type (image/jpeg, image/png, etc.)
  filename?: string   // Optional filename
  folder?: 'hub' | 'temp' // hub = permanent (Skinny Hub), temp = temporary
}

export async function POST(req: Request) {
  try {
    // Authenticate user (same pattern as generate route)
    let whopUserId: string | null = null

    const isAuthenticated = await hasWhopAuth()
    if (isAuthenticated) {
      try {
        const { token, hintedId } = await getWhopAuthFromHeaders()
        const whop = await verifyWhopTokenAndGetProfile(token, hintedId)
        whopUserId = whop.id // This is a UUID generated from the whop user id
      } catch (authError) {
        console.error('[Upload Image] Auth error:', authError)
      }
    }

    // Must be authenticated to upload
    if (!whopUserId) {
      return NextResponse.json(
        { error: 'Authentication required to upload images' },
        { status: 401 }
      )
    }

    // Parse request body
    const body: UploadRequest = await req.json()
    const { base64, mimeType, filename, folder = 'temp' } = body

    if (!base64 || !mimeType) {
      return NextResponse.json(
        { error: 'Missing required fields: base64 and mimeType' },
        { status: 400 }
      )
    }

    // Validate MIME type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowedTypes.includes(mimeType)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF' },
        { status: 400 }
      )
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(base64, 'base64')

    // Check file size (max 10MB)
    const maxSize = 10 * 1024 * 1024
    if (buffer.length > maxSize) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10MB.' },
        { status: 400 }
      )
    }

    // Determine file extension
    const ext = mimeType.includes('png') ? 'png'
      : mimeType.includes('gif') ? 'gif'
      : mimeType.includes('webp') ? 'webp'
      : 'jpg'

    // Generate path: userId/folder/filename. Supabase Storage rejects keys
    // with spaces, colons, parens, and a bunch of other punctuation common in
    // OS-default filenames like "Screenshot 2026-05-12 at 5.44.53 PM.png".
    // Sanitize by stripping anything outside [A-Za-z0-9._-], collapsing
    // dashes, and prefixing with a UUID so two uploads with identical names
    // never collide (we already have `upsert: false` which would otherwise
    // 409 on identical paths).
    const rawName = filename || `image.${ext}`
    const safeName = rawName
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(-80) // cap length so very long titles don't overrun storage path limits
      || `image.${ext}`
    const uploadFilename = `${uuidv4().slice(0, 8)}-${safeName}`
    const path = `${whopUserId}/${folder}/${uploadFilename}`

    console.log('[Upload Image] Uploading to:', path, 'size:', buffer.length)

    // Upload to Supabase storage
    const { data, error: uploadError } = await sbAdmin.storage
      .from('generated-images')
      .upload(path, buffer, {
        contentType: mimeType,
        upsert: false,
      })

    if (uploadError) {
      console.error('[Upload Image] Storage error:', uploadError)
      return NextResponse.json(
        { error: 'Failed to upload image to storage' },
        { status: 500 }
      )
    }

    // Get public URL
    const { data: urlData } = sbAdmin.storage
      .from('generated-images')
      .getPublicUrl(path)

    const publicUrl = urlData.publicUrl
    console.log('[Upload Image] Success:', publicUrl)

    // If saving to hub, also create a generation record so it appears in Skinny Hub library
    let generationId: string | null = null
    if (folder === 'hub') {
      const { data: genData, error: genError } = await sbAdmin
        .from('generations')
        .insert({
          id: uuidv4(),
          whop_user_id: whopUserId,
          model_slug: 'user-upload',
          model_category: 'image',
          prompt: filename || 'Uploaded image',
          output_urls: [publicUrl],
          replicate_status: 'succeeded',
          cost_cents: 0,
          completed_at: new Date().toISOString(),
          output_metadata: {
            source: 'user_upload',
            original_filename: filename,
          },
        })
        .select('id')
        .single()

      if (genError) {
        console.error('[Upload Image] Failed to create generation record:', genError)
        // Don't fail the upload, just log the error
      } else {
        generationId = genData?.id
        console.log('[Upload Image] Created generation record:', generationId)
      }
    }

    return NextResponse.json({
      success: true,
      url: publicUrl,
      path,
      folder,
      generationId,
    })
  } catch (error) {
    console.error('[Upload Image] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
