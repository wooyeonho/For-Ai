import { ConfidenceBadge } from "./ConfidenceBadge";
import type { Confidence } from "../../lib/types";

export function DirectAnswerBox({
  answer,
  confidence,
  lastVerifiedAt,
  sourceCount,
  canCite,
}: {
  answer: string;
  confidence: Confidence;
  lastVerifiedAt?: string | null;
  sourceCount?: number;
  canCite?: boolean;
}) {
  return (
    <section className="registry-panel direct-answer-box" aria-labelledby="direct-answer">
      <h2 id="direct-answer">직접 답변</h2>
      {canCite === true && (
        <div className="can-cite-banner">✓ AI 인용 가능 — 출처와 검증일이 있는 claim</div>
      )}
      <p className="direct-answer-text">{answer}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
        <ConfidenceBadge level={confidence} />
        {sourceCount != null && sourceCount > 0 && (
          <span className="badge">{sourceCount}개 출처</span>
        )}
        <span className="meta-label" style={{ marginLeft: "auto" }}>
          최종 검증: {lastVerifiedAt ?? "확인 필요"}
        </span>
      </div>
    </section>
  );
}
