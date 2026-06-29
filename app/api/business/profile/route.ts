import { NextResponse } from "next/server";
import { supabaseAdmin, requireAdmin, logAdminAuditEvent } from "@/lib/admin-api";
import { makeContributorHashForRequest } from "@/lib/contributor-hash";

// GET: List verified business profiles (public — only verified ones)
export async function GET() {
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  const { data, error } = await sb
    .from("verified_business_profiles")
    .select("id, entity_id, business_name, business_url, country, industry, tier, verified_at")
    .eq("status", "verified")
    .order("verified_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profiles: data ?? [] });
}

// POST: Submit a new business profile claim (public, goes to pending)
export async function POST(request: Request) {
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  const body = await request.json();
  const entityId = String(body.entity_id ?? "").trim();
  const businessName = String(body.business_name ?? "").trim();
  const businessEmail = String(body.business_email ?? "").trim();
  const businessUrl = String(body.business_url ?? "").trim() || null;
  const country = String(body.country ?? "").trim();
  const industry = String(body.industry ?? "").trim() || null;
  const contactName = String(body.contact_name ?? "").trim() || null;
  const contactEmailConsent = body.contact_email_consent === true;
  const contactEmailPurpose = String(body.contact_email_purpose ?? "business_profile_verification").trim();
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
    })
    .select("id, entity_id, business_name, status, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ profile, message: "Profile submitted for verification" }, { status: 201 });
}

// PATCH: Admin-only — verify/reject/suspend a business profile
export async function PATCH(request: Request) {
  const adminError = await requireAdmin(request, "business_profiles.update");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  const body = await request.json();
  const profileId = String(body.profile_id ?? "").trim();
  const newStatus = String(body.status ?? "").trim();
  const tier = String(body.tier ?? "").trim() || undefined;

  if (!profileId || !["verified", "rejected", "suspended"].includes(newStatus)) {
    return NextResponse.json(
      { error: "profile_id and valid status (verified/rejected/suspended) required" },
      { status: 400 },
    );
  }

  const update: Record<string, unknown> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  };
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
    new_status: newStatus,
    tier: tier ?? data.tier,
  });

  return NextResponse.json({ profile: data });
}
