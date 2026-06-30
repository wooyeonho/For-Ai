export type AdminRecommendationAction =
  | "add_source"
  | "verify_claim"
  | "reject_duplicate"
  | "mark_spam"
  | "recheck_stale"
  | "promote_candidate"
  | "request_official_source";

export type AdminRecommendation = {
  action: AdminRecommendationAction;
  label: string;
  reason: string;
  priority: "high" | "medium" | "low";
  href?: string;
};

type SourceLike = { source_type?: string | null; url?: string | null; citation?: string | null; title?: string | null };

type ClaimLike = {
  id?: string;
  status?: string | null;
  confidence?: string | null;
  claim_value?: string | null;
  field_path?: string | null;
  last_verified_at?: string | null;
  source_candidates?: SourceLike[] | null;
  claim_sources?: SourceLike[] | null;
};

type CandidateLike = {
  status?: string | null;
  slug?: string | null;
  risk_tier?: string | null;
  title?: string | null;
};

type CommunityPostLike = {
  status?: string | null;
  content?: string | null;
  author_type?: string | null;
  author_name?: string | null;
};

const OFFICIAL_SOURCE_TYPES = new Set(["official", "law", "platform", "document"]);
const STALE_AFTER_DAYS = 180;

export function adminRecommendationLabel(action: AdminRecommendationAction) {
  const labels: Record<AdminRecommendationAction, string> = {
    add_source: "출처 추가",
    verify_claim: "Claim 검증",
    reject_duplicate: "중복 거절",
    mark_spam: "스팸 표시",
    recheck_stale: "오래된 사실 재검증",
    promote_candidate: "후보 승격",
    request_official_source: "공식 출처 요청",
  };
  return labels[action];
}

function ageInDays(value?: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  return Math.floor((Date.now() - time) / (24 * 60 * 60 * 1000));
}

function hasOfficialSource(sources: SourceLike[] = []) {
  return sources.some((source) => OFFICIAL_SOURCE_TYPES.has(source.source_type ?? "") && Boolean(source.url || source.citation));
}

function isLikelySpam(post: CommunityPostLike) {
  const text = `${post.author_name ?? ""} ${post.content ?? ""}`.toLowerCase();
  const linkCount = (text.match(/https?:\/\//g) ?? []).length;
  return linkCount >= 3 || /casino|loan|crypto airdrop|viagra|바카라|토토/.test(text);
}

function isLikelyDuplicateCandidate(candidate: CandidateLike) {
  return candidate.status === "duplicate" || /duplicate|중복/.test(`${candidate.title ?? ""} ${candidate.slug ?? ""}`.toLowerCase());
}

export function recommendForClaim(claim: ClaimLike, href?: string): AdminRecommendation[] {
  const recommendations: AdminRecommendation[] = [];
  const sources = claim.claim_sources ?? [];
  const candidates = claim.source_candidates ?? [];
  const sourceCount = sources.length;
  const candidateCount = candidates.length;
  const staleDays = ageInDays(claim.last_verified_at);
  const needsValue = !claim.claim_value || claim.claim_value === "확인 필요" || claim.claim_value.toLowerCase?.() === "needs verification";

  if (claim.status === "verified" && staleDays !== null && staleDays > STALE_AFTER_DAYS) {
    recommendations.push({ action: "recheck_stale", label: adminRecommendationLabel("recheck_stale"), priority: "high", href, reason: `${staleDays}일 전에 검증된 claim입니다. AI 인용 전 최신 출처로 재확인이 필요합니다.` });
  }

  if (claim.status !== "verified" && sourceCount === 0) {
    recommendations.push({ action: "add_source", label: adminRecommendationLabel("add_source"), priority: "high", href, reason: candidateCount > 0 ? `검토 가능한 source 후보 ${candidateCount}개가 있지만 아직 claim_sources에 연결되지 않았습니다.` : "검증 가능한 출처가 아직 없어 verified로 승격할 수 없습니다." });
  }

  if (claim.status !== "verified" && sourceCount > 0 && !needsValue) {
    recommendations.push({ action: "verify_claim", label: adminRecommendationLabel("verify_claim"), priority: "high", href, reason: `출처 ${sourceCount}개와 확인된 값이 있으므로 사람이 citation을 확인한 뒤 verified 승격을 검토할 수 있습니다.` });
  }

  if (claim.status !== "verified" && !hasOfficialSource([...sources, ...candidates]) && (claim.confidence === "high" || needsValue)) {
    recommendations.push({ action: "request_official_source", label: adminRecommendationLabel("request_official_source"), priority: "medium", href, reason: "공식/법령/플랫폼 출처가 없어 high confidence 또는 미확인 값을 확정하기 어렵습니다." });
  }

  return recommendations;
}

export function recommendForCandidate(candidate: CandidateLike, href = "/admin/candidates"): AdminRecommendation[] {
  if (isLikelyDuplicateCandidate(candidate)) return [{ action: "reject_duplicate", label: adminRecommendationLabel("reject_duplicate"), priority: "high", href, reason: "후보 제목 또는 slug가 중복 신호를 포함합니다. 새 문서 생성 전에 기존 entity/document와 병합 여부를 확인하세요." }];
  if (["approved", "generated"].includes(candidate.status ?? "")) return [{ action: "promote_candidate", label: adminRecommendationLabel("promote_candidate"), priority: candidate.risk_tier === "high" ? "medium" : "high", href, reason: `${candidate.status} 상태입니다. 문서로 승격하되 claim은 출처 검증 전 verified 처리하지 마세요.` }];
  return [];
}

export function recommendForCommunityPost(post: CommunityPostLike, href = "/admin/posts?status=pending"): AdminRecommendation[] {
  if (post.status !== "pending") return [];
  if (isLikelySpam(post)) return [{ action: "mark_spam", label: adminRecommendationLabel("mark_spam"), priority: "high", href, reason: "여러 링크 또는 스팸 키워드가 감지되었습니다. 공개 전에 spam 처리 여부를 확인하세요." }];
  return [{ action: "request_official_source", label: adminRecommendationLabel("request_official_source"), priority: "low", href, reason: "커뮤니티 제출 내용은 공식 출처가 확인되기 전 claim-level 사실로 승격하지 마세요." }];
}

export function topAdminRecommendations(input: { claims?: ClaimLike[]; candidates?: CandidateLike[]; posts?: CommunityPostLike[] }, limit = 6) {
  return [
    ...(input.claims ?? []).flatMap((claim) => recommendForClaim(claim)),
    ...(input.candidates ?? []).flatMap((candidate) => recommendForCandidate(candidate)),
    ...(input.posts ?? []).flatMap((post) => recommendForCommunityPost(post)),
  ].sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority])).slice(0, limit);
}
