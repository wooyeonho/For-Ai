import "server-only";

import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Creates a Supabase client for server-side Route Handlers.
 *
 * Prefers SUPABASE_SERVICE_ROLE_KEY (bypasses RLS, never expose to client).
 * `createServerClient()` below may fall back to the public anon key for older
 * RLS-mediated routes. Private queues such as reports and source_suggestions
 * must use `createServiceRoleClient()` and fail closed when it is unavailable.
 *
 * Usage in Route Handlers (app/api/[resource]/route.ts):
 *   const supabase = createServerClient();
 *   await supabase.from('reports').insert({ ... });
 */
export function createServiceRoleClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function createServerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = serviceKey || anonKey;

  if (!url || !key) {
    throw new Error(
      'Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY)'
    );
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function isServiceRoleConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function isServiceRoleKeyConfigured(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function isSupabaseConfigured(): boolean {
  return (
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    (Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) ||
      Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY))
  );
}
