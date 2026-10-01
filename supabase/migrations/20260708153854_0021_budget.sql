-- VSYC-26 budget tracking: manual income/expense entries (sponsor funds, merch,
-- misc costs) plus a single fundraising goal, so admin can enter figures as they
-- come in and the public transparency page can show progress against the goal.
-- Registration income is NOT stored here — it's computed live from
-- vsyc_registrations.fee_cents where paid = true.

CREATE TABLE IF NOT EXISTS vsyc_budget_entries (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  entry_type   text not null check (entry_type in ('income', 'expense')),
  category     text not null check (category in ('sponsor', 'merch', 'other')),
  description  text not null,
  amount_cents integer not null check (amount_cents >= 0),
  entry_date   date not null default current_date,

  created_by   uuid references auth.users(id)
);

create index idx_vsyc_budget_entries_type on vsyc_budget_entries (entry_type);
create index idx_vsyc_budget_entries_category on vsyc_budget_entries (category);

create trigger vsyc_budget_entries_updated_at
  before update on vsyc_budget_entries
  for each row execute function set_updated_at();

alter table vsyc_budget_entries enable row level security;
create policy "service_role_all_budget_entries" on vsyc_budget_entries
  for all using (auth.role() = 'service_role');

-- Singleton row holding the public fundraising goal (in cents).
CREATE TABLE IF NOT EXISTS vsyc_budget_goal (
  id         boolean primary key default true check (id),
  goal_cents integer not null default 0 check (goal_cents >= 0),
  updated_at timestamptz not null default now()
);

create trigger vsyc_budget_goal_updated_at
  before update on vsyc_budget_goal
  for each row execute function set_updated_at();

alter table vsyc_budget_goal enable row level security;
create policy "service_role_all_budget_goal" on vsyc_budget_goal
  for all using (auth.role() = 'service_role');

INSERT INTO vsyc_budget_goal (id, goal_cents) VALUES (true, 0)
ON CONFLICT (id) DO NOTHING;
