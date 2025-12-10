import { NextResponse } from 'next/server'
import { recommendModel } from '@/lib/replicate'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { prompt } = body

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      )
    }

    const modelId = await recommendModel(prompt)

    return NextResponse.json({ modelId })
  } catch (error) {
    console.error('Error recommending model:', error)

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to recommend model' },
      { status: 500 }
    )
  }
}
