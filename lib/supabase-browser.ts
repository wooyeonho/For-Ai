import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let singleton: SupabaseClient | null | undefined;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (singleton !== undefined) return singleton;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  singleton = url && anonKey ? createClient(url, anonKey) : null;
  return singleton;
}
