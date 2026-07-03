import { NextResponse } from "next/server";
import { supabaseAdmin, requireAdmin, logAdminAuditEvent } from "@/lib/admin-api";
import { makeContributorHashForRequest } from "@/lib/contributor-hash";
import { calculateBusinessProfileCompletenessScore, getBusinessProfileRiskDashboard, getEntityProfile } from "@/lib/entity-profile";

const BUSINESS_PRODUCT_FLOW = [
  "claim_or_join_waitlist",
  "ownership_review",
  "risk_dashboard",
  "submit_corrections_with_sources",
  "independent_human_verification",
  "optional_reputation_alerts",
] as const;

const COMMERCIAL_INTEGRITY_NOTICE = "Verified business profiles, corrections, reputation alerts, and sponsored placements are separate products. None of them can directly verify a factual claim or change citation readiness.";

// GET: List business profiles. Public callers only see verified profiles;
// admins may pass ?status=pending|verified|rejected|suspended for review queues.
export async function GET(request: Request) {
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  const url = new URL(request.url);
  const requestedStatus = url.searchParams.get("status");
  const isAdminQueue = Boolean(requestedStatus);

  if (isAdminQueue) {
    const adminError = await requireAdmin(request, "business_profiles.read");
    if (adminError) return adminError;
  }

  let query = sb
    .from("verified_business_profiles")
    .select("*")
    .order(isAdminQueue ? "created_at" : "verified_at", { ascending: false })
    .limit(100);
  query = query.eq("status", requestedStatus ?? "verified");

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const profiles = await Promise.all((data ?? []).map(async (profile) => {
    const entityProfile = await getEntityProfile(String(profile.entity_id));
    const publicProfile = isAdminQueue ? profile : {
      id: profile.id,
      entity_id: profile.entity_id,
      business_name: profile.business_name,
      business_url: profile.business_url,
      country: profile.country,
      industry: profile.industry,
      tier: profile.tier,
      status: profile.status,
      verification_method: profile.verification_method,
      verified_at: profile.verified_at,
    };
    return {
      ...publicProfile,
      completeness: calculateBusinessProfileCompletenessScore(entityProfile?.documents ?? [], profile),
      risk_dashboard: getBusinessProfileRiskDashboard(entityProfile?.documents ?? []),
      product_flow: BUSINESS_PRODUCT_FLOW,
    };
  }));

  return NextResponse.json({ product_flow: BUSINESS_PRODUCT_FLOW, integrity_notice: COMMERCIAL_INTEGRITY_NOTICE, profiles });
}

// POST: Submit a new business profile claim (public, goes to pending)
export async function POST(request: Request) {
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  const contentType = request.headers.get("content-type") ?? "";
  const isJsonRequest = contentType.includes("application/json");
  const body = isJsonRequest
    ? await request.json()
    : Object.fromEntries((await request.formData()).entries());
  const entityId = String(body.entity_id ?? "").trim();
  const businessName = String(body.business_name ?? "").trim();
  const businessEmail = String(body.business_email ?? "").trim();
  const businessUrl = String(body.business_url ?? "").trim() || null;
  const country = String(body.country ?? "").trim();
  const industry = String(body.industry ?? "").trim() || null;
  const contactName = String(body.contact_name ?? "").trim() || null;
  const contactEmailConsent = body.contact_email_consent === true || body.contact_email_consent === "true";
  const contactEmailPurpose = String(body.contact_email_purpose ?? "business_profile_verification").trim();
  const demandIntent = String(body.intent ?? "claim_profile").trim();
  const requestedPlan = String(body.requested_plan ?? "unknown").trim();
  const painPoint = String(body.pain_point ?? "").trim() || null;
  const verificationMethod = String(body.verification_method ?? "email").trim();
  const verificationReviewUrl = String(body.verification_review_url ?? "").trim() || null;

  if ("verification_document" in body || "verification_document_blob" in body) {
    return NextResponse.json(
      { error: "Do not submit verification document contents. Provide verification_review_url for external/manual review instead." },
      { status: 400 },
    );
  }

  if (!entityId || !businessName || !businessEmail || !country) {
    return NextResponse.json(
      { error: "entity_id, business_name, business_email, and country are required" },
      { status: 400 },
    );
  }

  if (!contactEmailConsent || !contactEmailPurpose) {
    return NextResponse.json(
      {
        error: "contact_email_consent=true and contact_email_purpose are required to store business_email",
        purpose: "business_profile_verification",
      },
      { status: 400 },
    );
  }

  if (!["email", "domain", "document", "phone"].includes(verificationMethod)) {
    return NextResponse.json({ error: "Invalid verification_method" }, { status: 400 });
  }

  // Check entity exists
  const { data: entity } = await sb
    .from("entities")
    .select("id")
    .eq("id", entityId)
    .single();
  if (!entity) {
    return NextResponse.json({ error: "Entity not found" }, { status: 404 });
  }

  // Check if already claimed
  const { data: existing } = await sb
    .from("verified_business_profiles")
    .select("id, status")
    .eq("entity_id", entityId)
    .single();
  if (existing) {
    return NextResponse.json(
      { error: "Entity already claimed", status: existing.status },
      { status: 409 },
    );
  }

  let contributorHash: string;
  try {
    contributorHash = makeContributorHashForRequest(request);
  } catch (error) {
    console.error("[business-profile] Contributor salt missing:", error);
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const { data: profile, error } = await sb
    .from("verified_business_profiles")
    .insert({
      entity_id: entityId,
      business_name: businessName,
      business_email: businessEmail,
      business_url: businessUrl,
      country,
      industry,
      contact_name: contactName,
      contact_email_consent: contactEmailConsent,
      contact_email_purpose: contactEmailPurpose,
      verification_method: verificationMethod,
      verification_review_url: verificationReviewUrl,
      status: "pending",
      tier: "free",
      contributor_hash: contributorHash,
      metadata: {
        product_flow: BUSINESS_PRODUCT_FLOW,
        demand_intent: demandIntent === "waitlist" ? "waitlist" : "claim_profile",
        requested_plan: requestedPlan,
        pain_point: painPoint,
        integrity_notice: COMMERCIAL_INTEGRITY_NOTICE,
      },
    })
    .select("id, entity_id, business_name, status, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!isJsonRequest) {
    const redirectUrl = new URL("/business", request.url);
    redirectUrl.searchParams.set("submitted", "1");
    redirectUrl.searchParams.set("entity_id", entityId);
    return NextResponse.redirect(redirectUrl, { status: 303 });
  }

  return NextResponse.json({ profile, product_flow: BUSINESS_PRODUCT_FLOW, integrity_notice: COMMERCIAL_INTEGRITY_NOTICE, message: demandIntent === "waitlist" ? "Waitlist/contact captured for pre-payment demand validation" : "Profile submitted for verification" }, { status: 201 });
}

// PATCH: Admin-only — verify/reject/suspend a business profile
export async function PATCH(request: Request) {
  const adminError = await requireAdmin(request, "business_profiles.update");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  const contentType = request.headers.get("content-type") ?? "";
  const isJsonRequest = contentType.includes("application/json");
  const body = isJsonRequest
    ? await request.json()
    : Object.fromEntries((await request.formData()).entries());
  const profileId = String(body.profile_id ?? "").trim();
  const action = String(body.action ?? "").trim();
  const newStatus = String(body.status ?? "").trim();
  const tier = String(body.tier ?? "").trim() || undefined;
  const reviewerNote = body.reviewer_note ? String(body.reviewer_note).trim() : null;

  if (!profileId || (action !== "request_source" && !["verified", "rejected", "suspended"].includes(newStatus))) {
    return NextResponse.json(
      { error: "profile_id and valid status (verified/rejected/suspended) or action=request_source required" },
      { status: 400 },
    );
  }

  const update: Record<string, unknown> = {
    status: action === "request_source" ? "pending" : newStatus,
    updated_at: new Date().toISOString(),
  };
  if (action === "request_source") {
    update.metadata = {
      admin_review_state: "source_requested",
      source_requested_at: new Date().toISOString(),
      ...(reviewerNote ? { reviewer_note: reviewerNote } : {}),
    };
  }
  if (newStatus === "verified") update.verified_at = new Date().toISOString();
  if (tier && ["free", "pro", "enterprise"].includes(tier)) update.tier = tier;

  const { data, error } = await sb
    .from("verified_business_profiles")
    .update(update)
    .eq("id", profileId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAuditEvent(sb, request, "admin.business_profile.update", {
    profile_id: profileId,
    new_status: String(update.status),
    action: action || "status_update",
    tier: tier ?? data.tier,
  });

  return NextResponse.json({ profile: data });
}
