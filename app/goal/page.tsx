import type { Metadata } from "next";
import { getGoalMetrics, getTrustReadiness } from "@/lib/goal-metrics";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Mission Control",
  description: "For-Ai public mission control for claim-level registry readiness, AI citation policy, and data lifecycle.",
};

const lifecycle = [
  "Question or entity candidate",
  "internal_candidate",
  "topic_candidates persistence",
  "admin/source review",
  "public_unverified",
  "source-backed verification",
  "citation-ready claim",
  "sitemap/API/AI citation",
];

const protocolFields = [
  ["entity_id", "global-entity-stable-id"],
  ["document_id", "locale-specific-document-id"],
  ["claim.field_path", "documents.data render path only; claim remains canonical"],
  ["claim_sources", "source records required before verification"],
  ["verification_events", "human review trail before verified status"],
  ["verification_status", "확인 필요 / Needs verification"],
  ["confidence", "low"],
];

export default function GoalPage() {
  const metrics = getGoalMetrics();
  const cards = [
    ["Verification queue", metrics.generatedQuestionCandidates, "candidate questions awaiting source review"],
    ["Claim registry backlog", metrics.longTailTopicCandidates, "global topic expansion candidates"],
    ["Source-backed claims", metrics.verifiedSeedTopics, "seed topics with traceable source review"],
    ["Needs-review claims", metrics.needsReviewClaims, "확인 필요 / Needs verification / low / needs_review"],
    ["AI citation policy", metrics.verifiedClaims, "only verified, source-backed claims may be cited"],
    ["Citation-ready claims", metrics.citationReadyClaims, "verified + sources + last_verified_at"],
    ["Risk policy", metrics.highRiskCandidates, "high-risk claims must not be cited before review"],
    ["Freshness review queue", metrics.realtimeCandidates, "time-sensitive claims require current sources"],
  ];

  return (
    <article className="goal-dashboard">
      <header className="registry-panel goal-hero">
        <p className="eyebrow">For-Ai Mission Control</p>
        <h1>For-Ai는 AI가 인용할 수 있는 사실을 claim 단위로 검증하는 글로벌 사실 레지스트리입니다.</h1>
        <p className="direct-answer-text">For-Ai is a global claim-level fact registry for AI-citable facts.</p>
        <p>Generated content is a verification queue, not verified truth. Unknown facts remain 확인 필요 / Needs verification until source-backed claims are approved.</p>
      </header>

      <section className="goal-two-column">
        <div className="registry-panel"><h2>For-Ai is</h2><ul><li>global claim-level fact registry</li><li>claim-level source tracker</li><li>verification queue</li><li>machine-readable evidence surface for AI-citable facts</li></ul></div>
        <div className="registry-panel"><h2>For-Ai is not</h2><ul><li>AI wiki</li><li>generated answer farm</li><li>unsourced encyclopedia</li><li>legal/medical/financial advice engine</li><li>SEO content farm</li></ul></div>
      </section>

      <section className="registry-panel"><h2>Current Registry State</h2><p>AI-citable facts require source-backed verification; unknown facts stay 확인 필요 / Needs verification with low confidence.</p><div className="goal-metric-grid">{cards.map(([label, value, detail]) => <div className="goal-metric-card" key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>)}</div></section>

      <section className="registry-panel">
        <h2>Claim Lifecycle</h2>
        <p>The public protocol mirrors the canonical pipeline; generated records stay unverified until source-backed human review.</p>
        <ol className="goal-pipeline">{lifecycle.map((step) => <li key={step}>{step}</li>)}</ol>
      </section>

      <section className="registry-panel">
        <h2>Verification Protocol</h2>
        <p>Schema-aligned examples must describe verification state, not fake signatures, block numbers, IPFS URLs, or yield mechanics.</p>
        <div className="goal-code-panel" aria-label="Schema-aligned verification protocol fields">
          <div className="goal-code-line"><span>{"{}"[0]}</span></div>
          {protocolFields.map(([field, value]) => (
            <div className="goal-code-line" key={field}>
              <code>{`"${field}"`}</code>
              <span>:</span>
              <span>{`"${value}"`}</span>
            </div>
          ))}
          <div className="goal-code-line"><span>{"{}"[1]}</span></div>
        </div>
        <p className="goal-protocol-actions">Unverified public examples stay labeled <strong>확인 필요 / Needs verification</strong> with <strong>low</strong> confidence until claim_sources and verification_events support a verified claim.</p>
      </section>

      <section className="goal-two-column">
        <div className="registry-panel"><h2>AI may cite</h2><ul><li>claims with status <code>verified</code></li><li>claims with source-backed <code>claim_sources</code></li><li>claims with <code>last_verified_at</code></li><li>pages intentionally included in verified sitemap policy</li></ul></div>
        <div className="registry-panel"><h2>AI must not cite</h2><ul><li><code>internal_candidate</code> or <code>needs_review</code></li><li><code>확인 필요</code> / <code>Needs verification</code></li><li>low confidence without source</li><li>generated question candidates</li><li>medical/legal/finance/realtime price/real-estate candidates before source-backed verification</li></ul></div>
      </section>

      <section className="registry-panel"><h2>Trust readiness</h2><div className="goal-metric-grid">{getTrustReadiness().map((metric) => <div className="goal-metric-card" key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small></div>)}</div></section>

      <section className="registry-panel"><h2>Risk policy</h2><dl className="meta-grid"><div className="meta-item"><dt>Low risk</dt><dd>everyday objects, food categories, biology taxonomy, vehicle types</dd></div><div className="meta-item"><dt>High risk</dt><dd>medical, legal-adjacent, finance, tax, real-estate, realtime prices, platform policies</dd></div><div className="meta-item"><dt>Monetization boundary</dt><dd>Business ownership and API quota models are documented as post-MVP design only. No payment, user accounts, complex auth, or large admin systems are added in MVP.</dd></div></dl></section>
    </article>
  );
}
