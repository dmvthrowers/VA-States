-- 0065 (template 0047): run sheets for the stream, media, MC and merch modules (additive)
--
-- One small table serves four screens: a stream run-of-show and checklist, a media shot list, the MC's
-- script and shout-outs, and the merch table's stock list. Each row is a titled item with a status.
-- merch rows use `qty`; media rows can carry a `link` (a shared album or file). Service role only.

create table if not exists public.vsyc_module_items (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  module     text not null check (module in ('stream', 'media', 'mc', 'merch')),
  title      text not null check (length(title) between 1 and 160),
  body       text check (body is null or length(body) <= 2000),
  status     text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  position   integer not null default 0,
  qty        integer check (qty is null or qty >= 0),
  link       text check (link is null or (length(link) <= 500 and link ~ '^https://')),
  updated_by uuid
);

create index if not exists idx_vsyc_module_items_module on public.vsyc_module_items (module, position, created_at);

drop trigger if exists vsyc_module_items_updated_at on public.vsyc_module_items;
create trigger vsyc_module_items_updated_at
  before update on public.vsyc_module_items
  for each row execute function set_updated_at();

alter table public.vsyc_module_items enable row level security;
drop policy if exists "service_role_all_module_items" on public.vsyc_module_items;
create policy "service_role_all_module_items" on public.vsyc_module_items
  for all using (auth.role() = 'service_role');
