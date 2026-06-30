export const HIGH_RISK_CATEGORIES = [
  "finance",
  "banking",
  "insurance",
  "health",
  "healthcare",
  "genomics",
  "dna",
  "legal",
  "law",
  "government",
  "labor",
  "tax",
  "travel",
  "real_estate",
  "housing",
] as const;

export const OFFICIAL_SOURCE_REQUIRED_CATEGORIES = [
  "finance",
  "banking",
  "insurance",
  "health",
  "healthcare",
  "genomics",
  "dna",
  "legal",
  "law",
  "travel",
  "government",
  "labor",
  "tax",
] as const;

export const OFFICIAL_OR_REGULATOR_SOURCE_TYPES = ["official", "regulator", "law"] as const;

const HIGH_RISK_CATEGORY_SET = new Set<string>(HIGH_RISK_CATEGORIES);
const OFFICIAL_SOURCE_REQUIRED_CATEGORY_SET = new Set<string>(OFFICIAL_SOURCE_REQUIRED_CATEGORIES);
const OFFICIAL_OR_REGULATOR_SOURCE_TYPE_SET = new Set<string>(OFFICIAL_OR_REGULATOR_SOURCE_TYPES);

function normalizePolicyToken(value?: string | null) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function isHighRiskCategory(category?: string | null) {
  return HIGH_RISK_CATEGORY_SET.has(normalizePolicyToken(category));
}

export function requiresOfficialOrRegulatorSource(category?: string | null) {
  return OFFICIAL_SOURCE_REQUIRED_CATEGORY_SET.has(normalizePolicyToken(category));
}

export function isOfficialOrRegulatorSourceType(sourceType?: string | null) {
  return OFFICIAL_OR_REGULATOR_SOURCE_TYPE_SET.has(normalizePolicyToken(sourceType));
}

export function getRiskPolicy(category?: string | null) {
  const normalizedCategory = normalizePolicyToken(category);
  return {
    category: normalizedCategory,
    isHighRisk: isHighRiskCategory(normalizedCategory),
    requiresOfficialOrRegulatorSource: requiresOfficialOrRegulatorSource(normalizedCategory),
    requiredSourceTypes: OFFICIAL_OR_REGULATOR_SOURCE_TYPES,
    disclaimer: getCategoryDisclaimer(normalizedCategory),
  };
}

export function getCategoryDisclaimer(category?: string | null) {
  const normalizedCategory = normalizePolicyToken(category);
  switch (normalizedCategory) {
    case "finance":
    case "banking":
    case "insurance":
      return "Financial facts can affect money decisions. This page is not financial advice; cite only claims backed by official provider or regulator sources.";
    case "health":
    case "healthcare":
    case "genomics":
    case "dna":
      return "Health and genomics facts can affect care decisions. This page is not medical advice; cite only claims backed by official facility, public-health, or regulator sources.";
    case "legal":
    case "law":
      return "Legal facts can affect rights and obligations. This page is not legal advice; cite only claims backed by official legal or regulator sources.";
    case "travel":
      return "Travel rules can change quickly. Verify visa, transit, fee, and entry claims against official government, carrier, or regulator sources before citing.";
    case "government":
    case "labor":
    case "tax":
      return "Government-service facts can affect eligibility, fees, or deadlines. Cite only claims backed by official agency, law, or regulator sources.";
    default:
      return "This is a high-risk topic. Use extra caution and cite only source-backed verified claims.";
  }
}
