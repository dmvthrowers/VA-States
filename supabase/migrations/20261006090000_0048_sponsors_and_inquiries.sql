-- 0048: sponsor pipeline and public sponsor inquiries (additive)
--
-- vsyc_sponsors: the sponsor pipeline (prospect to paid) with deliverables, admin only.
-- vsyc_sponsor_inquiries: the public "Want to sponsor?" form at /sponsor writes here, kept apart from
-- vsyc_sponsors so an unvetted submission never counts as money. An admin reviews them on /sponsors and
-- either converts one into a prospect or dismisses it. Contact details are personal data: converted rows live
-- on in the pipeline, dismissed rows should be deleted after a set time (see the archive and purge plan).
-- Both tables are service role only. New tables only: nothing existing is altered.

create table if not exists public.vsyc_sponsors (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  name          text not null check (length(name) between 1 and 120),
  tier          text check (tier is null or length(tier) <= 60),
  status        text not null default 'prospect' check (status in ('prospect', 'contacted', 'committed', 'paid', 'declined')),
  amount_cents  integer not null default 0 check (amount_cents >= 0),
  in_kind       text check (in_kind is null or length(in_kind) <= 300),
  contact_name  text check (contact_name is null or length(contact_name) <= 120),
  contact_email text check (contact_email is null or length(contact_email) <= 320),
  notes         text check (notes is null or length(notes) <= 2000),
  -- [{ "label": "Logo on banner", "done": false }]
  deliverables  jsonb not null default '[]'::jsonb check (jsonb_typeof(deliverables) = 'array'),
  -- the sponsor's own staff login, if they have one
  auth_user_id  uuid
);

create index if not exists idx_vsyc_sponsors_status on public.vsyc_sponsors (status);
create index if not exists idx_vsyc_sponsors_user on public.vsyc_sponsors (auth_user_id) where auth_user_id is not null;

drop trigger if exists vsyc_sponsors_updated_at on public.vsyc_sponsors;
create trigger vsyc_sponsors_updated_at
  before update on public.vsyc_sponsors
  for each row execute function set_updated_at();

alter table public.vsyc_sponsors enable row level security;
drop policy if exists "service_role_all_sponsors" on public.vsyc_sponsors;
create policy "service_role_all_sponsors" on public.vsyc_sponsors
  for all using (auth.role() = 'service_role');

create table if not exists public.vsyc_sponsor_inquiries (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  status        text not null default 'new' check (status in ('new', 'converted', 'dismissed')),
  contact_first text not null check (length(contact_first) between 1 and 80),
  contact_last  text not null check (length(contact_last) between 1 and 80),
  email         text not null check (length(email) between 3 and 254 and email like '%_@_%'),
  phone         text check (phone is null or length(phone) <= 40),
  brand_name    text not null check (length(brand_name) between 1 and 160),
  social_handle text check (social_handle is null or length(social_handle) <= 100),
  contact_method text check (contact_method is null or length(contact_method) <= 60),
  website       text check (website is null or (length(website) <= 300 and website ~* '^https?://')),
  logo_url      text check (logo_url is null or (length(logo_url) <= 500 and logo_url ~* '^https?://')),
  -- a tier id or other-choice id from contest.sponsors in contest.config.ts
  tier          text not null check (length(tier) between 1 and 40),
  vendor_table  boolean,
  division_sponsor boolean,
  in_kind       boolean,
  retail_value_cents integer check (retail_value_cents is null or retail_value_cents between 0 and 100000000),
  -- how they would like to pay and who to bill, if not the contact (payment itself happens outside the form)
  payment_method text check (payment_method is null or length(payment_method) <= 60),
  billing_email text check (billing_email is null or (length(billing_email) between 3 and 254 and billing_email like '%_@_%')),
  -- how the name should read on the banner and in posts, if different from the brand name
  display_name  text check (display_name is null or length(display_name) <= 160),
  -- may product they include be used for prize bags, raffles and giveaways (credited to them)
  product_use_ok boolean,
  heard_from    text check (heard_from is null or length(heard_from) <= 80),
  notes         text check (notes is null or length(notes) <= 2000),
  sponsor_id    uuid references public.vsyc_sponsors (id) on delete set null,
  handled_by    uuid,
  handled_at    timestamptz
);

create index if not exists idx_vsyc_sponsor_inquiries_status on public.vsyc_sponsor_inquiries (status, created_at desc);

alter table public.vsyc_sponsor_inquiries enable row level security;
drop policy if exists "service_role_all_sponsor_inquiries" on public.vsyc_sponsor_inquiries;
create policy "service_role_all_sponsor_inquiries" on public.vsyc_sponsor_inquiries
  for all using (auth.role() = 'service_role');
