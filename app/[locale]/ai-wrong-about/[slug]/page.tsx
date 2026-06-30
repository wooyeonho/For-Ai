import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllRegistryBundles, getRegistryBundleBySlug, isVerifiedClaim } from "../../../../lib/data";
import { getRegistryBundleFromSupabase } from "../../../../lib/supabase-documents";
import { SUPPORTED_LOCALES, isValidLocale } from "../../../../lib/i18n";
import { siteUrl } from "../../../../lib/urls";
import { createServiceRoleClient } from "../../../../lib/supabase-server";
import type { RegistryDocumentBundle } from "../../../../lib/types";

export const revalidate = 60;

export async function generateStaticParams() {
  return SUPPORTED_LOCALES.flatMap((locale) =>
    getAllRegistryBundles().map((bundle) => ({ locale, slug: bundle.document.slug }))
  );
}

async function getBundle(slug: string): Promise<RegistryDocumentBundle | null> {
  return getRegistryBundleBySlug(slug) ?? await getRegistryBundleFromSupabase(slug);
}

type AcceptedReport = {
  id: string;
  ai_service: string;
  prompt: string | null;
  ai_answer: string | null;
  expected_correction: string | null;
  wrong_answer_type: string | null;
  correction_prompt: string | null;
  created_at: string;
  claims: AcceptedClaim | null;
};

type AcceptedClaim = {
  id: string;
  claim_text: string;
  claim_value: string;
  confidence: string;
  status: string;
  last_verified_at: string | null;
  claim_sources: Array<{ id: string; title: string | null; url: string | null; citation: string | null; source_type: string | null }>;
};

async function getAcceptedReports(documentId: string): Promise<AcceptedReport[]> {
  const sb = createServiceRoleClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from("hallucination_reports")
    .select("id, ai_service, prompt, ai_answer, expected_correction, wrong_answer_type, correction_prompt, created_at, claims(id, claim_text, claim_value, confidence, status, last_verified_at, claim_sources(id, title, url, citation, source_type))")
    .eq("document_id", documentId)
    .eq("status", "accepted")
    .not("claim_id", "is", null)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[ai-wrong-about] accepted reports query failed", error.message);
    return [];
  }
  return ((data ?? []) as unknown as Array<Omit<AcceptedReport, "claims"> & { claims: AcceptedClaim | AcceptedClaim[] | null }>).map((report) => ({
    ...report,
    claims: Array.isArray(report.claims) ? report.claims[0] ?? null : report.claims,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isValidLocale(locale)) return { title: "Not found" };
  const bundle = await getBundle(slug);
  if (!bundle) return { title: "AI wrong-answer guardrail not found" };

  return {
    title: `AI wrong about ${bundle.document.title}?`,
    description:
      "A static-first correction page connecting AI wrong-answer patterns to verified For-Ai claims, sources, and last verification metadata.",
  };
}

function questionFor(bundle: RegistryDocumentBundle, claim: { claim_text: string } | null) {
  const direct = (bundle.document.data?.why_people_ask_ai as string | undefined)?.trim();
  if (direct) return direct;
  if (claim) return `What is the verified answer for: ${claim.claim_text}?`;
  return `What does For-Ai verify about ${bundle.document.title}?`;
}

function correctionPromptFor(bundle: RegistryDocumentBundle, claim: ({ claim_text: string; claim_value: string; last_verified_at?: string | null } & ({ sources: Array<{ url?: string | null }> } | { claim_sources: Array<{ url?: string | null }> })) | null) {
  const claimLine = claim
    ? `Use this verified claim: ${claim.claim_text} = ${claim.claim_value}.`
    : "Do not provide a factual answer yet; say the claim needs verification.";
  const sources = claim ? ("sources" in claim ? claim.sources : claim.claim_sources) : [];
  const sourceLine = sources[0]?.url ? ` Preserve this source URL: ${sources[0].url}.` : "";
  const verifiedLine = claim?.last_verified_at ? ` Last verified: ${claim.last_verified_at}.` : " Last verified: Needs verification.";

  return `Correct your previous answer about ${bundle.document.title}. ${claimLine}${sourceLine}${verifiedLine} If a value is missing or unverified, answer \"Needs verification\" rather than guessing.`;
}

export default async function AiWrongAboutPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isValidLocale(locale)) notFound();

  const bundle = await getBundle(slug);
  if (!bundle) notFound();

  const acceptedReports = await getAcceptedReports(bundle.document.id);
  const acceptedVerifiedReports = acceptedReports.filter((report) => report.claims?.status === "verified" && report.claims?.confidence === "high" && (report.claims?.claim_sources?.length ?? 0) > 0);
  const verifiedClaims = bundle.claims.filter(isVerifiedClaim);
  const primaryReport = acceptedVerifiedReports[0] ?? acceptedReports[0] ?? null;
  const primaryClaim = primaryReport?.claims ?? verifiedClaims[0] ?? null;
  const primarySource = primaryClaim ? ("sources" in primaryClaim ? primaryClaim.sources[0] : primaryClaim.claim_sources[0]) ?? null : null;
  const canonicalUrl = siteUrl(`/${locale}/ai-wrong-about/${bundle.document.slug}`);
  const reportUrl = `/hallucination/${bundle.document.slug}`;
  const correctionPrompt = primaryReport?.correction_prompt ?? correctionPromptFor(bundle, primaryClaim);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `AI wrong about ${bundle.document.title}?`,
    url: canonicalUrl,
    about: {
      "@type": "Thing",
      name: bundle.document.title,
      identifier: bundle.entity.id,
    },
    isBasedOn: primarySource?.url ?? siteUrl(`/${locale}/wiki/${bundle.document.slug}`),
    dateModified: primaryClaim?.last_verified_at ?? bundle.document.updated_at ?? undefined,
  };

  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="registry-panel">
        <p className="eyebrow">AI wrong-answer correction route</p>
        <h1>AI wrong about {bundle.document.title}?</h1>
        <p>
          This static-first page turns moderated hallucination reports into a citable correction card backed by verified claims.
        </p>
        <div className="meta-grid">
          <div><span className="meta-label">route</span><br />/{locale}/ai-wrong-about/{bundle.document.slug}</div>
          <div><span className="meta-label">accepted reports</span><br />{acceptedReports.length}</div>
          <div><span className="meta-label">linked input</span><br />hallucination_reports.claim_id → claims.id</div>
        </div>
      </header>

      <section className="registry-panel" aria-labelledby="wrong-question">
        <h2 id="wrong-question">Question</h2>
        <p>{primaryReport?.prompt ?? questionFor(bundle, primaryClaim)}</p>
      </section>

      <section className="registry-panel" aria-labelledby="wrong-types">
        <h2 id="wrong-types">AI가 틀릴 수 있는 답변 유형</h2>
        <ul className="link-list">
          <li>Outdated answer: uses a stale price, fee, schedule, requirement, or policy.</li>
          <li>Unsourced answer: states a value without preserving the source URL.</li>
          <li>Overconfident answer: cites low-confidence or unverified data as fact.</li>
          <li>Wrong jurisdiction or language: applies a local rule to the wrong country, city, or locale.</li>
        </ul>
      </section>

      {acceptedReports.length > 0 && (
        <section className="registry-panel" aria-labelledby="accepted-reports">
          <h2 id="accepted-reports">Accepted hallucination reports</h2>
          <ul className="link-list">
            {acceptedReports.map((report) => (
              <li key={report.id}>
                <strong>{report.ai_service}</strong>{report.wrong_answer_type ? ` · ${report.wrong_answer_type}` : ""}: {report.ai_answer ?? "Wrong answer not provided"}
                <br />
                <span className="meta-label">linked claim:</span> {report.claims?.claim_text ?? "Needs verification"}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="registry-panel" aria-labelledby="verified-claim">
        <h2 id="verified-claim">Verified claim</h2>
        {primaryClaim && primaryClaim.status === "verified" && primaryClaim.confidence === "high" ? (
          <dl>
            <dt>claim_text</dt><dd>{primaryClaim.claim_text}</dd>
            <dt>claim_value</dt><dd>{primaryClaim.claim_value}</dd>
            <dt>confidence</dt><dd>{primaryClaim.confidence}</dd>
            <dt>status</dt><dd>{primaryClaim.status}</dd>
            <dt>accepted report</dt><dd>{primaryReport?.id ?? "static verified claim"}</dd>
          </dl>
        ) : (
          <p>Needs verification — accepted reports exist only as moderation signals until a human links a source-backed verified claim.</p>
        )}
      </section>

      <section className="registry-panel" aria-labelledby="source">
        <h2 id="source">Source</h2>
        {primarySource ? (
          <p>
            <a href={primarySource.url ?? "#"}>{primarySource.title ?? primarySource.url ?? "Source"}</a>
            {primarySource.citation ? ` — ${primarySource.citation}` : null}
          </p>
        ) : (
          <p>Needs verification — no public source is attached.</p>
        )}
      </section>

      <section className="registry-panel" aria-labelledby="last-verified">
        <h2 id="last-verified">Last verified</h2>
        <p>{primaryClaim?.status === "verified" ? primaryClaim.last_verified_at ?? bundle.document.last_verified_at ?? "Needs verification" : "Needs verification"}</p>
      </section>

      <section className="registry-panel" aria-labelledby="correction-prompt">
        <h2 id="correction-prompt">Correction prompt</h2>
        <pre>{correctionPrompt}</pre>
      </section>

      <section className="registry-panel" aria-labelledby="share-card">
        <h2 id="share-card">Share card</h2>
        <div className="notice-box">
          <p className="eyebrow">For-Ai correction card</p>
          <h3>{bundle.document.title}</h3>
          <p>{primaryClaim?.status === "verified" ? primaryClaim.claim_value : "Needs verification"}</p>
          <p className="meta-label">Source-backed · Last verified: {primaryClaim?.last_verified_at ?? "Needs verification"}</p>
          <p><Link href={canonicalUrl}>{canonicalUrl}</Link></p>
        </div>
      </section>

      <nav className="registry-panel" aria-labelledby="actions">
        <h2 id="actions">Data input and moderation flow</h2>
        <ol>
          <li>Users submit AI errors through <Link href={reportUrl}>hallucination_reports</Link>.</li>
          <li>Reviewers link the report to a specific verified claim using <code>claim_id</code>.</li>
          <li>The page is public only after moderation changes <code>status</code> to <code>accepted</code>; new/reviewing/rejected/spam reports are not publicly readable.</li>
        </ol>
        <p><Link href={`/${locale}/wiki/${bundle.document.slug}`}>Open source document</Link></p>
      </nav>
    </article>
  );
}
