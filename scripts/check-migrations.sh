#!/usr/bin/env bash
# Replay every migration on an empty plain-Postgres database (build plan 4.2). Catches migrations that only work
# on a database that already has history, and any public table left without row level security.
#
#   DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres scripts/check-migrations.sh
#
# supabase/ci/supabase-stubs.sql stands in for Supabase's built-in schemas. Never run this on a real project.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?set DATABASE_URL to an empty Postgres 15+ database}"
psql_() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q "$@"; }

psql_ -f supabase/ci/supabase-stubs.sql
for f in $(ls supabase/migrations/*.sql | sort); do
  echo "apply ${f##*/}"
  psql_ -f "$f" > /dev/null
done

# Every public table must have row level security on.
missing=$(psql_ -At -c "select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity")
if [ -n "$missing" ]; then
  echo "RLS is off on: $missing" >&2
  exit 1
fi
echo "migrations OK: $(ls supabase/migrations/*.sql | wc -l) files, RLS on every table"
