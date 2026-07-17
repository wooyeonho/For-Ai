import "server-only";

import { getRegistryBundleBySlug } from "./data";
import { getRegistryBundleFromSupabase } from "./supabase-documents";
import { createServiceRoleClient } from "./supabase-server";
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
