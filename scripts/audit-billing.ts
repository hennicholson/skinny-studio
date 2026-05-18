#!/usr/bin/env tsx
/**
 * Skinny Studio — Billing Forensic Auditor
 *
 * READ-ONLY audit of live Supabase billing data.
 *
 * Checks 4 invariants + 4 diagnostics:
 *
 *   I1. Per-generation atomicity — exactly 1 tx per billable gen
 *   I2. Ledger ↔ balance reconciliation — sum(tx) == user_profiles.balance_cents
 *   I3. No orphan deducts — billing_complete=true gens must have a tx
 *   I4. No orphan transactions — tx.generation_id must point at a succeeded gen
 *
 *   D1. Topup duplicates (by external_ref + idempotency_key)
 *   D2. webhook_events duplicate event_ids
 *   D3. Lifetime user purity — lifetime debits must have amount = 0
 *   D4. Same replicate_prediction_id across multiple generations
 *
 * Money model in this DB (confirmed via introspection 2026-05-16):
 *   - generations.cost_cents     INTEGER, CENTS
 *   - credit_transactions.amount NUMERIC, DOLLARS  (negative for debits, positive for topups)
 *   - credit_transactions.amount_charged   DOLLARS (positive, set on newer debit path; null on legacy)
 *   - credit_transactions.amount_credited  DOLLARS (rarely set; we don't rely on it)
 *   - user_profiles.balance_cents INTEGER, CENTS
 *   - credit_transactions.user_id == user_profiles.whop_user_id (NOT the profile id)
 *
 * Tx types in use: 'topup' and 'PersonaForge' (PersonaForge is the debit type).
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/audit-billing.ts [--user <uuid>] [--since <ISO>] [--json-only] [--verbose]
 *
 * Exit codes:
 *   0 — all invariants pass
 *   1 — at least one invariant failed (findings present)
 *   2 — script error
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// ───────────────────────────── env loading ─────────────────────────────

function loadDotEnvLocal() {
  const p = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(p)) return
  const raw = fs.readFileSync(p, 'utf-8')
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const m = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
    if (!m) continue
    let val = m[2]
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[m[1]]) process.env[m[1]] = val
  }
}

loadDotEnvLocal()

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: missing SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env or .env.local')
  process.exit(2)
}

// ───────────────────────────── CLI parsing ─────────────────────────────

interface Flags {
  user?: string
  since?: string
  jsonOnly: boolean
  verbose: boolean
}

function parseFlags(argv: string[]): Flags {
  const f: Flags = { jsonOnly: false, verbose: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--user') f.user = argv[++i]
    else if (a === '--since') f.since = argv[++i]
    else if (a === '--json-only') f.jsonOnly = true
    else if (a === '--verbose') f.verbose = true
    else if (a === '--help' || a === '-h') {
      console.log('Usage: audit-billing.ts [--user <uuid>] [--since <ISO>] [--json-only] [--verbose]')
      process.exit(0)
    }
  }
  return f
}

const flags = parseFlags(process.argv.slice(2))

// ───────────────────────────── client ─────────────────────────────

const sb: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// ───────────────────────────── helpers ─────────────────────────────

const PAGE_SIZE = 1000

async function fetchAll<T>(
  tableName: string,
  builder: (q: any) => any,
  cols: string,
): Promise<T[]> {
  const out: T[] = []
  let from = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q: any = sb.from(tableName).select(cols).range(from, from + PAGE_SIZE - 1)
    q = builder(q)
    const { data, error } = await q
    if (error) throw new Error(`${tableName} fetch failed: ${error.message}`)
    if (!data || data.length === 0) break
    out.push(...(data as T[]))
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return out
}

// dollar-amount → cents (rounding to handle float fuzz)
function dollarsToCents(d: number | null | undefined): number {
  if (d === null || d === undefined) return 0
  return Math.round(Number(d) * 100)
}

function fmtCents(c: number): string {
  const sign = c < 0 ? '-' : ''
  const abs = Math.abs(c)
  return `${sign}$${(abs / 100).toFixed(4)}`
}

function shortId(id: string | null | undefined, len = 8): string {
  if (!id) return '(null)'
  return id.slice(0, len)
}

// ───────────────────────────── types ─────────────────────────────

interface UserProfile {
  id: string
  whop_user_id: string
  whop_unique_id: string | null
  email: string | null
  username: string | null
  lifetime_access: boolean | null
  balance_cents: number | null
  created_at: string
}

interface CreditTransaction {
  tx_id: number
  user_id: string  // == user_profiles.whop_user_id
  type: string
  amount: number | null         // dollars
  amount_charged: number | null // dollars
  amount_credited: number | null
  external_ref: string | null
  idempotency_key: string | null
  metadata: any
  task: string | null
  status: string | null
  created_at: string
}

interface Generation {
  id: string
  whop_user_id: string | null
  user_id: string | null  // user_profiles.id
  model_slug: string | null
  model_category: string | null
  replicate_prediction_id: string | null
  replicate_status: string | null
  cost_cents: number | null
  total_cost_cents: number | null
  output_metadata: any
  billing_status: string | null
  billed_amount_cents: number | null
  billed_at: string | null
  created_at: string
  completed_at: string | null
}

interface WebhookEvent {
  id: number
  event_source: string | null
  event_id: string | null
  event_type: string | null
  processed: boolean | null
  created_at: string
}

// ───────────────────────────── audit ─────────────────────────────

interface Finding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  detail: any
}

interface InvariantResult {
  name: string
  description: string
  pass: boolean
  count: number
  findings: Finding[]
  notes?: string[]
}

interface Report {
  generated_at: string
  scope: { user?: string; since?: string }
  summary: {
    users_total: number
    users_lifetime: number
    generations_total: number
    generations_by_status: Record<string, number>
    transactions_total: number
    transactions_by_type: Record<string, number>
    total_balance_cents: number
    total_balance_usd: string
  }
  invariants: InvariantResult[]
  exit_code: 0 | 1
}

async function loadData() {
  console.error('[audit] loading user_profiles…')
  let q1: any = sb.from('user_profiles').select('id, whop_user_id, whop_unique_id, email, username, lifetime_access, balance_cents, created_at')
  if (flags.user) q1 = q1.or(`id.eq.${flags.user},whop_user_id.eq.${flags.user}`)
  const profilesData = await fetchAll<UserProfile>('user_profiles', (q) => {
    let qq = q
    if (flags.user) qq = qq.or(`id.eq.${flags.user},whop_user_id.eq.${flags.user}`)
    return qq
  }, 'id, whop_user_id, whop_unique_id, email, username, lifetime_access, balance_cents, created_at')

  console.error(`[audit] ${profilesData.length} user_profiles loaded`)

  const whopUserIds = new Set(profilesData.map((p) => p.whop_user_id))
  const profileById = new Map(profilesData.map((p) => [p.id, p]))
  const profileByWhopId = new Map(profilesData.map((p) => [p.whop_user_id, p]))

  console.error('[audit] loading credit_transactions…')
  const txs = await fetchAll<CreditTransaction>('credit_transactions', (q) => {
    let qq = q
    if (flags.since) qq = qq.gte('created_at', flags.since)
    if (flags.user) {
      const target = profileById.get(flags.user) || profileByWhopId.get(flags.user)
      const whopId = target?.whop_user_id || flags.user
      qq = qq.eq('user_id', whopId)
    }
    return qq.order('created_at', { ascending: true })
  }, 'tx_id, user_id, type, amount, amount_charged, amount_credited, external_ref, idempotency_key, metadata, task, status, created_at')
  console.error(`[audit] ${txs.length} credit_transactions loaded`)

  console.error('[audit] loading generations…')
  const gens = await fetchAll<Generation>('generations', (q) => {
    let qq = q
    if (flags.since) qq = qq.gte('created_at', flags.since)
    if (flags.user) {
      const target = profileById.get(flags.user) || profileByWhopId.get(flags.user)
      const whopId = target?.whop_user_id || flags.user
      qq = qq.eq('whop_user_id', whopId)
    }
    return qq.order('created_at', { ascending: true })
  }, 'id, whop_user_id, user_id, model_slug, model_category, replicate_prediction_id, replicate_status, cost_cents, total_cost_cents, output_metadata, billing_status, billed_amount_cents, billed_at, created_at, completed_at')
  console.error(`[audit] ${gens.length} generations loaded`)

  console.error('[audit] loading webhook_events…')
  const webhooks = await fetchAll<WebhookEvent>('webhook_events', (q) => {
    let qq = q
    if (flags.since) qq = qq.gte('created_at', flags.since)
    return qq.order('created_at', { ascending: true })
  }, 'id, event_source, event_id, event_type, processed, created_at')
  console.error(`[audit] ${webhooks.length} webhook_events loaded`)

  return { profiles: profilesData, txs, gens, webhooks, profileById, profileByWhopId, whopUserIds }
}

// ───────────────────────────── invariants ─────────────────────────────

/**
 * Invariant 1: Per-generation atomicity.
 * Every "believed-billed" generation must have EXACTLY ONE credit_transactions row
 * whose metadata.generation_id matches the gen id.
 *
 * "believed-billed" = billing_status IN ('charged','waived','refunded') — the new RPC's
 * source of truth. We also accept legacy output_metadata.billing_complete=true for
 * pre-migration rows (the migration backfills billing_status from this, so post-apply
 * both signals agree). Waived/refunded rows must have a matching $0 ledger row too.
 */
function checkInvariant1(gens: Generation[], txs: CreditTransaction[]): InvariantResult {
  const txByGenId = new Map<string, CreditTransaction[]>()
  for (const t of txs) {
    if (t.type !== 'PersonaForge') continue
    const gid = (t.metadata && typeof t.metadata === 'object' ? t.metadata.generation_id : null) as string | null
    if (!gid) continue
    if (!txByGenId.has(gid)) txByGenId.set(gid, [])
    txByGenId.get(gid)!.push(t)
  }

  const TERMINAL = new Set(['charged', 'waived', 'refunded'])
  const findings: Finding[] = []
  let checked = 0
  for (const g of gens) {
    const om = (g.output_metadata || {}) as any
    const newStatusBilled = g.billing_status ? TERMINAL.has(g.billing_status) : false
    const legacyBilled = g.replicate_status === 'succeeded' && om.billing_complete === true
    const billable = newStatusBilled || legacyBilled
    if (!billable) continue
    checked++
    const matches = txByGenId.get(g.id) || []
    if (matches.length === 0) {
      // This is "main path believed it charged, but no ledger row" — also caught by I3,
      // but flagged here too because it violates atomicity.
      findings.push({
        severity: 'critical',
        detail: {
          kind: 'zero_tx',
          generation_id: g.id,
          whop_user_id: g.whop_user_id,
          model: g.model_slug,
          cost_cents: g.cost_cents,
          billing_status: g.billing_status,
          billed_amount_cents: g.billed_amount_cents ?? om.billed_amount_cents,
          billed_via: om.billed_via,
        },
      })
    } else if (matches.length > 1) {
      findings.push({
        severity: 'critical',
        detail: {
          kind: 'duplicate_tx',
          generation_id: g.id,
          whop_user_id: g.whop_user_id,
          tx_count: matches.length,
          tx_ids: matches.map((t) => t.tx_id),
          tx_amounts: matches.map((t) => t.amount),
          tx_timestamps: matches.map((t) => t.created_at),
        },
      })
    }
  }
  return {
    name: 'I1 — Per-generation atomicity',
    description: 'Each billable generation must have exactly one matching credit_transactions row',
    pass: findings.length === 0,
    count: findings.length,
    findings,
    notes: [`Checked ${checked} generations marked billing_complete=true and replicate_status=succeeded`],
  }
}

/**
 * Invariant 2: Ledger ↔ balance reconciliation.
 *
 * For each user we compute expected_balance:
 *   - Sum positive 'topup' amounts (dollars → cents).
 *   - Subtract abs(negative debit amounts) (dollars → cents). For lifetime users this
 *     should be 0 by design, but the code historically violated that — we still
 *     reconcile what we see in the ledger to detect drift.
 *
 * NOTE: This is not "what the user paid" — it's "what the ledger says their balance
 * should be IF all credits/debits applied". We compare against user_profiles.balance_cents.
 *
 * For lifetime users we also check: balance should equal sum(topups) - sum(non-zero debits
 * that should have been zero). Drift here is the historical bug; we report it as a
 * separate diagnostic (D3) so the reconciler can decide whether to forgive.
 */
function checkInvariant2(
  profiles: UserProfile[],
  txs: CreditTransaction[],
): InvariantResult {
  // Bucket tx by user
  const byUser = new Map<string, CreditTransaction[]>()
  for (const t of txs) {
    if (!byUser.has(t.user_id)) byUser.set(t.user_id, [])
    byUser.get(t.user_id)!.push(t)
  }

  interface Drift {
    profile_id: string
    whop_user_id: string
    username: string | null
    lifetime_access: boolean
    actual_balance_cents: number
    expected_balance_cents: number
    delta_cents: number
    topups_cents: number
    debits_cents: number
    tx_count: number
    recent_txs?: Array<{ tx_id: number; type: string; amount: number | null; created_at: string }>
  }

  const drifts: Drift[] = []
  for (const p of profiles) {
    const userTxs = byUser.get(p.whop_user_id) || []
    let topupsCents = 0
    let debitsCents = 0
    for (const t of userTxs) {
      if (t.type === 'topup') {
        topupsCents += dollarsToCents(t.amount)
      } else if (t.type === 'PersonaForge') {
        // negative amount → debit
        const amt = dollarsToCents(t.amount)
        if (amt < 0) debitsCents += Math.abs(amt)
      }
    }
    const expected = topupsCents - debitsCents
    const actual = p.balance_cents || 0
    const delta = actual - expected
    if (Math.abs(delta) > 1) {
      drifts.push({
        profile_id: p.id,
        whop_user_id: p.whop_user_id,
        username: p.username,
        lifetime_access: !!p.lifetime_access,
        actual_balance_cents: actual,
        expected_balance_cents: expected,
        delta_cents: delta,
        topups_cents: topupsCents,
        debits_cents: debitsCents,
        tx_count: userTxs.length,
        recent_txs: flags.verbose
          ? userTxs.slice(-5).map((t) => ({ tx_id: t.tx_id, type: t.type, amount: t.amount, created_at: t.created_at }))
          : undefined,
      })
    }
  }

  // Cap to worst 50 by abs(delta)
  drifts.sort((a, b) => Math.abs(b.delta_cents) - Math.abs(a.delta_cents))
  const top = drifts.slice(0, 50)

  return {
    name: 'I2 — Ledger ↔ balance reconciliation',
    description: 'user_profiles.balance_cents must equal sum(topups) − sum(|debits|) per user',
    pass: drifts.length === 0,
    count: drifts.length,
    findings: top.map((d) => ({
      severity: Math.abs(d.delta_cents) >= 100 ? 'critical' : Math.abs(d.delta_cents) >= 10 ? 'high' : 'medium',
      detail: d,
    })),
    notes: drifts.length > 50 ? [`Showing worst 50 of ${drifts.length} users with drift > 1¢`] : undefined,
  }
}

/**
 * Invariant 3: No orphan deducts.
 *
 * A generation marked as billed (billing_status terminal OR legacy
 * output_metadata.billing_complete) MUST have a credit_transactions row for it.
 * If not, the code thinks it billed but no ledger record exists → user may or
 * may not have been actually deducted (silent revenue leak).
 */
function checkInvariant3(gens: Generation[], txs: CreditTransaction[]): InvariantResult {
  const txByGenId = new Set<string>()
  for (const t of txs) {
    if (t.type !== 'PersonaForge') continue
    const gid = (t.metadata && typeof t.metadata === 'object' ? t.metadata.generation_id : null) as string | null
    if (gid) txByGenId.add(gid)
  }

  const TERMINAL = new Set(['charged', 'waived', 'refunded'])
  const findings: Finding[] = []
  for (const g of gens) {
    const om = (g.output_metadata || {}) as any
    const newStatusBilled = g.billing_status ? TERMINAL.has(g.billing_status) : false
    const legacyBilled = om.billing_complete === true
    if (!newStatusBilled && !legacyBilled) continue
    if (!txByGenId.has(g.id)) {
      findings.push({
        severity: 'critical',
        detail: {
          generation_id: g.id,
          whop_user_id: g.whop_user_id,
          model: g.model_slug,
          cost_cents: g.cost_cents,
          billing_status: g.billing_status,
          billed_amount_cents: g.billed_amount_cents ?? om.billed_amount_cents,
          billed_via: om.billed_via,
          billed_at: g.billed_at ?? om.billed_at,
        },
      })
    }
  }
  return {
    name: 'I3 — No orphan deducts',
    description: 'Every generation marked as billed must have a matching credit_transactions row',
    pass: findings.length === 0,
    count: findings.length,
    findings,
  }
}

/**
 * Invariant 4: No orphan transactions.
 *
 * Every credit_transactions debit with a generation_id in metadata must point
 * to an actual generations row that exists and is replicate_status='succeeded'.
 */
function checkInvariant4(txs: CreditTransaction[], gens: Generation[]): InvariantResult {
  const genById = new Map(gens.map((g) => [g.id, g]))
  const findings: Finding[] = []
  for (const t of txs) {
    if (t.type !== 'PersonaForge') continue
    const gid = (t.metadata && typeof t.metadata === 'object' ? t.metadata.generation_id : null) as string | null
    if (!gid) continue
    const g = genById.get(gid)
    if (!g) {
      findings.push({
        severity: 'high',
        detail: {
          tx_id: t.tx_id,
          user_id: t.user_id,
          amount: t.amount,
          generation_id: gid,
          kind: 'gen_missing',
          created_at: t.created_at,
        },
      })
      continue
    }
    if (g.replicate_status !== 'succeeded') {
      findings.push({
        severity: 'high',
        detail: {
          tx_id: t.tx_id,
          user_id: t.user_id,
          amount: t.amount,
          generation_id: gid,
          kind: 'gen_not_succeeded',
          gen_status: g.replicate_status,
          created_at: t.created_at,
        },
      })
    }
  }
  return {
    name: 'I4 — No orphan transactions',
    description: 'Every tx with metadata.generation_id must point to a succeeded generation',
    pass: findings.length === 0,
    count: findings.length,
    findings,
  }
}

// ───────────────────────────── diagnostics ─────────────────────────────

/**
 * D1: Topup duplicates by external_ref AND idempotency_key.
 *
 * Note: in this DB, external_ref is just "usd"/"whop" (a tag, not a unique id).
 * The actual unique-per-whop-payment field is idempotency_key (e.g. pay_xxx).
 * We check BOTH and flag clearly which dup source.
 */
function checkTopupDuplicates(txs: CreditTransaction[]): InvariantResult {
  const byIdempotency = new Map<string, CreditTransaction[]>()
  let nullIdemKey = 0
  for (const t of txs) {
    if (t.type !== 'topup') continue
    if (!t.idempotency_key) { nullIdemKey++; continue }
    if (!byIdempotency.has(t.idempotency_key)) byIdempotency.set(t.idempotency_key, [])
    byIdempotency.get(t.idempotency_key)!.push(t)
  }
  const findings: Finding[] = []
  for (const [key, list] of byIdempotency.entries()) {
    if (list.length > 1) {
      findings.push({
        severity: 'critical',
        detail: {
          idempotency_key: key,
          tx_ids: list.map((t) => t.tx_id),
          amounts: list.map((t) => t.amount),
          users: [...new Set(list.map((t) => t.user_id))],
          created_at: list.map((t) => t.created_at),
        },
      })
    }
  }
  return {
    name: 'D1 — Topup duplicates',
    description: 'Topup transactions keyed by idempotency_key (the Whop payment id) must be unique',
    pass: findings.length === 0,
    count: findings.length,
    findings,
    notes: [
      `${nullIdemKey} topups have NULL idempotency_key (can't be de-duplicated; likely admin gifts or pre-idempotency rows).`,
    ],
  }
}

function checkWebhookDuplicates(webhooks: WebhookEvent[]): InvariantResult {
  const byEventId = new Map<string, WebhookEvent[]>()
  let nullEventId = 0
  for (const w of webhooks) {
    if (!w.event_id) { nullEventId++; continue }
    if (!byEventId.has(w.event_id)) byEventId.set(w.event_id, [])
    byEventId.get(w.event_id)!.push(w)
  }
  const findings: Finding[] = []
  for (const [eid, list] of byEventId.entries()) {
    if (list.length > 1) {
      findings.push({
        severity: 'high',
        detail: {
          event_id: eid,
          count: list.length,
          rows: list.map((w) => ({ id: w.id, type: w.event_type, processed: w.processed, created_at: w.created_at })),
        },
      })
    }
  }
  return {
    name: 'D2 — webhook_events duplicates',
    description: 'Same event_id should not appear twice (Wave 1 migration adds UNIQUE constraint)',
    pass: findings.length === 0,
    count: findings.length,
    findings,
    notes: [`${nullEventId} webhook_events rows have NULL event_id (older or non-Whop events).`],
  }
}

function checkLifetimePurity(profiles: UserProfile[], txs: CreditTransaction[]): InvariantResult {
  const lifetimeIds = new Set(profiles.filter((p) => p.lifetime_access).map((p) => p.whop_user_id))
  const findings: Finding[] = []
  const offendersByUser = new Map<string, { count: number; sum_cents: number; samples: any[] }>()
  for (const t of txs) {
    if (t.type !== 'PersonaForge') continue
    if (!lifetimeIds.has(t.user_id)) continue
    const cents = dollarsToCents(t.amount)
    if (cents !== 0) {
      const cur = offendersByUser.get(t.user_id) || { count: 0, sum_cents: 0, samples: [] as any[] }
      cur.count++
      cur.sum_cents += cents
      if (cur.samples.length < 3) cur.samples.push({ tx_id: t.tx_id, amount: t.amount, created_at: t.created_at })
      offendersByUser.set(t.user_id, cur)
    }
  }
  for (const [uid, agg] of offendersByUser.entries()) {
    findings.push({
      severity: 'high',
      detail: {
        whop_user_id: uid,
        nonzero_debit_count: agg.count,
        sum_amount_cents: agg.sum_cents,
        sample_txs: agg.samples,
      },
    })
  }
  return {
    name: 'D3 — Lifetime user purity',
    description: 'Debit transactions for lifetime users should have amount = 0',
    pass: findings.length === 0,
    count: findings.length,
    findings,
  }
}

function checkPredictionDuplicates(gens: Generation[]): InvariantResult {
  const byPred = new Map<string, Generation[]>()
  for (const g of gens) {
    if (!g.replicate_prediction_id) continue
    if (!byPred.has(g.replicate_prediction_id)) byPred.set(g.replicate_prediction_id, [])
    byPred.get(g.replicate_prediction_id)!.push(g)
  }
  const findings: Finding[] = []
  for (const [pred, list] of byPred.entries()) {
    if (list.length > 1) {
      findings.push({
        severity: 'high',
        detail: {
          replicate_prediction_id: pred,
          count: list.length,
          gen_ids: list.map((g) => g.id),
          users: [...new Set(list.map((g) => g.whop_user_id))],
          created_ats: list.map((g) => g.created_at),
        },
      })
    }
  }
  return {
    name: 'D4 — Same prediction, multiple gens',
    description: 'A replicate_prediction_id should be unique across generations (catches /api/generate retry double-creates)',
    pass: findings.length === 0,
    count: findings.length,
    findings,
  }
}

// ───────────────────────────── rendering ─────────────────────────────

function renderHuman(report: Report): string {
  const out: string[] = []
  out.push('━'.repeat(80))
  out.push('  SKINNY STUDIO — BILLING FORENSIC AUDIT')
  out.push(`  Generated:  ${report.generated_at}`)
  if (report.scope.user) out.push(`  Scope user: ${report.scope.user}`)
  if (report.scope.since) out.push(`  Scope since: ${report.scope.since}`)
  out.push('━'.repeat(80))
  out.push('')
  out.push('SUMMARY')
  out.push('───────')
  out.push(`  Users (total):           ${report.summary.users_total}`)
  out.push(`    of which lifetime:     ${report.summary.users_lifetime}`)
  out.push(`  Generations (total):     ${report.summary.generations_total}`)
  for (const [k, v] of Object.entries(report.summary.generations_by_status)) {
    out.push(`    ${k.padEnd(22)} ${v}`)
  }
  out.push(`  Transactions (total):    ${report.summary.transactions_total}`)
  for (const [k, v] of Object.entries(report.summary.transactions_by_type)) {
    out.push(`    ${k.padEnd(22)} ${v}`)
  }
  out.push(`  Total balance held:      ${fmtCents(report.summary.total_balance_cents)}  (${report.summary.total_balance_cents}¢)`)
  out.push('')

  for (const inv of report.invariants) {
    const status = inv.pass ? '✅ PASS' : '🔴 FAIL'
    out.push(`${status}  ${inv.name}`)
    out.push(`        ${inv.description}`)
    if (inv.notes) for (const n of inv.notes) out.push(`        note: ${n}`)
    if (!inv.pass) {
      out.push(`        ${inv.count} finding${inv.count === 1 ? '' : 's'}`)
      const sample = flags.verbose ? inv.findings : inv.findings.slice(0, 10)
      for (const f of sample) {
        out.push(`          [${f.severity}] ${JSON.stringify(f.detail)}`)
      }
      if (!flags.verbose && inv.findings.length > 10) {
        out.push(`          … and ${inv.findings.length - 10} more (rerun with --verbose for full list)`)
      }
    }
    out.push('')
  }

  out.push('━'.repeat(80))
  const anyFail = report.invariants.some((i) => !i.pass)
  if (anyFail) {
    out.push('  🔴 RESULT: At least one invariant failed — see findings above and the JSON report.')
  } else {
    out.push('  ✅ RESULT: All invariants pass.')
  }
  out.push('━'.repeat(80))
  return out.join('\n')
}

// ───────────────────────────── main ─────────────────────────────

async function main() {
  const { profiles, txs, gens, webhooks } = await loadData()

  const genStatusCounts: Record<string, number> = {}
  for (const g of gens) {
    const k = g.replicate_status || 'NULL'
    genStatusCounts[k] = (genStatusCounts[k] || 0) + 1
  }
  const txTypeCounts: Record<string, number> = {}
  for (const t of txs) {
    txTypeCounts[t.type] = (txTypeCounts[t.type] || 0) + 1
  }

  const totalBalance = profiles.reduce((sum, p) => sum + (p.balance_cents || 0), 0)
  const lifetimeCount = profiles.filter((p) => p.lifetime_access).length

  const invariants: InvariantResult[] = [
    checkInvariant1(gens, txs),
    checkInvariant2(profiles, txs),
    checkInvariant3(gens, txs),
    checkInvariant4(txs, gens),
    checkTopupDuplicates(txs),
    checkWebhookDuplicates(webhooks),
    checkLifetimePurity(profiles, txs),
    checkPredictionDuplicates(gens),
  ]

  const anyFail = invariants.some((i) => !i.pass)

  const report: Report = {
    generated_at: new Date().toISOString(),
    scope: { user: flags.user, since: flags.since },
    summary: {
      users_total: profiles.length,
      users_lifetime: lifetimeCount,
      generations_total: gens.length,
      generations_by_status: genStatusCounts,
      transactions_total: txs.length,
      transactions_by_type: txTypeCounts,
      total_balance_cents: totalBalance,
      total_balance_usd: `$${(totalBalance / 100).toFixed(2)}`,
    },
    invariants,
    exit_code: anyFail ? 1 : 0,
  }

  // Write JSON
  const stamp = report.generated_at.replace(/[:.]/g, '-')
  const jsonPath = path.resolve(process.cwd(), 'scripts', `audit-billing-report-${stamp}.json`)
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2))

  if (!flags.jsonOnly) {
    console.log(renderHuman(report))
  }
  console.error(`[audit] JSON report written to ${jsonPath}`)

  process.exit(anyFail ? 1 : 0)
}

main().catch((err) => {
  console.error('[audit] FATAL', err)
  process.exit(2)
})
