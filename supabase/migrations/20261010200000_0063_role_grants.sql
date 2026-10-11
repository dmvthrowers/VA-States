-- 0063 (template 0044 + 0045): role grants (expand step; nothing reads this table until the identity code is deployed)
--
-- One account can hold several roles (docs/ROLES.md). A grant is (person, role, optional event). Roles
-- themselves live in lib/roles.ts, so adding a role never needs a migration: the check only guards the
-- shape of the text. event_id is null for "every event"; it becomes a real reference when events exist.
-- Revoking sets revoked_at, so the history stays. Service role only.
--
-- Backfill: every existing staff account gets one grant from its current `role`, so nothing changes for
-- anyone. The old column stays and keeps working; it is dropped in a later contract step.

create table if not exists public.vsyc_role_grants (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  auth_user_id uuid not null,
  role         text not null check (role ~ '^[a-z][a-z0-9_]{0,29}$'),
  event_id     text check (event_id is null or event_id ~ '^[a-z0-9][a-z0-9_-]{0,59}$'),
  granted_by   uuid,
  revoked_at   timestamptz
);

-- At most one live grant per person, role and event (null event = all events).
create unique index if not exists uq_vsyc_role_grants_live
  on public.vsyc_role_grants (auth_user_id, role, coalesce(event_id, ''))
  where revoked_at is null;

-- who revoked a grant (template 0045)
alter table public.vsyc_role_grants add column if not exists revoked_by uuid;

create index if not exists idx_vsyc_role_grants_user
  on public.vsyc_role_grants (auth_user_id) where revoked_at is null;

alter table public.vsyc_role_grants enable row level security;
drop policy if exists "service_role_all_role_grants" on public.vsyc_role_grants;
create policy "service_role_all_role_grants" on public.vsyc_role_grants
  for all using (auth.role() = 'service_role');

insert into public.vsyc_role_grants (auth_user_id, role)
select sa.auth_user_id, sa.role
from public.vsyc_staff_accounts sa
where not exists (
  select 1 from public.vsyc_role_grants g
  where g.auth_user_id = sa.auth_user_id and g.role = sa.role and g.event_id is null and g.revoked_at is null
);
