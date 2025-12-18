import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'

// Admin Supabase client
const sbAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Helper to detect if a URL is a temporary Replicate URL
function isReplicateUrl(url: string): boolean {
  return url.includes('replicate.delivery') || url.includes('pbxt.replicate.delivery')
}

// Helper to check if a URL is still accessible
async function isUrlAccessible(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' })
    return response.ok
  } catch {
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

// Save media (image or video) from URL to Supabase storage
async function saveMediaToStorage(mediaUrl: string, userId?: string): Promise<string | null> {
  try {
    const response = await fetch(mediaUrl)
    if (!response.ok) {
      console.error(`Failed to fetch media: ${response.status}`)
      return null
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const contentType = response.headers.get('content-type') || 'image/webp'
    const isVideo = isVideoContent(mediaUrl, contentType)
    const ext = getExtensionFromContentType(contentType, isVideo)
    const bucket = isVideo ? 'generated-videos' : 'generated-images'

    const filename = `${uuidv4()}.${ext}`
    const path = userId ? `${userId}/${filename}` : `anonymous/${filename}`

    console.log(`[Migrate] Uploading ${isVideo ? 'video' : 'image'} to ${bucket}: ${path}`)

    const { data, error } = await sbAdmin.storage
      .from(bucket)
      .upload(path, buffer, {
        contentType,
        upsert: false,
      })

    if (error) {
      console.error('Storage upload error:', error)
      return null
    }

    const { data: urlData } = sbAdmin.storage
      .from(bucket)
      .getPublicUrl(path)

    return urlData.publicUrl
  } catch (error) {
    console.error('Error saving media to storage:', error)
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    // Optional: Add API key protection
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Find generations with pending storage
    const { data: pendingGenerations, error: fetchError } = await sbAdmin
      .from('generations')
      .select('id, output_urls, whop_user_id, metadata')
      .eq('replicate_status', 'succeeded')
      .not('output_urls', 'eq', '{}')
      .order('created_at', { ascending: false })
      .limit(50)

    if (fetchError) {
      console.error('Error fetching pending generations:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch generations' }, { status: 500 })
    }

    // Filter to only generations that have Replicate URLs
    const generationsToMigrate = pendingGenerations?.filter(gen => {
      const urls = gen.output_urls as string[]
      return urls && urls.some(url => isReplicateUrl(url))
    }) || []

    console.log(`[Migrate] Found ${generationsToMigrate.length} generations with Replicate URLs to migrate`)

    let migratedCount = 0
    let expiredCount = 0
    let failedCount = 0

    for (const generation of generationsToMigrate) {
      const outputUrls = generation.output_urls as string[]
      const newUrls: string[] = []
      let hasChanges = false

      for (const url of outputUrls) {
        if (!isReplicateUrl(url)) {
          // Already a permanent URL
          newUrls.push(url)
          continue
        }

        // Check if URL is still accessible
        const isAccessible = await isUrlAccessible(url)
        if (!isAccessible) {
          console.warn(`[Migrate] URL expired for generation ${generation.id}: ${url}`)
          newUrls.push(url) // Keep the expired URL (will show broken image)
          expiredCount++
          continue
        }

        // Try to upload to storage (handles both images and videos)
        const permanentUrl = await saveMediaToStorage(url, generation.whop_user_id || undefined)
        if (permanentUrl) {
          newUrls.push(permanentUrl)
          hasChanges = true
          console.log(`[Migrate] Successfully migrated media for generation ${generation.id}`)
        } else {
          newUrls.push(url) // Keep temp URL on failure
          failedCount++
        }
      }

      // Update generation if we migrated any URLs
      if (hasChanges) {
        const allMigrated = !newUrls.some(url => isReplicateUrl(url))
        const { error: updateError } = await sbAdmin
          .from('generations')
          .update({
            output_urls: newUrls,
            metadata: {
              ...generation.metadata,
              storage_pending: !allMigrated,
              storage_complete: allMigrated,
              migrated_at: new Date().toISOString(),
            },
          })
          .eq('id', generation.id)

        if (updateError) {
          console.error(`[Migrate] Failed to update generation ${generation.id}:`, updateError)
        } else {
          migratedCount++
        }
      }
    }

    return NextResponse.json({
      success: true,
      total_checked: generationsToMigrate.length,
      migrated: migratedCount,
      expired: expiredCount,
      failed: failedCount,
    })

  } catch (error) {
    console.error('[Migrate] Error:', error)
    return NextResponse.json({ error: 'Migration failed' }, { status: 500 })
  }
}

// Allow GET for easy testing
export async function GET(request: NextRequest) {
  return POST(request)
}
