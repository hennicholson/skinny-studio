import { NextResponse } from 'next/server'
import { sbAdmin } from '@/lib/supabaseAdmin'
import { getWhopAuthFromHeaders, verifyWhopTokenAndGetProfile } from '@/lib/whop'
import { isAdmin } from '@/lib/admin'
import { invalidatePlatformSettingsCache } from '@/lib/platform-settings'

export const runtime = 'nodejs'

export interface OrchestrationSettings {
  enabled: boolean
  gemini_api_key: string | null
  default_orchestrator_model: string | null
  mode: 'platform_key' | 'user_keys'
}

// GET - Fetch platform settings
export async function GET() {
  try {
    const { token, hintedId } = await getWhopAuthFromHeaders()
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId)

    if (!whop || !isAdmin(whop.id)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await sbAdmin
      .from('platform_settings')
      .select('*')
      .eq('key', 'orchestration')
      .single()

    if (error) {
      console.error('Error fetching platform settings:', error)
      return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
    }

    // Mask the API key for display (show last 4 chars)
    const settings = data.value as OrchestrationSettings
    const maskedSettings = {
      ...settings,
      gemini_api_key_masked: settings.gemini_api_key
        ? `...${settings.gemini_api_key.slice(-4)}`
        : null,
      has_api_key: !!settings.gemini_api_key,
    }

    // Don't send the actual API key to frontend
    delete (maskedSettings as any).gemini_api_key

    return NextResponse.json({
      settings: maskedSettings,
      updated_at: data.updated_at,
    })
  } catch (error) {
    console.error('Error in GET /api/admin/platform:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PUT - Update platform settings
export async function PUT(request: Request) {
  try {
    const { token, hintedId } = await getWhopAuthFromHeaders()
    const whop = await verifyWhopTokenAndGetProfile(token, hintedId)

    if (!whop || !isAdmin(whop.id)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      enabled,
      gemini_api_key,
      default_orchestrator_model,
      mode,
    } = body

    // Get current settings
    const { data: current, error: fetchError } = await sbAdmin
      .from('platform_settings')
      .select('value')
      .eq('key', 'orchestration')
      .single()

    if (fetchError) {
      console.error('Error fetching current settings:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch current settings' }, { status: 500 })
    }

    const currentSettings = current.value as OrchestrationSettings

    // Build updated settings - only update fields that were provided
    const updatedSettings: OrchestrationSettings = {
      enabled: enabled !== undefined ? enabled : currentSettings.enabled,
      gemini_api_key: gemini_api_key !== undefined
        ? gemini_api_key
        : currentSettings.gemini_api_key,
      default_orchestrator_model: default_orchestrator_model !== undefined
        ? default_orchestrator_model
        : currentSettings.default_orchestrator_model,
      mode: mode !== undefined ? mode : currentSettings.mode,
    }

    // Update settings
    const { error: updateError } = await sbAdmin
      .from('platform_settings')
      .update({
        value: updatedSettings,
        updated_at: new Date().toISOString(),
        updated_by: whop.email || whop.id,
      })
      .eq('key', 'orchestration')

    if (updateError) {
      console.error('Error updating platform settings:', updateError)
      return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
    }

    // Invalidate the cache so changes take effect immediately
    invalidatePlatformSettingsCache()

    // Return masked settings
    const maskedSettings = {
      ...updatedSettings,
      gemini_api_key_masked: updatedSettings.gemini_api_key
        ? `...${updatedSettings.gemini_api_key.slice(-4)}`
        : null,
      has_api_key: !!updatedSettings.gemini_api_key,
    }
    delete (maskedSettings as any).gemini_api_key

    return NextResponse.json({
      success: true,
      settings: maskedSettings,
    })
  } catch (error) {
    console.error('Error in PUT /api/admin/platform:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
