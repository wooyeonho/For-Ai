import type { Metadata } from "next";
import Link from "next/link";
import { getAllRegistryBundles, getRegistryBundleBySlug, isVerifiedClaim } from "../../../lib/data";
import type { ClaimWithSources, RegistryDocumentBundle } from "../../../lib/types";

export const metadata: Metadata = {
  title: "AI-citable URL checker — For-Ai",
  description:
    "Check whether a For-Ai internal slug is ready for AI citation, including source, freshness, and jurisdiction warnings.",
};

type SearchParams = Promise<{
  url?: string;
  question?: string;
  country?: string;
  category?: string;
}>;

type Warning = {
  label: string;
  active: boolean;
  detail: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const OUTDATED_AFTER_DAYS = 365;

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function normalizeSlug(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const wikiIndex = segments.indexOf("wiki");
    if (wikiIndex >= 0 && segments[wikiIndex + 1]) {
      return decodeURIComponent(segments[wikiIndex + 1]);
    }
    return decodeURIComponent(segments.at(-1) ?? "");
  } catch {
    const segments = trimmed.split(/[/?#]/)[0].split("/").filter(Boolean);
    const wikiIndex = segments.indexOf("wiki");
    if (wikiIndex >= 0 && segments[wikiIndex + 1]) {
      return decodeURIComponent(segments[wikiIndex + 1]);
    }
    return decodeURIComponent(segments.at(-1) ?? trimmed).replace(/\.md$/, "");
  }
}

function claimIsFresh(claim: ClaimWithSources): boolean {
  const dates = [
    claim.last_verified_at,
    ...claim.sources.map((source) => source.observed_at),
  ].filter(Boolean) as string[];

  if (dates.length === 0) return false;

  const newest = Math.max(...dates.map((date) => new Date(date).getTime()).filter(Number.isFinite));
  if (!Number.isFinite(newest)) return false;

  return Date.now() - newest <= OUTDATED_AFTER_DAYS * DAY_MS;
}

function claimHasJurisdiction(claim: ClaimWithSources, bundle: RegistryDocumentBundle): boolean {
  return Boolean(claim.jurisdiction || bundle.document.country || bundle.entity.country);
}

function calculateScore(bundle: RegistryDocumentBundle): number {
  if (bundle.claims.length === 0) return 0;

  const verifiedRatio = bundle.claims.filter(isVerifiedClaim).length / bundle.claims.length;
  const sourcedRatio = bundle.claims.filter((claim) => claim.sources.length > 0).length / bundle.claims.length;
  const freshRatio = bundle.claims.filter(claimIsFresh).length / bundle.claims.length;
  const jurisdictionRatio = bundle.claims.filter((claim) => claimHasJurisdiction(claim, bundle)).length / bundle.claims.length;

  const documentBonus = bundle.document.status === "verified" || bundle.document.status === "published" ? 10 : 0;
  return Math.min(
    100,
    Math.round(verifiedRatio * 45 + sourcedRatio * 25 + freshRatio * 20 + jurisdictionRatio * 10 + documentBonus),
  );
}

function findSuggestedBundle(question: string, country: string, category: string): RegistryDocumentBundle | null {
  const query = `${question} ${category}`.toLowerCase().trim();
  const candidates = getAllRegistryBundles().filter((bundle) => {
    const countryMatches = !country || bundle.document.country.toLowerCase() === country.toLowerCase() || bundle.entity.country.toLowerCase() === country.toLowerCase();
    if (!countryMatches) return false;
    if (!query) return true;

    const haystack = [
      bundle.document.slug,
      bundle.document.title,
      bundle.document.category,
      bundle.entity.canonical_name,
      ...bundle.claims.map((claim) => `${claim.field_path} ${claim.claim_text} ${claim.claim_value}`),
    ].join(" ").toLowerCase();

    return query.split(/\s+/).some((token) => token.length > 2 && haystack.includes(token));
  });

  return candidates[0] ?? getAllRegistryBundles()[0] ?? null;
}

export default async function AiCitableToolPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const inputUrl = firstValue(params.url);
  const question = firstValue(params.question);
  const country = firstValue(params.country);
  const category = firstValue(params.category);
  const slug = normalizeSlug(inputUrl);
  const bundle = slug ? getRegistryBundleBySlug(slug) : null;
  const suggested = bundle ?? findSuggestedBundle(question, country, category);

  const score = bundle ? calculateScore(bundle) : 0;
  const missingSourceCount = bundle?.claims.filter((claim) => claim.sources.length === 0).length ?? 0;
  const outdatedCount = bundle?.claims.filter((claim) => !claimIsFresh(claim)).length ?? 0;
  const unclearJurisdictionCount = bundle?.claims.filter((claim) => !claimHasJurisdiction(claim, bundle)).length ?? 0;

  const warnings: Warning[] = [
    {
      label: "Missing source warning",
      active: !bundle || missingSourceCount > 0,
      detail: bundle ? `${missingSourceCount} claim(s) have no attached claim_sources record.` : "No internal For-Ai slug was matched, so sources cannot be checked yet.",
    },
    {
      label: "Outdated warning",
      active: !bundle || outdatedCount > 0,
      detail: bundle ? `${outdatedCount} claim(s) have no verification/source observation date within ${OUTDATED_AFTER_DAYS} days.` : "Freshness is unavailable until a For-Ai claim page exists.",
    },
    {
      label: "Unclear jurisdiction warning",
      active: !bundle || unclearJurisdictionCount > 0,
      detail: bundle ? `${unclearJurisdictionCount} claim(s) lack claim, document, or entity jurisdiction context.` : "Jurisdiction is unclear for unmatched or future external URLs.",
    },
  ];

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">For-Ai tools · MVP internal slug check</p>
        <h1>AI-citable URL checker</h1>
        <p style={{ color: "var(--muted)", fontSize: "1rem", lineHeight: 1.7 }}>
          Enter a For-Ai wiki URL or slug plus the user question. The MVP checks only internal For-Ai slugs;
          external URL analysis will be added later without changing the claim-level output contract.
        </p>
      </header>

      <section className="registry-panel" aria-labelledby="checker-form">
        <h2 id="checker-form">Input</h2>
        <form action="/tools/ai-citable" method="get" style={{ display: "grid", gap: 12 }}>
          <label>
            URL or For-Ai slug
            <input name="url" defaultValue={inputUrl} placeholder="/en/wiki/example-slug" style={{ width: "100%", marginTop: 6, padding: 10 }} />
          </label>
          <label>
            Question
            <textarea name="question" defaultValue={question} placeholder="What fact should an AI cite?" rows={3} style={{ width: "100%", marginTop: 6, padding: 10 }} />
          </label>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <label>
              Optional country
              <input name="country" defaultValue={country} placeholder="KR, US, JP..." style={{ width: "100%", marginTop: 6, padding: 10 }} />
            </label>
            <label>
              Optional category
              <input name="category" defaultValue={category} placeholder="transport, healthcare..." style={{ width: "100%", marginTop: 6, padding: 10 }} />
            </label>
          </div>
          <button type="submit" style={{ width: "fit-content", padding: "10px 16px", fontWeight: 700 }}>Check citation readiness</button>
        </form>
      </section>

      <section className="registry-panel" aria-labelledby="checker-output">
        <h2 id="checker-output">Output</h2>
        <div className="meta-grid">
          <div><span className="meta-label">matched_slug</span><br />{slug || "Not provided"}</div>
          <div><span className="meta-label">citation_readiness_score</span><br />{score}/100</div>
          <div><span className="meta-label">status</span><br />{bundle?.document.status ?? "needs_claim_page"}</div>
          <div><span className="meta-label">claims_checked</span><br />{bundle?.claims.length ?? 0}</div>
        </div>

        <ul className="diagnostics-list" style={{ marginTop: 20 }}>
          {warnings.map((warning) => (
            <li key={warning.label}>
              <span className={warning.active ? "badge badge-review" : "badge badge-pass"}>{warning.active ? "warning" : "pass"}</span>{" "}
              <strong>{warning.label}</strong><br />
              <span className="meta-label">{warning.detail}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="registry-panel" aria-labelledby="suggested-page">
        <h2 id="suggested-page">Suggested For-Ai claim page</h2>
        {suggested ? (
          <p>
            <Link href={`/${suggested.document.lang || "en"}/wiki/${suggested.document.slug}`}>{suggested.document.title}</Link>{" "}
            <span className="meta-label">({suggested.document.slug})</span>
          </p>
        ) : (
          <p className="meta-label">No internal candidate is available yet. Create a claim-level page before citing this fact.</p>
        )}
      </section>
    </article>
  );
}
