import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getAdminAuthContext, requireAdmin, supabaseAdmin } from "@/lib/admin-api";
import { SUPPORTED_LOCALES } from "@/lib/i18n/locales";
import { loadRegistryBundleWithPublicationState } from "@/lib/registry-publication";
import { claimVersionReference, readBoundedJsonObject } from "@/lib/task5-report-server";

const RPC_BY_ACTION = {
  quarantine: "quarantine_claim",
  restore: "restore_quarantined_claim",
  withdraw: "withdraw_claim",
} as const;

type PublicationAction = keyof typeof RPC_BY_ACTION;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function revalidateClaimOrigins(slug: string) {
  for (const locale of SUPPORTED_LOCALES) {
    const origin = `/${locale}/wiki/${slug}`;
    revalidatePath(origin);
    revalidatePath(`${origin}/opengraph-image`);
    revalidatePath(`${origin}/twitter-image`);
  }
  revalidatePath(`/api/documents/${slug}`);
  revalidatePath(`/api/cite/${slug}`);
  revalidatePath(`/api/badge/${slug}`);
  revalidatePath(`/api/corrections/${slug}`);
  revalidatePath(`/embed/${slug}`);
  revalidatePath(`/raw/${slug}.md`);
}

export async function GET(request: Request) {
  const denied = await requireAdmin(request, "claims.publication_state.read");
  if (denied) return denied;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const params = new URL(request.url).searchParams;
  const status = params.get("status")?.trim() || "open";
  const limit = Math.min(Math.max(Number.parseInt(params.get("limit") ?? "100", 10) || 100, 1), 200);
  let query = sb
    .from("reports")
    .select("id,reported_document_slug,reported_claim_id,reported_claim_version,claim_id,claim_version_id,report_type,issue_category,severity,message,reporter_contact,contact_consent,review_due_at,status,created_at")
    .not("reported_claim_id", "is", null)
    .order("review_due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(limit);
  if (status === "open") query = query.in("status", ["new", "reviewing"]);
  else if (status !== "all") query = query.eq("status", status);

  const { data: reports, error } = await query;
  if (error) return NextResponse.json({ error: "report_queue_unavailable" }, { status: 500 });

  const claimIds = Array.from(new Set((reports ?? []).map((report) => report.reported_claim_id).filter(Boolean))) as string[];
  const { data: dbClaims } = claimIds.length > 0
    ? await sb.from("claims").select("id,publication_state,documents(slug,title,lang)").in("id", claimIds)
    : { data: [] };
  const { data: overrides } = claimIds.length > 0
    ? await sb.from("legacy_claim_publication_overrides").select("claim_id,publication_state").in("claim_id", claimIds)
    : { data: [] };

  return NextResponse.json({
    reports: reports ?? [],
    db_claims: dbClaims ?? [],
    legacy_overrides: overrides ?? [],
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const parsedBody = await readBoundedJsonObject(request);
  if (!parsedBody.ok) {
    return NextResponse.json(
      { error: parsedBody.error },
      { status: parsedBody.error === "body_too_large" ? 413 : 400 },
    );
  }
  const body = parsedBody.body;

  const action = clean(body.action) as PublicationAction;
  if (!(action in RPC_BY_ACTION)) return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  const denied = await requireAdmin(request, `claims.${action}`);
  if (denied) return denied;

  const reportId = clean(body.report_id);
  const publicReason = clean(body.public_reason);
  const idempotencyKey = clean(body.idempotency_key);
  if (!reportId) return NextResponse.json({ error: "report_id_required" }, { status: 400 });
  if (publicReason.length < 3 || publicReason.length > 2000) {
    return NextResponse.json({ error: "public_reason_length" }, { status: 400 });
  }
  if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    return NextResponse.json({ error: "invalid_idempotency_key" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });
  const { data: report, error: reportError } = await sb
    .from("reports")
    .select("id,reported_document_slug,reported_claim_id,reported_claim_version")
    .eq("id", reportId)
    .maybeSingle();
  if (reportError || !report?.reported_claim_id || !report.reported_document_slug || !report.reported_claim_version) {
    return NextResponse.json({ error: "bound_report_not_found" }, { status: 404 });
  }

  const currentBundle = await loadRegistryBundleWithPublicationState(report.reported_document_slug);
  const currentClaim = currentBundle?.claims.find((claim) => claim.id === report.reported_claim_id);
  if (!currentClaim) {
    return NextResponse.json({ error: "reported_claim_no_longer_exists" }, { status: 409 });
  }
  if (claimVersionReference(currentClaim) !== report.reported_claim_version) {
    return NextResponse.json({ error: "stale_report_claim_version" }, { status: 409 });
  }

  const auth = getAdminAuthContext(request);
  const { data, error } = await sb.rpc(RPC_BY_ACTION[action], {
    p_claim_id: report.reported_claim_id,
    p_public_reason: publicReason,
    p_admin_user_id: auth?.adminUserId ?? null,
    p_admin_user_hash: auth?.adminUserHash ?? null,
    p_idempotency_key: idempotencyKey,
    p_report_id: report.id,
    p_document_slug: report.reported_document_slug,
    p_claim_version_ref: report.reported_claim_version,
  });
  if (error) {
    return NextResponse.json({ error: "publication_action_rejected", detail: error.message }, { status: 400 });
  }

  revalidateClaimOrigins(report.reported_document_slug);
  const result = Array.isArray(data) ? data[0] ?? null : data;
  return NextResponse.json({
    result,
    origin_cache_invalidated: true,
    external_cache_notice: "External social/search caches are controlled by those platforms and may retain an older preview until they refresh it.",
  }, { headers: { "Cache-Control": "no-store" } });
}
