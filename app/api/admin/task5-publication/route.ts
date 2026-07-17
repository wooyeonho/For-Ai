import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getAdminAuthContext, requireAdmin, supabaseAdmin } from "@/lib/admin-api";
import { SUPPORTED_LOCALES } from "@/lib/i18n/locales";
import {
  buildTask5EvidenceExcerpt,
  isTask5AssistedReviewAction,
  publicTask5ModelProvenance,
  rankTask5DuplicateCandidates,
  TASK5_ASSISTED_POLICY_VERSION,
  TASK5_EDIT_TEXT_MAX,
  TASK5_REVIEW_REASON_MAX,
  TASK5_REVIEW_REASON_MIN,
  task5PublicationEmergencyDisabled,
  task5ReviewActionForRpc,
} from "@/lib/task5-assisted-publication";
import { readBoundedJsonObject } from "@/lib/task5-report-server";

type JsonRow = Record<string, unknown>;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function documentRelation(value: unknown): JsonRow {
  if (Array.isArray(value)) return (value[0] ?? {}) as JsonRow;
  return value && typeof value === "object" ? value as JsonRow : {};
}

function revalidatePublicationOrigins(slug: string) {
  for (const locale of SUPPORTED_LOCALES) {
    const page = `/${locale}/wiki/${slug}`;
    revalidatePath(page);
    revalidatePath(`${page}/opengraph-image`);
    revalidatePath(`${page}/twitter-image`);
  }
  revalidatePath(`/api/documents/${slug}`);
  revalidatePath(`/api/cite/${slug}`);
  revalidatePath(`/api/badge/${slug}`);
  revalidatePath(`/api/publication-receipts/${slug}`);
  revalidatePath(`/embed/${slug}`);
  revalidatePath(`/raw/${slug}.md`);
}

export async function GET(request: Request) {
  const denied = await requireAdmin(request, "claims.assisted_publication.read");
  if (denied) return denied;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const [settingsResult, claimsResult, policyResult, sampleResult] = await Promise.all([
    sb.from("task5_settings").select("phase,draft_enabled,updated_at").eq("id", true).maybeSingle(),
    sb.from("claims")
      .select("id,document_id,claim_text,claim_value,status,confidence,current_claim_version_id,published_claim_version_id,publication_state,created_at,updated_at,documents(slug,title,status,lang)")
      .eq("content_origin", "task5_ai")
      .is("published_claim_version_id", null)
      .order("created_at", { ascending: true })
      .limit(100),
    sb.from("verification_policies")
      .select("version,mode,rules,effective_from")
      .eq("mode", "assisted_operator")
      .lte("effective_from", new Date().toISOString())
      .order("effective_from", { ascending: false })
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb.from("assisted_review_events")
      .select("id", { count: "exact", head: true })
      .in("action", ["rejected", "escalated", "refetch_requested", "held"]),
  ]);

  if (claimsResult.error) {
    return NextResponse.json({ error: "assisted_queue_unavailable" }, { status: 500 });
  }
  const claims = (claimsResult.data ?? []) as JsonRow[];
  const versionIds = claims.map((row) => clean(row.current_claim_version_id)).filter(Boolean);
  const claimIds = claims.map((row) => clean(row.id)).filter(Boolean);

  const [versionsResult, risksResult, evidenceResult, attemptsResult, reviewsResult, duplicatePoolResult] = await Promise.all([
    versionIds.length
      ? sb.from("claim_versions").select("id,claim_id,version,text,text_hash,created_at").in("id", versionIds)
      : Promise.resolve({ data: [], error: null }),
    versionIds.length
      ? sb.from("risk_assessments").select("id,claim_version_id,deterministic_result,model_result,final_result,deterministic_policy_version,model_id,prompt_version,failure_reason,created_at").in("claim_version_id", versionIds).order("created_at", { ascending: false }).order("id", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    versionIds.length
      ? sb.from("claim_evidence").select("id,claim_version_id,source_snapshot_id,quote_start,quote_end,quote_hash,context_hash,relation,is_required,created_at,source_snapshots(id,canonical_url,final_url,retrieved_at,http_status,content_type,content_hash,normalized_text_hash,normalized_text,storage_path)").in("claim_version_id", versionIds).order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    claimIds.length
      ? sb.from("draft_attempts").select("id,claim_id,state,attempt_number,model_provenance,provider,model_id,prompt_version,source_snapshot_id,completed_at").in("claim_id", claimIds).eq("state", "completed").order("completed_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    claimIds.length
      ? sb.from("assisted_review_events").select("id,claim_id,claim_version_id,action,reason,verification_policy_version,created_at").in("claim_id", claimIds).order("created_at", { ascending: false }).limit(500)
      : Promise.resolve({ data: [], error: null }),
    sb.from("claims").select("id,claim_text,claim_value,documents(slug)").neq("content_origin", "task5_ai").limit(300),
  ]);

  const versions = (versionsResult.data ?? []) as JsonRow[];
  const risks = (risksResult.data ?? []) as JsonRow[];
  const evidences = (evidenceResult.data ?? []) as JsonRow[];
  const attempts = (attemptsResult.data ?? []) as JsonRow[];
  const reviews = (reviewsResult.data ?? []) as JsonRow[];
  const duplicatePool = ((duplicatePoolResult.data ?? []) as JsonRow[]).map((row) => ({
    id: clean(row.id),
    document_slug: clean(documentRelation(row.documents).slug),
    claim_text: clean(row.claim_text),
    claim_value: clean(row.claim_value),
  }));

  const versionById = new Map(versions.map((row) => [clean(row.id), row]));
  const latestRiskByVersion = new Map<string, JsonRow>();
  for (const risk of risks) {
    const versionId = clean(risk.claim_version_id);
    if (!latestRiskByVersion.has(versionId)) latestRiskByVersion.set(versionId, risk);
  }
  const latestAttemptByClaim = new Map<string, JsonRow>();
  for (const attempt of attempts) {
    const claimId = clean(attempt.claim_id);
    if (!latestAttemptByClaim.has(claimId)) latestAttemptByClaim.set(claimId, attempt);
  }

  const items = claims.map((claim) => {
    const claimId = clean(claim.id);
    const versionId = clean(claim.current_claim_version_id);
    const version = versionById.get(versionId) ?? null;
    const risk = latestRiskByVersion.get(versionId) ?? null;
    const attempt = latestAttemptByClaim.get(claimId) ?? null;
    const evidence = evidences.filter((row) => clean(row.claim_version_id) === versionId).map((row) => {
      const snapshot = documentRelation(row.source_snapshots);
      const normalizedText = clean(snapshot.normalized_text);
      const excerpt = normalizedText
        ? buildTask5EvidenceExcerpt(normalizedText, Number(row.quote_start), Number(row.quote_end))
        : null;
      const quoteHashValid = Boolean(excerpt && sha256(excerpt.quote) === clean(row.quote_hash));
      const contextHash = clean(row.context_hash);
      const contextHashValid = Boolean(excerpt && (!contextHash || sha256(excerpt.context) === contextHash));
      let publisher = "";
      try { publisher = new URL(clean(snapshot.final_url)).hostname; } catch { publisher = "invalid-url"; }
      return {
        id: row.id,
        relation: row.relation,
        is_required: row.is_required,
        quote_start: row.quote_start,
        quote_end: row.quote_end,
        quote: excerpt?.quote ?? null,
        context: excerpt?.context ?? null,
        quote_hash_valid: quoteHashValid,
        context_hash_valid: contextHashValid,
        source: {
          url: snapshot.final_url,
          canonical_url: snapshot.canonical_url,
          publisher,
          retrieved_at: snapshot.retrieved_at,
          http_status: snapshot.http_status,
          content_type: snapshot.content_type,
          content_hash: snapshot.content_hash,
          normalized_text_hash: snapshot.normalized_text_hash,
          text_available_for_revalidation: Boolean(normalizedText && !snapshot.storage_path),
        },
      };
    });
    const document = documentRelation(claim.documents);
    return {
      claim: {
        id: claimId,
        document_id: claim.document_id,
        document_slug: document.slug,
        document_title: document.title,
        document_status: document.status,
        lang: document.lang,
        claim_text: claim.claim_text,
        claim_value: claim.claim_value,
        status: claim.status,
        confidence: claim.confidence,
        current_claim_version_id: versionId,
        publication_state: claim.publication_state,
        created_at: claim.created_at,
      },
      version,
      latest_risk: risk,
      evidence,
      model_provenance: publicTask5ModelProvenance(attempt?.model_provenance),
      duplicate_candidates: rankTask5DuplicateCandidates({
        claim_text: clean(claim.claim_text),
        claim_value: clean(claim.claim_value),
      }, duplicatePool),
      review_events: reviews.filter((row) => clean(row.claim_id) === claimId).slice(0, 20),
      publish_ready: Boolean(
        version
        && risk?.final_result === "normal"
        && risk?.deterministic_result === "normal"
        && risk?.model_result === "normal"
        && evidence.length > 0
        && evidence.every((row) => row.relation === "supports" && row.quote_hash_valid && row.context_hash_valid && row.source.text_available_for_revalidation)
        && publicTask5ModelProvenance(attempt?.model_provenance).length > 0
      ),
    };
  });

  const phase = Number(settingsResult.data?.phase ?? 0);
  const sampleReviews = sampleResult.count ?? 0;
  return NextResponse.json({
    settings: settingsResult.data ?? { phase: 0, draft_enabled: false, updated_at: null },
    emergency_disabled: task5PublicationEmergencyDisabled(),
    assisted_policy: policyResult.data ?? null,
    expected_policy_version: TASK5_ASSISTED_POLICY_VERSION,
    gate: {
      minimum_observation_days: 14,
      required_operator_samples: 50,
      recorded_operator_samples: sampleReviews,
      code_ready_only: true,
      phase_1_enabled: phase >= 1,
      eligible_for_activation: false,
      reason: "Activation requires a separately approved 14-day/50-sample evidence report. This API never raises the phase.",
    },
    items,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const parsed = await readBoundedJsonObject(request);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.error === "body_too_large" ? 413 : 400 });
  }
  const body = parsed.body;
  const action = clean(body.action);
  const actionPermission = action === "publish"
    ? "claims.publish_assisted"
    : action === "edit"
      ? "claims.edit_assisted"
      : "claims.review_assisted";
  const denied = await requireAdmin(request, actionPermission);
  if (denied) return denied;

  const auth = getAdminAuthContext(request);
  if (!auth?.adminUserId || auth.authMethod !== "supabase") {
    return NextResponse.json({ error: "designated_supabase_editor_required" }, { status: 403 });
  }

  const claimId = clean(body.claim_id);
  const claimVersionId = clean(body.claim_version_id);
  const reason = clean(body.reason);
  const idempotencyKey = clean(body.idempotency_key);
  if (!claimId || !claimVersionId) return NextResponse.json({ error: "claim_and_version_required" }, { status: 400 });
  if (reason.length < TASK5_REVIEW_REASON_MIN || reason.length > TASK5_REVIEW_REASON_MAX) {
    return NextResponse.json({ error: "reason_length" }, { status: 400 });
  }
  if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    return NextResponse.json({ error: "invalid_idempotency_key" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  if (action === "publish") {
    if (task5PublicationEmergencyDisabled()) {
      return NextResponse.json({ error: "task5_emergency_disabled" }, { status: 503 });
    }
    if (body.duplicate_reviewed !== true) {
      return NextResponse.json({ error: "duplicate_review_required" }, { status: 400 });
    }
    const policyVersion = Number(body.verification_policy_version);
    if (!Number.isInteger(policyVersion) || policyVersion < 1) {
      return NextResponse.json({ error: "invalid_verification_policy_version" }, { status: 400 });
    }
    const { data, error } = await sb.rpc("publish_assisted_claim", {
      p_claim_id: claimId,
      p_claim_version_id: claimVersionId,
      p_verification_policy_version: policyVersion,
      p_duplicate_reviewed: true,
      p_reason: reason,
      p_admin_user_id: auth.adminUserId,
      p_admin_user_hash: auth.adminUserHash,
      p_idempotency_key: idempotencyKey,
    });
    if (error) return NextResponse.json({ error: "assisted_publication_rejected", detail: error.message }, { status: 400 });
    const result = Array.isArray(data) ? data[0] ?? null : data;
    const slug = clean((result as JsonRow | null)?.document_slug);
    if (slug) revalidatePublicationOrigins(slug);
    return NextResponse.json({ result, origin_cache_invalidated: Boolean(slug) }, { headers: { "Cache-Control": "no-store" } });
  }

  if (action === "edit") {
    const newText = clean(body.new_text);
    if (!newText || newText.length > TASK5_EDIT_TEXT_MAX) {
      return NextResponse.json({ error: "new_text_length" }, { status: 400 });
    }
    const { data, error } = await sb.rpc("create_task5_claim_version", {
      p_claim_id: claimId,
      p_expected_claim_version_id: claimVersionId,
      p_new_text: newText,
      p_reason: reason,
      p_admin_user_id: auth.adminUserId,
      p_admin_user_hash: auth.adminUserHash,
      p_idempotency_key: idempotencyKey,
    });
    if (error) return NextResponse.json({ error: "assisted_edit_rejected", detail: error.message }, { status: 400 });
    return NextResponse.json({ result: data, requires_new_evidence_and_risk: true }, { headers: { "Cache-Control": "no-store" } });
  }

  if (!isTask5AssistedReviewAction(action)) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }
  const { data, error } = await sb.rpc("record_task5_assisted_review", {
    p_claim_id: claimId,
    p_claim_version_id: claimVersionId,
    p_action: task5ReviewActionForRpc(action),
    p_reason: reason,
    p_admin_user_id: auth.adminUserId,
    p_admin_user_hash: auth.adminUserHash,
    p_idempotency_key: idempotencyKey,
  });
  if (error) return NextResponse.json({ error: "assisted_review_rejected", detail: error.message }, { status: 400 });
  return NextResponse.json({ result: data }, { headers: { "Cache-Control": "no-store" } });
}
