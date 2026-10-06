-- 0049: editable sponsor form settings (additive)
--
-- Tiers (name, price text, slots, perks) and the form's option lists are defaults in contest.config.ts.
-- Staff with sponsors.manage can change them on /sponsors/form; the saved copy lives here as one row and
-- wins over the config. Deleting the row restores the config defaults. Service role only.

create table if not exists public.vsyc_sponsor_form (
  id          boolean primary key default true check (id),
  settings    jsonb not null check (jsonb_typeof(settings) = 'object'),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

alter table public.vsyc_sponsor_form enable row level security;
drop policy if exists "service_role_all_sponsor_form" on public.vsyc_sponsor_form;
create policy "service_role_all_sponsor_form" on public.vsyc_sponsor_form
  for all using (auth.role() = 'service_role');
