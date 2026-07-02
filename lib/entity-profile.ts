import { createClient } from "@supabase/supabase-js";
import { getAllRegistryBundles } from "./data";
import { getRegistryBundleFromSupabase } from "./supabase-documents";
import { FRESHNESS_TTL_DAYS, getClaimCitationStatus, getDocumentCitationStatus, isStale, type FreshnessLabel } from "./citation-status";
import { DEFAULT_LOCALE } from "./i18n/locales";
import type { Entity, RegistryDocumentBundle } from "./types";

// An entity profile aggregates EVERY document/claim For-Ai holds about one entity
// (a place, institution, product, service…) into a single trust view — for humans
// to judge credibility and for AI to cite at the entity level. citable status is
// derived from the same getDocumentCitationStatus() used everywhere else.


export type BusinessProfileRiskDashboard = {
  ai_answer_risk: "low" | "medium" | "high";
  ai_answer_risk_score: number;
  unverified_critical_claims: Array<{
    claim_id: string;
    document_id: string;
    document_slug: string;
    field_path: string;
    claim_text: string;
    risk_tier: string;
    confidence: string;
    status: string;
  }>;
  stale_sources: Array<{
    claim_id: string;
    document_id: string;
    document_slug: string;
    field_path: string;
    last_verified_at: string | null;
    freshness_window_days: number;
  }>;
  summary: {
    total_claims: number;
    citation_ready_claims: number;
    unverified_claims: number;
    stale_claims: number;
  };
  note: string;
};

const CRITICAL_FIELD_PATTERN = /(hours|opening|price|pricing|fare|fee|refund|cancellation|return|address|phone|contact|availability|booking|reservation|accessibility|visa|requirement|deadline|rate)/i;

export function getBusinessProfileRiskDashboard(
  documents: RegistryDocumentBundle[],
  now: Date = new Date(),
): BusinessProfileRiskDashboard {
  const unverifiedCriticalClaims: BusinessProfileRiskDashboard["unverified_critical_claims"] = [];
  const staleSources: BusinessProfileRiskDashboard["stale_sources"] = [];
  let totalClaims = 0;
  let citationReadyClaims = 0;

  for (const bundle of documents) {
    const documentStatus = getDocumentCitationStatus(bundle, undefined, now);
    totalClaims += documentStatus.totalClaims;
    citationReadyClaims += documentStatus.verifiedClaims;

    for (const claim of bundle.claims) {
      const claimStatus = getClaimCitationStatus(claim, documentStatus.freshnessWindowDays, now, bundle.document.category);
      const criticalSignal =
        claim.risk_tier === "high" ||
        claim.risk_tier === "forbidden" ||
        CRITICAL_FIELD_PATTERN.test(`${claim.field_path} ${claim.claim_text}`);

      if (!claimStatus.isCitationReady && criticalSignal) {
        unverifiedCriticalClaims.push({
          claim_id: claim.id,
          document_id: bundle.document.id,
          document_slug: bundle.document.slug,
          field_path: claim.field_path,
          claim_text: claim.claim_text,
          risk_tier: claim.risk_tier,
          confidence: claim.confidence,
          status: claim.status,
        });
      }

      if (claimStatus.isCitationReady && claimStatus.freshness === "stale") {
        staleSources.push({
          claim_id: claim.id,
          document_id: bundle.document.id,
          document_slug: bundle.document.slug,
          field_path: claim.field_path,
          last_verified_at: claim.last_verified_at ?? null,
          freshness_window_days: documentStatus.freshnessWindowDays,
        });
      }
    }
  }

  const unverifiedClaims = Math.max(0, totalClaims - citationReadyClaims);
  const riskScore = Math.min(100, (unverifiedCriticalClaims.length * 25) + (staleSources.length * 15) + (unverifiedClaims * 5));
  const aiAnswerRisk = riskScore >= 60 ? "high" : riskScore >= 25 ? "medium" : "low";

  return {
    ai_answer_risk: aiAnswerRisk,
    ai_answer_risk_score: riskScore,
    unverified_critical_claims: unverifiedCriticalClaims,
    stale_sources: staleSources,
    summary: {
      total_claims: totalClaims,
      citation_ready_claims: citationReadyClaims,
      unverified_claims: unverifiedClaims,
      stale_claims: staleSources.length,
    },
    note: "Risk dashboard is an operational triage view. Paid status, sponsored placement, or business ownership never changes claim verification or citation readiness.",
  };
}

export type EntityProfileSummary = {
  total_documents: number;
  citable_documents: number;
  verified_claims: number;
  total_claims: number;
  freshness: FreshnessLabel;
  completeness: BusinessProfileCompletenessScore;
};

export type EntityProfile = {
  entity: Entity;
  documents: RegistryDocumentBundle[];
  summary: EntityProfileSummary;
};

export type BusinessProfileClaimCompletenessKey =
  | "opening_hours_claim"
  | "address_claim"
  | "phone_contact_claim"
  | "parking_claim"
  | "reservation_claim"
  | "refund_cancellation_claim"
  | "accessibility_claim";

export type BusinessProfileCompletenessItemKey =
  | "official_website_verified"
  | BusinessProfileClaimCompletenessKey
  | "last_verified_date_freshness";

export type BusinessProfileCompletenessItem = {
  key: BusinessProfileCompletenessItemKey;
  label: string;
  complete: boolean;
  evidence: string | null;
};

export type BusinessProfileCompletenessScore = {
  score: number;
  completed: number;
  total: number;
  items: BusinessProfileCompletenessItem[];
  missing: BusinessProfileCompletenessItemKey[];
  latest_verified_at: string | null;
  freshness: FreshnessLabel;
  note: string;
  paid_plan_note: string;
};

export type BusinessProfileCompletenessInput = {
  business_url?: string | null;
  verification_method?: string | null;
  status?: string | null;
  verified_at?: string | null;
};

const COMPLETENESS_NOTE =
  "Completeness score is an information-coverage metric only. It does not replace fact accuracy, claim-level confidence, source review, or verified status.";

const PAID_PLAN_COMPLETENESS_NOTE =
  "Paid plans may provide completeness improvement suggestions and monitoring, but they do not bypass human verification or change fact accuracy requirements.";

const CLAIM_COMPLETENESS_PATTERNS: Record<BusinessProfileClaimCompletenessKey, RegExp> = {
  opening_hours_claim: /(^|\.)(hours|opening_hours|business_hours|operating_hours)(\.|$)|opening.*hours|operating.*hours/i,
  address_claim: /(^|\.)(address|location|street_address|postal_address)(\.|$)|\baddress\b/i,
  phone_contact_claim: /(^|\.)(phone|telephone|contact|email|customer_service)(\.|$)|\b(phone|telephone|contact)\b/i,
  parking_claim: /(^|\.)parking(\.|$)|\bparking\b/i,
  reservation_claim: /(^|\.)(reservation|booking|appointment)(\.|$)|\b(reservation|booking|appointment)\b/i,
  refund_cancellation_claim: /(^|\.)(refund|cancellation|cancel|return)(\.|$)|\b(refund|cancellation|cancel)\b/i,
  accessibility_claim: /(^|\.)(accessibility|wheelchair|accessible|ada)(\.|$)|\b(accessibility|wheelchair|accessible)\b/i,
};

const CLAIM_COMPLETENESS_LABELS: Record<BusinessProfileClaimCompletenessKey, string> = {
  opening_hours_claim: "Opening hours claim",
  address_claim: "Address claim",
  phone_contact_claim: "Phone/contact claim",
  parking_claim: "Parking claim",
  reservation_claim: "Reservation claim",
  refund_cancellation_claim: "Refund/cancellation claim",
  accessibility_claim: "Accessibility claim",
};

function getLatestIsoDate(values: Array<string | null | undefined>): string | null {
  const valid = values.filter((value): value is string => Boolean(value) && !Number.isNaN(Date.parse(value as string)));
  if (valid.length === 0) return null;
  return valid.reduce((latest, current) => (Date.parse(current) > Date.parse(latest) ? current : latest));
}

function hasOfficialWebsiteVerified(profile?: BusinessProfileCompletenessInput | null): boolean {
  if (!profile?.business_url || profile.status !== "verified") return false;
  return profile.verification_method === "domain";
}

function claimEvidenceForPattern(
  documents: RegistryDocumentBundle[],
  pattern: RegExp,
): string | null {
  for (const bundle of documents) {
    const claim = bundle.claims.find((item) => {
      const haystack = `${item.field_path} ${item.claim_text}`.trim();
      return pattern.test(haystack);
    });
    if (claim) return `${claim.field_path} (${bundle.document.slug})`;
  }
  return null;
}

export function calculateBusinessProfileCompletenessScore(
  documents: RegistryDocumentBundle[],
  businessProfile?: BusinessProfileCompletenessInput | null,
  now: Date = new Date(),
): BusinessProfileCompletenessScore {
  const latestVerifiedAt = getLatestIsoDate([
    businessProfile?.verified_at,
    ...documents.map((bundle) => bundle.document.last_verified_at),
    ...documents.flatMap((bundle) => bundle.claims.map((claim) => claim.last_verified_at)),
  ]);
  const freshness: FreshnessLabel = !latestVerifiedAt
    ? "unknown"
    : isStale(latestVerifiedAt, FRESHNESS_TTL_DAYS, now)
      ? "stale"
      : "fresh";

  const items: BusinessProfileCompletenessItem[] = [
    {
      key: "official_website_verified",
      label: "Official website verified",
      complete: hasOfficialWebsiteVerified(businessProfile),
      evidence: businessProfile?.business_url ?? null,
    },
    ...Object.entries(CLAIM_COMPLETENESS_PATTERNS).map(([key, pattern]) => {
      const typedKey = key as BusinessProfileClaimCompletenessKey;
      const evidence = claimEvidenceForPattern(documents, pattern);
      return {
        key: typedKey,
        label: CLAIM_COMPLETENESS_LABELS[typedKey],
        complete: evidence !== null,
        evidence,
      };
    }),
    {
      key: "last_verified_date_freshness",
      label: "Last verified date freshness",
      complete: freshness === "fresh",
      evidence: latestVerifiedAt,
    },
  ];

  const completed = items.filter((item) => item.complete).length;
  const total = items.length;

  return {
    score: Math.round((completed / total) * 100),
    completed,
    total,
    items,
    missing: items.filter((item) => !item.complete).map((item) => item.key),
    latest_verified_at: latestVerifiedAt,
    freshness,
    note: COMPLETENESS_NOTE,
    paid_plan_note: PAID_PLAN_COMPLETENESS_NOTE,
  };
}

async function getSupabaseEntityBundles(
  entityId: string,
  excludeSlugs: Set<string>,
): Promise<RegistryDocumentBundle[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];

  try {
    const sb = createClient(url, key);
    const { data } = await sb
      .from("documents")
      .select("slug")
      .eq("entity_id", entityId)
      .in("status", ["published", "verified"]);

    const slugs = ((data ?? []) as { slug: string | null }[])
      .map((row) => row.slug)
      .filter((slug): slug is string => slug != null && slug.length > 0 && !excludeSlugs.has(slug));

    // Reuse the tested row→bundle mapping (loads claims/sources/events) per slug.
    const bundles = await Promise.all(slugs.map((slug) => getRegistryBundleFromSupabase(slug)));
    return bundles.filter((b): b is RegistryDocumentBundle => b !== null);
  } catch {
    return [];
  }
}

function summarize(documents: RegistryDocumentBundle[]): EntityProfileSummary {
  let citable = 0;
  let verifiedClaims = 0;
  let totalClaims = 0;
  let anyStale = false;

  for (const bundle of documents) {
    const status = getDocumentCitationStatus(bundle);
    verifiedClaims += status.verifiedClaims;
    totalClaims += status.totalClaims;
    if (status.isVerifiedDocument) {
      citable += 1;
      if (isStale(status.oldestVerifiedAt, status.freshnessWindowDays)) anyStale = true;
    }
  }

  const freshness: FreshnessLabel = citable === 0 ? "unknown" : anyStale ? "stale" : "fresh";

  return {
    total_documents: documents.length,
    citable_documents: citable,
    verified_claims: verifiedClaims,
    total_claims: totalClaims,
    freshness,
    completeness: calculateBusinessProfileCompletenessScore(documents),
  };
}

export async function getEntityProfile(entityId: string): Promise<EntityProfile | null> {
  const staticBundles = getAllRegistryBundles().filter((b) => b.entity.id === entityId);
  const supabaseBundles = await getSupabaseEntityBundles(
    entityId,
    new Set(staticBundles.map((b) => b.document.slug)),
  );

  const documents = [...staticBundles, ...supabaseBundles].sort((a, b) => {
    const av = getDocumentCitationStatus(a).isVerifiedDocument ? 0 : 1;
    const bv = getDocumentCitationStatus(b).isVerifiedDocument ? 0 : 1;
    return av - bv;
  });

  if (documents.length === 0) return null;

  return {
    entity: documents[0].entity,
    documents,
    summary: summarize(documents),
  };
}

// Lightweight list of all known entity ids (static + Supabase) for sitemap/index.
export async function getAllEntityRefs(): Promise<{ id: string; lang: string }[]> {
  const byId = new Map<string, string>();
  for (const b of getAllRegistryBundles()) {
    if (!byId.has(b.entity.id)) byId.set(b.entity.id, b.document.lang);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    try {
      const sb = createClient(url, key);
      const { data } = await sb
        .from("documents")
        .select("entity_id, lang")
        .in("status", ["published", "verified"]);
      for (const row of (data ?? []) as { entity_id: string | null; lang: string | null }[]) {
        if (row.entity_id && !byId.has(row.entity_id)) byId.set(row.entity_id, row.lang ?? DEFAULT_LOCALE);
      }
    } catch {
      // fall back to static-only refs
    }
  }

  return [...byId.entries()].map(([id, lang]) => ({ id, lang }));
}
