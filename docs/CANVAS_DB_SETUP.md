# Canvas DB Setup

Production setup for the canvas surfaces (`/canvas`, `/canvas/[id]`). Once these
migrations are applied, the index page stops falling back to `/canvas/demo` and
the editor persists everything (graph, viewport, generation history, runs).

## Migrations

Apply in this exact order (filenames are timestamped so `supabase db push`
honors them):

1. `supabase/migrations/20260511162640_canvases.sql`
   - Creates `canvases`, `canvas_nodes`, `canvas_edges`.
   - Adds RLS policies (service-role bypass + owner-only read/write).
   - Adds `user_profiles.last_seen_release_version` + `onboarded_at` (used by
     the "What's New" sheet — keep applied even if you're skipping canvases).
2. `supabase/migrations/20260511170733_canvas_sync.sql`
   - Adds `canvases.version` (int, default 1) + `canvases.last_edited_by_session`
     (text, nullable).
   - Replaces the `canvases_touch` trigger with `canvases_touch_and_bump()`
     which increments `version` only when `title`, `viewport_json`, or
     `last_edited_by_session` actually changes. This is what powers the
     optimistic-locking 409 path.
3. `supabase/migrations/20260511171500_canvas_runs.sql`
   - Creates `canvas_runs` (run header) + `canvas_run_nodes` (per-node telemetry).
   - Adds parallel RLS policies (owner-via-parent canvas).
   - `canvas_run_nodes.generation_id` is a soft FK into the existing
     `generations` table so we inherit billing/output without duplication.

### Apply

Supabase CLI (recommended for prod):

```bash
# Link to the project once
supabase link --project-ref <ref>

# Push pending migrations
supabase db push

# Or apply them one at a time (useful when retroactively migrating prod)
supabase migration up
```

Direct psql (for emergencies):

```bash
psql "$DATABASE_URL" \
  -f supabase/migrations/20260511162640_canvases.sql \
  -f supabase/migrations/20260511170733_canvas_sync.sql \
  -f supabase/migrations/20260511171500_canvas_runs.sql
```

The SQL is idempotent (`create table if not exists`, `add column if not exists`,
`drop trigger if exists` before each `create trigger`), so re-running is safe.

## Tables created

| Table | Purpose |
|---|---|
| `canvases` | Graph header. `user_id`, `title`, `viewport_json`, `version`, `last_edited_by_session`. |
| `canvas_nodes` | Positioned nodes. `client_node_id` is the stable IR id; `data_json` holds prompt/params/status/`generationHistory`. |
| `canvas_edges` | Typed connections between nodes (handle-to-handle). |
| `canvas_runs` | One row per "Run" press. `status`, `started_at`, `ended_at`, `actual_cost_cents`. |
| `canvas_run_nodes` | Per-node telemetry inside a run. Soft FK to `generations.id`. |

## Required environment variables

Server-side (Next.js API routes, `sbAdmin`):

- `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL` as fallback)
- `SUPABASE_SERVICE_ROLE_KEY` — used by `sbAdmin` for all canvas reads/writes.

Client-side (browser bundles):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Whop:

- `WHOP_API_KEY` — used by `verifyWhopTokenAndGetProfile()` to fetch usernames.
- `NEXT_PUBLIC_WHOP_APP_ID` — used by the Whop SDK constructor on both sides.

## RLS assumption

All canvas reads/writes go through server route handlers using the service
role (`sbAdmin` in `lib/supabaseAdmin.ts`), which bypasses RLS. The RLS
policies installed by migration #1 and #3 are **defense-in-depth only** —
they exist so that if anyone ever points a public Supabase anon-key client at
these tables, they'll see nothing unless they're authenticated as the owner.

The browser **never** queries `canvases` / `canvas_nodes` / `canvas_edges` /
`canvas_runs` / `canvas_run_nodes` directly. Every read goes through:

- `GET /api/canvas` (list)
- `GET /api/canvas/[id]` (load + version + lastEditedBySession)
- `GET /api/canvas/[id]/runs` (list runs)
- `GET /api/canvas/[id]/runs/[runId]` (run + per-node detail + generations)

Every write goes through:

- `POST /api/canvas` (create + optional template seed)
- `PUT /api/canvas/[id]` (save — sends `expectedVersion` + `sessionId`)
- `DELETE /api/canvas/[id]` (delete — cascades to nodes/edges/runs)
- `POST /api/canvas/[id]/runs` (start run row)
- `POST /api/canvas/[id]/runs/[runId]/nodes` (per-node telemetry)
- `PATCH /api/canvas/[id]/runs/[runId]` (finalize run)

Every route gates on Whop auth via `verifyWhopTokenAndGetProfile()` and scopes
queries with `.eq('user_id', userId)` (canvas-level) or
`assertCanvasOwnership` / `assertRunOwnership` (run-level).

## Smoke-test

```bash
# Set env, then:
npx tsx scripts/canvas-db-smoke.ts
```

The script creates a synthetic canvas, saves nodes + edges + a generation
history entry, reloads it, verifies the shape round-trips, and deletes it
(confirming the cascade fires). See `scripts/canvas-db-smoke.ts`.

## Verification checklist

After applying migrations, verify these flows in the running app:

- [ ] Visit `/canvas` while authenticated. The page does **not** toast
      "Canvases DB not linked yet".
- [ ] Pick a template. You should land on `/canvas/<uuid>` with the template
      graph rendered.
- [ ] Edit a node. After ~1.5s, the TopBar's "saved" indicator updates.
- [ ] Open the same canvas in a second browser tab. Edit in tab A, then try
      to save in tab B without refreshing. Tab B should toast "Canvas was
      edited in another tab — refreshed." and snap to tab A's state.
- [ ] Run the canvas. A row should appear in `canvas_runs` with
      `status = 'succeeded'` after completion, and one row per executed node
      in `canvas_run_nodes`.
