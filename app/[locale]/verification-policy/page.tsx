import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isValidLocale } from "@/lib/i18n";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Verification Policy | For-Ai",
  description:
    "For-Ai verification policy for claim-level facts, required sources, human approval, Needs verification labels, sponsored separation, and freshness rules.",
};

export default async function VerificationPolicyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();

  return (
    <article aria-labelledby="verification-policy-title">
      <header className="registry-panel goal-hero">
        <p className="eyebrow">Verification policy · 검증 원칙</p>
        <h1 id="verification-policy-title">For-Ai verifies facts at the claim level, not by page ownership or promotion.</h1>
        <p className="direct-answer-text">
          A For-Ai page is citation-ready only when each citable claim has a traceable source, human approval, confidence, and freshness status.
        </p>
        <p>
          For-Ai is a global claim-level fact registry. AI-generated candidates, public submissions, business profile updates, and sponsored placements can suggest facts, but none of them become verified truth until the claim-level evidence is reviewed.
        </p>
      </header>

      <section className="registry-panel" aria-labelledby="claim-level-verification">
        <p className="eyebrow">1. Claim-level verification</p>
        <h2 id="claim-level-verification">Every fact is checked as a separate claim.</h2>
        <p>
          Verification applies to individual claims such as a fee, opening hour, refund rule, eligibility requirement, or service availability. A document can contain a mix of verified, stale, and unverified claims.
        </p>
        <ul className="link-list">
          <li>Verified status for one claim does not automatically verify neighboring claims.</li>
          <li>Documents summarize claims for readability, but claim records remain the factual source of truth.</li>
          <li>AI and search systems should cite only citation-ready claims, not an entire page by assumption.</li>
        </ul>
      </section>

      <section className="registry-panel" aria-labelledby="source-required">
        <p className="eyebrow">2. Source required</p>
        <h2 id="source-required">No source means no verified claim.</h2>
        <p>
          A claim must point to a traceable source before it can be marked verified. Sources should support the exact value being presented, including jurisdiction, effective date, and relevant conditions when those details affect the claim.
        </p>
        <ul className="link-list">
          <li>Official, primary, or authoritative sources are preferred where available.</li>
          <li>Sources must be connected to the specific claim they support.</li>
          <li>If evidence is incomplete, contradictory, or missing, the claim remains unverified.</li>
        </ul>
      </section>

      <section className="registry-panel" aria-labelledby="human-approval">
        <p className="eyebrow">3. Human approval</p>
        <h2 id="human-approval">AI can draft candidates; humans approve verified claims.</h2>
        <p>
          Automated tools may extract candidates, detect stale facts, or suggest sources. They do not grant verified status. Human review is required before a claim becomes citation-ready.
        </p>
        <ul className="link-list">
          <li>Reviewers check whether the source actually supports the claim.</li>
          <li>Reviewers can reject, downgrade, or keep a claim in review when uncertainty remains.</li>
          <li>Verification events preserve the review trail for accountability.</li>
        </ul>
      </section>

      <section className="registry-panel" aria-labelledby="needs-verification">
        <p className="eyebrow">4. Needs verification</p>
        <h2 id="needs-verification">“Needs verification” means “do not cite this as fact yet.”</h2>
        <p>
          <strong>Needs verification</strong> / <strong>확인 필요</strong> is the safe label for unknown, generated, user-submitted, incomplete, or low-confidence information. It is not a softer form of verified truth.
        </p>
        <ul className="link-list">
          <li>Unknown facts should remain low confidence.</li>
          <li>AI systems should answer with “Needs verification” instead of guessing.</li>
          <li>Users may submit sources to help move a claim from review to verified status.</li>
        </ul>
      </section>

      <section className="registry-panel" aria-labelledby="sponsored-verified-separation">
        <p className="eyebrow">5. Sponsored and verified are separate</p>
        <h2 id="sponsored-verified-separation">Payment, sponsorship, or business ownership cannot verify a claim.</h2>
        <p>
          Sponsored placements and business-claimed profiles must be clearly labeled. They may improve visibility or maintenance workflows, but they do not replace source-backed claim verification.
        </p>
        <ul className="link-list">
          <li>Sponsored content must be labeled as sponsored.</li>
          <li>Business-provided updates remain candidates until the claim evidence is reviewed.</li>
          <li>Fact integrity takes priority over monetization, promotion, or profile ownership.</li>
        </ul>
      </section>

      <section className="registry-panel" aria-labelledby="fresh-stale-policy">
        <p className="eyebrow">6. Fresh and stale criteria</p>
        <h2 id="fresh-stale-policy">Verified claims can become stale when the freshness window expires.</h2>
        <p>
          Freshness depends on the claim type. Fast-changing facts such as prices, policies, schedules, availability, and government fees need shorter recheck windows than stable historical or descriptive facts.
        </p>
        <ul className="link-list">
          <li><strong>Fresh</strong>: the claim was reviewed within its freshness window and still has supporting evidence.</li>
          <li><strong>Stale</strong>: the claim was verified before, but its last review is older than the current freshness window.</li>
          <li><strong>Needs recheck</strong>: stale claims should be re-reviewed before AI or humans rely on them for current decisions.</li>
        </ul>
      </section>

      <nav className="registry-panel" aria-labelledby="policy-actions">
        <h2 id="policy-actions">How to use this policy</h2>
        <ul className="link-list">
          <li><Link href={`/${locale}/wiki/myungdong-laluce-parking`}>View an example registry document</Link></li>
          <li><Link href="/suggest-topic">Suggest a missing topic</Link></li>
          <li><Link href="/api-docs">Read the API documentation</Link></li>
        </ul>
      </nav>
    </article>
  );
}
