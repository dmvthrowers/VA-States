import { createClient } from '@supabase/supabase-js';

let adminClient: ReturnType<typeof createClient> | null = null;

export function hasAdminCredentials() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * Server-only admin client using the service role key.
 * NEVER import this in client components or expose to the browser.
 * Bypasses Row Level Security — use only in API routes.
 */
export function createAdminClient() {
  if (!hasAdminCredentials()) {
    throw new Error('Supabase admin credentials not configured');
  }

  if (!adminClient) {
    adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  }

  return adminClient;
}
