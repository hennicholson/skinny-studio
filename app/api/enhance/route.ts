import { NextResponse } from 'next/server'

export const runtime = 'edge'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { prompt, style } = body

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      )
    }

    // Enhancement is now handled by the orchestrator AI
    // This route is kept for backwards compatibility
    return NextResponse.json({
      enhanced: prompt,
      original: prompt,
      style: style || 'default'
    })
  } catch (error) {
    console.error('Error enhancing prompt:', error)

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to enhance prompt' },
      { status: 500 }
    )
  }
}
