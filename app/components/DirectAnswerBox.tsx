import { ConfidenceBadge } from "./ConfidenceBadge";
import type { Confidence } from "../../lib/types";

export function DirectAnswerBox({
  answer,
  confidence,
  isCitable = true,
}: {
  answer: string;
  confidence: Confidence;
  isCitable?: boolean;
}) {
  if (!isCitable) {
    return (
      <section className="registry-panel citation-warning-panel" aria-labelledby="direct-answer-review">
        <h2 id="direct-answer-review">확인 필요</h2>
        <p>이 문서는 아직 인용 가능 조건을 충족하지 않아 직접 답변을 사실값으로 강조하지 않습니다.</p>
        <p className="meta-label">검토 전 답변: {answer}</p>
        <ConfidenceBadge level={confidence} />
      </section>
    );
  }

  return (
    <section className="registry-panel direct-answer-box" aria-labelledby="direct-answer">
      <h2 id="direct-answer">직접 답변</h2>
      <p className="direct-answer-text">{answer}</p>
      <ConfidenceBadge level={confidence} />
    </section>
  );
}
