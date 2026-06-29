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
import educationExamTemplate from "../data/verified-claims/education-exam-template.json";
import newYorkSubwayBusFare from "../data/verified-claims/new-york-subway-bus-fare.json";
import singaporeMrtBusAdultFares from "../data/verified-claims/singapore-mrt-bus-adult-fares.json";
import torontoTtcFares from "../data/verified-claims/toronto-ttc-fares.json";
import sydneyAdultOpalFares from "../data/verified-claims/sydney-adult-opal-fares.json";

type VerifiedClaimFile = typeof seoulMetroFare | typeof passportFee | typeof moveInReport | typeof londonTubeFare | typeof usPassportFee | typeof tokyoMetroFare | typeof seoulCityBusFare | typeof seoulTransitTransferRule | typeof seoulTaxiBaseFare | typeof residentIdReissueFee | typeof vehicleTaxPaymentPeriod | typeof incomeTaxFilingPeriod | typeof educationExamTemplate;
type VerifiedClaimFileClaim = VerifiedClaimFile["claims"][number];

function isVerifiedFileClaim(claim: VerifiedClaimFileClaim): boolean {
  return (
    claim.status === "verified" &&
    Boolean(claim.claim_value?.trim()) &&
    claim.claim_value !== "확인 필요" &&
    (claim.confidence === "medium" || claim.confidence === "high") &&
    (claim.sources ?? []).length > 0 &&
    Boolean(claim.last_verified_at) &&
    Boolean(claim.verification_event)
  );
}

const verifiedFiles: VerifiedClaimFile[] = [
  seoulMetroFare,
  passportFee,
  moveInReport,
  londonTubeFare,
  usPassportFee,
  tokyoMetroFare,
  seoulCityBusFare,
  seoulTransitTransferRule,
  seoulTaxiBaseFare,
  residentIdReissueFee,
  vehicleTaxPaymentPeriod,
  incomeTaxFilingPeriod,
  educationExamTemplate,
  newYorkSubwayBusFare as unknown as VerifiedClaimFile,
  singaporeMrtBusAdultFares as unknown as VerifiedClaimFile,
  torontoTtcFares as unknown as VerifiedClaimFile,
  sydneyAdultOpalFares as unknown as VerifiedClaimFile,
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
    region: file.region,
    city: file.city,
    created_at: null,
    updated_at: null,
  };

  const hasVerifiedClaims = file.claims.some(isVerifiedFileClaim);
  const docStatus = hasVerifiedClaims ? "verified" as const : "needs_review" as const;
  const docConfidence = hasVerifiedClaims ? "high" as const : "low" as const;
  const defaultLang = file.lang === "ko" ? "ko" : "en";

  const document = {
    id: `doc-${file.entity_id}`,
    entity_id: file.entity_id,
    slug: file.slug,
    lang: file.lang,
    country: file.country,
    region: file.region,
    city: file.city,
    jurisdiction: file.jurisdiction,
    canonical_slug: file.canonical_slug,
    title: file.name,
    localized_title: file.localized_title,
    category: file.type,
    template: isGovernmentFeeTemplate ? "government-fee" : "fact-registry",
    status: docStatus,
    confidence: docConfidence,
    risk_tier: file.risk_tier as RegistryDocumentBundle["document"]["risk_tier"],
    update_frequency: file.update_frequency as RegistryDocumentBundle["document"]["update_frequency"],
    disclaimer_type: file.disclaimer_type as RegistryDocumentBundle["document"]["disclaimer_type"],
    translation_status: file.translation_status as RegistryDocumentBundle["document"]["translation_status"],
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
    jurisdiction: c.jurisdiction,
    country: c.country,
    region: c.region,
    city: c.city,
    risk_tier: c.risk_tier as ClaimWithSources["risk_tier"],
    update_frequency: c.update_frequency as ClaimWithSources["update_frequency"],
    disclaimer_type: c.disclaimer_type as ClaimWithSources["disclaimer_type"],
    lang: file.lang,
    original_claim_id: null,
    translation_status: null,
    confidence: c.confidence as "high" | "medium" | "low",
    status: (isVerifiedFileClaim(c) ? "verified" : "needs_review") as "verified" | "needs_review",
    last_verified_at: c.last_verified_at,
    created_at: null,
    updated_at: null,
    sources: (c.sources ?? []).map((s, i) => ({
      id: `src-${c.claim_id}-${i}`,
      claim_id: c.claim_id,
      source_type: s.source_type as ClaimWithSources["sources"][number]["source_type"],
      source_authority: s.source_authority as ClaimWithSources["sources"][number]["source_authority"],
      title: s.title,
      url: s.url,
      citation: s.note,
      observed_at: s.observed_at,
      lang: file.lang,
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
      ? `${file.claims.filter(isVerifiedFileClaim).length} verified claims`
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
  const statuses = bundles.map((bundle) => getDocumentCitationStatus(bundle));
  const totalClaims = statuses.reduce((sum, status) => sum + status.totalClaims, 0);
  const citationReadyClaims = statuses.reduce((sum, status) => sum + status.verifiedClaims, 0);
  const verifiedClaims = citationReadyClaims;
  return { totalTopics, totalClaims, verifiedClaims, citationReadyClaims };
}
