import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Creates a Supabase client using the SERVICE ROLE key.
 *
 * ⚠️  SERVER-SIDE ONLY — never import this in client components or pages.
 *     The service role key bypasses RLS and must not be exposed to the browser.
 *
 * Usage in Route Handlers (app/api/**/route.ts):
 *   const supabase = createServerClient();
 *   await supabase.from('reports').insert({ ... });
 */
export function createServerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  return createClient(url, key, {
    auth: {
      // Disable session persistence — this is a server-side client only
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Returns true if Supabase is configured (env vars are set).
 * Used to conditionally enable DB writes vs. stub fallback.
 */
export function isSupabaseConfigured(): boolean {
  return (
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
}
