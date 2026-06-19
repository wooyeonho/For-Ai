import type { ClaimStatus, DocumentStatus } from "../../lib/types";

const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  needs_review: "검증 필요",
  verified: "검증 완료",
  disputed: "이의 제기",
  unknown: "알 수 없음",
};

const DOC_STATUS_LABELS: Record<DocumentStatus, string> = {
  ai_draft: "AI 초안",
  needs_review: "검토 필요",
  verified: "검증 완료",
  published: "게시됨",
  archived: "보관됨",
};

function statusClass(status: string): string {
  if (status === "verified" || status === "published") return "badge badge-verified";
  if (status === "disputed") return "badge badge-disputed";
  return "badge badge-review";
}

export function ClaimStatusBadge({ status }: { status: ClaimStatus }) {
  return <span className={statusClass(status)}>{CLAIM_STATUS_LABELS[status]}</span>;
}

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  return <span className={statusClass(status)}>{DOC_STATUS_LABELS[status]}</span>;
}
