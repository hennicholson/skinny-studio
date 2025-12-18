import { NextResponse } from 'next/server'
import { isPlatformOrchestrationActive, getPlatformSettings } from '@/lib/platform-settings'

export const runtime = 'nodejs'

// GET - Check if platform orchestration is enabled (public endpoint)
export async function GET() {
  try {
    const isActive = await isPlatformOrchestrationActive()
    const settings = await getPlatformSettings()

    return NextResponse.json({
      platformOrchestrationEnabled: isActive,
      // Only include model info if platform mode is active
      defaultModel: isActive ? settings.default_orchestrator_model : null,
    })
  } catch (error) {
    console.error('Error checking platform status:', error)
    // Default to false on error (user provides own key)
    return NextResponse.json({
      platformOrchestrationEnabled: false,
      defaultModel: null,
    })
  }
}
