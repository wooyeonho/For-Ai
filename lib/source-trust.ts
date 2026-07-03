import type { SourceType } from "./types";

export type SourceCheckStatus = "unchecked" | "passed" | "warning" | "failed";


export type RecommendedSourceType = "official" | "primary" | "secondary" | "user_generated" | "commercial" | "unknown";

export type SourceTrustClassifierInput = {
  url?: string | null;
  title?: string | null;
  domain?: string | null;
  detected_language?: string | null;
  page_type?: string | null;
};

export type SourceTrustClassifierResult = {
  recommended_source_type: RecommendedSourceType;
  classifier_notes: string[];
  input: SourceTrustClassifierInput;
};

const USER_GENERATED_PAGE_TYPES = new Set(["review", "forum", "social", "comment", "ugc", "community", "wiki_edit"]);
const COMMERCIAL_PAGE_TYPES = new Set(["pricing", "checkout", "affiliate", "sponsored", "advertorial", "marketplace", "store", "booking"]);
const PRIMARY_PAGE_TYPES = new Set(["registry", "platform", "database", "listing", "app_store", "operator", "schedule", "product_page"]);
const OFFICIAL_PAGE_TYPES = new Set(["official", "policy", "terms", "filing", "notice", "law", "regulation", "standard", "government", "press_release"]);
const SECONDARY_PAGE_TYPES = new Set(["news", "reference", "report", "article", "blog", "dataset"]);

const USER_GENERATED_DOMAIN_HINTS = ["reddit.", "forum.", "community.", "facebook.com", "x.com", "twitter.com", "instagram.com", "tiktok.com", "threads.net", "youtube.com", "medium.com"];
const COMMERCIAL_DOMAIN_HINTS = ["amazon.", "booking.com", "expedia.", "tripadvisor.", "affiliate", "shop.", "store.", "coupon", "deals"];

function normalizeClassifierDomain(input: SourceTrustClassifierInput): string | null {
  const explicitDomain = input.domain?.trim().toLowerCase();
  if (explicitDomain) return explicitDomain.replace(/^www\./, "");
  const parsed = parseUrl(input.url);
  return parsed?.hostname.toLowerCase().replace(/^www\./, "") ?? null;
}

export function classifyRecommendedSourceType(input: SourceTrustClassifierInput): SourceTrustClassifierResult {
  const domain = normalizeClassifierDomain(input);
  const pageType = input.page_type?.trim().toLowerCase().replace(/[\s-]+/g, "_") ?? "";
  const title = input.title?.trim() ?? "";
  const notes: string[] = [];

  let recommended_source_type: RecommendedSourceType = "unknown";
  if (pageType && USER_GENERATED_PAGE_TYPES.has(pageType)) recommended_source_type = "user_generated";
  else if (pageType && COMMERCIAL_PAGE_TYPES.has(pageType)) recommended_source_type = "commercial";
  else if (pageType && OFFICIAL_PAGE_TYPES.has(pageType)) recommended_source_type = "official";
  else if (domain && isTrustedSourceDomain(domain)) recommended_source_type = "official";
  else if (pageType && PRIMARY_PAGE_TYPES.has(pageType)) recommended_source_type = "primary";
  else if (pageType && SECONDARY_PAGE_TYPES.has(pageType)) recommended_source_type = "secondary";
  else if (domain && USER_GENERATED_DOMAIN_HINTS.some((hint) => domain.includes(hint) || domain.startsWith(hint))) recommended_source_type = "user_generated";
  else if (domain && COMMERCIAL_DOMAIN_HINTS.some((hint) => domain.includes(hint) || domain.startsWith(hint))) recommended_source_type = "commercial";

  if (!domain) notes.push("domain을 확인할 수 없어 recommended source type은 보수적으로 산정됩니다.");
  if (!title) notes.push("title이 없어 page intent 판단이 제한됩니다.");
  if (!pageType) notes.push("page_type이 없어 URL/domain 기반 보조 분류만 수행했습니다.");
  notes.push("recommended_source_type은 리뷰 보조 라벨이며 claim_sources 승격, verification_events 생성, confidence/status 변경을 자동 수행하지 않습니다.");

  return { recommended_source_type, classifier_notes: notes, input: { ...input, domain: domain ?? input.domain ?? null } };
}

export type SourceTrustInput = {
  url?: string | null;
  source_type?: string | null;
  fetch_ok?: boolean | null;
  title?: string | null;
  observed_at?: string | null;
  claim_text?: string | null;
};

export type SourceTrustResult = {
  source_check_status: SourceCheckStatus;
  source_trust_score: number;
  source_check_notes: string[];
  checks: {
    uses_https: boolean;
    trusted_domain: boolean;
    preferred_source_type: boolean;
    fetch_success: boolean | null;
    title_extracted: boolean;
    observed_at_recorded: boolean;
    title_keyword_match: boolean | null;
  };
};

const PREFERRED_SOURCE_TYPES = new Set(["official", "law", "platform", "document"]);

const TRUSTED_DOMAIN_SUFFIXES = [
  ".gov",
  ".gov.uk",
  ".go.kr",
  ".go.jp",
  ".gob.es",
  ".gc.ca",
  ".europa.eu",
  ".edu",
  ".ac.uk",
  ".or.kr",
];

const TRUSTED_DOMAINS = new Set([
  "gov.kr",
  "www.gov.kr",
  "mofa.go.kr",
  "efine.go.kr",
  "wetax.go.kr",
  "hometax.go.kr",
  "law.go.kr",
  "seoul.go.kr",
  "data.seoul.go.kr",
  "metro9.co.kr",
  "seoulmetro.co.kr",
  "tfl.gov.uk",
  "gov.uk",
  "travel.state.gov",
  "state.gov",
  "usa.gov",
  "irs.gov",
  "metro.tokyo.lg.jp",
]);

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "what", "when", "where", "how", "does", "are", "is", "of", "to", "in", "on", "a", "an",
  "은", "는", "이", "가", "을", "를", "의", "에", "에서", "으로", "로", "와", "과", "및", "또는", "인가", "얼마", "며칠", "무엇",
]);

function parseUrl(url?: string | null): URL | null {
  if (!url) return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function isTrustedSourceDomain(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  if (TRUSTED_DOMAINS.has(host) || TRUSTED_DOMAINS.has(`www.${host}`)) return true;
  return TRUSTED_DOMAIN_SUFFIXES.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix));
}

export function extractKeywords(value?: string | null): string[] {
  if (!value) return [];
  const tokens = value
    .toLowerCase()
    .replace(/[()[\]{}"'“”‘’!?.,:;|/\\]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
  return [...new Set(tokens)].slice(0, 8);
}

export function getTitleKeywordMatch(claimText?: string | null, title?: string | null): boolean | null {
  const keywords = extractKeywords(claimText);
  if (!title || keywords.length === 0) return null;
  const normalizedTitle = title.toLowerCase();
  return keywords.some((keyword) => normalizedTitle.includes(keyword));
}

export function scoreSourceTrust(input: SourceTrustInput): SourceTrustResult {
  const parsed = parseUrl(input.url);
  const usesHttps = parsed?.protocol === "https:";
  const trustedDomain = parsed ? isTrustedSourceDomain(parsed.hostname) : false;
  const preferredSourceType = PREFERRED_SOURCE_TYPES.has(String(input.source_type ?? "").toLowerCase() as SourceType);
  const fetchSuccess = typeof input.fetch_ok === "boolean" ? input.fetch_ok : null;
  const titleExtracted = Boolean(input.title?.trim());
  const observedAtRecorded = Boolean(input.observed_at?.trim());
  const titleKeywordMatch = getTitleKeywordMatch(input.claim_text, input.title);

  const notes: string[] = [];
  let score = 0;

  if (usesHttps) score += 15;
  else notes.push("HTTPS가 아닌 URL입니다.");

  if (trustedDomain) score += 20;
  else notes.push("공식/신뢰 도메인 allowlist 또는 trusted domain 규칙과 일치하지 않습니다.");

  if (preferredSourceType) score += 15;
  else notes.push("source_type이 official/law/platform/document가 아닙니다.");

  if (fetchSuccess === true) score += 20;
  else if (fetchSuccess === false) notes.push("URL fetch에 실패했습니다.");
  else notes.push("URL fetch가 아직 수행되지 않았습니다.");

  if (titleExtracted) score += 10;
  else notes.push("source title을 추출하거나 입력하지 못했습니다.");

  if (observedAtRecorded) score += 10;
  else notes.push("observed_at 기록이 없습니다.");

  if (titleKeywordMatch === true) score += 10;
  else if (titleKeywordMatch === false) notes.push("claim_text와 source title의 키워드 일치가 확인되지 않았습니다.");
  else notes.push("claim_text/title 부족으로 키워드 일치를 판단하지 못했습니다.");

  const source_check_status: SourceCheckStatus = score >= 85 ? "passed" : score >= 55 ? "warning" : "failed";
  notes.push("Source check 통과는 verified를 의미하지 않으며, 최종 verified는 admin approval 이후에만 가능합니다.");

  return {
    source_check_status,
    source_trust_score: Math.max(0, Math.min(100, score)),
    source_check_notes: notes,
    checks: {
      uses_https: usesHttps,
      trusted_domain: trustedDomain,
      preferred_source_type: preferredSourceType,
      fetch_success: fetchSuccess,
      title_extracted: titleExtracted,
      observed_at_recorded: observedAtRecorded,
      title_keyword_match: titleKeywordMatch,
    },
  };
}
