-- 0057 Open books (master plan O4): more cost categories, and planned figures next to actuals.
-- * category: widened from (sponsor, merch, other) so costs show by category on the public budget page.
-- * planned:  true for a figure published before the event. Planned rows never count toward actual totals or
--             the fundraising goal.
-- Additive for data: existing rows keep their category and are actual (planned = false). The check is replaced by a
-- wider one in the same statement block; every existing row already satisfies it. Same change as the template's 0057.
-- Safe to run twice.

alter table public.vsyc_budget_entries drop constraint if exists vsyc_budget_entries_category_check;
alter table public.vsyc_budget_entries add constraint vsyc_budget_entries_category_check
  check (category in ('registration', 'sponsor', 'merch', 'spectator', 'venue', 'prizes', 'equipment', 'printing', 'food', 'insurance', 'other'));

alter table public.vsyc_budget_entries add column if not exists planned boolean not null default false;
