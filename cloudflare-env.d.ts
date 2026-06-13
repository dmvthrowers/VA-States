import type { D1Database, Fetcher, R2Bucket } from '@cloudflare/workers-types';

declare global {
  // Bindings declared in wrangler.jsonc; consumed via getCloudflareContext().
  interface CloudflareEnv {
    DB: D1Database;
    MUSIC_BUCKET: R2Bucket;
    ASSETS: Fetcher;
  }
}

export {};
