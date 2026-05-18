-- Canvas run history / telemetry.
-- A "run" is a single execution of a canvas DAG. It ties together all the
-- generation rows produced when the user clicked "Run" so we can later show:
--
--   "Canvas X has been run 5 times, total spent $Y, latest run yielded these
--    outputs."
--
-- canvas_runs       — one row per run (header).
-- canvas_run_nodes  — one row per executed node inside that run, with a soft
--                     FK to generations.id so we inherit existing billing,
--                     status, and output_urls without duplicating storage.


-- =====================================================================
-- canvas_runs
-- =====================================================================
create table if not exists public.canvas_runs (
  id uuid primary key default gen_random_uuid(),
  canvas_id uuid not null references public.canvases(id) on delete cascade,
  user_id uuid not null,                            -- whop-derived UUID (mirrors canvases.user_id)
  status text not null default 'running',           -- 'running' | 'succeeded' | 'failed' | 'cancelled'
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  estimated_cost_cents int not null default 0,
  actual_cost_cents int not null default 0,
  node_count int not null default 0
);

create index if not exists canvas_runs_canvas_idx on public.canvas_runs(canvas_id);
create index if not exists canvas_runs_user_idx on public.canvas_runs(user_id);
create index if not exists canvas_runs_started_at_idx on public.canvas_runs(started_at desc);

-- =====================================================================
-- canvas_run_nodes
-- Per-node telemetry inside a run. `generation_id` is a soft FK to the
-- existing `generations` table (no hard FK, since generations may live in a
-- different schema or be cleaned up independently).
-- =====================================================================
create table if not exists public.canvas_run_nodes (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.canvas_runs(id) on delete cascade,
  canvas_node_id uuid,                              -- soft FK to canvas_nodes.id
  client_node_id text not null,                     -- stable client-side id used by the IR
  generation_id uuid,                               -- soft FK to generations.id (null for non-billable nodes)
  status text not null default 'queued',            -- 'queued' | 'running' | 'succeeded' | 'failed' | 'skipped'
  cost_cents int not null default 0,
  started_at timestamptz,
  ended_at timestamptz,
  error text
);

create index if not exists canvas_run_nodes_run_idx on public.canvas_run_nodes(run_id);
create index if not exists canvas_run_nodes_generation_idx on public.canvas_run_nodes(generation_id);

-- =====================================================================
-- RLS — mirrors the pattern in 20260511162640_canvases.sql.
-- Service role bypasses everything; authenticated users may access run rows
-- only when they own the parent canvas.
-- =====================================================================
alter table public.canvas_runs enable row level security;
alter table public.canvas_run_nodes enable row level security;

drop policy if exists "canvas_runs via parent" on public.canvas_runs;
create policy "canvas_runs via parent" on public.canvas_runs
  for all
  using (
    auth.role() = 'service_role' or
    exists (
      select 1 from public.canvases c
      where c.id = canvas_id and c.user_id::text = auth.uid()::text
    )
  )
  with check (
    auth.role() = 'service_role' or
    exists (
      select 1 from public.canvases c
      where c.id = canvas_id and c.user_id::text = auth.uid()::text
    )
  );

drop policy if exists "canvas_run_nodes via parent" on public.canvas_run_nodes;
create policy "canvas_run_nodes via parent" on public.canvas_run_nodes
  for all
  using (
    auth.role() = 'service_role' or
    exists (
      select 1
      from public.canvas_runs r
      join public.canvases c on c.id = r.canvas_id
      where r.id = run_id and c.user_id::text = auth.uid()::text
    )
  )
  with check (
    auth.role() = 'service_role' or
    exists (
      select 1
      from public.canvas_runs r
      join public.canvases c on c.id = r.canvas_id
      where r.id = run_id and c.user_id::text = auth.uid()::text
    )
  );
