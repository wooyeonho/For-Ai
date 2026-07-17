import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ClaimSource, ClaimStatus, ClaimWithSources, Confidence, RegistryDocumentBundle, VerificationEvent } from "./types";

function isClaimStatus(value: unknown): value is ClaimStatus {
  return ["needs_review", "verified", "disputed", "unknown"].includes(String(value));
}

function toConfidence(value: unknown): Confidence {
  return value === "medium" || value === "high" ? value : "low";
}

function eventFromRow(row: Record<string, unknown>): VerificationEvent {
  return {
    id: String(row.id),
    claim_id: String(row.claim_id),
    event_type: String(row.event_type ?? "reviewed") as VerificationEvent["event_type"],
    previous_status: (row.previous_status ?? null) as VerificationEvent["previous_status"],
    new_status: (row.new_status ?? null) as VerificationEvent["new_status"],
    previous_confidence: (row.previous_confidence ?? null) as VerificationEvent["previous_confidence"],
    new_confidence: (row.new_confidence ?? null) as VerificationEvent["new_confidence"],
    note: (row.note ?? null) as string | null,
    contributor_hash: (row.contributor_hash ?? null) as string | null,
    created_at: (row.created_at ?? null) as string | null,
  };
}

function sourceFromRow(row: Record<string, unknown>): ClaimSource {
  return {
    id: String(row.id),
    claim_id: String(row.claim_id),
    source_type: String(row.source_type ?? "unknown") as ClaimSource["source_type"],
    source_authority: String(row.source_authority ?? "unknown") as ClaimSource["source_authority"],
    title: (row.title ?? null) as string | null,
    url: (row.url ?? null) as string | null,
    citation: (row.citation ?? null) as string | null,
    lang: (row.lang ?? null) as string | null,
    observed_at: (row.observed_at ?? null) as string | null,
    source_check_status: (row.source_check_status ?? null) as ClaimSource["source_check_status"],
    source_trust_score: typeof row.source_trust_score === "number" ? row.source_trust_score : null,
    source_check_notes: (row.source_check_notes ?? null) as string | null,
    contributor_hash: (row.contributor_hash ?? null) as string | null,
    created_at: (row.created_at ?? null) as string | null,
  };
}

function claimFromRow(
  cl: Record<string, unknown>,
  documentId: string,
  entityId: string,
): ClaimWithSources {
  return {
    id: String(cl.id),
    document_id: documentId,
    entity_id: entityId,
    field_path: String(cl.field_path ?? ""),
    claim_text: String(cl.claim_text ?? ""),
    claim_value: String(cl.claim_value ?? "확인 필요"),
    jurisdiction: String(cl.jurisdiction ?? ""),
    country: String(cl.country ?? ""),
    region: (cl.region ?? null) as string | null,
    city: (cl.city ?? null) as string | null,
    risk_tier: String(cl.risk_tier ?? "standard") as ClaimWithSources["risk_tier"],
    update_frequency: String(cl.update_frequency ?? "unknown") as ClaimWithSources["update_frequency"],
    disclaimer_type: String(cl.disclaimer_type ?? "none") as ClaimWithSources["disclaimer_type"],
    lang: String(cl.lang ?? "en"),
    original_claim_id: (cl.original_claim_id ?? null) as string | null,
    translation_status: (cl.translation_status ?? null) as ClaimWithSources["translation_status"],
    confidence: toConfidence(cl.confidence),
    status: isClaimStatus(cl.status) ? cl.status : "needs_review",
    last_verified_at: (cl.last_verified_at ?? null) as string | null,
    created_at: (cl.created_at ?? null) as string | null,
    updated_at: (cl.updated_at ?? null) as string | null,
    source_of_claim: String(cl.source_of_claim ?? "independent") as ClaimWithSources["source_of_claim"],
    business_submission_status: (cl.business_submission_status ?? null) as ClaimWithSources["business_submission_status"],
    submitted_by_business_name: (cl.submitted_by_business_name ?? null) as string | null,
    content_origin: (cl.content_origin ?? "legacy_manual") as ClaimWithSources["content_origin"],
    current_claim_version_id: (cl.current_claim_version_id ?? null) as string | null,
    published_claim_version_id: (cl.published_claim_version_id ?? null) as string | null,
    publication_mode: (cl.publication_mode ?? "manual_legacy") as ClaimWithSources["publication_mode"],
    publication_state: (cl.publication_state ?? "active") as ClaimWithSources["publication_state"],
    published_at: (cl.published_at ?? null) as string | null,
    freshness_profile: (cl.freshness_profile ?? null) as string | null,
    valid_from: (cl.valid_from ?? null) as string | null,
    valid_until: (cl.valid_until ?? null) as string | null,
    sources: ((cl.claim_sources ?? []) as Record<string, unknown>[]).map(sourceFromRow),
    verification_events: ((cl.verification_events ?? []) as Record<string, unknown>[]).map(eventFromRow),
  };
}

async function getPendingBusinessSubmittedClaims(
  sb: SupabaseClient,
  documentId: string,
  entityId: string,
): Promise<ClaimWithSources[]> {
  const { data, error } = await sb
    .from("business_submitted_claims")
    .select("*, verified_business_profiles(business_name)")
    .eq("document_id", documentId)
    .eq("entity_id", entityId)
    .eq("status", "pending_verification")
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return (data as Record<string, unknown>[]).map((row) => {
    const profile = (row.verified_business_profiles ?? {}) as Record<string, unknown>;
    const sourceUrl = typeof row.source_url === "string" ? row.source_url : null;
    return {
      id: String(row.id),
      document_id: documentId,
      entity_id: entityId,
      field_path: String(row.field_path ?? ""),
      claim_text: String(row.claim_text ?? `Business-submitted update for ${String(row.field_path ?? "claim")}`),
      claim_value: String(row.claim_value ?? "확인 필요"),
      jurisdiction: String(row.jurisdiction ?? ""),
      country: String(row.country ?? ""),
      region: (row.region ?? null) as string | null,
      city: (row.city ?? null) as string | null,
      risk_tier: "standard" as const,
      update_frequency: "unknown" as const,
      disclaimer_type: "none" as const,
      lang: String(row.lang ?? "en"),
      original_claim_id: null,
      translation_status: null,
      confidence: "low" as const,
      status: "needs_review" as const,
      last_verified_at: null,
      created_at: (row.created_at ?? null) as string | null,
      updated_at: (row.updated_at ?? null) as string | null,
      source_of_claim: "business_submitted" as const,
      business_submission_status: "pending_verification" as const,
      submitted_by_business_name: (profile.business_name ?? null) as string | null,
      sources: sourceUrl ? [{
        id: `${String(row.id)}-source`,
        claim_id: String(row.id),
        source_type: String(row.source_type ?? "official") as ClaimSource["source_type"],
        source_authority: "unknown" as ClaimSource["source_authority"],
        title: "Business-submitted source",
        url: sourceUrl,
        citation: null,
        lang: null,
        observed_at: null,
        contributor_hash: null,
        created_at: (row.created_at ?? null) as string | null,
      }] : [],
      verification_events: [],
    };
  });
}

export async function getRegistryBundleFromSupabase(slug: string): Promise<RegistryDocumentBundle | null> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;

    const sb = createClient(url, key);

    const { data: v3Doc } = await sb
      .from("documents")
      .select("*, entities(*), claims(*, claim_sources(*), verification_events(*))")
      .eq("slug", slug)
      .in("status", ["published", "verified"])
      .maybeSingle();

    if (v3Doc && v3Doc.entities) {
      const ent = v3Doc.entities as Record<string, unknown>;
      const rawClaims = (v3Doc.claims ?? []) as Record<string, unknown>[];
      const canonicalClaims = rawClaims.map((cl) => claimFromRow(cl, String(v3Doc.id), String(ent.id)));
      const pendingBusinessClaims = await getPendingBusinessSubmittedClaims(sb, String(v3Doc.id), String(ent.id));
      const claims = [...canonicalClaims, ...pendingBusinessClaims];

      return {
        entity: {
          id: String(ent.id),
          type: String(ent.type ?? "concept"),
          canonical_name: String(ent.canonical_name ?? ""),
          country: String(ent.country ?? ""),
          region: (ent.region ?? null) as string | null,
          city: (ent.city ?? null) as string | null,
          created_at: (ent.created_at ?? null) as string | null,
          updated_at: (ent.updated_at ?? null) as string | null,
        },
        document: {
          id: String(v3Doc.id),
          entity_id: String(ent.id),
          slug: String(v3Doc.slug),
          lang: String(v3Doc.lang),
          country: String(v3Doc.country ?? ent.country ?? ""),
          region: (v3Doc.region ?? ent.region ?? null) as string | null,
          city: (v3Doc.city ?? ent.city ?? null) as string | null,
          jurisdiction: String(v3Doc.jurisdiction ?? ent.country ?? "GLOBAL"),
          canonical_slug: String(v3Doc.canonical_slug ?? v3Doc.slug),
          title: String(v3Doc.title ?? ""),
          localized_title: (v3Doc.localized_title ?? { [String(v3Doc.lang)]: String(v3Doc.title ?? "") }) as RegistryDocumentBundle["document"]["localized_title"],
          category: String(v3Doc.category ?? ""),
          template: String(v3Doc.template ?? "fact-sheet"),
          status: v3Doc.status as RegistryDocumentBundle["document"]["status"],
          confidence: toConfidence(v3Doc.confidence),
          risk_tier: String(v3Doc.risk_tier ?? "low") as RegistryDocumentBundle["document"]["risk_tier"],
          update_frequency: String(v3Doc.update_frequency ?? "event_based") as RegistryDocumentBundle["document"]["update_frequency"],
          disclaimer_type: String(v3Doc.disclaimer_type ?? "check_official_source") as RegistryDocumentBundle["document"]["disclaimer_type"],
          translation_status: String(v3Doc.translation_status ?? "source_language") as RegistryDocumentBundle["document"]["translation_status"],
          last_verified_at: (v3Doc.last_verified_at ?? null) as string | null,
          license_code: String(v3Doc.license_code ?? "forai-data-license-v0.1"),
          data: (v3Doc.data ?? {}) as Record<string, unknown>,
          created_at: (v3Doc.created_at ?? null) as string | null,
          updated_at: (v3Doc.updated_at ?? null) as string | null,
        },
        claims,
        listing: null,
      };
    }

    const { data: legacyDoc } = await sb
      .from("registry_documents")
      .select("*, registry_entities(*), registry_claims(*)")
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();
    if (!legacyDoc || !legacyDoc.registry_entities) return null;

    const ent = legacyDoc.registry_entities as Record<string, unknown>;
    const rawClaims = (legacyDoc.registry_claims ?? []) as Record<string, unknown>[];
    const claims = rawClaims.map((cl) => ({
      id: String(cl.id),
      document_id: String(legacyDoc.id),
      entity_id: String(ent.id),
      field_path: String(cl.field_path ?? ""),
      claim_text: String(cl.claim_text ?? ""),
      claim_value: String(cl.claim_value ?? "확인 필요"),
      jurisdiction: String(cl.jurisdiction ?? legacyDoc.country ?? ent.country ?? "GLOBAL"),
      country: String(cl.country ?? legacyDoc.country ?? ent.country ?? "GLOBAL"),
      region: (cl.region ?? ent.region ?? null) as string | null,
      city: (cl.city ?? ent.city ?? null) as string | null,
      risk_tier: "low" as const,
      update_frequency: "event_based" as const,
      disclaimer_type: "check_official_source" as const,
      lang: String(cl.lang ?? legacyDoc.lang ?? "en"),
      original_claim_id: (cl.original_claim_id ?? null) as string | null,
      translation_status: (cl.translation_status ?? null) as RegistryDocumentBundle["claims"][number]["translation_status"],
      confidence: toConfidence(cl.confidence),
      status: isClaimStatus(cl.status) ? cl.status : "needs_review",
      last_verified_at: (cl.last_verified_at ?? null) as string | null,
      created_at: null,
      updated_at: null,
      sources: [],
      verification_events: [],
    }));

    return {
      entity: {
        id: String(ent.id),
        type: String(ent.entity_type ?? ent.type ?? "concept"),
        canonical_name: String(ent.canonical_name ?? ""),
        country: String(ent.country ?? ""),
        region: (ent.region ?? null) as string | null,
        city: (ent.city ?? null) as string | null,
        created_at: null,
        updated_at: null,
      },
      document: {
        id: String(legacyDoc.id),
        entity_id: String(ent.id),
        slug: String(legacyDoc.slug),
        lang: String(legacyDoc.lang ?? ""),
        country: String(legacyDoc.country ?? ent.country ?? ""),
        region: (ent.region ?? null) as string | null,
        city: (ent.city ?? null) as string | null,
        jurisdiction: String(legacyDoc.country ?? ent.country ?? "GLOBAL"),
        canonical_slug: String(legacyDoc.slug),
        title: String(legacyDoc.title ?? ""),
        localized_title: { [String(legacyDoc.lang ?? "")]: String(legacyDoc.title ?? "") },
        category: String(legacyDoc.category ?? ""),
        template: String(legacyDoc.template ?? "fact-sheet"),
        status: legacyDoc.status as RegistryDocumentBundle["document"]["status"],
        confidence: toConfidence(legacyDoc.confidence),
        risk_tier: "low" as const,
        update_frequency: "event_based" as const,
        disclaimer_type: "check_official_source" as const,
        translation_status: "source_language" as const,
        last_verified_at: null,
        license_code: String(legacyDoc.license_code ?? "CC-BY-4.0"),
        data: (legacyDoc.data ?? {}) as Record<string, unknown>,
        created_at: null,
        updated_at: null,
      },
      claims,
      listing: null,
    };
  } catch (error) {
    console.error(`Failed to load Supabase registry document for slug: ${slug}`, error);
    return null;
  }
}
export type SupabaseDocumentMetadata = {
  documentId: string | null;
  entityId: string | null;
  title: string;
  lang: string;
  category: string;
  country: string | null;
};

export async function getDocumentMetadataFromSupabase(slug: string): Promise<SupabaseDocumentMetadata | null> {
  const bundle = await getRegistryBundleFromSupabase(slug);
  if (!bundle) return null;

  return {
    documentId: bundle.document.id,
    entityId: bundle.document.entity_id,
    title: bundle.document.title,
    lang: bundle.document.lang || "en",
    category: bundle.document.category || "unknown",
    country: bundle.document.country || bundle.entity.country || null,
  };
}
