import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function supabaseAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function authorized(request: Request): boolean {
  const auth = request.headers.get("x-admin-secret");
  return !ADMIN_SECRET || auth === ADMIN_SECRET;
}

async function exactCount(sb: NonNullable<ReturnType<typeof supabaseAdmin>>, table: string, column: string, value: string) {
  const { count, error } = await sb.from(table).select("*", { count: "exact", head: true }).eq(column, value);
  if (error) throw error;
  return count ?? 0;
}

async function tableCount(sb: NonNullable<ReturnType<typeof supabaseAdmin>>, table: string) {
  const { count, error } = await sb.from(table).select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });

  try {
    const [
      newCandidates,
      reviewingCandidates,
      approvedCandidates,
      promotedCandidates,
      publishedDocuments,
      verifiedDocuments,
      needsReviewClaims,
      verifiedClaims,
      claimSources,
    ] = await Promise.all([
      exactCount(sb, "topic_candidates", "status", "new"),
      exactCount(sb, "topic_candidates", "status", "reviewing"),
      exactCount(sb, "topic_candidates", "status", "approved"),
      exactCount(sb, "topic_candidates", "status", "promoted"),
      exactCount(sb, "documents", "status", "published"),
      exactCount(sb, "documents", "status", "verified"),
      exactCount(sb, "claims", "status", "needs_review"),
      exactCount(sb, "claims", "status", "verified"),
      tableCount(sb, "claim_sources"),
    ]);

    const [{ data: approvedQueue, error: approvedError }, { data: reviewClaims, error: claimsError }, { data: verifiedDocs, error: docsError }] = await Promise.all([
      sb.from("topic_candidates").select("id, title, slug, category, status, created_at").eq("status", "approved").order("created_at", { ascending: true }).limit(5),
      sb.from("claims").select("id, field_path, claim_text, claim_value, status, documents(id, slug, lang, title)").eq("status", "needs_review").order("updated_at", { ascending: true }).limit(5),
      sb.from("documents").select("id, slug, lang, title, status, last_verified_at").eq("status", "verified").order("last_verified_at", { ascending: false }).limit(5),
    ]);

    if (approvedError) throw approvedError;
    if (claimsError) throw claimsError;
    if (docsError) throw docsError;

    return NextResponse.json({
      counts: {
        new_candidates: newCandidates,
        reviewing_candidates: reviewingCandidates,
        approved_candidates: approvedCandidates,
        promoted_candidates: promotedCandidates,
        published_documents: publishedDocuments,
        verified_documents: verifiedDocuments,
        needs_review_claims: needsReviewClaims,
        verified_claims: verifiedClaims,
        claim_sources: claimSources,
      },
      today: {
        needs_review_claims: reviewClaims ?? [],
        approved_candidates: approvedQueue ?? [],
      },
      verified_documents: verifiedDocs ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "dashboard query failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
