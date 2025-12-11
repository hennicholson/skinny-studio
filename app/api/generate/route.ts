import Replicate from 'replicate'
import { NextResponse } from 'next/server'
import { sbAdmin } from '@/lib/supabaseAdmin'
import { getWhopAuthFromHeaders, verifyWhopTokenAndGetProfile, hasWhopAuth } from '@/lib/whop'
import { v4 as uuidv4 } from 'uuid'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes for generation

interface GenerateRequest {
  model: string
  prompt: string
  params?: Record<string, any>
  referenceImages?: string[]
  conversationId?: string
  messageId?: string
}

// Initialize Replicate with API key
function getReplicateClient() {
  const apiKey = process.env.REPLICATE_API_TOKEN
  if (!apiKey) {
    throw new Error('REPLICATE_API_TOKEN not configured')
  }
  return new Replicate({ auth: apiKey })
}

// Download image from URL and upload to Supabase storage
async function saveImageToStorage(imageUrl: string, userId?: string): Promise<string> {
  try {
    // Fetch the image from Replicate's temp URL
    const response = await fetch(imageUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Determine content type from response or default to webp
    const contentType = response.headers.get('content-type') || 'image/webp'
    const ext = contentType.includes('png') ? 'png' : contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'webp'

    // Generate unique filename with optional user folder
    const filename = `${uuidv4()}.${ext}`
    const path = userId ? `${userId}/${filename}` : `anonymous/${filename}`

    // Upload to Supabase storage
    const { data, error } = await sbAdmin.storage
      .from('generated-images')
      .upload(path, buffer, {
        contentType,
        upsert: false,
      })

    if (error) {
      console.error('Storage upload error:', error)
      // Return original URL if upload fails
      return imageUrl
    }

    // Get public URL
    const { data: urlData } = sbAdmin.storage
      .from('generated-images')
      .getPublicUrl(path)

    return urlData.publicUrl
  } catch (error) {
    console.error('Error saving image to storage:', error)
    // Return original URL if anything fails
    return imageUrl
  }
}

export async function POST(request: Request) {
  try {
    // === AUTH CHECK ===
    let whopUserId: string | null = null
    let userProfileId: string | null = null
    let balanceCents = 0
    let hasLifetimeAccess = false

    const isAuthenticated = await hasWhopAuth()

    if (isAuthenticated) {
      try {
        const { token, hintedId } = await getWhopAuthFromHeaders()
        const whop = await verifyWhopTokenAndGetProfile(token, hintedId)
        whopUserId = whop.id // This is a UUID generated from the whop user id

        // Get or create user profile - keyed by whop_user_id (the UUID)
        let { data: profile, error: profileError } = await sbAdmin
          .from("user_profiles")
          .select("*")
          .eq("whop_user_id", whopUserId)
          .maybeSingle()

        if (profileError) {
          console.error("Error fetching profile:", profileError)
        }

        // Create profile if doesn't exist
        if (!profile) {
          const { data: newProfile, error: createError } = await sbAdmin
            .from("user_profiles")
            .insert({
              whop_user_id: whopUserId,
              whop_unique_id: whop.unique_id,
              email: whop.email,
              username: whop.username,
              balance_cents: 0,
              lifetime_access: false,
            })
            .select()
            .single()

          if (createError) {
            console.error("Error creating profile:", createError)
          } else {
            profile = newProfile
          }
        }

        if (profile) {
          userProfileId = profile.id
          balanceCents = profile.balance_cents || 0
          hasLifetimeAccess = profile.lifetime_access || false
        }
      } catch (authError) {
        console.log("Auth check failed:", authError)
      }
    }

    const body = await request.json() as GenerateRequest
    const { model, prompt, params = {}, referenceImages, conversationId, messageId } = body

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    // Fetch model from database
    const { data: studioModel, error: modelError } = await sbAdmin
      .from("studio_models")
      .select("*")
      .eq("slug", model)
      .eq("is_active", true)
      .maybeSingle()

    if (modelError || !studioModel) {
      return NextResponse.json({ error: `Model not found: ${model}` }, { status: 400 })
    }

    const costCents = studioModel.cost_per_run_cents || 0

    // === BALANCE CHECK (skip for lifetime users or free models) ===
    if (whopUserId && !hasLifetimeAccess && costCents > 0 && balanceCents < costCents) {
      return NextResponse.json(
        {
          error: 'Insufficient balance',
          required: costCents,
          available: balanceCents,
          code: 'INSUFFICIENT_BALANCE'
        },
        { status: 402 }
      )
    }

    const replicate = getReplicateClient()

    // Build input from model's default parameters merged with user params
    const input: Record<string, any> = {
      prompt,
      ...studioModel.default_parameters,
      ...params,
    }

    // Handle reference images based on model type
    if (referenceImages?.length) {
      // Different models expect different parameter names for images
      if (model.includes('flux')) {
        input.input_images = referenceImages
      } else if (model.includes('seedream') || model.includes('nano')) {
        input.image_input = referenceImages
      } else {
        input.image = referenceImages[0]
      }
    }

    // Create generation record BEFORE running (status: pending)
    let generationId: string | null = null
    if (whopUserId) {
      const { data: genRecord, error: genError } = await sbAdmin
        .from("generations")
        .insert({
          whop_user_id: whopUserId,
          user_id: userProfileId,
          model_id: studioModel.id,
          model_slug: model,
          model_category: studioModel.category,
          conversation_id: conversationId || null,
          message_id: messageId || null,
          prompt,
          parameters: params,
          cost_cents: costCents,
          replicate_status: 'starting',
        })
        .select("id")
        .single()

      if (!genError && genRecord) {
        generationId = genRecord.id
      }
    }

    // Run the model
    const output = await replicate.run(
      studioModel.replicate_model as `${string}/${string}` | `${string}/${string}:${string}`,
      { input }
    )

    // Handle different output formats
    let outputUrls: string[] = []

    if (Array.isArray(output)) {
      for (const item of output) {
        if (typeof item === 'string') {
          outputUrls.push(item)
        } else if (item && typeof item === 'object') {
          if ('url' in item && typeof item.url === 'function') {
            outputUrls.push(item.url())
          } else if ('url' in item) {
            outputUrls.push(item.url as string)
          }
        }
      }
    } else if (typeof output === 'string') {
      outputUrls.push(output)
    } else if (output && typeof output === 'object') {
      if ('url' in output && typeof (output as any).url === 'function') {
        outputUrls.push((output as any).url())
      } else if ('url' in output) {
        outputUrls.push((output as any).url)
      }
    }

    if (outputUrls.length === 0) {
      throw new Error('No output from model')
    }

    // === SAVE IMAGES TO SUPABASE STORAGE ===
    // Convert temporary Replicate URLs to permanent Supabase storage URLs
    const permanentUrls: string[] = []
    for (const tempUrl of outputUrls) {
      const permanentUrl = await saveImageToStorage(tempUrl, whopUserId || undefined)
      permanentUrls.push(permanentUrl)
    }

    // Use the permanent URLs instead of temp Replicate URLs
    const finalOutputUrls = permanentUrls
    const imageUrl = finalOutputUrls[0]

    // === UPDATE GENERATION RECORD ===
    if (generationId) {
      await sbAdmin
        .from("generations")
        .update({
          output_urls: finalOutputUrls,
          replicate_status: 'succeeded',
          completed_at: new Date().toISOString(),
        })
        .eq("id", generationId)
    }

    // === DEDUCT BALANCE (only if not lifetime and cost > 0) ===
    if (userProfileId && !hasLifetimeAccess && costCents > 0) {
      const { error: deductError } = await sbAdmin
        .from("user_profiles")
        .update({
          balance_cents: balanceCents - costCents,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userProfileId)

      if (deductError) {
        console.error("Failed to deduct balance:", deductError)
      }

      // Log the credit transaction
      await sbAdmin.from("credit_transactions").insert({
        user_id: whopUserId,
        type: "usage",
        amount: -costCents,
        amount_charged: costCents,
        app_name: "Skinny Studio",
        task: "generate",
        status: "completed",
        preview: imageUrl,
        metadata: { model, prompt, params },
      })
    }

    return NextResponse.json({
      success: true,
      imageUrl,
      outputUrls: finalOutputUrls,
      model: studioModel.name,
      prompt,
      cost: costCents,
      generationId,
      newBalance: hasLifetimeAccess ? balanceCents : balanceCents - costCents,
    })

  } catch (error) {
    console.error('Generation error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Generation failed'
    return NextResponse.json({
      error: errorMessage,
      code: 'GENERATION_FAILED',
    }, { status: 500 })
  }
}
