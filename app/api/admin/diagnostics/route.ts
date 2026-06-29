import { AI_PROVIDERS } from "@/lib/ai-providers";
import { requireAdmin, supabaseAdmin } from "@/lib/admin-api";
import { NextResponse } from "next/server";

type SupabaseAdminClient = NonNullable<ReturnType<typeof supabaseAdmin>>;

const TABLES_TO_CHECK = [
  "topic_candidates",
  "entities",
  "documents",
  "claims",
  "claim_sources",
  "verification_events",
  "listings",
] as const;

type TableCheck = {
  accessible: boolean;
  count: number | null;
  error: string | null;
};

async function checkTableAccess(sb: SupabaseAdminClient, table: string): Promise<TableCheck> {
  const { count, error } = await sb
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) return { accessible: false, count: null, error: error.message };
  return { accessible: true, count: count ?? 0, error: null };
}

export async function GET(request: Request) {
  const adminError = requireAdmin(request, "admin.diagnostics");
  if (adminError) return adminError;

  const aiProviders = Object.fromEntries(
    Object.values(AI_PROVIDERS).map((provider) => [
      provider.key,
      Boolean(process.env[provider.envKey]),
    ]),
  );
  const hasAiProviderKey = Object.values(aiProviders).some(Boolean);
  const sb = supabaseAdmin();
  const hasSupabaseAdminClient = Boolean(sb);

  const tableAccess = sb
    ? Object.fromEntries(
        await Promise.all(
          TABLES_TO_CHECK.map(async (table) => [table, await checkTableAccess(sb, table)]),
        ),
      )
    : Object.fromEntries(
        TABLES_TO_CHECK.map((table) => [
          table,
          { accessible: false, count: null, error: "Supabase admin client is not configured" },
        ]),
      );

  return NextResponse.json({
    env: {
      admin_secret: Boolean(process.env.ADMIN_SECRET),
      next_public_supabase_url: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      supabase_service_role_key: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      ai_provider_key: hasAiProviderKey,
      ai_providers: aiProviders,
    },
    supabase: {
      admin_client: hasSupabaseAdminClient,
      tables: tableAccess,
    },
  });
}
