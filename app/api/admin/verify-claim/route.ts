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

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });

  const { data, error } = await sb
    .from("documents")
    .select("*, entities(*), claims(*, claim_sources(*))")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ documents: data ?? [] });
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });

  const body = await request.json();
  const claimId = String(body.claim_id ?? "").trim();
  const claimValue = String(body.claim_value ?? "").trim();
  const sourceType = String(body.source_type ?? "official").trim();
  const title = String(body.title ?? "").trim() || null;
  const url = String(body.url ?? "").trim() || null;
  const citation = String(body.citation ?? "").trim() || null;
  const observedAt = String(body.observed_at ?? new Date().toISOString()).trim();
  const confidence = String(body.confidence ?? "high").trim();
  const allowedSources = new Set(["official", "platform", "review", "user", "phone", "photo", "document", "web", "other", "unknown"]);
  const allowedConfidence = new Set(["medium", "high"]);

  if (!claimId || !claimValue || claimValue === "확인 필요") return NextResponse.json({ error: "claim_id and verified claim_value are required" }, { status: 400 });
  if (!title && !url && !citation) return NextResponse.json({ error: "at least one source title, url, or citation is required" }, { status: 400 });
  if (!allowedSources.has(sourceType) || !allowedConfidence.has(confidence)) return NextResponse.json({ error: "invalid source_type or confidence" }, { status: 400 });

  const { data: existingClaim, error: fetchError } = await sb
    .from("claims")
    .select("id, document_id, entity_id, status, confidence")
    .eq("id", claimId)
    .single();
  if (fetchError || !existingClaim) return NextResponse.json({ error: "claim not found", detail: fetchError?.message }, { status: 404 });

  const now = new Date().toISOString();
  const sourceId = `src-${claimId}-${Date.now()}`;
  const { error: sourceError } = await sb.from("claim_sources").insert({
    id: sourceId,
    claim_id: claimId,
    source_type: sourceType,
    title,
    url,
    citation,
    observed_at: observedAt,
  });
  if (sourceError) return NextResponse.json({ error: "source insert failed", detail: sourceError.message }, { status: 500 });

  const { data: updatedClaim, error: claimError } = await sb
    .from("claims")
    .update({ claim_value: claimValue, confidence, status: "verified", last_verified_at: observedAt, updated_at: now })
    .eq("id", claimId)
    .select("*")
    .single();
  if (claimError) {
    await sb.from("claim_sources").delete().eq("id", sourceId);
    return NextResponse.json({ error: "claim update failed", detail: claimError.message }, { status: 500 });
  }

  await sb.from("verification_events").insert({
    claim_id: claimId,
    event_type: "status_changed",
    previous_status: existingClaim.status,
    new_status: "verified",
    previous_confidence: existingClaim.confidence,
    new_confidence: confidence,
    note: citation ?? title ?? url,
  });

  const { data: siblingClaims } = await sb.from("claims").select("status").eq("document_id", existingClaim.document_id);
  const allVerified = (siblingClaims ?? []).length > 0 && (siblingClaims ?? []).every((claim) => claim.status === "verified");
  await sb.from("documents").update({
    status: allVerified ? "verified" : "published",
    confidence: allVerified ? "high" : "low",
    last_verified_at: allVerified ? observedAt : null,
    updated_at: now,
  }).eq("id", existingClaim.document_id);

  return NextResponse.json({ claim: updatedClaim, source_id: sourceId, document_all_verified: allVerified });
}
