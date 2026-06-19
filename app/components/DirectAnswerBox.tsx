import { ConfidenceBadge } from "./ConfidenceBadge";
import type { Confidence } from "../../lib/types";

export function DirectAnswerBox({
  answer,
  confidence,
}: {
  answer: string;
  confidence: Confidence;
}) {
  return (
    <section className="registry-panel direct-answer-box" aria-labelledby="direct-answer">
      <h2 id="direct-answer">직접 답변</h2>
      <p className="direct-answer-text">{answer}</p>
      <ConfidenceBadge level={confidence} />
    </section>
  );
}
