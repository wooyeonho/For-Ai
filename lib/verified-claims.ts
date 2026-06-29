import { getDocumentCitationStatus } from "./citation-status";
import type { ClaimWithSources, RegistryDocumentBundle, VerificationEventType } from "./types";

import seoulMetroFare from "../data/verified-claims/seoul-metro-base-fare.json";
import passportFee from "../data/verified-claims/passport-reissue-fee.json";
import moveInReport from "../data/verified-claims/move-in-report-deadline.json";
import londonTubeFare from "../data/verified-claims/london-underground-fare.json";
import usPassportFee from "../data/verified-claims/us-passport-renewal-fee.json";
import tokyoMetroFare from "../data/verified-claims/tokyo-metro-fare.json";
import seoulCityBusFare from "../data/verified-claims/seoul-city-bus-fare.json";
import seoulTransitTransferRule from "../data/verified-claims/seoul-transit-transfer-rule.json";
import seoulTaxiBaseFare from "../data/verified-claims/seoul-taxi-base-fare.json";
import residentIdReissueFee from "../data/verified-claims/resident-id-reissue-fee.json";
import vehicleTaxPaymentPeriod from "../data/verified-claims/vehicle-tax-payment-period.json";
import incomeTaxFilingPeriod from "../data/verified-claims/income-tax-filing-period.json";

type VerifiedClaimFile = typeof seoulMetroFare;

const verifiedFiles: VerifiedClaimFile[] = [
  seoulMetroFare,
  passportFee,
  moveInReport,
  londonTubeFare as unknown as VerifiedClaimFile,
  usPassportFee as unknown as VerifiedClaimFile,
  tokyoMetroFare as unknown as VerifiedClaimFile,
  seoulCityBusFare as unknown as VerifiedClaimFile,
  seoulTransitTransferRule as unknown as VerifiedClaimFile,
  seoulTaxiBaseFare as unknown as VerifiedClaimFile,
  residentIdReissueFee as unknown as VerifiedClaimFile,
  vehicleTaxPaymentPeriod as unknown as VerifiedClaimFile,
  incomeTaxFilingPeriod as unknown as VerifiedClaimFile,
];

function toRegistryBundle(file: VerifiedClaimFile): RegistryDocumentBundle {
  const governmentFeeFieldPaths = new Set([
    "fee.amount",
    "fee.adult",
    "fee.child",
    "processing.standard",
    "processing.expedited",
    "required_documents",
    "application_channel",
    "official_page",
  ]);
  const isGovernmentFeeTemplate =
    file.disclaimer_type === "check_official_source" &&
    file.claims.some((claim) => governmentFeeFieldPaths.has(claim.field_path)) &&
    (file.type.includes("government") || file.type.includes("administration"));

  const entity = {
    id: file.entity_id,
    type: file.type,
    canonical_name: file.name,
    country: file.country,
    region: null,
    city: null,
    created_at: null,
    updated_at: null,
  };

  const hasVerifiedClaims = file.claims.some((c) => c.status === "verified");
  const docStatus = hasVerifiedClaims ? "verified" as const : "needs_review" as const;
  const docConfidence = hasVerifiedClaims ? "high" as const : "low" as const;
  const defaultLang = file.lang === "ko" ? "ko" : "en";

  const document = {
    id: `doc-${file.entity_id}`,
    entity_id: file.entity_id,
    slug: file.slug,
    lang: file.lang,
    country: file.country,
    title: file.name,
    category: file.type,
    template: isGovernmentFeeTemplate ? "government-fee" : "fact-registry",
    status: docStatus,
    confidence: docConfidence,
    last_verified_at: file.last_verified_at,
    license_code: "forai-data-license-v0.1",
    data: {
      direct_answer: file.claims[0]?.claim_value ?? "확인 필요",
      locale_path: `/${defaultLang}/wiki/${file.slug}`,
      canonical_path: `/${defaultLang}/wiki/${file.slug}`,
      machine_readable: {
        api_url: `/api/documents/${file.slug}`,
        raw_markdown_url: `/raw/${file.slug}.md`,
      },
      license_notice: "For-Ai Data License v0.1 placeholder.",
      risk_tier: file.risk_tier,
      update_frequency: file.update_frequency,
      disclaimer_type: file.disclaimer_type,
    },
    created_at: null,
    updated_at: null,
  };

  const claims: ClaimWithSources[] = file.claims.map((c) => ({
    id: c.claim_id,
    document_id: `doc-${file.entity_id}`,
    entity_id: file.entity_id,
    field_path: c.field_path,
    claim_text: c.claim_text,
    claim_value: c.claim_value,
    jurisdiction: file.country,
    confidence: c.confidence as "high" | "medium" | "low",
    status: c.status as "verified" | "needs_review",
    last_verified_at: c.last_verified_at,
    created_at: null,
    updated_at: null,
    sources: (c.sources ?? []).map((s, i) => ({
      id: `src-${c.claim_id}-${i}`,
      claim_id: c.claim_id,
      source_type: s.source_type as "official" | "law",
      title: s.title,
      url: s.url,
      citation: s.note,
      observed_at: s.observed_at,
      contributor_hash: null,
      created_at: null,
    })),
    verification_events: c.verification_event
      ? [
          {
            id: `ve-${c.claim_id}`,
            claim_id: c.claim_id,
            event_type: (c.verification_event.event_type ?? "source_verified") as VerificationEventType,
            previous_status: "needs_review" as const,
            new_status: "verified" as const,
            previous_confidence: "low" as const,
            new_confidence: "high" as const,
            note: c.verification_event.note,
            contributor_hash: null,
            created_at: c.verification_event.verified_at,
          },
        ]
      : [],
  }));

  const listing = {
    id: `listing-${file.entity_id}`,
    entity_id: file.entity_id,
    document_id: `doc-${file.entity_id}`,
    lang: file.lang,
    slug: file.slug,
    title: file.name,
    summary: hasVerifiedClaims
      ? `${file.claims.filter((c) => c.status === "verified").length} verified claims`
      : `${file.claims.length} claims pending verification`,
    status: "verified" as const,
    confidence: "high" as const,
    created_at: null,
    updated_at: null,
  };

  return { entity, document, claims, listing };
}

export const verifiedBundles: RegistryDocumentBundle[] =
  verifiedFiles.map(toRegistryBundle);

export function getVerifiedBundleBySlug(
  slug: string
): RegistryDocumentBundle | null {
  return verifiedBundles.find((b) => b.document.slug === slug) ?? null;
}

export function getVerifiedMetrics() {
  const bundles = verifiedBundles;
  const totalTopics = bundles.length;
  const statuses = bundles.map(getDocumentCitationStatus);
  const totalClaims = statuses.reduce((sum, status) => sum + status.totalClaims, 0);
  const citationReadyClaims = statuses.reduce((sum, status) => sum + status.verifiedClaims, 0);
  const verifiedClaims = citationReadyClaims;
  return { totalTopics, totalClaims, verifiedClaims, citationReadyClaims };
}
