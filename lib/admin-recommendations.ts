export type AdminRecommendationAction =
  | "add_source"
  | "verify_claim"
  | "reject_duplicate"
  | "mark_spam"
  | "recheck_stale"
  | "promote_candidate";

export type AdminRecommendation = {
  action: AdminRecommendationAction;
  label: string;
  reason: string;
  tone: "info" | "success" | "warning" | "danger";
};

type SourceLike = { url?: string | null; title?: string | null; citation?: string | null; source_type?: string | null };

type ClaimLike = {
  status?: string | null;
  confidence?: string | null;
  claim_value?: string | null;
  last_verified_at?: string | null;
  claim_sources?: SourceLike[] | null;
  source_candidates?: SourceLike[] | null;
};

type CandidateLike = {
  status?: string | null;
  reviewed_at?: string | null;
  promoted_at?: string | null;
  risk_tier?: string | null;
};

type InboxLike = {
  status?: string | null;
  content?: string | null;
  message?: string | null;
  report_type?: string | null;
  author_type?: string | null;
};

const STALE_DAYS = 180;

export function daysSince(date?: string | null, now = new Date()): number | null {
  if (!date) return null;
  const time = new Date(date).getTime();
  if (Number.isNaN(time)) return null;
  return Math.floor((now.getTime() - time) / (24 * 60 * 60 * 1000));
}

function hasSource(sources?: SourceLike[] | null) {
  return Array.isArray(sources) && sources.some((source) => Boolean(source.url || source.title || source.citation));
}

function hasSourceCandidate(claim: ClaimLike) {
  return hasSource(claim.source_candidates);
}

function hasSpamSignal(item: InboxLike) {
  const text = `${item.content ?? ""} ${item.message ?? ""}`.toLowerCase();
  return item.status === "spam_suspected"
    || /https?:\/\/\S+.*https?:\/\/\S+/.test(text)
    || /(casino|crypto giveaway|free money|바카라|도박|스팸)/i.test(text);
}

export function recommendForClaim(claim: ClaimLike, now = new Date()): AdminRecommendation {
  const sourceCount = claim.claim_sources?.length ?? 0;
  const staleDays = daysSince(claim.last_verified_at, now);

  if (claim.status === "verified" && staleDays !== null && staleDays > STALE_DAYS) {
    return {
      action: "recheck_stale",
      label: "재검증",
      tone: "warning",
      reason: `마지막 검증 후 ${staleDays}일이 지나 최신성이 떨어질 수 있습니다. 운영자가 출처를 다시 열어 현재 값과 일치하는지 확인하세요.`,
    };
  }

  if (claim.status === "verified") {
    return {
      action: "verify_claim",
      label: "검증 유지",
      tone: "success",
      reason: "이미 verified 상태입니다. 값·출처·인용 문구가 여전히 맞는지만 표본 점검하면 됩니다.",
    };
  }

  if (sourceCount === 0) {
    return {
      action: "add_source",
      label: "출처 추가",
      tone: "warning",
      reason: hasSourceCandidate(claim)
        ? "source 후보가 있지만 아직 claim_sources로 확정되지 않았습니다. 후보 출처를 직접 확인한 뒤 공식 출처를 추가하세요."
        : "검증 가능한 출처가 아직 없습니다. No fake facts 원칙에 따라 verified 전에 출처를 먼저 확보하세요.",
    };
  }

  if (claim.claim_value === "확인 필요" || claim.confidence === "low") {
    return {
      action: "add_source",
      label: "근거 보강",
      tone: "warning",
      reason: "값이 아직 '확인 필요'이거나 confidence가 낮습니다. 출처의 실제 문구를 citation에 남기고 확인된 값으로 보강하세요.",
    };
  }

  return {
    action: "verify_claim",
    label: "claim 검증",
    tone: "info",
    reason: "출처가 연결되어 있습니다. 운영자가 URL과 citation을 육안 확인한 뒤 verified 승격을 검토하세요.",
  };
}

export function recommendForCandidate(candidate: CandidateLike): AdminRecommendation {
  if (candidate.status === "generated" || candidate.status === "approved") {
    return {
      action: "promote_candidate",
      label: "후보 승격",
      tone: candidate.risk_tier === "high" || candidate.risk_tier === "forbidden" ? "warning" : "info",
      reason: candidate.risk_tier === "high" || candidate.risk_tier === "forbidden"
        ? "고위험 후보입니다. 문서로 승격하기 전에 필수 claim과 공식 출처가 준비됐는지 먼저 확인하세요."
        : "운영 검토가 진행된 후보입니다. entity_id와 안정적인 영어 slug를 확인한 뒤 문서/claim 생성으로 승격하세요.",
    };
  }

  return {
    action: "reject_duplicate",
    label: "중복 확인",
    tone: "info",
    reason: "신규 후보는 기존 entity·slug와 겹칠 수 있습니다. 중복이면 reject_duplicate, 새 주제면 검토를 계속하세요.",
  };
}

export function recommendForInboxItem(item: InboxLike): AdminRecommendation {
  if (hasSpamSignal(item)) {
    return {
      action: "mark_spam",
      label: "스팸 처리",
      tone: "danger",
      reason: "스팸 신호가 있습니다. 공개 반영하지 말고 mark_spam으로 분리한 뒤 필요한 경우 contributor_hash 기준으로 추가 확인하세요.",
    };
  }

  if (item.report_type === "duplicate") {
    return {
      action: "reject_duplicate",
      label: "중복 반려",
      tone: "warning",
      reason: "중복 신고 유형입니다. 기존 claim/entity와 동일하면 reject_duplicate로 닫고, 다른 사실이면 별도 claim으로 분리하세요.",
    };
  }

  return {
    action: "add_source",
    label: "출처 요청",
    tone: "info",
    reason: "사용자 제출 내용은 출처 없이 verified가 될 수 없습니다. 운영자가 공식/신뢰 출처를 요청하거나 직접 추가하세요.",
  };
}

export function recommendationBadgeColor(tone: AdminRecommendation["tone"]) {
  if (tone === "success") return { background: "#dcfce7", color: "#166534", border: "#86efac" };
  if (tone === "warning") return { background: "#fef3c7", color: "#92400e", border: "#fde68a" };
  if (tone === "danger") return { background: "#fee2e2", color: "#991b1b", border: "#fecaca" };
  return { background: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" };
}
