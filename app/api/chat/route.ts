import { GoogleGenerativeAI } from '@google/generative-ai'
import { generateSystemPrompt } from '@/lib/orchestrator/system-prompt'
import { getEffectiveGeminiApiKey, isPlatformOrchestrationActive } from '@/lib/platform-settings'
import { calculateGeminiCost } from '@/lib/gemini-pricing'
import { sbAdmin } from '@/lib/supabaseAdmin'
import { validateAndFix } from '@/lib/canvas/action-validator'
import type { CanvasActionPayload } from '@/lib/canvas/director-actions'
import { classifyIntent, type IntentMatch } from '@/lib/canvas/intent-classifier'
import { callQwen, type QwenMessage } from '@/lib/director/providers/qwen'
import { generateCanvasSystemPrompt } from '@/lib/orchestrator/system-prompt'

// Use nodejs runtime to support longer generation times (edge has 30s limit)
export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes to match generate route

// Image purpose types - must match frontend
type ImagePurpose = 'reference' | 'starting_frame' | 'edit_target' | 'last_frame' | 'analyze'

interface ChatAttachment {
  type: 'image' | 'reference'
  url: string
  name: string
  base64?: string
  mimeType?: string
  purpose?: ImagePurpose  // User-selected purpose for the image
  analysis?: string  // AI-generated image description
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  attachments?: ChatAttachment[]
}

interface SkillData {
  name: string
  shortcut: string
  icon?: string
  content: string
}

interface ChatCanvasSnapshot {
  nodes: Array<{ id: string; type: string; data?: any }>
  edges: Array<{ id: string; source: string; sourceHandle: string; target: string; targetHandle: string }>
}

interface ChatRequest {
  messages: ChatMessage[]
  apiKey: string
  modelId?: string
  skillsContext?: string  // Formatted skills for system prompt
  referencedSkills?: SkillData[]  // Skills referenced in the current message
  selectedGenerationModelId?: string  // The generation model selected by the user
  sessionContext?: string  // Session mode context with asset info and generation instructions
  // Canvas Director: when the client is in canvas mode it passes the current
  // IR so server-side validation can resolve short ids and check handle compat.
  canvas?: ChatCanvasSnapshot
  // Director provider override (canvas mode only). When 'qwen', route the
  // streaming generation through Alibaba DashScope using directorUserKey
  // instead of Gemini. The user supplies their own key — we never persist it.
  directorProvider?: 'gemini' | 'qwen'
  directorUserKey?: string
  directorQwenModel?: string  // Optional model id override, defaults to qwen3.5-omni-plus
}

interface GenerationBlock {
  model: string
  prompt: string
  params: Record<string, any>
  // Video-specific fields
  duration?: number
  resolution?: string
  // Seedream 4.5 sequential generation fields
  sequentialImageGeneration?: 'disabled' | 'auto'
  maxImages?: number
}

interface SkillCreationBlock {
  name: string
  shortcut: string
  description: string
  category: 'style' | 'technique' | 'tool' | 'workflow' | 'custom'
  icon?: string
  content: string
  tags?: string[]
  examples?: string[]
}

// Parse generation blocks from AI response
function parseGenerationBlock(text: string): GenerationBlock | null {
  const regex = /```generate\s*\n([\s\S]*?)\n```/
  const match = text.match(regex)

  if (!match) return null

  try {
    const json = JSON.parse(match[1])
    if (json.model && json.prompt) {
      return {
        model: json.model,
        prompt: json.prompt,
        params: json.params || {},
        // Video-specific fields
        duration: json.duration,
        resolution: json.resolution,
        // Seedream 4.5 sequential generation fields
        sequentialImageGeneration: json.sequentialImageGeneration,
        maxImages: json.maxImages,
      }
    }
  } catch (e) {
    console.error('Failed to parse generation block:', e)
  }

  return null
}

// Parse skill creation blocks from AI response
function parseSkillCreationBlock(text: string): SkillCreationBlock | null {
  const regex = /```create-skill\s*\n([\s\S]*?)\n```/
  const match = text.match(regex)

  if (!match) return null

  try {
    const json = JSON.parse(match[1])
    if (json.name && json.shortcut && json.content) {
      return {
        name: json.name,
        shortcut: json.shortcut,
        description: json.description || '',
        category: json.category || 'custom',
        icon: json.icon,
        content: json.content,
        tags: json.tags || [],
        examples: json.examples || [],
      }
    }
  } catch (e) {
    console.error('Failed to parse skill creation block:', e)
  }

  return null
}

// Remove the generation block from text (so it's not shown in chat)
function stripGenerationBlock(text: string): string {
  return text.replace(/```generate\s*\n[\s\S]*?\n```/g, '').trim()
}

// Parse director's notes from AI response
interface DirectorsNotes {
  modelChoice: string
  promptEnhancements: string
  parameterReasoning: string
  tips: string
}

function parseDirectorsNotes(text: string): DirectorsNotes | null {
  const regex = /```directors-notes\s*\n([\s\S]*?)\n```/
  const match = text.match(regex)

  if (!match) return null

  try {
    const json = JSON.parse(match[1])
    if (json.modelChoice || json.promptEnhancements || json.tips) {
      return {
        modelChoice: json.modelChoice || '',
        promptEnhancements: json.promptEnhancements || '',
        parameterReasoning: json.parameterReasoning || '',
        tips: json.tips || '',
      }
    }
  } catch (e) {
    console.error('Failed to parse directors notes:', e)
  }

  return null
}

// Strip director's notes from display text
function stripDirectorsNotes(text: string): string {
  return text.replace(/```directors-notes\s*\n[\s\S]*?\n```/g, '').trim()
}

// ---- Canvas-action block (Director tool-use) ---------------------------
// The canvas Director emits a fenced ```canvas-action JSON block when the
// user asks it to build / wire / edit the node graph. Mirrors the existing
// `generate` / `create-skill` / `directors-notes` parser pattern — we keep
// the route's parsing logic uniform.
interface CanvasActionBlock {
  version: number
  actions: any[]
  explanation?: string
}
function parseCanvasActionBlock(text: string): CanvasActionBlock | null {
  const regex = /```canvas-action\s*\n([\s\S]*?)\n```/
  const match = text.match(regex)
  if (!match) return null
  try {
    const json = JSON.parse(match[1])
    if (json && Array.isArray(json.actions) && json.actions.length > 0) {
      return {
        version: typeof json.version === 'number' ? json.version : 1,
        actions: json.actions,
        explanation: typeof json.explanation === 'string' ? json.explanation : undefined,
      }
    }
  } catch (e) {
    console.error('Failed to parse canvas-action block:', e)
  }
  return null
}
function stripCanvasActionBlock(text: string): string {
  return text.replace(/```canvas-action\s*\n[\s\S]*?\n```/g, '').trim()
}

// ---- BUILD HINT (server-side intent → action shape injection) ----------
// Director Reliability: the Gemini side has been emitting `"source": "unknown"`
// placeholder ids when a user asks to wire a new model into an existing
// canvas node. Root cause: the model "doesn't know" which short-id to use
// because the canvas state is buried in a 1500-line system prompt. Fix: run
// the pure intent classifier server-side, pluck out the existing short ids
// that match the live canvas, and prepend a `BUILD HINT:` line to the user
// message FOR THIS TURN ONLY. The hint is NOT persisted to chat history
// (we mutate the messages array in-place but only the last entry, just
// before the request is forwarded to Gemini).

/**
 * Compose the BUILD HINT text. Returns an empty string when the intent
 * classifier didn't surface anything useful (unknown / low confidence) —
 * caller should skip injection in that case.
 *
 * Format is human-readable so the model can read it inline, but compact
 * enough that it doesn't bloat the context. Keep it to 1-3 lines.
 */
function buildHintForTurn(
  intent: IntentMatch,
  canvasShortIds: string[],
): string {
  if (intent.intent === 'unknown' || intent.confidence < 0.5) return ''

  const parts: string[] = [`intent=${intent.intent}`, `confidence=${intent.confidence.toFixed(2)}`]
  const h = intent.hints || {}
  if (h.existingNodeShortIds && h.existingNodeShortIds.length > 0) {
    parts.push(`mentionedExistingNodes=[${h.existingNodeShortIds.join(', ')}]`)
  } else if (h.targetNodeShortId) {
    parts.push(`mentionedExistingNodes=[${h.targetNodeShortId}]`)
  }
  if (h.modelHint) parts.push(`modelHint=${h.modelHint}`)
  if (h.intendedAction) parts.push(`intendedAction=${h.intendedAction}`)
  if (h.count !== undefined) parts.push(`count=${h.count}`)
  if (h.aspectRatio) parts.push(`aspectRatio=${h.aspectRatio}`)

  let line = `BUILD HINT: ${parts.join(', ')}`

  // For the highest-value intent (update_and_extend) include an explicit
  // recommended action shape — it's the difference between the model getting
  // it right and emitting "source": "unknown". Synthesise from whatever
  // existing short id we found, OR fall back to the single text-prompt on
  // the canvas if there's exactly one (common case for the bug we're fixing).
  if (intent.intent === 'update_and_extend') {
    const ids = h.existingNodeShortIds && h.existingNodeShortIds.length > 0
      ? h.existingNodeShortIds
      : (h.targetNodeShortId ? [h.targetNodeShortId] : [])
    // If no explicit id but the canvas has exactly one node, we can still
    // hint usefully: name that node so the model uses its real short id
    // instead of a placeholder.
    const fallbackId = ids.length === 0 && canvasShortIds.length === 1
      ? canvasShortIds[0]
      : undefined
    const sourceId = ids[0] || fallbackId
    const model = h.modelHint || 'image-gen'
    if (sourceId) {
      line += `\nRecommended action shape: update_node ${sourceId} (prompt rewrite), add_node tmp-m1 image-gen ${model}, connect ${sourceId} out:prompt → tmp-m1 in:prompt`
    } else if (canvasShortIds.length === 0) {
      // No nodes yet — usual 3-action shape applies.
      line += `\nRecommended action shape: add_node tmp-p text-prompt, add_node tmp-m1 image-gen ${model}, connect tmp-p out:prompt → tmp-m1 in:prompt`
    } else {
      // Multiple candidate nodes and no named id — tell the model to ask.
      line += `\nMultiple existing nodes on canvas (${canvasShortIds.join(', ')}) but none named by the user — ask which one to wire from before emitting the connect.`
    }
  }

  return line
}

/**
 * CANVAS NUDGES — proactive observations the Director should react to before
 * the user even asks. We scan the live canvas for actionable issues (orphan
 * refs with no downstream wire, model nodes missing prompts, lone unused
 * starters, fresh refs with vision context the Director should leverage)
 * and surface them as a short bulleted block in the system prompt for THIS
 * turn only. The Director is instructed to weave them into its reply when
 * relevant ("noticed [45a5] isn't wired yet — want me to connect it?")
 * rather than dumping them as a list.
 *
 * Lightweight by design — pure structural scan, no LLM calls, no DB.
 * Returns '' when there's nothing actionable so we don't waste tokens.
 */
function computeCanvasNudges(canvas: ChatCanvasSnapshot | undefined): string {
  if (!canvas?.nodes?.length) return ''
  const nodes = canvas.nodes
  const edges = canvas.edges || []
  const out = (id: string) => edges.some((e) => e.source === id)
  const inOn = (id: string, h: string) =>
    edges.some((e) => e.target === id && e.targetHandle === h)
  const short = (id: string) => id.slice(0, 4)

  const lines: string[] = []

  // Orphan refs — image attached, vision context cached, but nothing reads it.
  const orphanRefs = nodes.filter(
    (n) =>
      (n.type === 'reference-image' || n.type === 'entity') &&
      n.data?.imageUrl &&
      !out(n.id),
  )
  for (const n of orphanRefs.slice(0, 3)) {
    const vc =
      typeof n.data?.visionContext === 'string'
        ? n.data.visionContext.slice(0, 100).trim()
        : ''
    const titlePart = n.data?.title ? ` "${n.data.title}"` : ''
    lines.push(
      `- [${short(n.id)}] ${n.type}${titlePart} has an image but no downstream wire.${vc ? ` Vision: ${vc}${vc.length >= 100 ? '…' : ''}` : ''}`,
    )
  }

  // Model nodes missing prompt input (the most common AI miss).
  const orphanModels = nodes.filter(
    (n) =>
      (n.type === 'image-gen' || n.type === 'video-gen') &&
      !inOn(n.id, 'in:prompt'),
  )
  for (const n of orphanModels.slice(0, 3)) {
    const slug = n.data?.modelSlug ? ` (${n.data.modelSlug})` : ''
    lines.push(
      `- [${short(n.id)}] ${n.type}${slug} has no prompt input — it can't run until wired.`,
    )
  }

  // Production-brief nodes with no storyboard frames yet.
  const idleBriefs = nodes.filter(
    (n) =>
      n.type === 'production-brief' &&
      !inOn(n.id, 'in:storyboard'),
  )
  for (const n of idleBriefs.slice(0, 2)) {
    lines.push(
      `- [${short(n.id)}] production-brief has no storyboard refs wired — needs at least one image to generate a brief.`,
    )
  }

  // Lone empty canvas starter (zero edges, only static-input nodes) — nudge
  // the Director to suggest the next move instead of waiting passively.
  if (edges.length === 0 && nodes.length <= 2) {
    const types = nodes.map((n) => n.type).join(', ')
    lines.push(
      `- Canvas has ${nodes.length} starter node(s) [${types}] and no edges yet. If the user's request is open-ended, propose a concrete workflow shape.`,
    )
  }

  if (lines.length === 0) return ''
  return `## CANVAS NUDGES (server-detected, react to these naturally)\n${lines.join('\n')}`
}

/**
 * Pull the 4-char short ids out of a canvas snapshot. Mirrors the
 * client-side shortening used everywhere else (first 4 chars of the UUID).
 */
function shortIdsFromCanvas(canvas: ChatCanvasSnapshot | undefined): string[] {
  if (!canvas?.nodes) return []
  return canvas.nodes.map((n) => n.id.slice(0, 4))
}

/**
 * Extract the user-facing text of the latest user message. The chat route
 * supports messages with rich attachments + the canvas director wraps the
 * raw user text inside a `[CANVAS DIRECTOR MODE] ...\n[USER MESSAGE]\n<raw>`
 * preamble. We need the RAW user text for intent classification — feeding
 * the whole system prompt to the classifier would match every keyword in
 * the recipe library. So we look for the trailing `[USER MESSAGE]\n` marker
 * and slice from there. Fallback: return the whole content (the classifier
 * tolerates noise — its regexes target user phrasings, not prompt copy).
 */
function extractRawUserText(content: string): string {
  if (!content) return ''
  const marker = content.lastIndexOf('[USER MESSAGE]\n')
  if (marker >= 0) return content.slice(marker + '[USER MESSAGE]\n'.length).trim()
  return content
}

// Storyboard Mode: Parse shot-list blocks from AI response
interface ShotListItem {
  shotNumber: number
  title?: string
  description: string
  cameraAngle?: string
  cameraMovement?: string
  mediaType?: 'image' | 'video'
  entities?: string[]
  suggestedPrompt?: string
}

interface ShotListBlock {
  shots: ShotListItem[]
}

function parseShotListBlock(text: string): ShotListBlock | null {
  const regex = /```shot-list\s*\n([\s\S]*?)\n```/
  const match = text.match(regex)

  if (!match) return null

  try {
    const json = JSON.parse(match[1])
    if (json.shots && Array.isArray(json.shots)) {
      return {
        shots: json.shots.map((shot: any) => ({
          shotNumber: shot.shotNumber || 0,
          title: shot.title,
          description: shot.description || '',
          cameraAngle: shot.cameraAngle,
          cameraMovement: shot.cameraMovement,
          mediaType: shot.mediaType || 'image',
          entities: shot.entities || [],
          suggestedPrompt: shot.suggestedPrompt,
        }))
      }
    }
  } catch (e) {
    console.error('Failed to parse shot-list block:', e)
  }

  return null
}

// Storyboard Mode: Parse entity suggestion blocks from AI response
interface EntitySuggestionItem {
  name: string
  type: 'character' | 'world' | 'object' | 'style'
  description?: string
}

interface EntitySuggestionBlock {
  entities: EntitySuggestionItem[]
}

function parseEntitySuggestionBlock(text: string): EntitySuggestionBlock | null {
  const regex = /```entity-suggestion\s*\n([\s\S]*?)\n```/
  const match = text.match(regex)

  if (!match) return null

  try {
    const json = JSON.parse(match[1])
    if (json.entities && Array.isArray(json.entities)) {
      return {
        entities: json.entities.map((entity: any) => ({
          name: entity.name || 'Unknown',
          type: entity.type || 'character',
          description: entity.description,
        }))
      }
    }
  } catch (e) {
    console.error('Failed to parse entity-suggestion block:', e)
  }

  return null
}

// Supported model IDs
const SUPPORTED_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemma-3-27b-it',
  'gemma-3-12b-it',
]

// Models that support vision/image input
const VISION_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
]

export async function POST(request: Request) {
  try {
    const body = await request.json() as ChatRequest
    const { messages, apiKey, modelId, skillsContext, referencedSkills, selectedGenerationModelId, sessionContext, canvas } = body

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Messages are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Check if platform orchestration is active (admin provides the key)
    const isPlatformMode = await isPlatformOrchestrationActive()

    // Get Whop user ID from headers for tracking
    const whopUserId = request.headers.get('x-whop-user-id') || null

    // Get effective API key (platform key, user key, or env variable)
    let effectiveApiKey: string
    try {
      effectiveApiKey = await getEffectiveGeminiApiKey(apiKey)
    } catch (error) {
      return new Response(JSON.stringify({
        error: 'API key required. Please add your Google AI API key in Settings.',
        code: 'NO_API_KEY'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Validate model ID - default to gemini-2.5-flash for best quality
    const effectiveModelId = modelId && SUPPORTED_MODELS.includes(modelId)
      ? modelId
      : 'gemini-2.5-flash'

    const supportsVision = VISION_MODELS.includes(effectiveModelId)

    // Initialize Gemini with the API key
    const genAI = new GoogleGenerativeAI(effectiveApiKey)

    // Build system prompt with skills context
    let systemPrompt = generateSystemPrompt()

    // Append skills context if provided
    if (skillsContext) {
      systemPrompt += skillsContext
    }

    // Append session context if in session mode (overrides normal generation behavior)
    if (sessionContext) {
      systemPrompt += '\n\n' + sessionContext
    }

    // Add specific instructions for referenced skills
    if (referencedSkills && referencedSkills.length > 0) {
      systemPrompt += '\n\n## Currently Referenced Skills\n'
      systemPrompt += 'The user has referenced the following skills in their message. Apply these guidelines:\n\n'
      for (const skill of referencedSkills) {
        systemPrompt += `### ${skill.icon || '📌'} ${skill.name} (@${skill.shortcut})\n`
        systemPrompt += `${skill.content}\n\n`
      }
    }

    // Check if Creative Consultant mode (chat-only, no generation)
    const isConsultantMode = selectedGenerationModelId === 'creative-consultant'

    if (isConsultantMode) {
      // Override system prompt for consultant mode - pure brainstorming, no generation
      systemPrompt += `\n\n## CREATIVE CONSULTANT MODE (Prompt Building)\n`
      systemPrompt += `IMPORTANT: The user has selected "Creative Consultant" mode. This means:\n`
      systemPrompt += `- DO NOT generate any images or videos\n`
      systemPrompt += `- DO NOT use the generate_image or generate_video tools\n`
      systemPrompt += `- DO NOT provide cost estimates or ask to confirm generation\n`
      systemPrompt += `- Focus ONLY on brainstorming, ideation, and PROMPT CRAFTING\n\n`
      systemPrompt += `## Your Primary Role: Expert Prompt Engineer\n`
      systemPrompt += `You are an expert prompt engineer helping users craft perfect prompts for ANY AI tool.\n`
      systemPrompt += `Users may want to use their prompts in Midjourney, DALL-E, Stable Diffusion, RunwayML, or other AI tools.\n\n`
      systemPrompt += `Your responsibilities:\n`
      systemPrompt += `1. **Build & Refine Prompts**: Help craft detailed, effective prompts optimized for their target platform\n`
      systemPrompt += `2. **Use Skills**: When users reference @skills (prompt guides), apply those techniques to enhance their prompts\n`
      systemPrompt += `3. **Platform-Specific Advice**: Tailor prompts to work best on different AI platforms:\n`
      systemPrompt += `   - Midjourney: Use --ar, --v, --s, --c parameters and MJ-specific syntax\n`
      systemPrompt += `   - DALL-E: Natural language descriptions, clear composition\n`
      systemPrompt += `   - Stable Diffusion: Use weights, (emphasis:1.2), quality tags\n`
      systemPrompt += `   - Flux: Detailed natural descriptions, style keywords\n`
      systemPrompt += `4. **Iterate**: Help refine prompts through multiple iterations\n`
      systemPrompt += `5. **Explain Techniques**: Teach users how different prompt elements affect the output\n\n`
      systemPrompt += `## Output Format\n`
      systemPrompt += `When you craft a final prompt, present it clearly in a code block or quoted format so users can easily copy it.\n`
      systemPrompt += `Remind users they can save their favorite prompts to their Library using the save button!\n\n`
      systemPrompt += `## When Ready to Generate\n`
      systemPrompt += `If the user wants to actually generate images in Skinny Studio, suggest they:\n`
      systemPrompt += `- Select an image or video model from the model picker (like FLUX Pro, Seedream, etc.)\n`
      systemPrompt += `- Or copy their prompt and use it in their preferred external AI tool\n`
    } else if (selectedGenerationModelId) {
      // Normal generation mode with pre-selected model
      systemPrompt += `\n\n## User's Selected Generation Model\n`
      systemPrompt += `CRITICAL: The user has pre-selected "${selectedGenerationModelId}" in the UI.\n`
      systemPrompt += `This means they know exactly which model they want - DO NOT:\n`
      systemPrompt += `- Ask them to confirm the model choice\n`
      systemPrompt += `- Recommend a different model\n`
      systemPrompt += `- Ask what type of content they want to create (they chose the model already)\n\n`
      systemPrompt += `Instead, skip directly to Step 2 (Prompt Crafting) and use "${selectedGenerationModelId}" for generation.\n`
      systemPrompt += `Only offer model alternatives if they explicitly ask or if their request is impossible with this model.\n`
    }

    // Server-detected canvas nudges — append to the system prompt for THIS
    // turn so the Director proactively addresses orphan refs / missing prompt
    // wires / unwired production-briefs without the user having to ask.
    const geminiNudges = computeCanvasNudges(canvas)
    if (geminiNudges) {
      systemPrompt += `\n\n${geminiNudges}`
    }

    // Get the model
    const model = genAI.getGenerativeModel({
      model: effectiveModelId,
      systemInstruction: systemPrompt,
    })

    // Purpose labels for context injection
    const PURPOSE_CONTEXT: Record<ImagePurpose, string> = {
      reference: 'REFERENCE IMAGE (style/content reference, ingredients for the generation)',
      starting_frame: 'STARTING FRAME (first frame for video generation, image-to-video)',
      edit_target: 'EDIT TARGET (image to be modified/edited)',
      last_frame: 'LAST FRAME (end frame for video generation)',
      analyze: 'ANALYZED IMAGE (with AI-generated content description)',
    }

    // Convert messages to Gemini format with image support
    const convertMessageToParts = (msg: ChatMessage) => {
      const parts: any[] = []

      // Add text content
      if (msg.content) {
        parts.push({ text: msg.content })
      }

      // Add image context to message - both local uploads AND Skinny Hub references
      // This ensures the AI orchestrator knows about ALL attached images
      if (msg.attachments?.length) {
        // Get all image attachments - both 'image' (local) and 'reference' (Skinny Hub)
        const allImageAttachments = msg.attachments.filter(a =>
          (a.type === 'image' || a.type === 'reference') && (a.base64 || a.url)
        )

        if (allImageAttachments.length > 0) {
          // Add context text about ALL images (regardless of base64) so AI knows they exist
          // Include AI analysis when available for smarter prompt crafting
          const imageContexts = allImageAttachments.map((att, i) => {
            const purposeLabel = att.purpose ? PURPOSE_CONTEXT[att.purpose] : 'REFERENCE IMAGE'
            let context = `[Image ${i + 1}: ${purposeLabel}]`

            // Include truncated analysis if available (max 500 chars to manage tokens)
            if (att.analysis) {
              const truncatedAnalysis = att.analysis.length > 500
                ? att.analysis.slice(0, 500) + '...'
                : att.analysis
              context += `\nAnalysis: ${truncatedAnalysis}`
            }

            return context
          }).join('\n\n')

          parts.push({ text: `\n\n--- ATTACHED IMAGES ---\n${imageContexts}\n` })

          // Add inline image data ONLY for images with base64 (vision models only)
          if (supportsVision) {
            const base64Attachments = allImageAttachments.filter(a => a.base64 && a.mimeType)
            for (const attachment of base64Attachments) {
              parts.push({
                inlineData: {
                  data: attachment.base64,
                  mimeType: attachment.mimeType,
                }
              })
            }
          }
        }
      }

      return parts
    }

    // Build history (all messages except the last one)
    const history = messages.slice(0, -1).map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: convertMessageToParts(msg),
    }))

    // Get the last message
    const lastMessage = messages[messages.length - 1]

    // ---- BUILD HINT injection (canvas mode only) -----------------------
    // When the client is in canvas mode AND the request body carries the
    // current canvas IR, run the intent classifier server-side and prepend
    // a `BUILD HINT:` paragraph to the last user message. This is the fix
    // for the "source: unknown" placeholder bug — the hint names the exact
    // existing short ids the model should use as connect sources.
    //
    // We DO NOT mutate `messages` itself or persist the hint into chat
    // history — we build a local `effectiveLastMessage` and pass that into
    // `convertMessageToParts` instead. The original `lastMessage` stays
    // intact for any downstream code (token tracking, generation forwarding)
    // that might inspect it.
    let hintIncluded = false
    let lastMessageForLLM = lastMessage
    let injectedHint = ''
    let classifiedIntentForLog: IntentMatch | null = null
    if (canvas && lastMessage && lastMessage.role === 'user') {
      try {
        const canvasShortIds = shortIdsFromCanvas(canvas)
        const rawUserText = extractRawUserText(lastMessage.content || '')
        const intent = classifyIntent(rawUserText, canvasShortIds)
        classifiedIntentForLog = intent
        const hint = buildHintForTurn(intent, canvasShortIds)
        if (hint) {
          injectedHint = hint
          hintIncluded = true
          // Clone the last message so we don't mutate the caller's object.
          // The hint goes at the VERY START of the content so it's the
          // first thing the model reads, ahead of the canvas director
          // preamble. Wrapped in a marker that the model knows from the
          // system prompt's BUILD HINT section.
          lastMessageForLLM = {
            ...lastMessage,
            content: `${hint}\n\n${lastMessage.content || ''}`,
          }
        }
      } catch (err) {
        // Classifier failures must never break the chat flow.
        console.error('[director-emit] BUILD HINT generation failed', err)
      }
    }

    // Telemetry — logged to stdout for now; will move to a real table later.
    if (canvas) {
      const canvasId = (canvas as any)?.id || 'inline'
      console.log('[director-emit]', {
        canvasId,
        intent: classifiedIntentForLog?.intent ?? 'unclassified',
        confidence: classifiedIntentForLog?.confidence ?? 0,
        hintIncluded,
        existingNodeShortIds: classifiedIntentForLog?.hints?.existingNodeShortIds ?? [],
        modelHint: classifiedIntentForLog?.hints?.modelHint ?? null,
        intendedAction: classifiedIntentForLog?.hints?.intendedAction ?? null,
        hintLength: injectedHint.length,
      })
    }

    // ===== Qwen branch (Alibaba DashScope, swappable canvas Director) =====
    // Qwen-Omni is now the DEFAULT for the canvas Director — it routes here
    // unless the client explicitly opted into Gemini. Bypasses all the
    // Gemini-specific setup below (chat history → parts conversion,
    // generation/skill block detection, gemini_usage logging) because
    // Qwen-Omni only handles plain text generation. The canvas-action emit
    // + validateAndFix pipeline is preserved verbatim — provider-agnostic.
    //
    // Key resolution order:
    //   1. Client-supplied directorUserKey (from the settings popover) — wins
    //      so users can run on their own free credits.
    //   2. Platform QWEN_API_KEY env var — fallback so first-time users get
    //      a working Director without configuring anything.
    const canvasModeForRouting =
      selectedGenerationModelId === 'creative-consultant' || !!canvas
    const platformQwenKey =
      process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || ''
    const userQwenKey = (body.directorUserKey || '').trim()
    const wantsQwen =
      canvasModeForRouting &&
      body.directorProvider !== 'gemini' &&
      (body.directorProvider === 'qwen' || !!platformQwenKey || !!userQwenKey)
    const resolvedQwenKey = userQwenKey || platformQwenKey

    if (wantsQwen) {
      if (!resolvedQwenKey) {
        return new Response(
          JSON.stringify({
            error:
              'Qwen provider selected but no DashScope key is available. Add one in the Director settings, or configure QWEN_API_KEY on the server.',
            code: 'NO_QWEN_KEY',
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        )
      }

      // Reuse the same canvas system prompt the Gemini path got — clients
      // already build it via director-client.buildCanvasPreamble and prepend
      // it to the user message, but we ALSO send the explicit canvas-mode
      // system prompt as message[0] so Qwen has the tool-block contract +
      // recipe library available even when the user's preamble is missing
      // (some clients may not wrap).
      const canvasDescription = canvas
        ? `Canvas has ${canvas.nodes?.length ?? 0} nodes and ${(canvas as any).edges?.length ?? 0} edges.`
        : 'Canvas is empty.'
      const baseSystemPrompt = generateCanvasSystemPrompt(canvasDescription)
      const nudges = computeCanvasNudges(canvas)
      const systemPromptForQwen = nudges
        ? `${baseSystemPrompt}\n\n${nudges}`
        : baseSystemPrompt

      // Translate the incoming chat history into OpenAI-shape messages. We
      // collapse attachments — canvas Director on Qwen is text-only for v1
      // (visionContext is pre-extracted via Gemini and embedded in text).
      const qwenMessages: QwenMessage[] = [
        { role: 'system', content: systemPromptForQwen },
        ...messages.slice(0, -1).map((m): QwenMessage => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: typeof m.content === 'string' ? m.content : '',
        })),
      ]
      // Last message — use the BUILD-HINT-enriched version, not the raw.
      qwenMessages.push({
        role: 'user',
        content:
          typeof lastMessageForLLM.content === 'string'
            ? lastMessageForLLM.content
            : '',
      })

      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        async start(controller) {
          let canvasActionEmitted = false
          let fullResponse = ''
          try {
            const { stream: qwenStream, usage: usagePromise } = callQwen({
              apiKey: resolvedQwenKey,
              model: body.directorQwenModel || undefined,
              messages: qwenMessages,
              temperature: 0.7,
            })

            for await (const delta of qwenStream) {
              fullResponse += delta
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ content: delta })}\n\n`),
              )

              // Same mid-stream canvas-action detection as the Gemini path.
              if (!canvasActionEmitted) {
                const parsedBlock = parseCanvasActionBlock(fullResponse)
                if (parsedBlock) {
                  canvasActionEmitted = true
                  const validation = validateAndFix(
                    parsedBlock as unknown as CanvasActionPayload,
                    canvas || null,
                  )
                  try {
                    const rawConnects = (parsedBlock.actions || [])
                      .filter((a: any) => a?.type === 'connect')
                      .map((a: any) => `${(a.source || '?').slice(0, 8)}→${(a.target || '?').slice(0, 8)}`)
                    const outConnects = (validation.payload.actions || [])
                      .filter((a: any) => a?.type === 'connect')
                      .map((a: any) => `${(a.source || '?').slice(0, 8)}→${(a.target || '?').slice(0, 8)}`)
                    console.log('[validator:qwen]', {
                      actionsIn: validation.summary?.actionsIn,
                      actionsOut: validation.summary?.actionsOut,
                      errors: validation.summary?.errors,
                      autoWiredPrompts: validation.summary?.autoWiredPrompts,
                      autoWiredRefs: validation.summary?.autoWiredRefs,
                      rawConnects,
                      outConnects,
                      ok: validation.ok,
                    })
                  } catch {}

                  const toolCallId =
                    typeof crypto !== 'undefined' && 'randomUUID' in crypto
                      ? crypto.randomUUID()
                      : `tc-${Date.now()}-${Math.random().toString(16).slice(2)}`
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        toolCall: {
                          id: toolCallId,
                          name: 'canvas-action',
                          args: validation.payload,
                          issues: validation.issues,
                          ok: validation.ok,
                        },
                      })}\n\n`,
                    ),
                  )
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        cleanContent: stripCanvasActionBlock(fullResponse),
                      })}\n\n`,
                    ),
                  )
                }
              }
            }

            // Final usage telemetry (don't write to gemini_usage — that
            // table is provider-specific).
            const usage = await usagePromise
            console.log('[director-emit:qwen]', {
              model: body.directorQwenModel || 'qwen3.5-omni-plus',
              promptTokens: usage?.promptTokens ?? null,
              responseTokens: usage?.responseTokens ?? null,
              canvasActionEmitted,
            })

            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ error: msg, code: 'QWEN_ERROR' })}\n\n`,
              ),
            )
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          } finally {
            controller.close()
          }
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    }
    // ===== End Qwen branch =====

    const lastMessageParts = convertMessageToParts(lastMessageForLLM)

    // Start chat with history
    const chat = model.startChat({
      history: history as any,
    })

    // Create a streaming response
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Stream the response - pass parts array for multimodal
          const result = await chat.sendMessageStream(lastMessageParts)

          let fullResponse = ''
          let generationTriggered = false
          // Canvas-action mid-stream emit guard. Once the fenced JSON block
          // closes and parses, we validate it, push it to the client, and
          // skip the end-of-stream fallback that would otherwise re-emit.
          let canvasActionEmitted = false
          // Only attempt canvas-action mid-stream parsing when the client is
          // in canvas / consultant mode. Other modes (storyboard generation,
          // skill creation) don't emit canvas-action blocks and we don't want
          // to spend time matching the regex on every chunk.
          const canvasModeActive =
            selectedGenerationModelId === 'creative-consultant' ||
            !!canvas

          for await (const chunk of result.stream) {
            const text = chunk.text()
            if (text) {
              fullResponse += text

              // Send the content chunk
              const data = JSON.stringify({ content: text })
              controller.enqueue(encoder.encode(`data: ${data}\n\n`))

              // Check for complete generation block
              if (!generationTriggered) {
                const genBlock = parseGenerationBlock(fullResponse)
                if (genBlock) {
                  generationTriggered = true

                  // Send generation status: planning
                  const planningData = JSON.stringify({
                    generation: {
                      status: 'planning',
                      model: genBlock.model,
                      params: genBlock.params,
                    }
                  })
                  controller.enqueue(encoder.encode(`data: ${planningData}\n\n`))
                }
              }

              // Mid-stream canvas-action emit. As soon as the fenced block
              // closes (the model just emitted the second ```), parse it,
              // run the validator, and ship the toolCall to the client so
              // nodes can render before Gemini finishes its prose tail.
              if (canvasModeActive && !canvasActionEmitted) {
                const parsedBlock = parseCanvasActionBlock(fullResponse)
                if (parsedBlock) {
                  canvasActionEmitted = true

                  const validation = validateAndFix(
                    parsedBlock as unknown as CanvasActionPayload,
                    canvas || null,
                  )

                  // Visibility: which connects did the AI emit + what did the
                  // validator do with them? Lets us see whether the validator
                  // is actually dropping bogus connects or whether they're
                  // leaking to the client.
                  try {
                    const rawConnects = (parsedBlock.actions || [])
                      .filter((a: any) => a?.type === 'connect')
                      .map((a: any) => `${(a.source || '?').slice(0, 8)}→${(a.target || '?').slice(0, 8)}`)
                    const outConnects = (validation.payload.actions || [])
                      .filter((a: any) => a?.type === 'connect')
                      .map((a: any) => `${(a.source || '?').slice(0, 8)}→${(a.target || '?').slice(0, 8)}`)
                    console.log('[validator]', {
                      actionsIn: validation.summary?.actionsIn,
                      actionsOut: validation.summary?.actionsOut,
                      errors: validation.summary?.errors,
                      warnings: validation.summary?.warnings,
                      fixed: validation.summary?.fixed,
                      autoWiredPrompts: validation.summary?.autoWiredPrompts,
                      autoWiredRefs: validation.summary?.autoWiredRefs,
                      rawConnects,
                      outConnects,
                      canvasNodes: canvas?.nodes?.length ?? 'NO_CANVAS',
                      ok: validation.ok,
                    })
                  } catch {}

                  const toolCallId =
                    typeof crypto !== 'undefined' && 'randomUUID' in crypto
                      ? crypto.randomUUID()
                      : `tc-${Date.now()}-${Math.random().toString(16).slice(2)}`
                  const toolCallData = JSON.stringify({
                    toolCall: {
                      id: toolCallId,
                      name: 'canvas-action',
                      args: validation.payload,
                      issues: validation.issues,
                      ok: validation.ok,
                    },
                  })
                  controller.enqueue(encoder.encode(`data: ${toolCallData}\n\n`))

                  const cleaned = stripCanvasActionBlock(fullResponse)
                  const cleanData = JSON.stringify({ cleanContent: cleaned })
                  controller.enqueue(encoder.encode(`data: ${cleanData}\n\n`))
                }
              }
            }
          }

          // Track token usage after streaming completes
          try {
            const aggregatedResponse = await result.response
            const usage = aggregatedResponse.usageMetadata

            if (usage && usage.promptTokenCount && usage.candidatesTokenCount) {
              const estimatedCost = calculateGeminiCost(
                effectiveModelId,
                usage.promptTokenCount,
                usage.candidatesTokenCount
              )

              // Log to gemini_usage table
              await sbAdmin.from('gemini_usage').insert({
                whop_user_id: whopUserId,
                prompt_tokens: usage.promptTokenCount,
                response_tokens: usage.candidatesTokenCount,
                total_tokens: usage.totalTokenCount || (usage.promptTokenCount + usage.candidatesTokenCount),
                model: effectiveModelId,
                estimated_cost_cents: estimatedCost,
                is_platform_key: isPlatformMode,
              })

              console.log('[Chat] Token usage logged:', {
                promptTokens: usage.promptTokenCount,
                responseTokens: usage.candidatesTokenCount,
                model: effectiveModelId,
                estimatedCostCents: estimatedCost,
                isPlatformKey: isPlatformMode,
              })
            }
          } catch (usageError) {
            // Don't fail the request if usage tracking fails
            console.error('[Chat] Failed to track token usage:', usageError)
          }

          // After streaming is complete, check for skill creation block
          const skillBlock = parseSkillCreationBlock(fullResponse)
          if (skillBlock) {
            // Send skill creation event to client
            const skillData = JSON.stringify({
              skillCreation: skillBlock
            })
            controller.enqueue(encoder.encode(`data: ${skillData}\n\n`))
          }

          // After streaming is complete, check for generation block (skip in consultant mode)
          const genBlock = isConsultantMode ? null : parseGenerationBlock(fullResponse)
          if (genBlock) {
            // Send generating status
            const generatingData = JSON.stringify({
              generation: {
                status: 'generating',
                model: genBlock.model,
                params: genBlock.params,
              }
            })
            controller.enqueue(encoder.encode(`data: ${generatingData}\n\n`))

            try {
              // Call the generation API - forward auth headers for user identification
              const forwardHeaders: Record<string, string> = {
                'Content-Type': 'application/json',
              }

              // Forward Whop authentication headers
              const whopToken = request.headers.get('x-whop-user-token')
              const whopUserId = request.headers.get('x-whop-user-id')
              const cookie = request.headers.get('cookie')

              if (whopToken) forwardHeaders['x-whop-user-token'] = whopToken
              if (whopUserId) forwardHeaders['x-whop-user-id'] = whopUserId
              if (cookie) forwardHeaders['cookie'] = cookie

              // Collect images from the ENTIRE conversation history (not just last message)
              // This is critical: user might attach an image in message 1, then confirm in message 3
              // We need to find all images across the conversation
              // Include base64 data so generate route can upload to storage if needed
              // Include both 'image' and 'reference' types (from Skinny Hub)
              const imagesWithPurposes: Array<{
                url: string
                base64?: string
                mimeType?: string
                purpose: string
              }> = []

              // ONLY use images from the LAST user message to prevent stale references
              // This fixes the bug where old images from previous messages were being reused
              // Users must explicitly attach images to each generation request
              const lastUserMessage = messages.filter(m => m.role === 'user').pop()
              if (lastUserMessage?.attachments?.length) {
                const imageAttachments = lastUserMessage.attachments.filter(
                  att => (att.type === 'image' || att.type === 'reference') && (att.base64 || att.url)
                )
                for (const att of imageAttachments) {
                  const purpose = att.purpose || 'reference'
                  // Check if we already have this exact URL to avoid duplicates
                  const alreadyHasUrl = imagesWithPurposes.some(img => img.url === att.url)
                  if (!alreadyHasUrl) {
                    imagesWithPurposes.push({
                      url: att.url,
                      base64: att.base64,
                      mimeType: att.mimeType,
                      purpose: purpose,
                    })
                  }
                }
              }

              // Log attachment debugging info
              console.log('[Chat] Total messages in conversation:', messages.length)
              console.log('[Chat] Last message attachments:', lastMessage.attachments?.length || 0)
              console.log('[Chat] Images collected from conversation history:', imagesWithPurposes.length)
              if (imagesWithPurposes.length > 0) {
                console.log('[Chat] Images detail:', JSON.stringify(imagesWithPurposes.map(i => ({
                  purpose: i.purpose,
                  hasUrl: !!i.url,
                  hasBase64: !!i.base64,
                  urlType: i.url?.startsWith('http') ? 'http' : i.url?.startsWith('blob') ? 'blob' : 'other',
                  urlPreview: i.url?.slice(0, 80)
                }))))
              } else {
                console.warn('[Chat] WARNING: No images found in conversation history!')
              }

              console.log('[Chat] Calling generate API for model:', genBlock.model)
              const generateUrl = new URL('/api/generate', request.url).href
              console.log('[Chat] Generate URL:', generateUrl)

              const genResponse = await fetch(generateUrl, {
                method: 'POST',
                headers: forwardHeaders,
                body: JSON.stringify({
                  model: genBlock.model,
                  prompt: genBlock.prompt,
                  params: genBlock.params,
                  // Video-specific fields
                  duration: genBlock.duration,
                  resolution: genBlock.resolution,
                  // Seedream 4.5 sequential generation fields
                  sequentialImageGeneration: genBlock.sequentialImageGeneration,
                  maxImages: genBlock.maxImages,
                  // Pass images with purposes
                  images: imagesWithPurposes.length > 0 ? imagesWithPurposes : undefined,
                  // Always return immediately for frontend polling (Netlify SSE compatibility)
                  noWait: true,
                }),
              })

              console.log('[Chat] Generate response status:', genResponse.status, genResponse.statusText)
              const genResultText = await genResponse.text()
              console.log('[Chat] Generate response text (first 500 chars):', genResultText.slice(0, 500))

              let genResult: any
              try {
                genResult = JSON.parse(genResultText)
              } catch (parseError) {
                console.error('[Chat] Failed to parse generate response:', parseError)
                throw new Error(`Generate API returned invalid JSON: ${genResultText.slice(0, 200)}`)
              }

              if (genResult.success && genResult.imageUrl) {
                console.log('[Chat] Generation successful! imageUrl:', genResult.imageUrl)
                console.log('[Chat] All output URLs:', genResult.outputUrls)
                // Send complete status with result - include all output URLs for sequential generation
                // Also include reference images used so UI can display them
                const referenceImagesUsed = imagesWithPurposes
                  .filter(img => img.url && img.purpose === 'reference')
                  .map(img => ({ url: img.url, purpose: img.purpose }))
                const completeData = JSON.stringify({
                  generation: {
                    status: 'complete',
                    model: genBlock.model,
                    params: genBlock.params,
                    result: {
                      imageUrl: genResult.imageUrl,
                      outputUrls: genResult.outputUrls || [genResult.imageUrl],
                      prompt: genBlock.prompt,
                      referenceImages: referenceImagesUsed.length > 0 ? referenceImagesUsed : undefined,
                    }
                  }
                })
                console.log('[Chat] Sending complete data to stream')
                controller.enqueue(encoder.encode(`data: ${completeData}\n\n`))
                console.log('[Chat] Complete data sent')
              } else if (genResult.pending && genResult.generationId) {
                // Generation is still processing - DON'T poll here!
                // Netlify will timeout before completion (10-26s limit)
                // Send generationId to frontend for client-side polling
                console.log('[Chat] Generation pending, sending generationId for frontend polling:', genResult.generationId)
                const pendingData = JSON.stringify({
                  generation: {
                    status: 'generating',  // Keep as generating (frontend will poll)
                    model: genBlock.model,
                    params: genBlock.params,
                    generationId: genResult.generationId,  // Frontend needs this to poll
                  }
                })
                controller.enqueue(encoder.encode(`data: ${pendingData}\n\n`))
              } else {
                console.log('[Chat] Generation failed:', genResult.error || 'Unknown error')
                console.log('[Chat] Error code:', genResult.code)
                // Send error status with all details (including balance info if applicable)
                const errorData = JSON.stringify({
                  generation: {
                    status: 'error',
                    model: genBlock.model,
                    params: genBlock.params,
                    error: genResult.error || 'Generation failed',
                    code: genResult.code,
                    required: genResult.required,
                    available: genResult.available,
                  }
                })
                controller.enqueue(encoder.encode(`data: ${errorData}\n\n`))
              }
            } catch (genError: any) {
              console.error('Generation error:', genError)
              const errorData = JSON.stringify({
                generation: {
                  status: 'error',
                  model: genBlock.model,
                  params: genBlock.params,
                  error: genError.message || 'Generation failed',
                }
              })
              controller.enqueue(encoder.encode(`data: ${errorData}\n\n`))
            }
          }

          // After streaming is complete, check for director's notes
          const directorsNotes = parseDirectorsNotes(fullResponse)
          if (directorsNotes) {
            // Send director's notes event to client
            const notesData = JSON.stringify({
              directorsNotes: directorsNotes
            })
            controller.enqueue(encoder.encode(`data: ${notesData}\n\n`))
          }

          // Canvas Director tool-call (fallback): the mid-stream watcher
          // above usually catches this. We only fall through here if the
          // block closed in the SAME chunk as [DONE] or if canvas mode
          // wasn't detected during streaming. Guarded by canvasActionEmitted
          // so we never double-emit.
          if (!canvasActionEmitted) {
            const canvasAction = parseCanvasActionBlock(fullResponse)
            if (canvasAction) {
              const validation = validateAndFix(
                canvasAction as unknown as CanvasActionPayload,
                canvas || null,
              )
              const toolCallId =
                typeof crypto !== 'undefined' && 'randomUUID' in crypto
                  ? crypto.randomUUID()
                  : `tc-${Date.now()}-${Math.random().toString(16).slice(2)}`
              const toolCallData = JSON.stringify({
                toolCall: {
                  id: toolCallId,
                  name: 'canvas-action',
                  args: validation.payload,
                  issues: validation.issues,
                  ok: validation.ok,
                },
              })
              controller.enqueue(encoder.encode(`data: ${toolCallData}\n\n`))
              // Replace the assistant content with the stripped version — the
              // client swaps the displayed message so the JSON block vanishes
              // once the action is dispatched.
              const cleaned = stripCanvasActionBlock(fullResponse)
              const cleanData = JSON.stringify({ cleanContent: cleaned })
              controller.enqueue(encoder.encode(`data: ${cleanData}\n\n`))
            }
          }

          // Send done marker
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (error: any) {
          console.error('Streaming error:', error)

          // Handle specific error types
          let errorMessage = 'An error occurred'
          let errorCode = 'UNKNOWN_ERROR'

          if (error.message?.includes('API_KEY_INVALID') || error.message?.includes('API key')) {
            errorMessage = 'Invalid API key. Please check your Google AI API key in Settings.'
            errorCode = 'INVALID_API_KEY'
          } else if (error.message?.includes('quota') || error.message?.includes('rate')) {
            errorMessage = 'Rate limit exceeded. Please wait a moment and try again.'
            errorCode = 'RATE_LIMITED'
          } else if (error.message?.includes('not found') || error.message?.includes('not supported')) {
            errorMessage = 'Model not available. Try a different model in Settings.'
            errorCode = 'MODEL_NOT_FOUND'
          } else if (error.message?.includes('image') || error.message?.includes('vision')) {
            errorMessage = 'This model does not support images. Try Gemini 2.5 Flash.'
            errorCode = 'NO_VISION_SUPPORT'
          }

          const errorData = JSON.stringify({
            error: errorMessage,
            code: errorCode,
          })
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`))
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Chat API error:', error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'An error occurred',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}
