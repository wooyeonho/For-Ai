import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { documentPageUrl } from "../../../../lib/urls";

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

type SupabaseAdminClient = SupabaseClient;

function supabaseAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function authorized(request: Request): boolean {
  const auth = request.headers.get("x-admin-secret");
  return !ADMIN_SECRET || auth === ADMIN_SECRET;
}

async function countRows(
  sb: SupabaseAdminClient,
  table: string,
  filters: Record<string, string> = {},
): Promise<number> {
  let query = sb.from(table).select("id", { count: "exact", head: true });
  for (const [column, value] of Object.entries(filters)) query = query.eq(column, value);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

function publicDocumentLink(doc: { slug?: string | null; lang?: string | null }) {
  if (!doc.slug) return null;
  return documentPageUrl(doc.slug, doc.lang ?? "ko");
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });

  try {
    const [
      candidatesNew,
      candidatesApproved,
      documentsPublished,
      claimSources,
      claimsNeedsReview,
      claimsVerified,
      documentsVerified,
    ] = await Promise.all([
      countRows(sb, "topic_candidates", { status: "new" }),
      countRows(sb, "topic_candidates", { status: "approved" }),
      countRows(sb, "documents", { status: "published" }),
      countRows(sb, "claim_sources"),
      countRows(sb, "claims", { status: "needs_review" }),
      countRows(sb, "claims", { status: "verified" }),
      countRows(sb, "documents", { status: "verified" }),
    ]);

    const { data: priorityClaims, error: claimsError } = await sb
      .from("claims")
      .select("id, document_id, entity_id, field_path, claim_text, claim_value, confidence, status, documents(slug, lang, title, status)")
      .eq("status", "needs_review")
      .order("updated_at", { ascending: true })
      .limit(10);
    if (claimsError) throw claimsError;

    const { data: approvedCandidates, error: candidatesError } = await sb
      .from("topic_candidates")
      .select("id, title, slug, lang, category, risk_tier, status, created_at")
      .eq("status", "approved")
      .order("reviewed_at", { ascending: true, nullsFirst: false })
      .limit(10);
    if (candidatesError) throw candidatesError;

    const { data: verifiedDocuments, error: docsError } = await sb
      .from("documents")
      .select("id, title, slug, lang, status, last_verified_at")
      .eq("status", "verified")
      .order("last_verified_at", { ascending: false, nullsFirst: false })
      .limit(10);
    if (docsError) throw docsError;

    return NextResponse.json({
      counts: {
        candidates_new: candidatesNew,
        candidates_approved: candidatesApproved,
        documents_published: documentsPublished,
        claim_sources: claimSources,
        claims_needs_review: claimsNeedsReview,
        claims_verified: claimsVerified,
        documents_verified: documentsVerified,
      },
      priorities: {
        needs_review_claims: (priorityClaims ?? []).map((claim) => {
          const doc = Array.isArray(claim.documents) ? claim.documents[0] : claim.documents;
          return { ...claim, document_url: publicDocumentLink(doc ?? {}) };
        }),
        approved_candidates: approvedCandidates ?? [],
      },
      verified_documents: (verifiedDocuments ?? []).map((doc) => ({
        ...doc,
        public_url: publicDocumentLink(doc),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "admin review query failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
