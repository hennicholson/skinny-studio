-- =========================================================================
-- Atomic Billing Rewrite
-- =========================================================================
-- Introduces:
--   * generations.billing_status / billed_amount_cents / billed_at
--   * UNIQUE PARTIAL INDEX on credit_transactions((metadata->>'generation_id'))
--   * UNIQUE on webhook_events.event_id
--   * complete_generation_billing()  — keystone RPC (debit + tx + flag in one txn)
--   * apply_topup_credit()           — webhook credit RPC (credit + tx in one txn)
--
-- Idempotent: re-running this migration is safe. All ADDs / CREATEs are guarded.
-- Additive only: no DROPs, no destructive cleanup of existing rows.
--
-- Pre-flight expectations (verified against live DB on 2026-05-16):
--   - generations.user_id        UUID  -> user_profiles.id
--   - generations.whop_user_id   UUID  (the "Whop-side" id, also used as credit_transactions.user_id)
--   - credit_transactions.tx_id  INT PK (not 'id')
--   - credit_transactions.user_id UUID
--   - credit_transactions.metadata JSONB
--   - credit_transactions.external_ref TEXT  (a TAG column — values 'usd' | 'whop' | NULL;
--                                              NOT a per-payment unique id; do not dedup on it)
--   - credit_transactions.idempotency_key TEXT (the actual per-payment unique id, shaped 'pay_xxx';
--                                                NULL for admin-added manual credits — preserved)
--   - user_profiles.balance_cents INT
--   - 0 duplicate metadata->>'generation_id' values, 0 duplicate webhook_events.event_id,
--     0 duplicate non-null idempotency_key values on topup rows
-- =========================================================================

BEGIN;

SET LOCAL client_min_messages = NOTICE;

-- -------------------------------------------------------------------------
-- 1. generations: billing_status + billed_amount_cents + billed_at
-- -------------------------------------------------------------------------

ALTER TABLE public.generations
  ADD COLUMN IF NOT EXISTS billing_status      TEXT,
  ADD COLUMN IF NOT EXISTS billed_amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS billed_at           TIMESTAMPTZ;

-- Set default on billing_status (only adds default; existing NULLs are backfilled below)
ALTER TABLE public.generations
  ALTER COLUMN billing_status SET DEFAULT 'pending';

-- CHECK constraint, guarded so re-runs don't error
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'generations_billing_status_check'
      AND conrelid = 'public.generations'::regclass
  ) THEN
    -- Allow NULL temporarily so backfill can succeed before NOT NULL is added.
    ALTER TABLE public.generations
      ADD CONSTRAINT generations_billing_status_check
      CHECK (billing_status IS NULL OR billing_status IN
             ('pending', 'charged', 'waived', 'failed', 'refunded'));
  END IF;
END $$;

-- Backfill billing_status for existing rows.
-- Rules:
--   * If output_metadata.billing_complete = true              -> 'charged' (or 'waived' if amount 0)
--   * Else if replicate_status IN ('failed','canceled')      -> 'failed'
--   * Else                                                   -> 'pending'
UPDATE public.generations
SET billing_status = CASE
  WHEN (output_metadata->>'billing_complete')::boolean = true THEN
    CASE
      WHEN COALESCE((output_metadata->>'billed_amount_cents')::int, cost_cents, 0) = 0 THEN 'waived'
      ELSE 'charged'
    END
  WHEN replicate_status IN ('failed', 'canceled') THEN 'failed'
  ELSE 'pending'
END
WHERE billing_status IS NULL;

-- Backfill billed_amount_cents and billed_at from the legacy metadata blob
-- where possible. Don't overwrite anything already set.
UPDATE public.generations
SET billed_amount_cents = COALESCE(
      (output_metadata->>'billed_amount_cents')::int,
      CASE WHEN billing_status = 'waived' THEN 0
           WHEN billing_status = 'charged' THEN cost_cents
           ELSE NULL END
    )
WHERE billed_amount_cents IS NULL
  AND billing_status IN ('charged', 'waived');

UPDATE public.generations
SET billed_at = COALESCE(
      (output_metadata->>'billed_at')::timestamptz,
      completed_at,
      created_at
    )
WHERE billed_at IS NULL
  AND billing_status IN ('charged', 'waived');

-- Helpful covering index for the polling sweep + admin queries
CREATE INDEX IF NOT EXISTS generations_billing_status_idx
  ON public.generations (billing_status);

CREATE INDEX IF NOT EXISTS generations_billing_status_pending_idx
  ON public.generations (created_at)
  WHERE billing_status = 'pending';

COMMENT ON COLUMN public.generations.billing_status IS
  'Billing lifecycle: pending|charged|waived|failed|refunded. Authoritative — supersedes output_metadata.billing_complete.';
COMMENT ON COLUMN public.generations.billed_amount_cents IS
  'Exact cents debited from user balance (0 for lifetime/waived). May differ from estimate cost_cents.';
COMMENT ON COLUMN public.generations.billed_at IS
  'Wall-clock time of the successful balance debit (or waive decision).';

-- -------------------------------------------------------------------------
-- 2. credit_transactions: UNIQUE PARTIAL INDEX on metadata->>'generation_id'
-- -------------------------------------------------------------------------

-- Live DB check (2026-05-16): 108 tx rows have a non-null generation_id, 0 duplicates.
-- We RAISE NOTICE if any future dupes appear so the operator can intervene.
DO $$
DECLARE
  dupe_cnt INTEGER;
BEGIN
  SELECT COUNT(*) INTO dupe_cnt
  FROM (
    SELECT metadata->>'generation_id' AS gid, COUNT(*) AS c
    FROM public.credit_transactions
    WHERE metadata->>'generation_id' IS NOT NULL
    GROUP BY 1
    HAVING COUNT(*) > 1
  ) d;

  IF dupe_cnt > 0 THEN
    RAISE NOTICE '[atomic_billing] FOUND % duplicate metadata->>generation_id groups in credit_transactions.', dupe_cnt;
    RAISE NOTICE '[atomic_billing] Inspect with:';
    RAISE NOTICE '  SELECT metadata->>''generation_id'' gid, array_agg(tx_id ORDER BY created_at) txs, COUNT(*) ';
    RAISE NOTICE '  FROM credit_transactions WHERE metadata->>''generation_id'' IS NOT NULL';
    RAISE NOTICE '  GROUP BY 1 HAVING COUNT(*) > 1;';
    RAISE NOTICE '[atomic_billing] To resolve: keep earliest tx per generation_id and mark later ones reversed.';
    RAISE NOTICE '[atomic_billing] Unique index NOT created — manual cleanup required first.';
  ELSE
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS credit_transactions_generation_id_uniq '
         || 'ON public.credit_transactions ((metadata->>''generation_id'')) '
         || 'WHERE metadata->>''generation_id'' IS NOT NULL';
    RAISE NOTICE '[atomic_billing] credit_transactions_generation_id_uniq created (0 dupes).';
  END IF;
END $$;

-- -------------------------------------------------------------------------
-- 3. credit_transactions: UNIQUE PARTIAL INDEX on idempotency_key for topup idempotency
-- -------------------------------------------------------------------------
--
-- Forensic audit correction (2026-05-16): the original draft of this migration
-- attempted to dedup on `external_ref`, but `external_ref` is a TAG column —
-- production values are 'usd' (97 + 35 rows), 'whop' (1 row), NULL (190 rows) —
-- NOT a per-payment unique id. The actual per-Whop-payment unique id lives in
-- `idempotency_key` (values shaped 'pay_xxx').
--
-- Live DB at audit time (2026-05-16):
--   * 10 topup rows with non-null idempotency_key — all unique (zero dupes)
--   * 26 topup rows with NULL idempotency_key — admin-added manual credits;
--     these are intentionally non-idempotent and the partial index respects that.
--
-- So this index can be created directly. RAISE NOTICE on the off-chance a
-- future dupe slips in (e.g. webhook retried under buggy code).
DO $$
DECLARE
  dupe_cnt INTEGER;
BEGIN
  SELECT COUNT(*) INTO dupe_cnt
  FROM (
    SELECT idempotency_key
    FROM public.credit_transactions
    WHERE type = 'topup' AND idempotency_key IS NOT NULL
    GROUP BY 1
    HAVING COUNT(*) > 1
  ) d;

  IF dupe_cnt > 0 THEN
    RAISE NOTICE '[atomic_billing] FOUND % duplicate idempotency_key groups on type=topup.', dupe_cnt;
    RAISE NOTICE '[atomic_billing] Inspect with:';
    RAISE NOTICE '  SELECT idempotency_key, array_agg(tx_id ORDER BY created_at) txs, COUNT(*)';
    RAISE NOTICE '  FROM credit_transactions';
    RAISE NOTICE '  WHERE type = ''topup'' AND idempotency_key IS NOT NULL';
    RAISE NOTICE '  GROUP BY 1 HAVING COUNT(*) > 1;';
    RAISE NOTICE '[atomic_billing] Resolution: keep earliest tx per idempotency_key; null-out';
    RAISE NOTICE '  the rest or mark them via metadata before re-applying.';
    RAISE NOTICE '[atomic_billing] credit_transactions_topup_idempotency_key_uniq NOT created — fix dupes first.';
  ELSE
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS credit_transactions_topup_idempotency_key_uniq '
         || 'ON public.credit_transactions (idempotency_key) '
         || 'WHERE type = ''topup'' AND idempotency_key IS NOT NULL';
    RAISE NOTICE '[atomic_billing] credit_transactions_topup_idempotency_key_uniq created (0 dupes).';
  END IF;
END $$;

-- -------------------------------------------------------------------------
-- 4. webhook_events: UNIQUE on event_id
-- -------------------------------------------------------------------------
-- Live DB check (2026-05-16): 283 rows, 0 duplicate event_id values, 0 NULLs.
-- Safe to add unconditionally — but still emit notice if any future dupes block it.
DO $$
DECLARE
  dupe_cnt INTEGER;
BEGIN
  SELECT COUNT(*) INTO dupe_cnt
  FROM (
    SELECT event_id FROM public.webhook_events
    WHERE event_id IS NOT NULL
    GROUP BY 1 HAVING COUNT(*) > 1
  ) d;

  IF dupe_cnt > 0 THEN
    RAISE NOTICE '[atomic_billing] FOUND % duplicate webhook_events.event_id groups.', dupe_cnt;
    RAISE NOTICE '[atomic_billing] Cleanup SQL (run manually before re-applying):';
    RAISE NOTICE '  DELETE FROM webhook_events w1 USING webhook_events w2';
    RAISE NOTICE '  WHERE w1.event_id = w2.event_id';
    RAISE NOTICE '    AND w1.event_id IS NOT NULL';
    RAISE NOTICE '    AND w1.created_at > w2.created_at;  -- keep earliest';
    RAISE NOTICE '[atomic_billing] webhook_events_event_id_uniq NOT created — fix dupes first.';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'webhook_events'
      AND indexname = 'webhook_events_event_id_uniq'
  ) THEN
    -- Use a partial unique index (allows NULL event_id, which is permitted today)
    CREATE UNIQUE INDEX webhook_events_event_id_uniq
      ON public.webhook_events (event_id)
      WHERE event_id IS NOT NULL;
    RAISE NOTICE '[atomic_billing] webhook_events_event_id_uniq created.';
  END IF;
END $$;

-- -------------------------------------------------------------------------
-- 5. complete_generation_billing(): the keystone RPC
-- -------------------------------------------------------------------------
-- One atomic transaction:
--   (a) fast-path return if already charged/waived/refunded
--   (b) FOR UPDATE lock on user_profiles
--   (c) lifetime users: tx + flag (amount=0), return 'waived'
--   (d) non-lifetime: conditional UPDATE deduct (no row -> insufficient)
--   (e) on debit success: insert tx + flag, return 'charged'
--   (f) on unique_violation of the credit_transactions partial index:
--       a concurrent caller beat us — converge state, return 'already_billed_race'
--
-- SECURITY DEFINER + locked search_path: only service role API routes
-- should call this; treat it as service-level infrastructure.

CREATE OR REPLACE FUNCTION public.complete_generation_billing(
  p_generation_id    UUID,
  p_user_profile_id  UUID,
  p_whop_user_id     UUID,
  p_amount_cents     INTEGER,
  p_model_slug       TEXT,
  p_model_category   TEXT,
  p_preview_url      TEXT,
  p_extra_metadata   JSONB,
  p_path             TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing_status        TEXT;
  v_existing_amount        INTEGER;
  v_profile_id             UUID;
  v_lifetime               BOOLEAN;
  v_balance_before         INTEGER;
  v_balance_after          INTEGER;
  v_new_tx_id              INTEGER;
  v_existing_tx_id         INTEGER;
  v_task                   TEXT;
  v_metadata               JSONB;
  v_effective_amount_cents INTEGER;
BEGIN
  -- Validate basic inputs (defensive — service routes already check)
  IF p_generation_id   IS NULL THEN RETURN jsonb_build_object('status','invalid_args','field','p_generation_id'); END IF;
  IF p_user_profile_id IS NULL THEN RETURN jsonb_build_object('status','invalid_args','field','p_user_profile_id'); END IF;
  IF p_amount_cents    IS NULL OR p_amount_cents < 0 THEN
    RETURN jsonb_build_object('status','invalid_args','field','p_amount_cents');
  END IF;

  -- Derive task label from category (mirrors existing app logic)
  v_task := CASE
    WHEN p_model_category = 'video' THEN 'Video Generation'
    WHEN p_model_category = 'audio' THEN 'Audio Generation'
    ELSE 'Image Generation'
  END;

  -- ---------------------------------------------------------------
  -- (a) Fast-path idempotency: already settled?
  -- ---------------------------------------------------------------
  SELECT billing_status, billed_amount_cents
    INTO v_existing_status, v_existing_amount
  FROM public.generations
  WHERE id = p_generation_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'generation_not_found');
  END IF;

  IF v_existing_status IN ('charged', 'waived', 'refunded') THEN
    RETURN jsonb_build_object(
      'status', 'already_billed',
      'billing_status', v_existing_status,
      'billed_amount_cents', v_existing_amount
    );
  END IF;

  -- ---------------------------------------------------------------
  -- (b) Lock user profile
  -- ---------------------------------------------------------------
  SELECT id, lifetime_access, balance_cents
    INTO v_profile_id, v_lifetime, v_balance_before
  FROM public.user_profiles
  WHERE id = p_user_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'user_not_found', 'user_profile_id', p_user_profile_id);
  END IF;

  -- ---------------------------------------------------------------
  -- (c) Lifetime: waive
  -- ---------------------------------------------------------------
  IF v_lifetime IS TRUE THEN
    v_metadata := COALESCE(p_extra_metadata, '{}'::jsonb) || jsonb_build_object(
      'generation_id', p_generation_id,
      'model', p_model_slug,
      'category', p_model_category,
      'is_lifetime_user', true,
      'billed_via', p_path,
      'estimated_amount_cents', p_amount_cents
    );

    BEGIN
      INSERT INTO public.credit_transactions (
        user_id, type, amount, amount_charged, app_name, task,
        status, preview, metadata
      ) VALUES (
        p_whop_user_id, 'PersonaForge', 0, 0, 'Skinny Studio', v_task,
        'completed', p_preview_url, v_metadata
      )
      RETURNING tx_id INTO v_new_tx_id;
    EXCEPTION
      WHEN unique_violation THEN
        -- Concurrent caller already inserted the row. Look it up.
        SELECT tx_id INTO v_existing_tx_id
        FROM public.credit_transactions
        WHERE metadata->>'generation_id' = p_generation_id::text
        LIMIT 1;

        UPDATE public.generations
        SET billing_status = COALESCE(billing_status, 'waived'),
            billed_amount_cents = COALESCE(billed_amount_cents, 0),
            billed_at = COALESCE(billed_at, now())
        WHERE id = p_generation_id
          AND billing_status NOT IN ('charged', 'waived', 'refunded');

        RETURN jsonb_build_object(
          'status', 'already_billed_race',
          'tx_id', v_existing_tx_id,
          'billing_status', 'waived'
        );
    END;

    UPDATE public.generations
    SET billing_status      = 'waived',
        billed_amount_cents = 0,
        billed_at           = now()
    WHERE id = p_generation_id;

    RETURN jsonb_build_object(
      'status', 'waived',
      'tx_id', v_new_tx_id,
      'new_balance_cents', v_balance_before,
      'billed_amount_cents', 0
    );
  END IF;

  -- ---------------------------------------------------------------
  -- (d) Conditional debit. If balance < amount, no row returned.
  -- ---------------------------------------------------------------
  -- Treat amount_cents = 0 specially: no real debit needed but record a tx
  -- (matches current app behavior for zero-cost runs).
  IF p_amount_cents = 0 THEN
    v_effective_amount_cents := 0;
    v_balance_after := v_balance_before;
  ELSE
    UPDATE public.user_profiles
    SET balance_cents = balance_cents - p_amount_cents,
        updated_at = now()
    WHERE id = p_user_profile_id
      AND balance_cents >= p_amount_cents
    RETURNING balance_cents INTO v_balance_after;

    IF NOT FOUND THEN
      -- Insufficient balance: mark generation failed, DO NOT insert tx.
      UPDATE public.generations
      SET billing_status = 'failed',
          billed_amount_cents = 0,
          billed_at = now()
      WHERE id = p_generation_id;

      RETURN jsonb_build_object(
        'status', 'insufficient_balance',
        'balance_cents', v_balance_before,
        'required_cents', p_amount_cents
      );
    END IF;

    v_effective_amount_cents := p_amount_cents;
  END IF;

  -- ---------------------------------------------------------------
  -- (e) Log transaction & mark generation charged.
  -- ---------------------------------------------------------------
  v_metadata := COALESCE(p_extra_metadata, '{}'::jsonb) || jsonb_build_object(
    'generation_id', p_generation_id,
    'model', p_model_slug,
    'category', p_model_category,
    'is_lifetime_user', false,
    'billed_via', p_path,
    'balance_before_cents', v_balance_before,
    'balance_after_cents', v_balance_after
  );

  BEGIN
    INSERT INTO public.credit_transactions (
      user_id, type, amount, amount_charged, app_name, task,
      status, preview, metadata
    ) VALUES (
      p_whop_user_id,
      'PersonaForge',
      -(v_effective_amount_cents::numeric / 100),
      (v_effective_amount_cents::numeric / 100),
      'Skinny Studio',
      v_task,
      'completed',
      p_preview_url,
      v_metadata
    )
    RETURNING tx_id INTO v_new_tx_id;
  EXCEPTION
    WHEN unique_violation THEN
      -- Concurrent caller (different code path) already inserted a tx for this
      -- generation. Our balance UPDATE will be rolled back by the surrounding
      -- statement-level subtransaction. Re-credit the user, converge state.
      --
      -- IMPORTANT: only catch the GEN-ID unique violation; re-raise others.
      -- Postgres exposes the constraint name only via SQLERRM/SQLSTATE — we
      -- inspect the constraint name to be precise.
      IF SQLERRM NOT ILIKE '%credit_transactions_generation_id_uniq%' THEN
        RAISE;
      END IF;

      -- Roll back the debit we just performed (subtransaction inside this BEGIN
      -- only rolls back the failed INSERT, NOT the prior UPDATE — so we must
      -- compensate manually).
      IF v_effective_amount_cents > 0 THEN
        UPDATE public.user_profiles
        SET balance_cents = balance_cents + v_effective_amount_cents,
            updated_at = now()
        WHERE id = p_user_profile_id;
      END IF;

      SELECT tx_id INTO v_existing_tx_id
      FROM public.credit_transactions
      WHERE metadata->>'generation_id' = p_generation_id::text
      LIMIT 1;

      UPDATE public.generations
      SET billing_status = COALESCE(NULLIF(billing_status,'pending'), 'charged'),
          billed_at = COALESCE(billed_at, now())
      WHERE id = p_generation_id
        AND billing_status NOT IN ('charged', 'waived', 'refunded');

      RETURN jsonb_build_object(
        'status', 'already_billed_race',
        'tx_id', v_existing_tx_id,
        'billing_status', 'charged'
      );
  END;

  UPDATE public.generations
  SET billing_status      = 'charged',
      billed_amount_cents = v_effective_amount_cents,
      billed_at           = now()
  WHERE id = p_generation_id;

  RETURN jsonb_build_object(
    'status', 'charged',
    'tx_id', v_new_tx_id,
    'new_balance_cents', v_balance_after,
    'billed_amount_cents', v_effective_amount_cents
  );
END;
$$;

COMMENT ON FUNCTION public.complete_generation_billing IS
  'Atomic generation billing: idempotent (gen.billing_status fast-path + credit_transactions unique gen_id index). '
  'Returns JSON with status in (already_billed, already_billed_race, charged, waived, '
  'insufficient_balance, user_not_found, generation_not_found, invalid_args).';

-- Lock down EXECUTE: only service_role (used by API routes) and supabase admin roles.
REVOKE ALL ON FUNCTION public.complete_generation_billing(UUID,UUID,UUID,INTEGER,TEXT,TEXT,TEXT,JSONB,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_generation_billing(UUID,UUID,UUID,INTEGER,TEXT,TEXT,TEXT,JSONB,TEXT) TO service_role;

-- -------------------------------------------------------------------------
-- 6. apply_topup_credit(): the Whop top-up RPC
-- -------------------------------------------------------------------------
-- One atomic transaction:
--   (a) lookup or create user_profiles row (matches existing webhook behavior)
--   (b) FOR UPDATE lock
--   (c) INSERT credit_transactions with external_ref = whop_event_id
--   (d) on unique_violation -> return 'already_credited' (no balance change)
--   (e) UPDATE balance, return new value

CREATE OR REPLACE FUNCTION public.apply_topup_credit(
  p_whop_user_id   UUID,
  p_whop_event_id  TEXT,
  p_credits_cents  INTEGER,
  p_plan_name      TEXT,
  p_extra_metadata JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile_id      UUID;
  v_balance_before  INTEGER;
  v_balance_after   INTEGER;
  v_new_tx_id       INTEGER;
  v_existing_tx_id  INTEGER;
  v_metadata        JSONB;
BEGIN
  IF p_whop_user_id IS NULL THEN
    RETURN jsonb_build_object('status','invalid_args','field','p_whop_user_id');
  END IF;
  IF p_credits_cents IS NULL OR p_credits_cents <= 0 THEN
    RETURN jsonb_build_object('status','invalid_args','field','p_credits_cents');
  END IF;

  -- NULL/empty p_whop_event_id is INTENTIONALLY ALLOWED. It signals an admin-added
  -- manual credit (no Whop payment, no idempotency wanted). 26 such rows exist
  -- in production today with NULL idempotency_key — those are the canonical pattern.
  -- We normalize empty string to NULL so callers don't accidentally collide.
  IF p_whop_event_id = '' THEN
    p_whop_event_id := NULL;
  END IF;

  -- (a)+(b) lookup or create profile, then lock it.
  -- INSERT ... ON CONFLICT DO NOTHING then SELECT FOR UPDATE: lock is held by
  -- THIS transaction regardless of which path created the row.
  INSERT INTO public.user_profiles (whop_user_id, balance_cents, lifetime_access)
  VALUES (p_whop_user_id, 0, false)
  ON CONFLICT (whop_user_id) DO NOTHING;
  -- Note: ON CONFLICT requires the existing unique constraint
  -- `user_profiles_whop_user_id_key` (verified present 2026-05-16).

  SELECT id, balance_cents
    INTO v_profile_id, v_balance_before
  FROM public.user_profiles
  WHERE whop_user_id = p_whop_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','user_not_found','whop_user_id',p_whop_user_id);
  END IF;

  -- (c) Pre-flight idempotency check (only when an event id was provided).
  -- The DB-level partial unique index `credit_transactions_topup_idempotency_key_uniq`
  -- is the authoritative guard, but a pre-check lets us short-circuit without
  -- consuming a tx_id sequence value on the common duplicate-webhook case.
  IF p_whop_event_id IS NOT NULL THEN
    SELECT tx_id INTO v_existing_tx_id
    FROM public.credit_transactions
    WHERE type = 'topup' AND idempotency_key = p_whop_event_id
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'status', 'already_credited',
        'tx_id', v_existing_tx_id,
        'balance_cents', v_balance_before
      );
    END IF;
  END IF;

  -- (d) Build metadata and insert.
  v_metadata := COALESCE(p_extra_metadata, '{}'::jsonb) || jsonb_build_object(
    'whop_event_id', p_whop_event_id,
    'plan_name', p_plan_name,
    'credited_via', 'apply_topup_credit'
  );

  BEGIN
    -- amount / amount_credited stored as DOLLARS-NUMERIC (column convention,
    -- verified live 2026-05-16: e.g. 10.5, 14.96, 0.01).
    -- external_ref is a TAG column: 'whop' for Whop-sourced topups (matches the
    -- production convention on tx_id=185); NULL for admin manual credits.
    INSERT INTO public.credit_transactions (
      user_id, type, amount, amount_credited, app_name, task,
      status, external_ref, idempotency_key, metadata
    ) VALUES (
      p_whop_user_id,
      'topup',
      (p_credits_cents::numeric / 100),
      (p_credits_cents::numeric / 100),
      'Skinny Studio',
      p_plan_name,
      'completed',
      CASE WHEN p_whop_event_id IS NOT NULL THEN 'whop' ELSE NULL END,
      p_whop_event_id,
      v_metadata
    )
    RETURNING tx_id INTO v_new_tx_id;
  EXCEPTION
    WHEN unique_violation THEN
      -- The partial unique index on (idempotency_key) WHERE type='topup' caught
      -- a concurrent insert with the same event id. Only catch THAT specific
      -- constraint — re-raise anything else.
      IF SQLERRM NOT ILIKE '%credit_transactions_topup_idempotency_key_uniq%' THEN
        RAISE;
      END IF;

      SELECT tx_id INTO v_existing_tx_id
      FROM public.credit_transactions
      WHERE type = 'topup' AND idempotency_key = p_whop_event_id
      LIMIT 1;

      RETURN jsonb_build_object(
        'status', 'already_credited',
        'tx_id', v_existing_tx_id,
        'balance_cents', v_balance_before
      );
  END;

  -- (e) Apply balance bump (balance_cents stays in cents).
  UPDATE public.user_profiles
  SET balance_cents = balance_cents + p_credits_cents,
      updated_at    = now()
  WHERE id = v_profile_id
  RETURNING balance_cents INTO v_balance_after;

  RETURN jsonb_build_object(
    'status', 'credited',
    'tx_id', v_new_tx_id,
    'new_balance_cents', v_balance_after,
    'credited_cents', p_credits_cents
  );
END;
$$;

COMMENT ON FUNCTION public.apply_topup_credit IS
  'Atomic Whop top-up credit application. Idempotent via credit_transactions partial unique on '
  '(idempotency_key) WHERE type=''topup'' AND idempotency_key IS NOT NULL. '
  'NULL/empty p_whop_event_id is allowed and signals an admin manual credit '
  '(no idempotency, matches the existing NULL-key topup convention). '
  'external_ref is a tag column: ''whop'' for Whop-sourced, NULL for admin manual. '
  'amount / amount_credited are stored as dollars-numeric. '
  'Returns status in (credited, already_credited, user_not_found, invalid_args).';

REVOKE ALL ON FUNCTION public.apply_topup_credit(UUID,TEXT,INTEGER,TEXT,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_topup_credit(UUID,TEXT,INTEGER,TEXT,JSONB) TO service_role;

-- -------------------------------------------------------------------------
-- 7. Deprecate (don't drop) deduct_balance_safely
-- -------------------------------------------------------------------------
-- The existing function deduct_balance_safely(p_user_id UUID, p_amount INT) returning
-- jsonb {success, new_balance, error} is fully subsumed by complete_generation_billing.
-- Old call sites in /api/generate, /api/replicate-webhook, and the Netlify poll
-- function will be migrated in Wave 2. Keep the function in place; just label it.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'deduct_balance_safely'
  ) THEN
    EXECUTE 'COMMENT ON FUNCTION public.deduct_balance_safely(uuid,integer) IS '
         || $c$'[DEPRECATED 2026-05-16] Use complete_generation_billing() instead. '
            'This function only performs the balance debit half of the atomic flow; '
            'callers using it still need to manually insert credit_transactions and '
            'flip generations.billing_status, which is not race-safe. '
            'Scheduled removal after Wave 2 migration of /api/generate, '
            '/api/replicate-webhook, and netlify/functions/poll-pending-generations.'$c$;
  END IF;
END $$;

COMMIT;

-- =========================================================================
-- TEST PLAN (run manually in a staging DB; do NOT execute against prod)
-- =========================================================================
--
-- Setup:
--   INSERT INTO user_profiles (id, whop_user_id, balance_cents, lifetime_access)
--   VALUES ('11111111-1111-1111-1111-111111111111',
--           '22222222-2222-2222-2222-222222222222', 500, false);
--   INSERT INTO generations (id, user_id, whop_user_id, model_slug, model_category,
--                            cost_cents, replicate_status, billing_status)
--   VALUES ('33333333-3333-3333-3333-333333333333',
--           '11111111-1111-1111-1111-111111111111',
--           '22222222-2222-2222-2222-222222222222',
--           'flux-2-pro','image',100,'succeeded','pending');
--
-- Case 1 — happy path (charged):
--   SELECT complete_generation_billing(
--     '33333333-3333-3333-3333-333333333333',
--     '11111111-1111-1111-1111-111111111111',
--     '22222222-2222-2222-2222-222222222222',
--     100, 'flux-2-pro', 'image', NULL, '{"prompt":"x"}'::jsonb, 'sync');
--   -- Expect: {status:'charged', tx_id:<n>, new_balance_cents:400, billed_amount_cents:100}
--   SELECT billing_status, billed_amount_cents FROM generations
--   WHERE id='33333333-3333-3333-3333-333333333333';
--   -- Expect: ('charged', 100)
--
-- Case 2 — idempotency (already_billed):
--   SELECT complete_generation_billing(...same args...);
--   -- Expect: {status:'already_billed', billing_status:'charged', billed_amount_cents:100}
--   -- balance unchanged at 400
--
-- Case 3 — insufficient balance:
--   UPDATE user_profiles SET balance_cents=10 WHERE id='11111111-...';
--   -- Reset generation:
--   UPDATE generations SET billing_status='pending', billed_amount_cents=NULL, billed_at=NULL
--   WHERE id='44444444-4444-4444-4444-444444444444';
--   SELECT complete_generation_billing('44444444-...', ..., 100, ...);
--   -- Expect: {status:'insufficient_balance', balance_cents:10, required_cents:100}
--   -- No credit_transactions row inserted. generations.billing_status='failed'.
--
-- Case 4 — lifetime user:
--   UPDATE user_profiles SET lifetime_access=true WHERE id='11111111-...';
--   SELECT complete_generation_billing('55555555-...', ..., 100, ...);
--   -- Expect: {status:'waived', tx_id:<n>, new_balance_cents:<unchanged>, billed_amount_cents:0}
--
-- Case 5 — race (concurrent insert): hardest to simulate in a single session.
--   In psql terminal A: BEGIN; SELECT complete_generation_billing(GEN, ...);
--   In psql terminal B: SELECT complete_generation_billing(GEN, ...);
--   A commits first -> B receives unique_violation -> returns 'already_billed_race'
--   and reverses its own UPDATE so balance is correct.
--
-- Case 6 — topup happy path (Whop webhook):
--   SELECT apply_topup_credit('22222222-...', 'pay_TEST1', 1000, 'Top Up $10', '{}'::jsonb);
--   -- Expect: {status:'credited', tx_id:<n>, new_balance_cents:<prev+1000>, credited_cents:1000}
--   SELECT type, amount, amount_credited, external_ref, idempotency_key
--   FROM credit_transactions WHERE tx_id = <n>;
--   -- Expect: ('topup', 10.00, 10.00, 'whop', 'pay_TEST1')
--
-- Case 7 — topup idempotent re-delivery (same event id):
--   SELECT apply_topup_credit('22222222-...', 'pay_TEST1', 1000, 'Top Up $10', '{}'::jsonb);
--   -- Expect: {status:'already_credited', tx_id:<orig>}, balance unchanged.
--   -- Both the pre-flight check and the unique index would catch this; pre-flight wins
--   -- in the non-racing case, but the EXCEPTION block handles concurrent inserts.
--
-- Case 8 — topup admin manual credit (NULL event id, no idempotency):
--   SELECT apply_topup_credit('22222222-...', NULL, 100, 'Manual credit (admin)', '{}'::jsonb);
--   -- Expect: {status:'credited', tx_id:<n>, new_balance_cents:<prev+100>, credited_cents:100}
--   SELECT external_ref, idempotency_key FROM credit_transactions WHERE tx_id = <n>;
--   -- Expect: (NULL, NULL)   <-- matches the 26 admin-manual rows already in production
--
-- Case 9 — repeated admin manual credits (NULL event id) should NOT collide:
--   SELECT apply_topup_credit('22222222-...', NULL, 100, 'Manual credit', '{}'::jsonb);
--   SELECT apply_topup_credit('22222222-...', NULL, 100, 'Manual credit', '{}'::jsonb);
--   -- Expect: two distinct {status:'credited'} responses; balance += 200 total.
--   -- The partial unique index excludes NULL keys, so this is allowed by design.
--
-- Case 10 — topup empty-string event id is normalized to NULL:
--   SELECT apply_topup_credit('22222222-...', '', 100, 'Edge', '{}'::jsonb);
--   -- Expect: same behavior as NULL — credited, no idempotency check.
--
-- =========================================================================
