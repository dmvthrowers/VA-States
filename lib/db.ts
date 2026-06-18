import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';

/**
 * Cloudflare bindings, available in route handlers and dynamically rendered
 * pages (all DB-touching pages are force-dynamic). During `next dev`,
 * initOpenNextCloudflareForDev() in next.config.mjs provides local emulation
 * (miniflare SQLite for D1, local R2) — run `npm run db:migrate:local` once.
 */
export function getDb(): D1Database {
  return getCloudflareContext().env.DB;
}

export function getMusicBucket(): R2Bucket {
  return getCloudflareContext().env.MUSIC_BUCKET;
}

/** divisions are stored as a JSON array string in D1. */
export function parseDivisions(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * SQL fragment matching rows whose JSON divisions array contains a value.
 * Use with one bound parameter (the division code).
 */
export const DIVISION_CONTAINS_SQL =
  "EXISTS (SELECT 1 FROM json_each(divisions) WHERE json_each.value = ?)";
