-- 0061: answers to the forms on our own system (additive; build plan 5.1, docs/FORMS.md)
--
-- One table for every form described in contest.config.ts (`contest.forms`). `answers` holds the cleaned answers
-- keyed by field id, so adding a field to a form needs no migration. The public form posts through the API,
-- never straight to the table; only the service role reads and writes it, and staff see rows through the API
-- (capability `forms.review`). Rows can hold personal details: set a retention rule before collecting anything
-- sensitive (docs/SEASON_ARCHIVE.md). Nothing is deleted by this migration.

create table if not exists public.vsyc_form_submissions (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  form_id     text not null check (form_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(form_id) <= 60),
  status      text not null default 'new' check (status in ('new', 'read', 'handled', 'dismissed')),
  answers     jsonb not null check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 20000),
  note        text check (note is null or length(note) <= 2000),
  handled_by  uuid,
  handled_at  timestamptz
);

create index if not exists idx_vsyc_form_submissions_form on public.vsyc_form_submissions (form_id, status, created_at desc);

alter table public.vsyc_form_submissions enable row level security;
drop policy if exists "service_role_all_form_submissions" on public.vsyc_form_submissions;
create policy "service_role_all_form_submissions" on public.vsyc_form_submissions
  for all using (auth.role() = 'service_role');
