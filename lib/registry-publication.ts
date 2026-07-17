import "server-only";

import { getRegistryBundleBySlug } from "./data";
import { getRegistryBundleFromSupabase } from "./supabase-documents";
import { createServiceRoleClient } from "./supabase-server";
import {
  publicTask5ModelProvenance,
  type PublicAssistedPublicationReceipt,
} from "./task5-assisted-publication";
import type { ClaimPublicationState, RegistryDocumentBundle } from "./types";

type PublicationOverrideRow = {
  claim_id: string;
  publication_state: ClaimPublicationState;
};

function failClosedLegacyPublication(bundle: RegistryDocumentBundle): RegistryDocumentBundle {
  return {
    ...bundle,
    claims: bundle.claims.map((claim) => ({
      ...claim,
      publication_state: "quarantined",
    })),
  };
}

export type PublicCorrectionEvent = {
  id: string;
  claim_id: string;
  claim_version_ref: string;
  event_type: "quarantined" | "restored" | "withdrawn";
  previous_publication_state: ClaimPublicationState;
  new_publication_state: ClaimPublicationState;
  public_reason: string;
  created_at: string;
};

export async function applyLegacyPublicationOverrides(
  bundle: RegistryDocumentBundle,
): Promise<RegistryDocumentBundle> {
  const sb = createServiceRoleClient();
  if (bundle.claims.length === 0) return bundle;
  if (!sb) {
    return process.env.NODE_ENV === "production"
      ? failClosedLegacyPublication(bundle)
      : bundle;
  }

  const { data, error } = await sb
    .from("legacy_claim_publication_overrides")
    .select("claim_id,publication_state")
    .eq("document_slug", bundle.document.slug)
    .in("claim_id", bundle.claims.map((claim) => claim.id));

  if (error) {
    console.error("[registry-publication] publication overlay unavailable; failing closed");
    return failClosedLegacyPublication(bundle);
  }
  if (!data || data.length === 0) return bundle;
  const states = new Map(
    (data as PublicationOverrideRow[]).map((row) => [row.claim_id, row.publication_state]),
  );
  return {
    ...bundle,
    claims: bundle.claims.map((claim) => ({
      ...claim,
      publication_state: states.get(claim.id) ?? claim.publication_state ?? "active",
    })),
  };
}

export async function loadRegistryBundleWithPublicationState(
  slug: string,
): Promise<RegistryDocumentBundle | null> {
  const legacyBundle = getRegistryBundleBySlug(slug);
  if (legacyBundle) return applyLegacyPublicationOverrides(legacyBundle);
  return getRegistryBundleFromSupabase(slug);
}

export async function getPublicCorrectionEvents(
  slug: string,
  claimIds?: string[],
): Promise<PublicCorrectionEvent[]> {
  const sb = createServiceRoleClient();
  if (!sb) return [];

  let query = sb
    .from("claim_correction_events")
    .select("id,claim_id,claim_version_ref,event_type,previous_publication_state,new_publication_state,public_reason,created_at")
    .eq("document_slug", slug)
    .order("created_at", { ascending: false })
    .limit(100);
  if (claimIds && claimIds.length > 0) query = query.in("claim_id", claimIds);

  const { data, error } = await query;
  if (error || !data) return [];
  return data as PublicCorrectionEvent[];
}

export async function getPublicAssistedPublicationReceipts(
  slug: string,
  claimIds?: string[],
): Promise<PublicAssistedPublicationReceipt[]> {
  const sb = createServiceRoleClient();
  if (!sb) return [];

  let claimsQuery = sb
    .from("claims")
    .select("id,published_claim_version_id,publication_mode,content_origin,published_at,documents!inner(slug)")
    .eq("documents.slug", slug)
    .eq("content_origin", "task5_ai")
    .eq("publication_mode", "assisted_operator")
    .not("published_claim_version_id", "is", null);
  if (claimIds?.length) claimsQuery = claimsQuery.in("id", claimIds);
  const { data: claimRows, error: claimError } = await claimsQuery;
  if (claimError || !claimRows?.length) return [];

  const claims = claimRows as Array<Record<string, unknown>>;
  const publishedClaimIds = claims.map((row) => String(row.id));
  const versionIds = claims.map((row) => String(row.published_claim_version_id));
  const [eventsResult, evidenceResult, attemptsResult] = await Promise.all([
    sb.from("assisted_review_events")
      .select("id,claim_id,claim_version_id,verification_policy_version,risk_assessment_id,metadata,created_at,risk_assessments(deterministic_policy_version,final_result)")
      .eq("action", "published")
      .in("claim_id", publishedClaimIds)
      .in("claim_version_id", versionIds)
      .order("created_at", { ascending: false }),
    sb.from("claim_evidence")
      .select("claim_version_id,source_snapshots(final_url,retrieved_at,content_type)")
      .eq("relation", "supports")
      .in("claim_version_id", versionIds),
    sb.from("draft_attempts")
      .select("claim_id,model_provenance,completed_at")
      .eq("state", "completed")
      .in("claim_id", publishedClaimIds)
      .order("completed_at", { ascending: false }),
  ]);
  if (eventsResult.error || evidenceResult.error || attemptsResult.error) return [];

  const eventByClaim = new Map<string, Record<string, unknown>>();
  for (const row of (eventsResult.data ?? []) as Array<Record<string, unknown>>) {
    const claimId = String(row.claim_id);
    if (!eventByClaim.has(claimId)) eventByClaim.set(claimId, row);
  }
  const attemptByClaim = new Map<string, Record<string, unknown>>();
  for (const row of (attemptsResult.data ?? []) as Array<Record<string, unknown>>) {
    const claimId = String(row.claim_id);
    if (!attemptByClaim.has(claimId)) attemptByClaim.set(claimId, row);
  }

  return claims.flatMap((claim) => {
    const claimId = String(claim.id);
    const versionId = String(claim.published_claim_version_id);
    const event = eventByClaim.get(claimId);
    if (!event || String(event.claim_version_id) !== versionId) return [];
    const metadata = event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
      ? event.metadata as Record<string, unknown>
      : {};
    const riskRelation = Array.isArray(event.risk_assessments)
      ? event.risk_assessments[0]
      : event.risk_assessments;
    if (!riskRelation || typeof riskRelation !== "object") return [];
    const publishedRisk = riskRelation as Record<string, unknown>;
    if (publishedRisk.final_result !== "normal" || typeof publishedRisk.deterministic_policy_version !== "string") return [];
    const sources = ((evidenceResult.data ?? []) as Array<Record<string, unknown>>)
      .filter((row) => String(row.claim_version_id) === versionId)
      .flatMap((row) => {
        const relation = Array.isArray(row.source_snapshots)
          ? row.source_snapshots[0]
          : row.source_snapshots;
        if (!relation || typeof relation !== "object") return [];
        const source = relation as Record<string, unknown>;
        if (typeof source.final_url !== "string" || typeof source.retrieved_at !== "string") return [];
        return [{
          url: source.final_url,
          retrieved_at: source.retrieved_at,
          content_type: typeof source.content_type === "string" ? source.content_type : "unknown",
        }];
      });
    const attempt = attemptByClaim.get(claimId);
    return [{
      event_id: String(event.id),
      claim_id: claimId,
      claim_version_id: versionId,
      publication_mode: "assisted_operator" as const,
      content_origin: "task5_ai" as const,
      verification_policy_version: Number(event.verification_policy_version),
      deterministic_policy_version: publishedRisk.deterministic_policy_version,
      risk_result: "normal" as const,
      evidence_count: Number(metadata.evidence_count ?? sources.length),
      source_count: Number(metadata.source_count ?? sources.length),
      published_at: String(claim.published_at ?? event.created_at),
      model_provenance: publicTask5ModelProvenance(attempt?.model_provenance),
      sources,
    }];
  });
}
