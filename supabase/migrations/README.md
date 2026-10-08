# Migrations

Each file is named `<version>_<name>.sql`, where `<version>` is the exact
version recorded in production's `supabase_migrations.schema_migrations`
for that migration. Supabase decides what is "already applied" by
`version` alone, so the filename timestamp must match production. A
mismatched timestamp makes an applied migration look unapplied to
`supabase db push` / branching.

Already applied to production, never rename or edit these files. Add new
migrations with a new timestamp (`supabase migration new <name>`, or the
`apply_migration` tool, which records the version for you), then make sure
the committed filename uses the version production recorded.

## Why the `00NN` labels aren't sequential

The `00NN_` part of each name is just a label, kept as production recorded
it. Supabase never reads it. Known quirks:

- **Two `0017`s**: `0017_public_read_policies_profiles_and_results` and
  `0017_staff_socials` are separate migrations, both applied.
- **No `0024`/`0025`**: those labels were never used; nothing is missing.
- **`0014`/`0015` sort after `0021`**: they were applied to production on
  2026-09-20, after `0021`, and file order follows the real apply order.
- The first six files and `enable_rls_run_order_scores` /
  `vsyc26_survey_responses` predate the `00NN` convention.

Renaming the labels would also mean rewriting production's migration
history, for no functional gain, so they stay as they are.


## Replaying from scratch

`scripts/check-migrations.sh` (run in CI as the `migrations` job) applies every file here, in order, to an empty
Postgres with `supabase/ci/supabase-stubs.sql` standing in for Supabase's built-in schemas, then checks that every
public table has row level security on. Seven older migrations (0010, 0012, 0014, 0015, 0017, 0018, 0022) got a
`DROP VIEW IF EXISTS` line at the top (0014 also before dropping its old columns) because a view they rebuild depends
on columns they alter; production applied them in an order where that did not matter. The edit changes nothing on a
database that already ran them. Do not use the stubs or the script on a real project.
