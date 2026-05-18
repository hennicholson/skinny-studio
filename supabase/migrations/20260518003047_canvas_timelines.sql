-- Canvas timelines: per-canvas video timeline document + user-uploaded assets
-- + Supabase Storage buckets for rendered MP4s and user-uploaded audio/video.
--
-- The Timeline IR (see lib/timeline/ir.ts) is stored as a single jsonb blob on
-- canvas_timelines.document. We persist render metadata as columns alongside
-- the doc for easy querying. Uploads (user-provided audio/video assets
-- referenced by clips) get their own table so we can enforce per-user storage
-- ownership independently of the timeline doc lifecycle.
--
-- One timeline per canvas for v0 (UNIQUE constraint on canvas_id). When/if we
-- support multiple timelines per canvas, drop the unique constraint and add a
-- `slug` or `title` column.
--
-- ALL rendering happens in the user's browser via FFmpeg.wasm. The server just
-- stores the resulting MP4 in `canvas-renders/{user_id}/{timeline_id}-{ts}.mp4`
-- and records the URL in canvas_timelines.last_rendered_url. No server-side
-- FFmpeg, no transcoding queue.

-- =====================================================================
-- canvas_timelines
-- =====================================================================
create table if not exists public.canvas_timelines (
  id uuid primary key default gen_random_uuid(),
  canvas_id uuid not null references public.canvases(id) on delete cascade,
  user_id uuid not null,                          -- whop-derived UUID; mirrors canvases.user_id
  document jsonb not null default '{}'::jsonb,    -- Timeline IR (tracks, clips, uploads, fps, width, height)
  duration_seconds numeric not null default 0,
  last_rendered_url text,
  last_rendered_at timestamptz,
  render_status text not null default 'idle'
    check (render_status in ('idle', 'rendering', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (canvas_id)                              -- v0: one timeline per canvas
);

create index if not exists canvas_timelines_canvas_idx on public.canvas_timelines(canvas_id);
create index if not exists canvas_timelines_user_idx on public.canvas_timelines(user_id);
create index if not exists canvas_timelines_updated_at_idx on public.canvas_timelines(updated_at desc);

-- =====================================================================
-- canvas_timeline_uploads
-- User-uploaded audio/video assets referenced by timeline clips. The file
-- itself lives in the canvas-timeline-uploads bucket at
-- {user_id}/{upload_id}-{filename}; storage_path is the bucket-relative key.
-- =====================================================================
create table if not exists public.canvas_timeline_uploads (
  id uuid primary key default gen_random_uuid(),
  timeline_id uuid not null references public.canvas_timelines(id) on delete cascade,
  user_id uuid not null,                          -- whop-derived UUID; mirrors canvas_timelines.user_id
  storage_path text not null,                     -- bucket-relative path
  filename text,
  content_type text,
  duration_seconds numeric,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create index if not exists canvas_timeline_uploads_timeline_idx
  on public.canvas_timeline_uploads(timeline_id);
create index if not exists canvas_timeline_uploads_user_idx
  on public.canvas_timeline_uploads(user_id);

-- =====================================================================
-- updated_at trigger for canvas_timelines.
-- Reuses public.touch_updated_at() from 20260511162640_canvases.sql.
-- =====================================================================
drop trigger if exists canvas_timelines_touch on public.canvas_timelines;
create trigger canvas_timelines_touch before update on public.canvas_timelines
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- RLS — mirrors the canvases pattern.
-- Service role bypasses; authenticated users may access rows they own.
-- The app uses sbAdmin (service role) for all writes, so these policies are
-- defense-in-depth for direct anon-key access.
-- =====================================================================
alter table public.canvas_timelines enable row level security;
alter table public.canvas_timeline_uploads enable row level security;

drop policy if exists "canvas_timelines owner" on public.canvas_timelines;
create policy "canvas_timelines owner" on public.canvas_timelines
  for all
  using (auth.uid()::text = user_id::text or auth.role() = 'service_role')
  with check (auth.uid()::text = user_id::text or auth.role() = 'service_role');

drop policy if exists "canvas_timeline_uploads owner" on public.canvas_timeline_uploads;
create policy "canvas_timeline_uploads owner" on public.canvas_timeline_uploads
  for all
  using (auth.uid()::text = user_id::text or auth.role() = 'service_role')
  with check (auth.uid()::text = user_id::text or auth.role() = 'service_role');

-- =====================================================================
-- Storage buckets
--   canvas-renders          — final rendered MP4s; public read.
--   canvas-timeline-uploads — user-uploaded source assets; authenticated read.
-- Both: owner-write only, enforced via storage.objects RLS below.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('canvas-renders', 'canvas-renders', true, 209715200,
    array['video/mp4', 'video/quicktime', 'video/webm']),
  ('canvas-timeline-uploads', 'canvas-timeline-uploads', false, 52428800,
    array[
      'video/mp4', 'video/quicktime', 'video/webm',
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav',
      'audio/ogg', 'audio/aac', 'audio/x-m4a', 'audio/mp4'
    ])
on conflict (id) do nothing;

-- =====================================================================
-- storage.objects RLS — own-prefix access only.
-- Path convention: {user_id}/<anything>. The first path segment must match
-- auth.uid() for non-service-role callers. Service role bypasses (it's the
-- only thing that writes from the server today; signed upload URLs we hand
-- out to the client are scoped to the user's prefix at issue time).
--
-- canvas-renders is public-read (we expose rendered MP4s as <video> sources),
-- so we only need write/delete policies. canvas-timeline-uploads is private,
-- so we need a read policy too — the client fetches the audio/video via the
-- service role's signed-download URL, but RLS still applies when the user
-- accesses storage directly with their session token.
-- =====================================================================

-- canvas-renders: owner can write/update/delete their prefix.
drop policy if exists "canvas-renders owner insert" on storage.objects;
create policy "canvas-renders owner insert" on storage.objects
  for insert
  with check (
    bucket_id = 'canvas-renders'
    and (
      auth.role() = 'service_role'
      or (auth.uid()::text = (storage.foldername(name))[1])
    )
  );

drop policy if exists "canvas-renders owner update" on storage.objects;
create policy "canvas-renders owner update" on storage.objects
  for update
  using (
    bucket_id = 'canvas-renders'
    and (
      auth.role() = 'service_role'
      or (auth.uid()::text = (storage.foldername(name))[1])
    )
  )
  with check (
    bucket_id = 'canvas-renders'
    and (
      auth.role() = 'service_role'
      or (auth.uid()::text = (storage.foldername(name))[1])
    )
  );

drop policy if exists "canvas-renders owner delete" on storage.objects;
create policy "canvas-renders owner delete" on storage.objects
  for delete
  using (
    bucket_id = 'canvas-renders'
    and (
      auth.role() = 'service_role'
      or (auth.uid()::text = (storage.foldername(name))[1])
    )
  );

-- canvas-timeline-uploads: authenticated read on own prefix + owner write.
drop policy if exists "canvas-timeline-uploads owner select" on storage.objects;
create policy "canvas-timeline-uploads owner select" on storage.objects
  for select
  using (
    bucket_id = 'canvas-timeline-uploads'
    and (
      auth.role() = 'service_role'
      or (auth.uid()::text = (storage.foldername(name))[1])
    )
  );

drop policy if exists "canvas-timeline-uploads owner insert" on storage.objects;
create policy "canvas-timeline-uploads owner insert" on storage.objects
  for insert
  with check (
    bucket_id = 'canvas-timeline-uploads'
    and (
      auth.role() = 'service_role'
      or (auth.uid()::text = (storage.foldername(name))[1])
    )
  );

drop policy if exists "canvas-timeline-uploads owner update" on storage.objects;
create policy "canvas-timeline-uploads owner update" on storage.objects
  for update
  using (
    bucket_id = 'canvas-timeline-uploads'
    and (
      auth.role() = 'service_role'
      or (auth.uid()::text = (storage.foldername(name))[1])
    )
  )
  with check (
    bucket_id = 'canvas-timeline-uploads'
    and (
      auth.role() = 'service_role'
      or (auth.uid()::text = (storage.foldername(name))[1])
    )
  );

drop policy if exists "canvas-timeline-uploads owner delete" on storage.objects;
create policy "canvas-timeline-uploads owner delete" on storage.objects
  for delete
  using (
    bucket_id = 'canvas-timeline-uploads'
    and (
      auth.role() = 'service_role'
      or (auth.uid()::text = (storage.foldername(name))[1])
    )
  );
