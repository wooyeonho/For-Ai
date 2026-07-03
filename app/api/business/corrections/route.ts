import { NextResponse } from "next/server";
import { supabaseAdmin, requireAdmin, logAdminAuditEvent } from "@/lib/admin-api";

const COMMERCIAL_INTEGRITY_NOTICE = "Business product actions are intake/monitoring only; independent human verification is still required before any factual claim becomes AI-citable.";

// GET: Admin — list business corrections (filterable by status/priority)
export async function GET(request: Request) {
  const adminError = await requireAdmin(request, "business_corrections.read");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "new";
  const priority = url.searchParams.get("priority");

  let query = sb
    .from("business_corrections")
    .select("*, verified_business_profiles(business_name, tier)")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(50);

  if (priority) query = query.eq("priority", priority);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ product_step: "submit_corrections_with_sources", integrity_notice: COMMERCIAL_INTEGRITY_NOTICE, corrections: data ?? [] });
}

// POST: Submit a business correction (requires valid profile_id via API key or admin)
export async function POST(request: Request) {
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  const body = await request.json();
  const profileId = String(body.profile_id ?? "").trim();
  const entityId = String(body.entity_id ?? "").trim();
  const claimId = body.claim_id ? String(body.claim_id).trim() : null;
  const fieldPath = String(body.field_path ?? "").trim();
  const currentValue = body.current_value ? String(body.current_value).trim() : null;
  const proposedValue = String(body.proposed_value ?? "").trim();
  const reason = String(body.reason ?? "").trim();
  const sourceUrl = body.source_url ? String(body.source_url).trim() : null;
  const sourceType = String(body.source_type ?? "official").trim();
  const priority = String(body.priority ?? "standard").trim();

  if (!profileId || !entityId || !fieldPath || !proposedValue || !reason) {
    return NextResponse.json(
      { error: "profile_id, entity_id, field_path, proposed_value, and reason are required" },
      { status: 400 },
    );
  }

  if (!["standard", "priority", "urgent"].includes(priority)) {
    return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
  }

  // Verify the profile exists and is verified
  const { data: profile } = await sb
    .from("verified_business_profiles")
    .select("id, entity_id, status, tier")
    .eq("id", profileId)
    .single();

  if (!profile || profile.status !== "verified") {
    return NextResponse.json(
      { error: "Valid verified business profile required" },
      { status: 403 },
    );
  }

  // Verify the entity matches the profile's entity
  if (profile.entity_id !== entityId) {
    return NextResponse.json(
      { error: "Entity does not match business profile" },
      { status: 403 },
    );
  }

  // Priority/urgent corrections require pro+ tier
  if (priority !== "standard" && profile.tier === "free") {
    return NextResponse.json(
      { error: "Priority corrections require Pro or Enterprise tier" },
      { status: 403 },
    );
  }

  const { data: existingClaim } = claimId
    ? await sb
      .from("claims")
      .select("id, document_id, claim_value, claim_text")
      .eq("id", claimId)
      .maybeSingle()
    : await sb
      .from("claims")
      .select("id, document_id, claim_value, claim_text")
      .eq("entity_id", entityId)
      .eq("field_path", fieldPath)
      .eq("status", "verified")
      .maybeSingle();

  const existingClaimRecord = (existingClaim ?? {}) as Record<string, unknown>;
  const documentId = typeof existingClaimRecord.document_id === "string" ? existingClaimRecord.document_id : null;
  const conflictsWithClaimId = typeof existingClaimRecord.id === "string" ? existingClaimRecord.id : claimId;
  const existingValue = typeof existingClaimRecord.claim_value === "string"
    ? existingClaimRecord.claim_value
    : currentValue;
  const differsFromVerifiedClaim = Boolean(existingValue && existingValue !== proposedValue);

  const { data: submittedClaim, error: submittedClaimError } = await sb
    .from("business_submitted_claims")
    .insert({
      profile_id: profileId,
      entity_id: entityId,
      document_id: documentId,
      conflicts_with_claim_id: conflictsWithClaimId,
      field_path: fieldPath,
      claim_text: String(existingClaimRecord.claim_text ?? `Business-submitted claim for ${fieldPath}`),
      claim_value: proposedValue,
      source_url: sourceUrl,
      source_type: sourceType,
      status: "pending_verification",
      citation_ready: false,
    })
    .select("id, field_path, claim_value, status, citation_ready, created_at")
    .single();

  if (submittedClaimError) {
    return NextResponse.json({ error: submittedClaimError.message }, { status: 500 });
  }

  const { data: correction, error } = await sb
    .from("business_corrections")
    .insert({
      profile_id: profileId,
      entity_id: entityId,
      claim_id: conflictsWithClaimId,
      field_path: fieldPath,
      current_value: existingValue,
      proposed_value: proposedValue,
      reason,
      source_url: sourceUrl,
      source_type: sourceType,
      priority,
      status: "new",
    })
    .select("id, field_path, proposed_value, priority, status, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    {
      correction,
      submitted_claim: submittedClaim,
      differs_from_verified_claim: differsFromVerifiedClaim,
      product_step: "submit_corrections_with_sources",
      next_step: "independent_human_verification",
      integrity_notice: COMMERCIAL_INTEGRITY_NOTICE,
      message: "Business-submitted claim stored separately and queued for verification",
    },
    { status: 201 },
  );
}

// PATCH: Admin — review a correction (accept/reject)
export async function PATCH(request: Request) {
  const adminError = await requireAdmin(request, "business_corrections.review");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  const body = await request.json();
  const correctionId = String(body.correction_id ?? "").trim();
  const action = String(body.action ?? "").trim();
  const newStatus = String(body.status ?? "").trim();
  const reviewerNote = body.reviewer_note ? String(body.reviewer_note).trim() : null;

  if (!correctionId || (action !== "request_source" && !["accepted", "rejected"].includes(newStatus))) {
    return NextResponse.json(
      { error: "correction_id and valid status (accepted/rejected) or action=request_source required" },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const update = action === "request_source"
    ? {
        status: "new",
        reviewer_note: reviewerNote ?? "Additional source requested",
        updated_at: now,
      }
    : {
        status: newStatus,
        reviewed_at: now,
        reviewer_note: reviewerNote,
        updated_at: now,
      };
  const { data, error } = await sb
    .from("business_corrections")
    .update(update)
    .eq("id", correctionId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAuditEvent(sb, request, "admin.business_correction.review", {
    correction_id: correctionId,
    new_status: String(update.status),
    action: action || "status_update",
    entity_id: data.entity_id,
  });

  return NextResponse.json({ correction: data });
}
