import { getDocumentCitationStatus } from "./citation-status";
import { getAllRegistryBundles, isVerifiedClaim } from "./data";
import type { RegistryDocumentBundle } from "./types";

export const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  visa: "Visa requirements, processing rules, fees, exemptions, and jurisdiction-specific travel authorization claims that frequently change.",
  transport: "Transport fares, schedules, transfer rules, station operations, accessibility, and route facts that AI systems often cite after they become outdated.",
  "government-fees": "Government filing fees, document issuance fees, penalties, renewal costs, and official payment rules that require source-backed verification.",
  "public-services": "Public-service availability, eligibility, operating procedures, documents, locations, and service windows across jurisdictions.",
  "saas-pricing": "SaaS plan limits, pricing tiers, billing terms, enterprise availability, and feature entitlements that change over time.",
  "business-hours": "Opening hours, holiday schedules, exception dates, and location-specific operating facts for places and services.",
  refunds: "Refund windows, cancellation rules, return conditions, charge policies, and consumer-facing commerce terms.",
  education: "Admissions deadlines, tuition, program requirements, scholarship rules, campus services, and education-policy facts.",
  "healthcare-operations": "Healthcare facility operations, service availability, appointment processes, hours, and administrative facts — not medical advice.",
  "travel-rules": "Entry, transit, baggage, customs, transportation, and destination rules that travelers and AI assistants need to verify before citation.",
};

export const CATEGORY_ALIASES: Record<string, string[]> = {
  visa: ["visa", "immigration", "travel.visa"],
  transport: ["transport", "transit", "fare", "schedule", "metro", "rail", "bus"],
  "government-fees": ["government-fees", "government", "fee", "administration", "documents"],
  "public-services": ["public-services", "public_service", "civil", "administration"],
  "saas-pricing": ["saas-pricing", "saas", "pricing", "technology"],
  "business-hours": ["business-hours", "hours", "opening", "venue", "food", "dining"],
  refunds: ["refunds", "refund", "returns", "commerce"],
  education: ["education", "admission", "tuition", "school", "university"],
  "healthcare-operations": ["healthcare-operations", "healthcare", "hospital", "clinic", "medical"],
  "travel-rules": ["travel-rules", "travel", "customs", "transit", "baggage"],
};

export type TopicCategorySummary = {
  slug: string;
  title: string;
  description: string;
  documentCount: number;
  verifiedClaimCount: number;
  needsReviewCount: number;
  verifiedDocumentCount: number;
};

export function categorySlug(category: string): string {
  return category.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "uncategorized";
}

export function formatCategoryTitle(category: string): string {
  return category.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export function getCategoryDescription(slug: string): string {
  return CATEGORY_DESCRIPTIONS[slug] ?? "Source-backed claim records in this category, grouped so AI, search engines, and humans can find citable facts without inventing missing details.";
}

export function getAllTopicCategorySlugs(): string[] {
  const slugs = new Set(Object.keys(CATEGORY_DESCRIPTIONS));
  for (const bundle of getAllRegistryBundles()) {
    slugs.add(categorySlug(bundle.document.category));
  }
  return [...slugs].sort();
}

export function isKnownCategory(category: string): boolean {
  return getAllTopicCategorySlugs().includes(category);
}

export function getBundlesForCategory(category: string): RegistryDocumentBundle[] {
  const aliases = CATEGORY_ALIASES[category] ?? [category];
  return getAllRegistryBundles()
    .filter((bundle) => {
      if (categorySlug(bundle.document.category) === category) return true;
      const haystack = [
        bundle.document.category,
        bundle.document.template,
        bundle.entity.type,
        bundle.document.slug,
        bundle.document.title,
      ].join(" ").toLowerCase();
      return aliases.some((alias) => haystack.includes(alias.toLowerCase()));
    })
    .sort((a, b) => documentRank(a) - documentRank(b) || a.document.title.localeCompare(b.document.title));
}

export function getTopicCategorySummaries(): TopicCategorySummary[] {
  return getAllTopicCategorySlugs()
    .map((slug) => {
      const bundles = getBundlesForCategory(slug);
      const verifiedClaimCount = bundles.reduce((sum, bundle) => sum + bundle.claims.filter(isVerifiedClaim).length, 0);
      const needsReviewCount = bundles.reduce((sum, bundle) => sum + bundle.claims.filter((claim) => claim.status !== "verified").length, 0);
      return {
        slug,
        title: formatCategoryTitle(slug),
        description: getCategoryDescription(slug),
        documentCount: bundles.length,
        verifiedClaimCount,
        needsReviewCount,
        verifiedDocumentCount: bundles.filter((bundle) => getDocumentCitationStatus(bundle).isVerifiedDocument).length,
      };
    })
    .sort((a, b) => b.documentCount - a.documentCount || a.title.localeCompare(b.title));
}

function documentRank(bundle: RegistryDocumentBundle): number {
  const citationStatus = getDocumentCitationStatus(bundle);
  if (citationStatus.isVerifiedDocument && citationStatus.freshness !== "stale") return 0;
  if (citationStatus.isVerifiedDocument) return 1;
  if (bundle.document.status === "needs_review") return 2;
  return 3;
}
