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

type ClaimLike = {
  status?: string | null;
  confidence?: string | null;
  claim_value?: string | null;
  last_verified_at?: string | null;
  claim_sources?: unknown[] | null;
  source_candidates?: unknown[] | null;
};

type CandidateLike = { status?: string | null; slug?: string | null };
type CommunityPostLike = { status?: string | null; content?: string | null; author_type?: string | null };
type DocumentLike = { status?: string | null; last_verified_at?: string | null; slug?: string | null };

export type AdminRecommendationContext = {
  claim?: ClaimLike | null;
  candidate?: CandidateLike | null;
  post?: CommunityPostLike | null;
  document?: DocumentLike | null;
  counts?: {
    pending_community_posts?: number | null;
    candidates_new?: number | null;
    candidates_generated?: number | null;
    claims_needs_review?: number | null;
    stale_claims?: number | null;
    source_check_failures?: number | null;
  } | null;
  hrefs?: Partial<Record<AdminRecommendationAction, string>>;
  now?: Date;
};

export const ADMIN_RECOMMENDATION_LABELS: Record<AdminRecommendationAction, string> = {
  add_source: "출처 추가",
  verify_claim: "Claim 검증",
  reject_duplicate: "중복 반려",
  mark_spam: "스팸 처리",
  recheck_stale: "오래된 Claim 재검증",
  promote_candidate: "후보 공개 등록",
  request_official_source: "공식 출처 요청",
};

const STALE_DAYS = 180;
const SPAM_PATTERN = /(https?:\/\/\S+\s*){3,}|casino|loan|crypto|바카라|도박|대출|성인|무료\s*머니/i;

function daysSince(value?: string | null, now = new Date()) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  return Math.floor((now.getTime() - time) / (24 * 60 * 60 * 1000));
}

function addRecommendation(
  list: AdminRecommendation[],
  action: AdminRecommendationAction,
  reason: string,
  priority: AdminRecommendation["priority"],
  href?: string,
) {
  if (list.some((item) => item.action === action && item.reason === reason)) return;
  list.push({ action, label: ADMIN_RECOMMENDATION_LABELS[action], reason, priority, href });
}

export function recommendAdminActions(context: AdminRecommendationContext): AdminRecommendation[] {
  const recommendations: AdminRecommendation[] = [];
  const now = context.now ?? new Date();
  const claim = context.claim;
  const candidate = context.candidate;
  const post = context.post;
  const document = context.document;
  const counts = context.counts;
  const hrefs = context.hrefs ?? {};

  if ((counts?.pending_community_posts ?? 0) > 0) {
    addRecommendation(recommendations, "mark_spam", `검토 대기 커뮤니티 글이 ${counts?.pending_community_posts}건 있습니다. 공개 전 스팸·홍보·무관한 내용을 먼저 걸러야 합니다.`, "high", hrefs.mark_spam ?? "/admin/posts?status=pending");
  }
  if ((counts?.claims_needs_review ?? 0) > 0) {
    addRecommendation(recommendations, "verify_claim", `needs_review claim이 ${counts?.claims_needs_review}건 있습니다. 사람이 출처를 확인해야 verified로 승격할 수 있습니다.`, "high", hrefs.verify_claim ?? "/admin/verify-claim?claim_status=needs_review");
  }
  if ((counts?.source_check_failures ?? 0) > 0) {
    addRecommendation(recommendations, "request_official_source", `출처 점검 실패 또는 unknown source가 ${counts?.source_check_failures}건 있습니다. 신뢰 가능한 공식 출처를 다시 확보해야 합니다.`, "medium", hrefs.request_official_source ?? "/admin/verify-claim");
  }
  if ((counts?.stale_claims ?? 0) > 0) {
    addRecommendation(recommendations, "recheck_stale", `180일 이상 지난 verified claim이 ${counts?.stale_claims}건 있습니다. 최신 사실인지 재확인하세요.`, "medium", hrefs.recheck_stale ?? "/admin/review#verified-documents");
  }
  if ((counts?.candidates_generated ?? 0) > 0 || (counts?.candidates_new ?? 0) > 0) {
    const total = (counts?.candidates_generated ?? 0) + (counts?.candidates_new ?? 0);
    addRecommendation(recommendations, "promote_candidate", `공개 등록 전 후보가 ${total}건 있습니다. 중복 여부와 claim 단위 구조를 확인한 뒤 승격하세요.`, "medium", hrefs.promote_candidate ?? "/admin/candidates");
  }

  if (post) {
    const content = post.content ?? "";
    if (post.status === "pending" && SPAM_PATTERN.test(content)) {
      addRecommendation(recommendations, "mark_spam", "본문에 반복 링크·스팸성 키워드가 있어 공개하지 말고 spam/hidden 처리를 권장합니다.", "high", hrefs.mark_spam ?? "/admin/posts?status=pending");
    }
  }

  if (claim) {
    const sourceCount = claim.claim_sources?.length ?? 0;
    const candidateCount = claim.source_candidates?.length ?? 0;
    const value = (claim.claim_value ?? "").trim();
    if (claim.status !== "verified" && sourceCount === 0) {
      addRecommendation(recommendations, "add_source", candidateCount > 0 ? "source 후보가 있지만 아직 claim_source가 없습니다. 후보 출처를 직접 열어 보고 근거를 저장하세요." : "검증 가능한 claim_source가 없습니다. verified 승격 전에 추적 가능한 출처를 추가해야 합니다.", "high", hrefs.add_source);
    }
    if (claim.status === "needs_review" && sourceCount > 0 && value && value !== "확인 필요") {
      addRecommendation(recommendations, "verify_claim", "출처와 값이 모두 있으므로 citation 문구를 대조한 뒤 verified 승격을 검토하세요.", "high", hrefs.verify_claim);
    }
    if (claim.status === "needs_review" && (value === "" || value === "확인 필요" || claim.confidence === "low")) {
      addRecommendation(recommendations, "request_official_source", "값이 비어 있거나 confidence가 낮습니다. 공식 출처를 확보하기 전에는 verified로 올리지 마세요.", "medium", hrefs.request_official_source);
    }
    const age = daysSince(claim.last_verified_at, now);
    if (claim.status === "verified" && (age == null || age >= STALE_DAYS)) {
      addRecommendation(recommendations, "recheck_stale", age == null ? "verified claim이지만 last_verified_at이 없습니다. 재검증 일자를 남기세요." : `${age}일 전에 검증된 claim입니다. 변경 가능성이 있으므로 최신 출처로 재확인하세요.`, "medium", hrefs.recheck_stale);
    }
  }

  if (candidate) {
    if (candidate.status === "generated" || candidate.status === "approved") {
      addRecommendation(recommendations, "promote_candidate", `${candidate.status} 후보입니다. 중복 문서가 없는지 확인하고 claim 구조로 공개 등록하세요.`, "medium", hrefs.promote_candidate ?? (candidate.slug ? `/admin/verify-claim?slug=${encodeURIComponent(candidate.slug)}` : "/admin/candidates"));
    }
    if (candidate.status === "new") {
      addRecommendation(recommendations, "reject_duplicate", "신규 후보는 기존 slug/entity와 중복될 수 있습니다. 먼저 중복이면 반려하고, 아니면 검토 단계로 넘기세요.", "low", hrefs.reject_duplicate ?? "/admin/candidates?status=new");
    }
  }

  if (document) {
    const age = daysSince(document.last_verified_at, now);
    if (document.status === "verified" && (age == null || age >= STALE_DAYS)) {
      addRecommendation(recommendations, "recheck_stale", age == null ? "verified 문서에 최근 검증일이 없습니다. 핵심 claim의 출처를 다시 확인하세요." : `문서가 ${age}일 전에 검증되었습니다. AI 인용 품질 유지를 위해 재검증하세요.`, "medium", hrefs.recheck_stale ?? (document.slug ? `/admin/verify-claim?slug=${encodeURIComponent(document.slug)}` : "/admin/verify-claim"));
    }
  }

  return recommendations.sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority]));
}
