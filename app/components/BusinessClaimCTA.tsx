import Link from "next/link";

interface BusinessClaimCTAProps {
  entityId: string;
  documentSlug: string;
  locale: string;
  documentTitle: string;
  unverifiedCriticalClaims: number;
  staleSources: number;
}

export function BusinessClaimCTA({
  entityId,
  documentSlug,
  locale,
  documentTitle,
  unverifiedCriticalClaims,
  staleSources,
}: BusinessClaimCTAProps) {
  const claimUrl = `/business?entity_id=${encodeURIComponent(entityId)}&slug=${encodeURIComponent(documentSlug)}&lang=${encodeURIComponent(locale)}`;
  const correctionUrl = `/report/${documentSlug}?lang=${locale}&return=/${locale}/wiki/${documentSlug}`;

  return (
    <section
      className="registry-panel"
      aria-labelledby="business-claim-cta"
      style={{ background: "#f8fafc", border: "2px solid #cbd5e1", borderInlineStart: "6px solid #2563eb" }}
    >
      <p className="eyebrow">Business owner tools · pre-payment waitlist</p>
      <h2 id="business-claim-cta" style={{ marginTop: 0 }}>Claim this entity / Correct AI-visible facts</h2>
      <p>
        Own or represent <strong>{documentTitle}</strong>? Join the waitlist or submit contact details before payment.
        Verified business profiles unlock a risk dashboard for AI answer risk, unverified critical claims, and stale sources,
        but every factual change still requires independent human verification.
      </p>
      <dl className="direct-answer-meta" aria-label="Business risk preview">
        <div><dt>AI answer risk inputs</dt><dd>{unverifiedCriticalClaims} critical unverified · {staleSources} stale</dd></div>
        <div><dt>Fact integrity</dt><dd>Paid profile ≠ verified claim</dd></div>
        <div><dt>Sponsored placement</dt><dd>Promotional only; no verification effect</dd></div>
      </dl>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
        <Link className="button" href={claimUrl}>Claim this entity</Link>
        <Link className="button button-secondary" href={correctionUrl}>Correct AI-visible facts</Link>
      </div>
    </section>
  );
}
