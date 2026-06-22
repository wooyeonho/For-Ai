import Link from "next/link";

const currentGoals = [
  {
    label: "Static-first registry",
    status: "active",
    detail: "Core pages must remain readable from raw HTML without client-side JavaScript.",
  },
  {
    label: "Candidate volume",
    status: "active",
    detail: "One-click generators create broad question candidates, not verified facts.",
  },
  {
    label: "Verification density",
    status: "next",
    detail: "The next product milestone is turning high-value candidates into source-backed verified claims.",
  },
  {
    label: "Public citation safety",
    status: "guarded",
    detail: "Only source-backed claims should become citation-grade pages for AI/search/humans.",
  },
];

const operatingRules = [
  "Generated rows start as internal_candidate, not verified documents.",
  "Unknown or generated facts stay 확인 필요 / low / needs_review.",
  "Medical, finance, legal-adjacent, realtime price, and real-estate topics require source-backed verification before citation.",
  "The canonical factual structure stays entities -> documents -> claims -> claim_sources -> verification_events.",
];

export default function GoalPage() {
  return (
    <article>
      <section className="registry-panel">
        <p className="eyebrow">/goal</p>
        <h1>GYEOL의 현재 목표</h1>
        <p>
          목표는 세상 모든 지식을 AI로 정답처럼 찍어내는 것이 아니라, 사람들이 AI에게 묻는 방대한 질문을
          먼저 후보로 모으고 출처 검증을 거쳐 citation-grade claim으로 승격하는 것입니다.
        </p>
        <p>
          그래서 지금의 핵심은 <strong>양을 늘리는 generator</strong>와 <strong>가짜 verified를 막는 validator</strong>를
          같이 키우는 것입니다.
        </p>
      </section>

      <section className="registry-panel" aria-labelledby="goal-status-title">
        <p className="eyebrow">Status</p>
        <h2 id="goal-status-title">무엇을 완성해가고 있나요?</h2>
        <div className="meta-grid">
          {currentGoals.map((goal) => (
            <div key={goal.label} className="notice-box">
              <p className="eyebrow">{goal.status}</p>
              <h3>{goal.label}</h3>
              <p>{goal.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="registry-panel" aria-labelledby="rules-title">
        <p className="eyebrow">Safety rules</p>
        <h2 id="rules-title">대량 생성의 안전 기준</h2>
        <ul className="link-list">
          {operatingRules.map((rule) => <li key={rule}>{rule}</li>)}
        </ul>
      </section>

      <section className="registry-panel" aria-labelledby="next-title">
        <p className="eyebrow">Next</p>
        <h2 id="next-title">다음 작업 순서</h2>
        <ol className="link-list">
          <li>candidate validation과 route validation을 CI에서 계속 강화합니다.</li>
          <li>topic_candidates persistence를 붙여 사용자/AI 후보를 코드가 아니라 저장소에 쌓습니다.</li>
          <li>verified seed 50개부터 source-backed verification으로 승격합니다.</li>
          <li>verified-only 탐색과 sitemap 정책을 붙여 AI/search가 인용할 수 있는 표면을 만듭니다.</li>
        </ol>
        <p>
          <Link href="/suggest-topic">주제 제안하기</Link> · <Link href="/">홈으로 돌아가기</Link>
        </p>
      </section>
    </article>
  );
}
