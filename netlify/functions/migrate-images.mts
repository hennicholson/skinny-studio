import type { Config } from "@netlify/functions"
import { createClient } from '@supabase/supabase-js'

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
  console.log("[Migrate Scheduled] Running migration job. Next run:", next_run)

  // Get Supabase credentials from environment
  const supabaseUrl = Netlify.env.get('NEXT_PUBLIC_SUPABASE_URL')
  const supabaseServiceKey = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[Migrate Scheduled] Missing Supabase credentials')
    return
  }

  const sbAdmin = createClient(supabaseUrl, supabaseServiceKey)

  // Save image from URL to Supabase storage
  async function saveImageToStorage(imageUrl: string, userId?: string): Promise<string | null> {
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

      const filename = `${generateUUID()}.${ext}`
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

  try {
    // Find generations with Replicate URLs (last 100)
    const { data: allGenerations, error: fetchError } = await sbAdmin
      .from('generations')
      .select('id, output_urls, whop_user_id, metadata')
      .eq('replicate_status', 'succeeded')
      .not('output_urls', 'eq', '{}')
      .order('created_at', { ascending: false })
      .limit(100)

    if (fetchError) {
      console.error('[Migrate Scheduled] Error fetching generations:', fetchError)
      return
    }

    // Filter to only generations that have Replicate URLs
    const generationsToMigrate = allGenerations?.filter(gen => {
      const urls = gen.output_urls as string[]
      return urls && urls.some(url => isReplicateUrl(url))
    }) || []

    console.log(`[Migrate Scheduled] Found ${generationsToMigrate.length} generations with temp URLs`)

    let migratedCount = 0
    let expiredCount = 0

    // Process up to 10 generations per run (30s limit)
    const toProcess = generationsToMigrate.slice(0, 10)

    for (const generation of toProcess) {
      const outputUrls = generation.output_urls as string[]
      const newUrls: string[] = []
      let hasChanges = false

      for (const url of outputUrls) {
        if (!isReplicateUrl(url)) {
          newUrls.push(url)
          continue
        }

        const isAccessible = await isUrlAccessible(url)
        if (!isAccessible) {
          console.warn(`[Migrate Scheduled] URL expired: ${generation.id}`)
          newUrls.push(url)
          expiredCount++
          continue
        }

        const permanentUrl = await saveImageToStorage(url, generation.whop_user_id || undefined)
        if (permanentUrl) {
          newUrls.push(permanentUrl)
          hasChanges = true
          console.log(`[Migrate Scheduled] Migrated image for: ${generation.id}`)
        } else {
          newUrls.push(url)
        }
      }

      if (hasChanges) {
        const allMigrated = !newUrls.some(url => isReplicateUrl(url))
        await sbAdmin
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

        migratedCount++
      }
    }

    console.log(`[Migrate Scheduled] Done. Migrated: ${migratedCount}, Expired: ${expiredCount}`)
  } catch (error) {
    console.error('[Migrate Scheduled] Error:', error)
  }
}

export const config: Config = {
  // Run every 30 minutes
  schedule: "*/30 * * * *"
}
