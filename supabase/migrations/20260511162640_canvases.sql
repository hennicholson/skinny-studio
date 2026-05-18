-- Canvas / node-graph workspace.
-- Three tables: canvases (header), canvas_nodes (positioned graph nodes),
-- canvas_edges (typed connections). Generated assets remain in `generations`;
-- canvas_nodes.generation_id is a soft FK to that table so the canvas inherits
-- existing billing + history.


-- =====================================================================
-- canvases
-- =====================================================================
create table if not exists public.canvases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,                          -- whop-derived UUID; matches user_profiles.whop_user_id
  title text not null default 'Untitled canvas',
  viewport_json jsonb not null default '{"x":0,"y":0,"zoom":1}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists canvases_user_id_idx on public.canvases(user_id);
create index if not exists canvases_updated_at_idx on public.canvases(updated_at desc);

-- =====================================================================
-- canvas_nodes
-- =====================================================================
create table if not exists public.canvas_nodes (
  id uuid primary key default gen_random_uuid(),
  canvas_id uuid not null references public.canvases(id) on delete cascade,
  client_node_id text not null,                   -- client-generated stable id used by the IR/edges
  type text not null,                             -- 'text-prompt' | 'image-gen' | 'video-gen' | ...
  position_x numeric not null default 0,
  position_y numeric not null default 0,
  data_json jsonb not null default '{}'::jsonb,   -- model slug, params, prompt, status, outputUrls...
  generation_id uuid,                             -- soft FK to generations.id when this node ran
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (canvas_id, client_node_id)
);

create index if not exists canvas_nodes_canvas_idx on public.canvas_nodes(canvas_id);

-- =====================================================================
-- canvas_edges
-- =====================================================================
create table if not exists public.canvas_edges (
  id uuid primary key default gen_random_uuid(),
  canvas_id uuid not null references public.canvases(id) on delete cascade,
  client_edge_id text not null,
  source_client_node_id text not null,
  source_handle text not null,
  target_client_node_id text not null,
  target_handle text not null,
  created_at timestamptz not null default now(),
  unique (canvas_id, client_edge_id)
);

create index if not exists canvas_edges_canvas_idx on public.canvas_edges(canvas_id);

-- =====================================================================
-- updated_at triggers
-- =====================================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists canvases_touch on public.canvases;
create trigger canvases_touch before update on public.canvases
  for each row execute function public.touch_updated_at();

drop trigger if exists canvas_nodes_touch on public.canvas_nodes;
create trigger canvas_nodes_touch before update on public.canvas_nodes
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- RLS — service role bypasses; authenticated reads gated by user_id.
-- The app uses the service role on the server (sbAdmin), so policies here
-- are a defense-in-depth layer for direct anon-key access.
-- =====================================================================
alter table public.canvases enable row level security;
alter table public.canvas_nodes enable row level security;
alter table public.canvas_edges enable row level security;

drop policy if exists "canvases owner" on public.canvases;
create policy "canvases owner" on public.canvases
  for all
  using (auth.uid()::text = user_id::text or auth.role() = 'service_role')
  with check (auth.uid()::text = user_id::text or auth.role() = 'service_role');

drop policy if exists "canvas_nodes via parent" on public.canvas_nodes;
create policy "canvas_nodes via parent" on public.canvas_nodes
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

drop policy if exists "canvas_edges via parent" on public.canvas_edges;
create policy "canvas_edges via parent" on public.canvas_edges
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

-- =====================================================================
-- user_profiles.last_seen_release_version — drives the "What's New" sheet.
-- =====================================================================
alter table public.user_profiles
  add column if not exists last_seen_release_version text;
alter table public.user_profiles
  add column if not exists onboarded_at timestamptz;
