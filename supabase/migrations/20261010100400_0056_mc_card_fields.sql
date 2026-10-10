-- 0056 MC cards (master plan T4): what the announcer needs on the card, as the player gave it at sign-up.
-- All optional. ADDITIVE: nullable columns. Same change as the template's 0056. Safe to run twice.

alter table public.vsyc_registrations add column if not exists name_pronunciation text check (name_pronunciation is null or length(name_pronunciation) <= 60);
alter table public.vsyc_registrations add column if not exists intro_note        text check (intro_note is null or length(intro_note) <= 200);
alter table public.vsyc_registrations add column if not exists sponsor_name      text check (sponsor_name is null or length(sponsor_name) <= 80);
