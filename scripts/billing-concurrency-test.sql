-- ============================================================================
-- Skinny Studio — Billing Concurrency Stress Test
--
-- Manual smoke test for the Wave 2 billing-rewrite RPC. NOT for live data.
-- This file documents three scenarios that the new RPC must survive.
--
-- HOW TO RUN
-- ----------
-- This is NOT an automated test — Postgres does not give us thread-level
-- concurrency in a single connection. We simulate concurrency by running
-- two psql sessions side-by-side and synchronizing with pg_sleep.
--
-- 0. Spin up a *test* Postgres / Supabase project. NEVER run this against
--    the live database — it inserts rows.
--
-- 1. Open TWO terminals and connect to the test DB:
--      Terminal A: psql "$TEST_DB_URL"
--      Terminal B: psql "$TEST_DB_URL"
--
-- 2. In Terminal A, run SECTION 0 (schema + seed). This creates the test
--    schema in `billing_test` so it doesn't pollute `public`.
--
-- 3. Apply the new billing RPC under test to `billing_test` (or alias the
--    public one in this schema). Recommended call shape (your team's spec):
--
--      SELECT * FROM billing_test.charge_for_generation(
--        p_user_id        := <user_uuid>,
--        p_generation_id  := <gen_uuid>,
--        p_amount_cents   := <int>,
--        p_idempotency_key:= <text>          -- e.g. 'gen:<id>'
--      );
--
--    The RPC must return a result row with at least:
--      { result: 'charged' | 'already_billed_race' | 'insufficient_funds'
--                | 'waived_lifetime', tx_id: bigint | null,
--          new_balance_cents: int }
--
-- 4. For each scenario below, follow the inline "Terminal A" / "Terminal B"
--    instructions. The expected outcome is documented at the bottom of each
--    scenario.
--
-- 5. After all scenarios pass, drop the schema:
--      DROP SCHEMA billing_test CASCADE;
--
-- ============================================================================


-- ============================================================================
-- SECTION 0 — Schema + seed (run in Terminal A only, once)
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS billing_test;
SET search_path TO billing_test, public;

DROP TABLE IF EXISTS billing_test.credit_transactions CASCADE;
DROP TABLE IF EXISTS billing_test.generations         CASCADE;
DROP TABLE IF EXISTS billing_test.user_profiles       CASCADE;

CREATE TABLE billing_test.user_profiles (
  id              uuid PRIMARY KEY,
  whop_user_id    uuid NOT NULL UNIQUE,
  lifetime_access boolean NOT NULL DEFAULT false,
  balance_cents   integer NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE billing_test.generations (
  id                       uuid PRIMARY KEY,
  user_id                  uuid NOT NULL REFERENCES billing_test.user_profiles(id),
  whop_user_id             uuid NOT NULL,
  replicate_status         text NOT NULL DEFAULT 'starting',
  cost_cents               integer NOT NULL,
  output_metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE billing_test.credit_transactions (
  tx_id            bigserial PRIMARY KEY,
  user_id          uuid NOT NULL,           -- == user_profiles.whop_user_id
  type             text NOT NULL,
  amount           numeric NOT NULL,        -- dollars (legacy schema)
  amount_charged   numeric,
  external_ref     text,
  idempotency_key  text UNIQUE,             -- ENFORCED unique in the rewrite
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Three users:
--   alice: $5.00 balance, regular user
--   bob:   $0.05 balance, regular user (intentionally tiny for scenario 2)
--   carol: lifetime
INSERT INTO billing_test.user_profiles (id, whop_user_id, lifetime_access, balance_cents) VALUES
  ('11111111-1111-1111-1111-111111111111'::uuid, '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, false, 500),
  ('22222222-2222-2222-2222-222222222222'::uuid, '22222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, false,   5),
  ('33333333-3333-3333-3333-333333333333'::uuid, '33333333-cccc-cccc-cccc-cccccccccccc'::uuid, true,  100);

-- Three pending generations, each 10¢.
INSERT INTO billing_test.generations (id, user_id, whop_user_id, replicate_status, cost_cents) VALUES
  -- gen for scenario 1: alice, fresh
  ('aaaaaaaa-1111-1111-1111-111111111111'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'starting', 10),
  -- gen for scenario 2: bob, fresh — only 5¢ balance, can't afford 10
  ('aaaaaaaa-2222-2222-2222-222222222222'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, '22222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'starting', 10),
  -- gen for scenario 3: carol (lifetime), fresh
  ('aaaaaaaa-3333-3333-3333-333333333333'::uuid, '33333333-3333-3333-3333-333333333333'::uuid, '33333333-cccc-cccc-cccc-cccccccccccc'::uuid, 'starting', 10);

-- Sanity check:
SELECT id, whop_user_id, balance_cents, lifetime_access FROM billing_test.user_profiles;
SELECT id, cost_cents, replicate_status FROM billing_test.generations;


-- ============================================================================
-- SCENARIO 1 — Two parallel calls for the same generation
--
-- Setup: alice has 500¢. gen `aaaa…1111` costs 10¢.
-- Two webhook deliveries fire at the same instant. The RPC must serialize them
-- such that exactly one of them charges and the other returns
-- `already_billed_race` (no double-charge, no double-tx-insert).
-- ============================================================================

-- Terminal A:
BEGIN;
  -- pg_sleep simulates "we have the row lock and are doing real work".
  -- During this sleep, terminal B will call the RPC and must block (if the
  -- RPC uses SELECT … FOR UPDATE on user_profiles + an idempotency-key insert)
  -- until A commits.
  SELECT * FROM billing_test.charge_for_generation(
    '11111111-1111-1111-1111-111111111111'::uuid,
    'aaaaaaaa-1111-1111-1111-111111111111'::uuid,
    10,
    'gen:aaaaaaaa-1111-1111-1111-111111111111'
  );
  SELECT pg_sleep(3);
COMMIT;

-- Terminal B (run within the 3-second window):
SELECT * FROM billing_test.charge_for_generation(
  '11111111-1111-1111-1111-111111111111'::uuid,
  'aaaaaaaa-1111-1111-1111-111111111111'::uuid,
  10,
  'gen:aaaaaaaa-1111-1111-1111-111111111111'
);

-- ✅ EXPECTED:
--   Terminal A:  result='charged', new_balance_cents=490, one tx row inserted.
--   Terminal B:  result='already_billed_race', tx_id IS NULL.
--   user_profiles.balance_cents = 490 (charged exactly once).
--   credit_transactions count for this gen = 1.

-- Verify in either terminal:
SELECT balance_cents FROM billing_test.user_profiles WHERE id='11111111-1111-1111-1111-111111111111';
SELECT count(*), array_agg(tx_id) FROM billing_test.credit_transactions
  WHERE idempotency_key = 'gen:aaaaaaaa-1111-1111-1111-111111111111';


-- ============================================================================
-- SCENARIO 2 — Insufficient balance + concurrent run
--
-- Setup: bob has 5¢. gen `aaaa…2222` costs 10¢. Both calls must fail with
-- `insufficient_funds`. No partial debit. No tx logged. Balance unchanged.
-- ============================================================================

-- Terminal A:
BEGIN;
  SELECT * FROM billing_test.charge_for_generation(
    '22222222-2222-2222-2222-222222222222'::uuid,
    'aaaaaaaa-2222-2222-2222-222222222222'::uuid,
    10,
    'gen:aaaaaaaa-2222-2222-2222-222222222222'
  );
  SELECT pg_sleep(3);
COMMIT;

-- Terminal B (run during the sleep window):
SELECT * FROM billing_test.charge_for_generation(
  '22222222-2222-2222-2222-222222222222'::uuid,
  'aaaaaaaa-2222-2222-2222-222222222222'::uuid,
  10,
  'gen:aaaaaaaa-2222-2222-2222-222222222222'
);

-- ✅ EXPECTED:
--   Both terminals: result='insufficient_funds', tx_id IS NULL.
--   user_profiles.balance_cents = 5  (UNCHANGED).
--   credit_transactions count for this gen = 0.
--
-- If the RPC inserts a tx row of any kind on insufficient_funds, that's
-- a bug — we don't want a ledger entry for a charge that never happened.

SELECT balance_cents FROM billing_test.user_profiles WHERE id='22222222-2222-2222-2222-222222222222';
SELECT count(*) FROM billing_test.credit_transactions
  WHERE idempotency_key = 'gen:aaaaaaaa-2222-2222-2222-222222222222';


-- ============================================================================
-- SCENARIO 3 — Lifetime user + concurrent calls
--
-- Setup: carol has lifetime_access=true. gen `aaaa…3333` costs 10¢. Both
-- calls must return `waived_lifetime`, balance must NOT change, and exactly
-- ONE $0 tx row must be logged (so the user's spending log shows the gen,
-- but no money moved).
-- ============================================================================

-- Terminal A:
BEGIN;
  SELECT * FROM billing_test.charge_for_generation(
    '33333333-3333-3333-3333-333333333333'::uuid,
    'aaaaaaaa-3333-3333-3333-333333333333'::uuid,
    10,
    'gen:aaaaaaaa-3333-3333-3333-333333333333'
  );
  SELECT pg_sleep(3);
COMMIT;

-- Terminal B (during the sleep window):
SELECT * FROM billing_test.charge_for_generation(
  '33333333-3333-3333-3333-333333333333'::uuid,
  'aaaaaaaa-3333-3333-3333-333333333333'::uuid,
  10,
  'gen:aaaaaaaa-3333-3333-3333-333333333333'
);

-- ✅ EXPECTED:
--   Terminal A:  result='waived_lifetime', one tx row inserted with amount=0.
--   Terminal B:  result='already_billed_race' (or 'waived_lifetime' idempotent
--                return, depending on RPC contract — but ONLY ONE tx row total).
--   user_profiles.balance_cents = 100 (UNCHANGED).
--   credit_transactions count for this gen = 1, with amount = 0.

SELECT balance_cents FROM billing_test.user_profiles WHERE id='33333333-3333-3333-3333-333333333333';
SELECT count(*), array_agg(tx_id), array_agg(amount)
  FROM billing_test.credit_transactions
  WHERE idempotency_key = 'gen:aaaaaaaa-3333-3333-3333-333333333333';


-- ============================================================================
-- ADDITIONAL SUGGESTED CHECKS (run as ad-hoc SQL after the three scenarios)
-- ============================================================================

-- ALL gens that have been billed must have exactly one tx
SELECT g.id, count(t.*) AS tx_count
FROM billing_test.generations g
LEFT JOIN billing_test.credit_transactions t
  ON t.idempotency_key = 'gen:' || g.id::text
GROUP BY g.id
HAVING count(t.*) <> 1
   AND g.output_metadata->>'billing_complete' = 'true';

-- Total balance moved across the ledger must match user_profiles balances
WITH ledger AS (
  SELECT user_id, sum(amount * 100)::int AS sum_cents
  FROM billing_test.credit_transactions
  GROUP BY user_id
),
expected AS (
  SELECT p.whop_user_id AS user_id,
         coalesce(l.sum_cents, 0) AS expected_change
  FROM billing_test.user_profiles p
  LEFT JOIN ledger l ON l.user_id = p.whop_user_id
)
SELECT p.whop_user_id, p.balance_cents AS actual, e.expected_change AS expected
FROM billing_test.user_profiles p
JOIN expected e ON e.user_id = p.whop_user_id;


-- ============================================================================
-- CLEANUP — run in Terminal A when done
-- ============================================================================
-- DROP SCHEMA billing_test CASCADE;
