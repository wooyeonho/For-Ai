import type { Metadata } from "next";
import { getGoalMetrics, getTrustReadiness } from "@/lib/goal-metrics";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Mission Control",
  description: "For-Ai public mission control for claim-level registry readiness, AI citation policy, and data lifecycle.",
};

const lifecycle = [
  "AI/user generated question", "internal_candidate", "topic_candidates persistence", "admin/source review", "public_unverified", "source-backed verification", "verified claim", "sitemap/API/AI citation",
];

export default function GoalPage() {
  const metrics = getGoalMetrics();
  const cards = [
    ["Generated question candidates", metrics.generatedQuestionCandidates, "data/question-candidates queue"],
    ["Long-tail topic candidates", metrics.longTailTopicCandidates, "deterministic 10,000+ expansion baseline"],
    ["Verified seed topics", metrics.verifiedSeedTopics, "verification queue only; not counted as verified claims"],
    ["Needs-review claims", metrics.needsReviewClaims, "확인 필요 / low / needs_review"],
    ["Verified claims", metrics.verifiedClaims, "source-backed local seed data only"],
    ["Citation-ready claims", metrics.citationReadyClaims, "verified + sources + last_verified_at"],
    ["High-risk candidates", metrics.highRiskCandidates, "must not be cited before review"],
    ["Realtime candidates", metrics.realtimeCandidates, "freshness-sensitive topics"],
  ];

  return (
    <article className="goal-dashboard">
      <header className="registry-panel goal-hero">
        <p className="eyebrow">For-Ai Mission Control</p>
        <h1>GYEOL은 AI가 인용할 수 있는 사실을 claim 단위로 검증 가능하게 만드는 레지스트리입니다.</h1>
        <p className="direct-answer-text">GYEOL exists to make AI-citable facts verifiable at the claim level.</p>
        <p>Generated content is a candidate queue, not verified truth. Only source-backed claims may become citation-grade facts.</p>
      </header>

      <section className="goal-two-column">
        <div className="registry-panel"><h2>GYEOL is</h2><ul><li>local fact registry</li><li>claim-level source tracker</li><li>verification queue</li><li>machine-readable evidence surface</li></ul></div>
        <div className="registry-panel"><h2>GYEOL is not</h2><ul><li>AI wiki</li><li>generated answer farm</li><li>unsourced encyclopedia</li><li>legal/medical/financial advice engine</li><li>SEO content farm</li></ul></div>
      </section>

      <section className="registry-panel"><h2>Current Registry State</h2><p>Verified claims are intentionally low until source-backed verification is implemented.</p><div className="goal-metric-grid">{cards.map(([label, value, detail]) => <div className="goal-metric-card" key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>)}</div></section>

      <section className="registry-panel"><h2>Data lifecycle</h2><ol className="goal-pipeline">{lifecycle.map((step) => <li key={step}>{step}</li>)}</ol></section>

      <section className="goal-two-column">
        <div className="registry-panel"><h2>AI may cite</h2><ul><li>claims with status <code>verified</code></li><li>claims with source-backed <code>claim_sources</code></li><li>claims with <code>last_verified_at</code></li><li>pages intentionally included in verified sitemap policy</li></ul></div>
        <div className="registry-panel"><h2>AI must not cite</h2><ul><li><code>internal_candidate</code> or <code>needs_review</code></li><li><code>확인 필요</code></li><li>low confidence without source</li><li>generated question candidates</li><li>medical/legal/finance/realtime price/real-estate candidates before source-backed verification</li></ul></div>
      </section>

      <section className="registry-panel"><h2>Trust readiness</h2><div className="goal-metric-grid">{getTrustReadiness().map((metric) => <div className="goal-metric-card" key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small></div>)}</div></section>

      <section className="registry-panel"><h2>Risk policy</h2><dl className="meta-grid"><div className="meta-item"><dt>Low risk</dt><dd>everyday objects, food categories, biology taxonomy, vehicle types</dd></div><div className="meta-item"><dt>High risk</dt><dd>medical, legal-adjacent, finance, tax, real-estate, realtime prices, platform policies</dd></div><div className="meta-item"><dt>Monetization boundary</dt><dd>Business ownership and API quota models are documented as post-MVP design only. No payment, user accounts, complex auth, or large admin systems are added in MVP.</dd></div></dl></section>
    </article>
  );
}
