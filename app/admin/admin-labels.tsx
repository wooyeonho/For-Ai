import type { ReactNode } from "react";

export const ADMIN_LABELS: Record<string, string> = {
  entity_id: "대상 ID",
  document_id: "문서 ID",
  field_path: "사실 항목",
  claim_value: "검증할 값",
  needs_review: "검토 필요",
  verified: "검증 완료",
  stale: "재검증 필요",
};

export function adminLabel(key: string) {
  return ADMIN_LABELS[key] ?? key;
}

export function AdminDbDetails({ children }: { children: ReactNode }) {
  return (
    <details style={{ marginTop: 8 }}>
      <summary style={{ cursor: "pointer", color: "#6b7280", fontSize: 12, fontWeight: 700 }}>
        고급 DB 정보 보기
      </summary>
      <div style={{ marginTop: 6, color: "#6b7280", fontSize: 12 }}>{children}</div>
    </details>
  );
}
