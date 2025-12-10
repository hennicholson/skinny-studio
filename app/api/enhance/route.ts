import { NextResponse } from 'next/server'
import { enhancePrompt } from '@/lib/replicate'

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

    const result = await enhancePrompt(prompt, style)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error enhancing prompt:', error)

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to enhance prompt' },
      { status: 500 }
    )
  }
}
