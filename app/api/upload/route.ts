import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hasWhopAuth, getWhopAuthFromHeaders, verifyWhopTokenAndGetProfile } from '@/lib/whop'
import { rateLimit, getRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'

export const runtime = 'nodejs'

// Max file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

// Generate a simple UUID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 15)
}

export async function POST(request: Request) {
  try {
    // === AUTH CHECK ===
    const isAuthenticated = await hasWhopAuth()
    if (!isAuthenticated) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    let userId: string
    try {
      const { token, hintedId } = await getWhopAuthFromHeaders()
      const whop = await verifyWhopTokenAndGetProfile(token, hintedId)
      userId = whop.id
    } catch (authError) {
      return NextResponse.json(
        { error: 'Invalid authentication' },
        { status: 401 }
      )
    }

    // === RATE LIMIT CHECK ===
    const rateLimitKey = getRateLimitKey(request, userId, 'upload')
    const { success: rateLimitOk } = rateLimit(rateLimitKey, RATE_LIMITS.upload.limit, RATE_LIMITS.upload.windowMs)

    if (!rateLimitOk) {
      return NextResponse.json(
        { error: 'Too many uploads. Please try again later.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      )
    }

    // === STORAGE CONFIG ===
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Storage not configured' },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF' },
        { status: 400 }
      )
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10MB' },
        { status: 400 }
      )
    }

    // Generate unique filename with user-scoped path
    const ext = file.name.split('.').pop() || 'jpg'
    const filename = `${generateId()}.${ext}`
    const path = `references/${userId}/${filename}`  // User-scoped storage

    // Convert File to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()

    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from('training-images')
      .upload(path, arrayBuffer, {
        contentType: file.type,
        upsert: false,
      })

    if (error) {
      console.error('Storage upload error:', error)
      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500 }
      )
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('training-images')
      .getPublicUrl(path)

    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
      path: data.path,
      filename,
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: 'Upload failed' },
      { status: 500 }
    )
  }
}
