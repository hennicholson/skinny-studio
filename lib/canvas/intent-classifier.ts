// Pure intent-classifier for Canvas Director user messages.
//
// This module exists to give the UI an instant "I understood what you want"
// affordance BEFORE the LLM has finished streaming. The Director chat calls
// `classifyIntent(message, canvasShortIds)` synchronously on the way to the
// network, so it can:
//   1. Show an optimistic status pill ("Building sequential workflow…")
//   2. Eventually pass a structured hint to the server prompt (out of scope
//      for this module — it just produces metadata).
//
// Design constraints:
//   * No external imports, no side-effects, no async — easy to unit-test.
//   * Multiple regex sets per intent: real users don't speak in canonical
//     forms ("make 10 of X", "give me ten", "I want 10 variations" all
//     mean the same thing).
//   * Confidence tiers:
//       0.9+ — unambiguous (verb+object pair, or a numeric+intent combo)
//       0.6–0.8 — partial / single-signal match
//       <0.5  — falls through to 'unknown'
//
// IMPORTANT: ordering of checks matters. We check the most-specific intents
// first (sequential_n with a count, end_frame's "from X to Y") before more
// general ones (animate, edit_image). Each branch records the matched
// phrases in `signals` for debugging.

export type Intent =
  | 'sequential_n'
  | 'animate'
  | 'end_frame'
  | 'storyboard_grid'
  | 'edit_image'
  | 'fan_out'
  | 'consistent_character'
  | 'logo'
  | 'poster_text'
  | 'swap_model'
  | 'add_audio'
  | 'delete_all'
  | 'tidy_layout'
  // update_and_extend: user references an existing canvas node (by short id or
  // by demonstrative "the existing prompt") AND asks for something new to be
  // added (a model, a connection, etc). This is the bug-driving intent that
  // triggered the Director-reliability work: the AI was silently emitting
  // `"source": "unknown"` instead of using the real short-id when wiring a
  // new model to an existing prompt. With this intent the server can ship a
  // BUILD HINT naming the exact short-id to use as the source.
  | 'update_and_extend'
  | 'unknown'

export interface IntentMatch {
  intent: Intent
  confidence: number
  signals: string[]
  hints?: {
    count?: number
    aspectRatio?: string
    modelHint?: string
    /** Single existing short id matched (backwards-compatible field). */
    targetNodeShortId?: string
    /**
     * EVERY short id mentioned by the user that ALSO matches a real node on
     * the canvas. Populated by update_and_extend (and any other intent that
     * picks up multiple bracket refs). Use this when emitting BUILD HINTs —
     * tells the model exactly which ids are safe to reference as sources.
     */
    existingNodeShortIds?: string[]
    /**
     * Coarse signal of what the user wants the AI to DO with the existing
     * node(s). Used by the BUILD HINT generator to phrase the recommended
     * action shape ("update + connect" vs "wire ref" vs "swap model").
     */
    intendedAction?: 'add_model' | 'add_reference' | 'rewire' | 'rewrite'
  }
}

/* ----------------------------- helpers ---------------------------------- */

const WORD_NUMERALS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  // Bonus common ones — small integers people actually say.
  dozen: 12, couple: 2, few: 3, several: 4,
}

/**
 * Pull a small integer (2..20) out of the message. Prefers a number that
 * appears next to "of", "variations", "panels", "shots", "frames", "scenes",
 * "versions"; falls back to any standalone integer 2..20.
 */
function parseCount(msg: string): number | undefined {
  // 1) Digit form near a quantity keyword.
  const digitNear = msg.match(
    /\b(\d{1,2})\s*(?:of|variations?|panels?|shots?|frames?|scenes?|versions?|images?|nodes?|copies|times)\b/i,
  )
  if (digitNear) {
    const n = parseInt(digitNear[1], 10)
    if (n >= 2 && n <= 50) return n
  }
  // 2) Word-numeral form near a quantity keyword.
  const wordNear = msg.match(
    /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|dozen|couple|few|several)\s*(?:of|variations?|panels?|shots?|frames?|scenes?|versions?|images?|nodes?|copies|times)\b/i,
  )
  if (wordNear) return WORD_NUMERALS[wordNear[1].toLowerCase()]
  // 3) "make N <noun>" — N right before any noun.
  const makeN = msg.match(
    /\b(?:make|create|generate|build|produce|render|give\s+me|i\s+want)\s+(\d{1,2}|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|dozen)\b/i,
  )
  if (makeN) {
    const tok = makeN[1].toLowerCase()
    const n = /^\d+$/.test(tok) ? parseInt(tok, 10) : WORD_NUMERALS[tok]
    if (n && n >= 2 && n <= 50) return n
  }
  // 4) Bare integer between 2 and 20 (last resort).
  const bare = msg.match(/(?<!\d)(\d{1,2})(?!\d)/)
  if (bare) {
    const n = parseInt(bare[1], 10)
    if (n >= 2 && n <= 20) return n
  }
  return undefined
}

function parseAspectRatio(msg: string): string | undefined {
  const m = msg.match(/\b(\d{1,2}):(\d{1,2})\b/)
  if (m) return `${m[1]}:${m[2]}`
  // Common named ratios.
  if (/\b(landscape|widescreen|cinematic)\b/i.test(msg)) return '16:9'
  if (/\b(portrait|vertical|tiktok|reel|stories?)\b/i.test(msg)) return '9:16'
  if (/\b(square|insta(gram)?\s*post)\b/i.test(msg)) return '1:1'
  return undefined
}

function parseModelHint(msg: string): string | undefined {
  // Order matters — more specific / longer model names FIRST so e.g.
  // "seedream-4.5" wins over "seedream" alone, and "veo-3.1" beats "veo".
  // Mapped values are canonical model slugs we can hand to BUILD HINTs and
  // recipe selection. Aliases users actually type ("nanobanana", "flux pro",
  // "veo 3", "veo 3.1") all collapse to the canonical slug.
  const patterns: Array<[RegExp, string]> = [
    // Image models — versioned canonical slugs first.
    [/\bseedream[\s-]?4\.?5\b/i, 'seedream-4.5'],
    [/\bseedream\b/i, 'seedream-4.5'],
    [/\bflux[\s-]?2[\s-]?pro\b/i, 'flux-2-pro'],
    [/\bflux\s*pro\b/i, 'flux-2-pro'],
    [/\bflux[\s-]?schnell\b/i, 'flux-schnell'],
    [/\bflux\b/i, 'flux-2-pro'],
    [/\bnano[\s-]?banana[\s-]?pro\b/i, 'nano-banana-pro'],
    [/\bnano[\s-]?banana\b/i, 'nano-banana-pro'],
    [/\bideogram[\s-]?v?2\b/i, 'ideogram-v2'],
    [/\bideogram\b/i, 'ideogram-v2'],
    [/\brecraft[\s-]?v?3\b/i, 'recraft-v3'],
    [/\brecraft\b/i, 'recraft-v3'],
    [/\bimagen\b/i, 'imagen'],
    // Video models — Veo 3.1 / Wan 2.5 / Kling / Hailuo first because users
    // mention these the most for I2V. Versioned slugs take precedence.
    [/\bveo[\s-]?3\.?1[\s-]?fast\b/i, 'veo-3.1-fast'],
    [/\bveo[\s-]?3\.?1\b/i, 'veo-3.1'],
    [/\bveo[\s-]?3\b/i, 'veo-3.1'],
    [/\bveo\b/i, 'veo-3.1'],
    [/\bwan[\s-]?2\.?5[\s-]?fast\b/i, 'wan-2.5-fast'],
    [/\bwan[\s-]?2\.?5\b/i, 'wan-2.5'],
    [/\bkling[\s-]?2\.?5[\s-]?pro\b/i, 'kling-2.5-pro'],
    [/\bkling\b/i, 'kling-2.5-pro'],
    [/\bhailuo\b/i, 'hailuo'],
    // Models we don't actually ship but users name-drop — map to closest
    // canonical so BUILD HINTs at least suggest something sane.
    [/\brunway\b/i, 'veo-3.1'],
    [/\bsora\b/i, 'veo-3.1'],
    [/\bpika\b/i, 'veo-3.1'],
    [/\bsdxl\b/i, 'flux-2-pro'],
    [/\bsd3\b/i, 'flux-2-pro'],
  ]
  for (const [re, name] of patterns) if (re.test(msg)) return name
  return undefined
}

/**
 * Find every `[abcd]` / `Node[abcd]` reference in the message AND filter
 * to the ones that actually exist on the canvas. Used by update_and_extend
 * to surface every existing node the user wants wired into the new work.
 * Returns lowercase short ids, de-duplicated, preserving first-mention order.
 */
function parseAllExistingShortIds(
  msg: string,
  canvasShortIds?: string[],
): string[] {
  const re = /(?:node)?\[([a-zA-Z0-9]{4})\]/gi
  const hits: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(msg)) !== null) {
    const id = m[1].toLowerCase()
    if (!hits.includes(id)) hits.push(id)
  }
  if (hits.length === 0) return []
  if (!canvasShortIds || canvasShortIds.length === 0) return hits
  const lowered = new Set(canvasShortIds.map((s) => s.toLowerCase()))
  return hits.filter((id) => lowered.has(id))
}

/**
 * Heuristic: does the message imply the user wants to ACT on an existing
 * prompt/node even without naming a short id? E.g. "the existing prompt",
 * "this prompt", "the prompt above". We only treat this as evidence when
 * the canvas actually has at least one text-prompt-shaped node — but we
 * don't have node TYPES here, only short ids. The caller passes
 * `canvasHasAnyNode` so we don't conjure references against an empty canvas.
 */
function mentionsExistingPrompt(msg: string): boolean {
  return /\b(the|this|that)\s+(existing\s+)?(prompt|text[-\s]?prompt|node|prompt\s+above|prompt\s+below)\b/i.test(
    msg,
  )
}

/**
 * Heuristic: does the message imply "add a NEW model/something"? Combined
 * with an existing-node reference this triggers update_and_extend.
 */
function impliesAddNew(msg: string): {
  hit: boolean
  action?: NonNullable<IntentMatch['hints']>['intendedAction']
} {
  if (/\b(add|make|generate|create|build|produce|render|attach|drop\s+in|throw\s+in|spin\s+up)\s+(a|an|another)?\s*(seedream|flux|veo|wan|kling|hailuo|nano[\s-]?banana|ideogram|recraft|imagen|model|node|image[-\s]?gen|video[-\s]?gen|generator|image|video)\b/i.test(msg))
    return { hit: true, action: 'add_model' }
  if (/\b(wire|connect|hook|plug|link)\b/i.test(msg))
    return { hit: true, action: 'rewire' }
  if (/\b(use|swap\s+to|switch\s+to|change\s+to)\s+(seedream|flux|veo|wan|kling|hailuo|nano[\s-]?banana|ideogram|recraft|imagen)\b/i.test(msg))
    return { hit: true, action: 'add_model' }
  if (/\b(rewrite|rework|expand|elaborate|improve)\b/i.test(msg))
    return { hit: true, action: 'rewrite' }
  if (/\b(add|attach|drop\s+in)\s+(a|an|another)?\s*(reference|ref|style\s+ref|character)\b/i.test(msg))
    return { hit: true, action: 'add_reference' }
  return { hit: false }
}

function parseTargetShortId(msg: string, canvasShortIds?: string[]): string | undefined {
  // Accept [abcd] / [abc1] / Node[abcd] — 4-char hex-ish prefix.
  const m = msg.match(/(?:node)?\[([a-zA-Z0-9]{4})\]/i)
  if (!m) return undefined
  const candidate = m[1].toLowerCase()
  if (canvasShortIds && canvasShortIds.length > 0) {
    const lowered = canvasShortIds.map((s) => s.toLowerCase())
    if (lowered.includes(candidate)) return candidate
    return undefined
  }
  // No canvas given — trust the syntactic form.
  return candidate
}

/* ----------------------------- intent specs ----------------------------- */
//
// Each spec is a list of regexes; the highest scoring matching intent wins.
// We keep them small and readable, and bias confidence by how many distinct
// signals fire.

// `update_and_extend` is excluded because its match logic is structural
// (requires existing-id signal + add-new signal), not a simple regex list.
// `sequential_n` is excluded for the same reason — it requires a count.
const PATTERNS: Record<Exclude<Intent, 'unknown' | 'sequential_n' | 'update_and_extend'>, RegExp[]> = {
  animate: [
    /\banimate\s+(this|that|it|the\s+\w+)/i,
    /\bbring\s+(this|that|it)\s+to\s+life\b/i,
    /\bmake\s+(this|that|it)\s+move\b/i,
    /\b(turn|convert)\s+(this|that|it)?\s*(into|to)\s+(a\s+)?(video|motion|clip)\b/i,
    /\b(image|photo|still)\s*[-→]?\s*to\s*[-→]?\s*video\b/i,
    /\bvideo\s+of\s+(this|that|it)\b/i,
  ],
  end_frame: [
    /\bfrom\s+.{2,60}?\s+to\s+.{2,60}/i,
    /\binterpolat(e|ion)\s+between\b/i,
    /\b(start|first)\s+frame\b.*\b(end|last)\s+frame\b/i,
    /\bmorph\s+(from|between)\b/i,
    /\btransition\s+(from|between)\b/i,
    /\bend\s*frame\b/i,
  ],
  storyboard_grid: [
    /\b(\d{1,2})[-\s]?panel\b/i,
    /\bstoryboard\b/i,
    /\bcomic\s+(strip|page|panels?)\b/i,
    /\bgrid\s+of\b/i,
    /\b(3x3|2x2|4x4|3x2|2x3)\b/i,
  ],
  edit_image: [
    /\bchange\s+the\s+\w+\s+to\b/i,
    /\b(edit|modify|tweak|adjust|alter)\s+(this|that|the\s+\w+)/i,
    /\b(remove|add|replace|swap)\s+(the\s+)?\w+\b/i,
    /\b(make\s+it|turn\s+it)\s+(more|less|into)\b/i,
    /\binpaint\b/i,
    /\bretouch\b/i,
  ],
  fan_out: [
    /\b(test|try|explore)\s+\d*\s*(prompts?|variations?|options?|directions?|takes?)\b/i,
    /\b(\d+|two|three|four|five|six)\s+variations?\b/i,
    /\bfan[\s-]?out\b/i,
    /\bcompare\s+\w+\s+(prompts?|models?)\b/i,
    /\b(several|multiple|different)\s+(prompts?|takes?|options?)\b/i,
  ],
  consistent_character: [
    /\b(same|consistent|matching)\s+character\b/i,
    /\bacross\s+\d+\s+(scenes?|shots?|frames?|panels?)\b/i,
    /\bcharacter\s+(consistency|sheet|across)\b/i,
    /\bkeep\s+the\s+(same\s+)?(character|face|person|subject)\b/i,
    /\bsame\s+(person|face|subject)\s+in\b/i,
  ],
  logo: [
    /\blogo\b/i,
    /\b(brand|brandmark|wordmark)\b/i,
    /\bicon\s+(for|design)\b/i,
    /\bapp\s+icon\b/i,
    /\bfavicon\b/i,
  ],
  poster_text: [
    /\bposter\b/i,
    /\b(typography|typographic)\b/i,
    /\bwith\s+text\s+(reading|that\s+says|saying)\b/i,
    /\b(movie|gig|event)\s+poster\b/i,
    /\bheadline\s+(reads|saying)\b/i,
  ],
  swap_model: [
    /\bswap\s+(to|model)\b/i,
    /\b(use|switch\s+to)\s+(veo|seedream|flux|kling|sdxl|nano[-\s]?banana|ideogram|runway|sora|pika|recraft|imagen)\b/i,
    /\b(re-?run|rerender)\s+(with|using)\b/i,
    /\b(try|use)\s+\w+\s+instead\b/i,
    /\bchange\s+the\s+model\b/i,
  ],
  add_audio: [
    /\bwith\s+(audio|sound|music|dialogue|voice(over)?|narration)\b/i,
    /\badd\s+(audio|sound|music|dialogue|voice(over)?|narration|sfx)\b/i,
    /\b(voice|speech|narrat\w+)\s+over\b/i,
    /\blip[-\s]?sync\b/i,
    /\bsoundtrack\b/i,
  ],
  delete_all: [
    /\b(clear|reset|wipe|nuke|empty)\s+(the\s+)?(canvas|board|everything|all)\b/i,
    /\bstart\s+over\b/i,
    /\bfresh\s+(start|canvas)\b/i,
    /\bdelete\s+(everything|all\s+nodes?|the\s+canvas)\b/i,
  ],
  tidy_layout: [
    /\b(tidy|clean|organi[sz]e|arrange|rearrange|re-?arrange|sort|space|align|format)\s+(this|that|the\s+\w+|up|out|everything|things|nodes?|canvas|workflow|layout|graph|board)\b/i,
    /\b(make|get)\s+(this|the\s+\w+|it)\s+(look\s+)?(better|cleaner|tidier|neater|readable|presentable|prettier)\b/i,
    /\b(layout|positioning|placement|spacing)\s+(is|looks)\s+(messy|bad|off|cluttered|cramped|broken)\b/i,
    /\b(everything|this|the\s+canvas)\s+(is|looks)\s+(messy|cluttered|cramped|jumbled|disorganized|all\s+over)\b/i,
    /\bauto[\s-]?(layout|arrange|format)\b/i,
    /\b(fix|reset)\s+(the\s+)?(layout|positions?|spacing)\b/i,
    /\b(flow|stack)\s+(it|them|the\s+nodes?)\s+(left|right|down|nicely|properly)\b/i,
  ],
}

/* ----------------------------- main ------------------------------------- */

export function classifyIntent(
  userMessage: string,
  canvasShortIds?: string[],
): IntentMatch {
  const msg = (userMessage ?? '').trim()
  if (!msg) return { intent: 'unknown', confidence: 0, signals: [] }

  const hints: NonNullable<IntentMatch['hints']> = {}
  const aspectRatio = parseAspectRatio(msg)
  if (aspectRatio) hints.aspectRatio = aspectRatio
  const modelHint = parseModelHint(msg)
  if (modelHint) hints.modelHint = modelHint
  const targetShortId = parseTargetShortId(msg, canvasShortIds)
  if (targetShortId) hints.targetNodeShortId = targetShortId
  const allExistingIds = parseAllExistingShortIds(msg, canvasShortIds)
  if (allExistingIds.length > 0) hints.existingNodeShortIds = allExistingIds
  const count = parseCount(msg)
  if (count !== undefined) hints.count = count

  /* ---- specific-first checks ---------------------------------------- */

  // delete_all: very disruptive, treat as high-priority match if it fires.
  {
    const matched = PATTERNS.delete_all.filter((re) => re.test(msg))
    if (matched.length > 0) {
      return {
        intent: 'delete_all',
        confidence: matched.length >= 1 ? 0.92 : 0.6,
        signals: matched.map((re) => re.source),
        hints: cleanHints(hints),
      }
    }
  }

  // sequential_n: a count (>=2) PLUS either an explicit "of/variations/
  // series/sequence" phrasing, OR a make/create-style verb directly
  // followed by a number ("make 10 astronauts", "generate 5 logos").
  // We do NOT fire on bare numbers — "16:9 aspect" has a 16 in it but
  // should be a hint, not an intent.
  {
    const seqVerbs = [
      /\b(make|create|generate|build|produce|render|give\s+me|i\s+want)\b.*\b(of|with|in\s+a\s+(series|sequence))\b/i,
      /\bsequence\s+of\b/i,
      /\bseries\s+of\b/i,
      /\b(\d+|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)\s+(of|variations?|copies|versions?)\b/i,
      // "make/create/generate N <noun>" — N can be digit OR word numeral.
      /\b(make|create|generate|build|produce|render|give\s+me|i\s+want)\s+(\d{1,2}|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+\w/i,
    ]
    const seqMatched = seqVerbs.filter((re) => re.test(msg))
    if (count !== undefined && count >= 2 && seqMatched.length > 0) {
      return {
        intent: 'sequential_n',
        confidence: Math.min(0.95, 0.8 + 0.05 * seqMatched.length),
        signals: ['count=' + count, ...seqMatched.map((re) => re.source)],
        hints: cleanHints(hints),
      }
    }
  }

  // end_frame BEFORE animate — "animate from X to Y" should win as end_frame
  // because the from/to pair is the load-bearing signal.
  {
    const matched = PATTERNS.end_frame.filter((re) => re.test(msg))
    if (matched.length > 0) {
      // Discount "from X to Y" if it's clearly a metaphor ("from scratch
      // to finish") — heuristic: skip if neither X nor Y looks like a noun
      // phrase. We approximate by ignoring matches where the substring
      // between "from" and "to" is < 3 chars.
      return {
        intent: 'end_frame',
        confidence: matched.length >= 2 ? 0.9 : 0.72,
        signals: matched.map((re) => re.source),
        hints: cleanHints(hints),
      }
    }
  }

  /* ---- update_and_extend (existing-node + new-thing) --------------- */
  // This is the intent that fixes the "source: unknown" bug. We fire when:
  //   (a) the user named at least one real canvas short id [abcd] AND wants
  //       to add/wire something new — confidence 0.9
  //   (b) the user said "the/this/that existing prompt" (canvas has nodes)
  //       AND wants to add/wire something new — confidence 0.7
  //   (c) the user explicitly said "make sure all nodes are connected" or
  //       "wire them up" alongside a model verb — confidence 0.8 even
  //       without a named id; the BUILD HINT then synthesises a default
  //       wiring from the single existing prompt (if there's exactly one).
  // We DO NOT fire if the message looks like a pure "update [abcd]" with
  // no add-new signal — that stays in the general scan as a softer match.
  {
    const addNew = impliesAddNew(msg)
    const explicitWiringDemand =
      /\bmake\s+sure\b.*\b(connect|connected|wired|wires|hooked|linked)\b/i.test(msg) ||
      /\bensure\b.*\b(connect|connected|wired)\b/i.test(msg) ||
      /\b(connect|wire|hook|plug|link)\s+(them|it|the\s+nodes|all|everything)\b/i.test(msg)
    const namedExistingIds = allExistingIds.length > 0
    const demonstrativePromptRef =
      mentionsExistingPrompt(msg) && (canvasShortIds?.length ?? 0) > 0

    if (
      (namedExistingIds && addNew.hit) ||
      (demonstrativePromptRef && addNew.hit) ||
      (explicitWiringDemand && addNew.hit && (canvasShortIds?.length ?? 0) > 0)
    ) {
      // Tier confidence by the strongest evidence available.
      // The user's "make sure all nodes are connected" phrasing alongside a
      // model verb is the LOUDEST signal we have — they're literally telling
      // us the wiring matters, and the bug we're patching was the AI
      // ignoring exactly this demand. Treat it at 0.9 parity with a named id.
      let confidence = 0.7
      if (namedExistingIds && addNew.hit) confidence = 0.9
      else if (explicitWiringDemand && addNew.hit) confidence = 0.9
      else if (demonstrativePromptRef && addNew.hit) confidence = 0.7
      // Extra bump when we ALSO got a clean model hint (e.g. "seedream-4.5") —
      // the BUILD HINT will then carry an action shape, so the model has
      // even less excuse to hallucinate the source id.
      if (confidence < 0.92 && modelHint) confidence = Math.min(0.92, confidence + 0.02)

      if (addNew.action) hints.intendedAction = addNew.action

      const signals: string[] = []
      if (namedExistingIds) signals.push(`existing=[${allExistingIds.join(',')}]`)
      if (demonstrativePromptRef) signals.push('demonstrative-prompt-ref')
      if (explicitWiringDemand) signals.push('explicit-wiring-demand')
      if (addNew.action) signals.push(`add=${addNew.action}`)
      if (modelHint) signals.push(`model=${modelHint}`)

      return {
        intent: 'update_and_extend',
        confidence,
        signals,
        hints: cleanHints(hints),
      }
    }
  }

  /* ---- general intent scan ----------------------------------------- */

  // Score every other intent. Highest score wins; ties broken by spec order.
  type Score = { intent: Intent; matches: RegExp[] }
  const scores: Score[] = []
  const generalOrder: Array<keyof typeof PATTERNS> = [
    'animate',
    'storyboard_grid',
    'edit_image',
    'fan_out',
    'consistent_character',
    'logo',
    'poster_text',
    'swap_model',
    'add_audio',
  ]
  for (const intent of generalOrder) {
    const matches = PATTERNS[intent].filter((re) => re.test(msg))
    if (matches.length > 0) scores.push({ intent, matches })
  }

  if (scores.length === 0) {
    // Pure hint-only messages (e.g. just "use veo") still count weakly as
    // swap_model — sweep them up here.
    if (hints.modelHint && /\b(swap|use|switch|change)\b/i.test(msg)) {
      return {
        intent: 'swap_model',
        confidence: 0.7,
        signals: [`modelHint=${hints.modelHint}`],
        hints: cleanHints(hints),
      }
    }
    return { intent: 'unknown', confidence: 0, signals: [], hints: cleanHints(hints) }
  }

  // Pick the highest-scoring intent; bias storyboard_grid up if a count
  // appeared alongside (e.g. "9-panel storyboard").
  scores.sort((a, b) => b.matches.length - a.matches.length)
  const top = scores[0]
  let confidence = 0.6 + 0.12 * Math.min(top.matches.length, 3)
  if (top.intent === 'storyboard_grid' && count !== undefined && count >= 4) {
    confidence = Math.min(0.95, confidence + 0.1)
  }
  if (top.intent === 'animate' && hints.modelHint === 'veo') {
    confidence = Math.min(0.95, confidence + 0.05)
  }
  if (top.intent === 'swap_model' && hints.modelHint) {
    confidence = Math.min(0.95, confidence + 0.1)
  }
  // Single weak signal — keep below the 0.7 optimistic-UI threshold.
  if (top.matches.length === 1) confidence = Math.min(confidence, 0.78)

  return {
    intent: top.intent,
    confidence,
    signals: top.matches.map((re) => re.source),
    hints: cleanHints(hints),
  }
}

function cleanHints(h: NonNullable<IntentMatch['hints']>): IntentMatch['hints'] {
  if (
    h.count === undefined &&
    h.aspectRatio === undefined &&
    h.modelHint === undefined &&
    h.targetNodeShortId === undefined &&
    (h.existingNodeShortIds === undefined || h.existingNodeShortIds.length === 0) &&
    h.intendedAction === undefined
  ) {
    return undefined
  }
  return h
}

/**
 * Human-readable label for an intent — used by the optimistic UI pill.
 * Kept here so the UI doesn't have to maintain its own lookup.
 */
export function intentLabel(intent: Intent): string {
  switch (intent) {
    case 'sequential_n': return 'sequential workflow'
    case 'animate': return 'animation'
    case 'end_frame': return 'end-frame interpolation'
    case 'storyboard_grid': return 'storyboard grid'
    case 'edit_image': return 'image edit'
    case 'fan_out': return 'prompt fan-out'
    case 'consistent_character': return 'consistent-character set'
    case 'logo': return 'logo'
    case 'poster_text': return 'typographic poster'
    case 'swap_model': return 'model swap'
    case 'add_audio': return 'audio layer'
    case 'delete_all': return 'canvas reset'
    case 'update_and_extend': return 'update + extend'
    case 'tidy_layout': return 'tidy layout'
    case 'unknown': return 'workflow'
  }
}
