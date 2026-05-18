-- Canvas sync: optimistic locking + cross-tab edit tracking.
-- Additive only — no destructive changes. Existing rows get version = 1.
--
-- Protocol:
--   Client GETs canvas → receives `version`.
--   Client PUTs canvas with `expectedVersion`. Server compares to current.
--     mismatch  → 409 { currentVersion }
--     match     → bump version, write rows, return { newVersion }
--   `last_edited_by_session` lets the client detect that another tab/browser
--   updated the canvas (their session id differs from ours).
--
-- The version bump happens in the trigger so any update path increments it,
-- not just our service-role saves. This is defensive — we want stale clients
-- to lose, period.

-- =====================================================================
-- canvases.version + canvases.last_edited_by_session
-- =====================================================================
alter table public.canvases
  add column if not exists version int not null default 1;

alter table public.canvases
  add column if not exists last_edited_by_session text;

-- =====================================================================
-- Replace touch trigger function with a version-bumping variant for canvases.
-- We keep the generic touch_updated_at() for canvas_nodes (no version there)
-- and introduce a canvas-specific trigger function that also increments
-- `version` whenever any row column actually changes.
-- =====================================================================
create or replace function public.canvases_touch_and_bump()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  -- Only bump version when meaningful fields change (not when only updated_at
  -- itself is touched). This protects against trigger recursion and avoids
  -- spurious bumps from a no-op UPDATE.
  if (
    new.title is distinct from old.title
    or new.viewport_json is distinct from old.viewport_json
    or new.last_edited_by_session is distinct from old.last_edited_by_session
  ) then
    new.version = coalesce(old.version, 1) + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists canvases_touch on public.canvases;
create trigger canvases_touch before update on public.canvases
  for each row execute function public.canvases_touch_and_bump();
