-- 0064 (template 0046, part 1): staff accounts can hold any role (expand step)
--
-- vsyc_staff_accounts.role was limited to judge, dj, audio_tech and admin. Roles now live in lib/roles.ts and are
-- granted through vsyc_role_grants (migration 0063), so the column only needs a sane shape. Existing rows are
-- unaffected. The old check is replaced by a shape check in the same transaction. Safe to run twice.
alter table public.vsyc_staff_accounts drop constraint if exists vsyc_staff_accounts_role_check;
alter table public.vsyc_staff_accounts drop constraint if exists vsyc_staff_accounts_role_shape;
alter table public.vsyc_staff_accounts
  add constraint vsyc_staff_accounts_role_shape check (role ~ '^[a-z][a-z0-9_]{0,29}$');
