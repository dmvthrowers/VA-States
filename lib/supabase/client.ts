import { createClient } from '@supabase/supabase-js';

/**
 * Browser-safe anon client. Read-only access per RLS policies.
 * Safe to use in client components for public data only.
 */
export function createBrowserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
