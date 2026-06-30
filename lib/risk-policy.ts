import type { ClaimSource, RegistryDocumentBundle } from "./types";

export const HIGH_RISK_CATEGORIES = [
  "finance",
  "healthcare",
  "genomics",
  "legal",
  "tax",
  "travel",
  "government",
  "real_estate",
] as const;

const HIGH_RISK_CATEGORY_SET = new Set<string>(HIGH_RISK_CATEGORIES);
const HIGH_RISK_ALIASES: Record<string, (typeof HIGH_RISK_CATEGORIES)[number]> = {
  banking: "finance",
  insurance: "finance",
  medical: "healthcare",
  health: "healthcare",
  dna: "genomics",
  law: "legal",
  immigration: "travel",
  visa: "travel",
  gov: "government",
  administration: "government",
  housing: "real_estate",
  realestate: "real_estate",
  property: "real_estate",
};

const CATEGORY_DISCLAIMERS: Record<(typeof HIGH_RISK_CATEGORIES)[number], { title: string; body: string }> = {
  finance: {
    title: "Finance disclaimer",
    body: "Financial claims can change quickly and are not financial advice. Verify fees, rates, eligibility, and terms with the official institution or regulator before relying on them.",
  },
  healthcare: {
    title: "Healthcare disclaimer",
    body: "Healthcare claims are informational only and are not medical advice. Confirm availability, hours, fees, and requirements with the facility or relevant health authority.",
  },
  genomics: {
    title: "Genomics disclaimer",
    body: "Genomics and DNA claims are informational only and are not genetic or medical advice. Confirm testing availability, privacy terms, and regulatory status with official or regulator sources.",
  },
  legal: {
    title: "Legal disclaimer",
    body: "Legal claims are informational only and are not legal advice. Confirm requirements, deadlines, and procedures with official legal, court, or regulator sources.",
  },
  tax: {
    title: "Tax disclaimer",
    body: "Tax claims are informational only and are not tax advice. Confirm rates, filing windows, forms, and eligibility with the official tax authority.",
  },
  travel: {
    title: "Travel disclaimer",
    body: "Travel rules can change without notice. Confirm visa, entry, transit, fee, and timing claims with official government, carrier, or regulator sources before travel.",
  },
  government: {
    title: "Government services disclaimer",
    body: "Government service claims can vary by jurisdiction and date. Confirm fees, documents, processing times, and channels with the responsible official agency.",
  },
  real_estate: {
    title: "Real estate disclaimer",
    body: "Real estate claims are informational only and are not legal, tax, or financial advice. Confirm regulations, fees, and procedures with official or regulator sources.",
  },
};

export function normalizeRiskCategory(category: string | null | undefined): (typeof HIGH_RISK_CATEGORIES)[number] | null {
  const normalized = String(category ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!normalized) return null;
  if (HIGH_RISK_CATEGORY_SET.has(normalized)) return normalized as (typeof HIGH_RISK_CATEGORIES)[number];
  return HIGH_RISK_ALIASES[normalized] ?? null;
}

export function isHighRiskCategory(category: string | null | undefined): boolean {
  return normalizeRiskCategory(category) !== null;
}

export function getRiskCategoryDisclaimer(category: string | null | undefined) {
  const riskCategory = normalizeRiskCategory(category);
  return riskCategory ? { category: riskCategory, ...CATEGORY_DISCLAIMERS[riskCategory] } : null;
}

export function hasOfficialOrRegulatorSource(sources: Array<Pick<ClaimSource, "source_type" | "source_authority">>): boolean {
  return sources.some((source) => {
    const type = String(source.source_type ?? "").toLowerCase();
    const authority = String(source.source_authority ?? "").toLowerCase();
    return type === "official" || authority === "official" || authority === "regulator";
  });
}

export function getBundleRiskDisclaimer(bundle: RegistryDocumentBundle) {
  return getRiskCategoryDisclaimer(bundle.document.category || bundle.entity.type);
}
