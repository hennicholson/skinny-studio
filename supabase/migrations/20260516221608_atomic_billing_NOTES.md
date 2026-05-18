# Atomic Billing Migration — Operator Notes

Migration file: `20260516221608_atomic_billing.sql`
Authored: 2026-05-16
Last updated: 2026-05-16 (forensic-audit correction — see "Audit correction" section)
Status: **NOT YET APPLIED.** Review, then run via Supabase CLI (`supabase db push`) or paste into the SQL editor.

---

## Audit correction (2026-05-16)

An earlier draft of this migration attempted to dedup Whop topup events on `credit_transactions.external_ref`. A separate forensic audit confirmed (and live data verified) that **`external_ref` is a TAG column, not a unique identifier**:

- Production values: `'usd'` (97 PersonaForge + 35 topup rows), `'whop'` (1 topup row), `NULL` (190 PersonaForge rows). It's a free-form label of payment origin / currency, not a per-payment id.
- The actual per-Whop-payment unique id lives in **`credit_transactions.idempotency_key`** (text, values shaped `pay_xxx`).
- Live DB: 10 topup rows have non-null `idempotency_key`, all unique. 26 topup rows have NULL `idempotency_key` — those are admin-added manual credits (small amounts, all on 2025-10-24); their NULL key is intentional ("no idempotency wanted").

**What changed:**
- The migration now creates `credit_transactions_topup_idempotency_key_uniq` (partial unique on `idempotency_key WHERE type='topup' AND idempotency_key IS NOT NULL`) instead of an index on `external_ref`.
- `apply_topup_credit` writes `idempotency_key = p_whop_event_id` and `external_ref = 'whop'` (the production tag for Whop-sourced topups, matching tx_id=185).
- For admin manual credits (`p_whop_event_id IS NULL OR ''`), the RPC writes `external_ref = NULL` and `idempotency_key = NULL`, and **skips the idempotency check** — repeated admin credits are allowed by design (matches the 26 existing NULL-key rows). Empty-string event id is normalized to NULL.
- The signature of `apply_topup_credit` is **unchanged** — Wave 2 callers see no difference.

---

## What this migration does

1. Adds `billing_status` / `billed_amount_cents` / `billed_at` columns to `generations` and backfills them from the legacy `output_metadata.billing_complete` blob.
2. Adds a **unique partial index** on `credit_transactions((metadata->>'generation_id'))` so the database itself prevents double-billing — even if two API paths race.
3. Adds a **unique partial index** on `credit_transactions(idempotency_key) WHERE type='topup' AND idempotency_key IS NOT NULL` for Whop top-up webhook idempotency. **0 duplicates exist today — applies cleanly.**
4. Adds a **unique partial index** on `webhook_events(event_id)` (NULLs allowed). 0 duplicates today, so it applies cleanly.
5. Creates two new RPCs (see signatures below).
6. Adds a deprecation `COMMENT` to the existing `deduct_balance_safely` function (does not drop it).

The migration is **idempotent**. Re-running it does nothing once everything is in place.

---

## New RPC signatures (what Wave 2 will call)

### `complete_generation_billing(...)` → `JSONB`

```sql
complete_generation_billing(
  p_generation_id    UUID,    -- generations.id
  p_user_profile_id  UUID,    -- user_profiles.id
  p_whop_user_id     UUID,    -- credit_transactions.user_id (UUID-typed today)
  p_amount_cents     INTEGER, -- exact cents to debit
  p_model_slug       TEXT,    -- e.g. 'flux-2-pro'
  p_model_category   TEXT,    -- 'image' | 'video' | 'audio'
  p_preview_url      TEXT,    -- nullable, populates credit_transactions.preview
  p_extra_metadata   JSONB,   -- merged into transaction metadata
  p_path             TEXT     -- 'sync' | 'webhook' | 'webhook_recovery' | 'poll'
)
```

**Possible `status` values in the returned JSON:**

| `status` | Meaning | Other keys |
|---|---|---|
| `charged` | Debit succeeded; tx inserted; `generations.billing_status='charged'` | `tx_id`, `new_balance_cents`, `billed_amount_cents` |
| `waived` | Lifetime user; tx inserted with amount 0; `billing_status='waived'` | `tx_id`, `new_balance_cents`, `billed_amount_cents: 0` |
| `already_billed` | Generation already in a terminal billing state (fast-path; **no writes**) | `billing_status`, `billed_amount_cents` |
| `already_billed_race` | A concurrent caller inserted the tx first — we converged state | `tx_id`, `billing_status` |
| `insufficient_balance` | Balance < amount; `generations.billing_status='failed'`; **NO tx inserted** | `balance_cents`, `required_cents` |
| `user_not_found` | `p_user_profile_id` does not exist in `user_profiles` | `user_profile_id` |
| `generation_not_found` | `p_generation_id` does not exist | — |
| `invalid_args` | Defensive: missing/negative inputs | `field` |

Callers should treat **`charged`, `waived`, `already_billed`, and `already_billed_race`** as success. The first two are first-time settlements; the last two indicate someone else already settled it.

`insufficient_balance` and `user_not_found` are real failures and should bubble up to the user.

### `apply_topup_credit(...)` → `JSONB`

```sql
apply_topup_credit(
  p_whop_user_id   UUID,    -- the same id used in credit_transactions.user_id
  p_whop_event_id  TEXT,    -- Whop webhook event id (idempotency key). NULL or '' allowed
                            -- for admin manual credits — idempotency check is skipped.
  p_credits_cents  INTEGER, -- credits to add (cents)
  p_plan_name      TEXT,    -- e.g. 'Top Up $10', stored in credit_transactions.task
  p_extra_metadata JSONB
)
```

| `status` | Meaning | Other keys |
|---|---|---|
| `credited` | Balance bumped; tx inserted; row created if profile didn't exist | `tx_id`, `new_balance_cents`, `credited_cents` |
| `already_credited` | A topup tx with this `idempotency_key` already exists — balance unchanged | `tx_id`, `balance_cents` |
| `user_not_found` | Couldn't find or create user profile (shouldn't happen) | `whop_user_id` |
| `invalid_args` | Missing inputs (only `p_whop_user_id` and `p_credits_cents > 0` are required) | `field` |

**Column-write behavior:**
- `amount` and `amount_credited` are written in **dollars** (e.g., `1000` cents → `10.00`) to match the existing dollars-numeric convention of the column.
- `balance_cents` (on `user_profiles`) stays in **cents**.
- `external_ref` is set to the literal string `'whop'` when an event id is provided (matches production tag convention from tx_id=185); set to `NULL` for admin manual credits.
- `idempotency_key` is set to `p_whop_event_id` (or `NULL` for admin manual credits).

The function auto-creates the `user_profiles` row via `INSERT … ON CONFLICT (whop_user_id) DO NOTHING`. This relies on the existing unique constraint `user_profiles_whop_user_id_key` (verified present 2026-05-16).

**Admin manual credits**: Pass `p_whop_event_id = NULL` (or `''`, which is normalized to NULL). The RPC inserts a tx with NULL `idempotency_key` / NULL `external_ref` and **does not check for idempotency** — repeated admin credits accumulate, matching the 26 existing rows.

---

## Backfill behavior

For each existing `generations` row (NULL `billing_status`), the migration sets:

- `output_metadata.billing_complete = true` AND `billed_amount_cents > 0` → `billing_status = 'charged'`
- `output_metadata.billing_complete = true` AND `billed_amount_cents = 0` → `billing_status = 'waived'`
- `replicate_status IN ('failed','canceled')` → `billing_status = 'failed'`
- Everything else → `billing_status = 'pending'`

Live DB counts (as of 2026-05-16, n=283):
- `charged` (was billing_complete) ≈ 217
- `failed` (replicate failed/canceled) ≈ 17
- `pending` ≈ 49 (includes the 35 truly pending + 15 succeeded-but-unbilled; these will be picked up by the poll function or webhook recovery once Wave 2 ships)

`billed_amount_cents` and `billed_at` are also backfilled where derivable from existing metadata.

---

## Pre-apply cleanup checklist

Before running this migration, check the `NOTICE` output. The migration is defensive: if any unique-index target has dupes, it skips that index and prints the cleanup SQL instead of failing.

### `credit_transactions` `metadata->>'generation_id'` duplicates

Live DB (2026-05-16) has **0** duplicates across 108 charged-gen rows. Index creates cleanly.

### `credit_transactions` topup `idempotency_key` duplicates

Live DB (2026-05-16) has **0** duplicates across 10 non-null keys. Index creates cleanly. The 26 NULL-key rows are excluded by the partial predicate — they remain in place untouched.

### `webhook_events.event_id` duplicates

Live DB has **0** duplicates across 283 rows. Index creates cleanly.

### `credit_transactions.external_ref` legacy values — NO CLEANUP NEEDED

The 132 rows with `external_ref='usd'` (97 PersonaForge + 35 topup) and the row with `external_ref='whop'` are **NOT a data integrity problem**. `external_ref` is a tag column. The migration does not touch these rows.

---

## What is NOT touched

- **No application code is modified.** Wave 2 will migrate `/api/generate/route.ts`, `/api/replicate-webhook/route.ts`, `/api/webhooks/whop/route.ts`, and `netlify/functions/poll-pending-generations.mts` to call the new RPCs.
- `deduct_balance_safely` is **not dropped**. It's kept in place with a deprecation `COMMENT` so legacy call sites continue to function until Wave 2.
- Existing `credit_transactions` rows are not modified.
- Existing `output_metadata.billing_complete` data is preserved (the new columns supplement, not replace, it).

---

## Apply procedure

1. **Backup.** `pg_dump` of at least `generations`, `credit_transactions`, `user_profiles`, `webhook_events`.
2. Read the `NOTICE` channel during apply (the Supabase Studio SQL editor shows these; the CLI shows them with `--debug`).
3. With current live-data state, all four unique indexes are expected to create cleanly. If a future re-run encounters dupes, the migration will skip the affected index and print cleanup SQL — fix and re-apply (the migration is idempotent).
4. Verify with:
   ```sql
   SELECT proname FROM pg_proc
   WHERE proname IN ('complete_generation_billing','apply_topup_credit');
   -- expect 2 rows

   SELECT indexname FROM pg_indexes WHERE schemaname='public'
   AND indexname IN ('credit_transactions_generation_id_uniq',
                     'credit_transactions_topup_idempotency_key_uniq',
                     'webhook_events_event_id_uniq',
                     'generations_billing_status_idx',
                     'generations_billing_status_pending_idx');
   -- expect 5 rows

   SELECT billing_status, COUNT(*) FROM generations GROUP BY 1;
   -- sanity check the backfill distribution
   ```

---

## Wave 2 hand-off

The four code paths to update, in priority order:

1. `app/api/replicate-webhook/route.ts` — replace BOTH the main billing block (lines 407-501) AND the recovery block (lines 277-351) with a single `supabase.rpc('complete_generation_billing', {...})` call.
2. `netlify/functions/poll-pending-generations.mts` (lines 178-267) — same replacement.
3. `app/api/generate/route.ts` (lines 869-958) — same replacement, passing `p_path = 'sync'`.
4. `app/api/webhooks/whop/route.ts` (lines 215-241) — replace the manual balance update + tx insert with `supabase.rpc('apply_topup_credit', { p_whop_event_id: event.id, ... })`. **Note**: the legacy code wrote `external_ref: event.id` — the new RPC ignores that pattern and uses `idempotency_key` for dedup, writing `external_ref='whop'` as a tag. The outer `webhook_events` idempotency SELECT can be relaxed because the RPC is now race-safe — but keeping it is fine (defense in depth).

For all four, the new return-status taxonomy is documented above. Treat `charged`/`waived`/`already_billed`/`already_billed_race` as success; surface `insufficient_balance` to the user with a top-up CTA.
