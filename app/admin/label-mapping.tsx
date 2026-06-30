import type { ReactNode } from "react";

export const ADMIN_LABELS: Record<string, string> = {
  entity_id: "대상 ID",
  document_id: "문서 ID",
  field_path: "사실 항목",
  claim_value: "검증할 값",
  needs_review: "검토 필요",
  verified: "검증 완료",
};

export function adminLabel(key: string) {
  return ADMIN_LABELS[key] ?? key;
}

export function adminStatusLabel(status?: string | null) {
  return status ? adminLabel(status) : "-";
}

export function AdminDbDetails({ children, summary = "고급 DB 정보" }: { children: ReactNode; summary?: string }) {
  return (
    <details style={{ margin: "8px 0", fontSize: 12, color: "#6b7280" }}>
      <summary style={{ cursor: "pointer", fontWeight: 700 }}>{summary}</summary>
      <div style={{ marginTop: 6 }}>{children}</div>
    </details>
  );
}
