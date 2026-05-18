// Qwen provider — Alibaba DashScope's OpenAI-compatible /chat/completions
// endpoint. Used as a swappable alternative to Gemini for the canvas
// Director, picked per-user via DirectorSettingsPopover (provider +
// user-supplied API key, stored in localStorage on the client).
//
// What's intentionally NOT here:
//   - Tool/function calling. Qwen-Omni doesn't support it. Our Director
//     emits a fenced ```canvas-action``` JSON block in plain text instead,
//     which works on any text-generation model.
//   - Multimodal image input. The current Director flow consumes pre-
//     extracted visionContext as text. We can add base64 image inputs in
//     a phase-2 optimization once the text-only path is proven.
//
// Streaming contract: yields text deltas as strings. Caller is responsible
// for accumulating fullResponse, scanning for the canvas-action fence, and
// emitting toolCall events through the same SSE pipeline Gemini uses.

export interface QwenMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface QwenCallOptions {
  /** User-supplied DashScope key. Required — no platform key for Qwen. */
  apiKey: string
  /** Model id. Defaults to qwen3.5-omni-plus (the multimodal flagship). */
  model?: string
  /** International (Singapore) endpoint by default. Override for US or CN. */
  baseUrl?: string
  /** OpenAI-style messages array. System prompt is the first message. */
  messages: QwenMessage[]
  /** Sampling. Mirrors Gemini's temperature for parity. */
  temperature?: number
  signal?: AbortSignal
}

export interface QwenUsage {
  promptTokens: number
  responseTokens: number
  totalTokens: number
}

export interface QwenStreamResult {
  /** Async iterator of text deltas as they stream in. */
  stream: AsyncIterable<string>
  /** Resolved after the stream completes with token usage from the final chunk. */
  usage: Promise<QwenUsage | null>
}

const DEFAULT_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
const DEFAULT_MODEL = 'qwen3.5-omni-plus'

/**
 * Stream a completion from DashScope and yield text deltas. Throws on
 * non-200 responses with the error body included so the caller can surface
 * it to the user (typical failure modes: invalid key, model unavailable in
 * region, rate limit, free credits exhausted).
 */
export function callQwen(opts: QwenCallOptions): QwenStreamResult {
  const baseUrl = opts.baseUrl || DEFAULT_BASE_URL
  const model = opts.model || DEFAULT_MODEL

  let resolveUsage: (u: QwenUsage | null) => void = () => {}
  const usage = new Promise<QwenUsage | null>((res) => {
    resolveUsage = res
  })

  async function* iterate(): AsyncGenerator<string, void, undefined> {
    let res: Response
    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: opts.messages,
          stream: true,
          // Stream-options requests usage in the final chunk so we can log it.
          stream_options: { include_usage: true },
          temperature: opts.temperature ?? 0.7,
        }),
        signal: opts.signal,
      })
    } catch (err) {
      resolveUsage(null)
      throw new Error(
        `Qwen network error: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    if (!res.ok || !res.body) {
      let body = ''
      try {
        body = await res.text()
      } catch {
        // ignore
      }
      resolveUsage(null)
      // Try to extract a clean message from DashScope's error envelope.
      let friendly = `Qwen API error ${res.status}`
      try {
        const parsed = JSON.parse(body)
        const msg = parsed?.error?.message || parsed?.message
        if (msg) friendly = `${friendly}: ${msg}`
      } catch {
        if (body) friendly = `${friendly}: ${body.slice(0, 200)}`
      }
      throw new Error(friendly)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let finalUsage: QwenUsage | null = null

    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // SSE frames are separated by blank lines. Each frame is one or more
        // `data: ...` lines. Standard OpenAI-compatible chunk shape.
        let idx
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, idx)
          buffer = buffer.slice(idx + 2)
          const lines = frame.split('\n')
          for (const line of lines) {
            if (!line.startsWith('data:')) continue
            const payload = line.slice(5).trim()
            if (!payload) continue
            if (payload === '[DONE]') continue
            try {
              const json = JSON.parse(payload)
              const delta = json?.choices?.[0]?.delta?.content
              if (typeof delta === 'string' && delta.length > 0) {
                yield delta
              }
              // Final chunk in stream_options:{include_usage:true} carries
              // the usage object on the top level.
              if (json?.usage) {
                finalUsage = {
                  promptTokens: json.usage.prompt_tokens ?? 0,
                  responseTokens: json.usage.completion_tokens ?? 0,
                  totalTokens: json.usage.total_tokens ?? 0,
                }
              }
            } catch {
              // Malformed SSE frame — skip silently so a single bad chunk
              // doesn't tear down the stream.
            }
          }
        }
      }
    } finally {
      resolveUsage(finalUsage)
      reader.releaseLock()
    }
  }

  return { stream: iterate(), usage }
}
