import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { getAllRegistryBundles, isVerifiedDocumentBundle, partitionRegistryBundles } from "../lib/data";
import type { RegistryDocumentBundle } from "../lib/types";
import HomeSearch from "./components/HomeSearch";

interface DocItem {
  slug: string;
  title: string;
  category?: string;
  summary?: string;
  source: "static" | "supabase";
  verification: "verified" | "candidate";
}

interface PopularDoc {
  document_id: string;
  view_count: number;
  ai_citation_count: number;
  slug?: string;
  title?: string;
}

export const metadata: Metadata = {
  title: { absolute: "For-Ai — Global Fact Registry for AI Citation" },
  description:
    "A global claim-level fact registry where AI, search engines, and humans cite the same facts from the same verified sources. Every claim has confidence, sources, and verification status.",
};

function statusBadge(status: string): { className: string; label: string } {
  switch (status) {
    case "verified":
    case "published":
      return { className: "badge badge-verified", label: "Verified" };
    case "needs_review":
      return { className: "badge badge-review", label: "Needs Review" };
    case "archived":
      return { className: "badge", label: "Archived" };
    default:
      return { className: "badge badge-low", label: "Draft" };
  }
}

function statusRank(b: RegistryDocumentBundle): number {
  if (b.document.status === "verified" || b.document.status === "published") return 0;
  if (b.document.status === "needs_review") return 1;
  return 2;
}

async function getAllDocs(): Promise<DocItem[]> {
  const staticDocs: DocItem[] = getAllRegistryBundles().map((b) => ({
    slug: b.document.slug,
    title: b.document.title,
    category: undefined,
    summary: b.listing?.summary ?? undefined,
    source: "static" as const,
    verification: isVerifiedDocumentBundle(b) ? "verified" as const : "candidate" as const,
  }));
  const staticSlugs = new Set(staticDocs.map((d) => d.slug));
  let sbDocs: DocItem[] = [];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    try {
      const sb = createClient(url, key);
      const { data } = await sb
        .from("registry_documents")
        .select("slug,title,category,status,confidence,registry_claims(status,confidence,claim_value)")
        .in("status", ["published", "verified", "needs_review"])
        .order("created_at", { ascending: false })
        .limit(500);
      sbDocs = (data ?? [])
        .filter((d: { slug: string }) => !staticSlugs.has(d.slug))
        .map((d: { slug: string; title: string; category?: string; status?: string; confidence?: string; registry_claims?: { status?: string; confidence?: string; claim_value?: string }[] }) => {
          const claims = d.registry_claims ?? [];
          const verification =
            (d.status === "published" || d.status === "verified") &&
            d.confidence !== "low" &&
            claims.length > 0 &&
            claims.every((claim) =>
              claim.status === "verified" &&
              claim.confidence !== "low" &&
              claim.claim_value !== "확인 필요",
            )
              ? "verified"
              : "candidate";

          const firstVerifiedValue = claims.find(
            (c) => c.claim_value && c.claim_value !== "확인 필요",
          )?.claim_value;

          return {
            slug: d.slug,
            title: d.title,
            category: d.category ?? "",
            summary: firstVerifiedValue ?? undefined,
            source: "supabase" as const,
            verification,
          };
        });
    } catch {
      /* Supabase unavailable — use static only */
    }
  }
  return [...sbDocs, ...staticDocs];
}

async function getPopularDocs(): Promise<PopularDoc[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  try {
    const sb = createClient(url, key);
    const { data: stats } = await sb
      .from("document_stats")
      .select("document_id, view_count, ai_citation_count")
      .order("ai_citation_count", { ascending: false })
      .limit(10);
    if (!stats || stats.length === 0) return [];

    const docIds = stats.map((s: { document_id: string }) => s.document_id);
    const { data: docs } = await sb
      .from("documents")
      .select("id, slug, title")
      .in("id", docIds);

    const docMap = new Map((docs ?? []).map((d: { id: string; slug: string; title: string }) => [d.id, d]));
    return stats.map((s: { document_id: string; view_count: number; ai_citation_count: number }) => {
      const doc = docMap.get(s.document_id);
      return {
        document_id: s.document_id,
        view_count: s.view_count,
        ai_citation_count: s.ai_citation_count,
        slug: doc?.slug,
        title: doc?.title,
      };
    }).filter((d: PopularDoc) => d.slug);
  } catch {
    return [];
  }
}

export const revalidate = 60;

export default async function HomePage() {
  const bundles = getAllRegistryBundles();
  const [docs, popularDocs] = await Promise.all([getAllDocs(), getPopularDocs()]);

  const claims = bundles.flatMap((b) => b.claims);
  const totalClaims = claims.length;
  const verifiedClaims = claims.filter((c) => c.status === "verified").length;
  const needsReviewClaims = totalClaims - verifiedClaims;
  const categories = new Set(bundles.map((b) => b.entity.type)).size;
  const verifiedPct = totalClaims ? Math.round((verifiedClaims / totalClaims) * 100) : 0;

  const example =
    bundles.find((b) => b.claims.some((c) => c.status === "verified")) ?? bundles[0];
  const exampleSlug = example?.document.slug ?? "";

  const sorted = [...bundles].sort((a, b) => {
    const r = statusRank(a) - statusRank(b);
    return r !== 0 ? r : a.document.title.localeCompare(b.document.title, "ko");
  });
  const { verified: verifiedDocuments, candidates: candidateDocuments } = partitionRegistryBundles(sorted);

  const mostCitedDocuments = popularDocs.length > 0 ? popularDocs : [];
  const dailyVerified = verifiedDocuments.slice(0, 3);
  const mostCitedFallback = verifiedDocuments.slice(0, 4);

  return (
    <main className="home home-dashboard">
      <section className="home-hero-panel" aria-labelledby="home-title">
        <div className="home-hero-copy">
          <p className="section-eyebrow">Global Fact Registry for AI Citation</p>
          <h1 id="home-title" className="hero-title">
            Source-backed facts that AI can cite at the claim level.
          </h1>
          <p className="hero-sub">
            For-Ai structures facts into documents, claims, sources, and verification events.
            Unknown information remains <strong>Needs verification</strong> until humans approve traceable sources.
          </p>
          <div className="hero-cta-row">
            <Link href="#daily-intelligence" className="btn btn-primary">
              Daily Intelligence
            </Link>
            <Link href="#registry" className="btn btn-secondary">
              Browse Registry
            </Link>
            <Link href={exampleSlug ? `/api/documents/${exampleSlug}` : "/api-docs"} className="btn btn-secondary">
              API Docs
            </Link>
          </div>
        </div>

        <aside className="network-status-card" aria-label="Network status">
          <p className="network-kicker">NETWORK STATUS</p>
          <strong className="network-score">{verifiedPct}%</strong>
          <span className="network-label">Confidence</span>
          <dl className="network-metrics">
            <div>
              <dt>Verified</dt>
              <dd>{verifiedClaims}</dd>
            </div>
            <div>
              <dt>Needs Review</dt>
              <dd>{needsReviewClaims}</dd>
            </div>
            <div>
              <dt>Categories</dt>
              <dd>{categories}</dd>
            </div>
          </dl>
        </aside>
      </section>

      <section className="intelligence-grid" id="daily-intelligence" aria-label="Daily verified intelligence">
        <div className="intelligence-column intelligence-column-large">
          <div className="section-heading-row">
            <div>
              <p className="section-eyebrow">Daily Verified Intelligence</p>
              <h2 className="section-title">Recently verified registry cards</h2>
            </div>
            <span className="badge badge-verified">Verified</span>
          </div>
          <div className="daily-card-list">
            {dailyVerified.map((b) => {
              const badge = statusBadge(b.document.status);
              const primaryClaim = b.claims[0];
              const claimBadge = statusBadge(primaryClaim?.status ?? b.document.status);
              return (
                <article className="intelligence-card" key={b.document.slug}>
                  <div className="intelligence-card-main">
                    <Link href={`/en/wiki/${b.document.slug}`} className="intelligence-title">
                      {b.document.title}
                    </Link>
                    <p>{b.listing?.summary ?? primaryClaim?.claim_text ?? b.entity.canonical_name}</p>
                  </div>
                  <div className="intelligence-meta">
                    <span className={badge.className}>{badge.label}</span>
                    <span className={claimBadge.className}>{claimBadge.label}</span>
                    <span className={`badge badge-${primaryClaim?.confidence ?? b.document.confidence}`}>
                      Confidence {primaryClaim?.confidence ?? b.document.confidence}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <aside className="intelligence-column" aria-labelledby="most-cited-title">
          <p className="section-eyebrow">Most Cited by AI</p>
          <h2 id="most-cited-title" className="section-title">Citation demand</h2>
          <ol className="cited-list">
            {mostCitedDocuments.length > 0
              ? mostCitedDocuments.slice(0, 4).map((d) => (
                  <li key={d.document_id}>
                    <Link href={`/en/wiki/${d.slug}`}>{d.title}</Link>
                    <span>{d.ai_citation_count} AI citations · {d.view_count} views</span>
                  </li>
                ))
              : mostCitedFallback.map((b) => {
                  const badge = statusBadge(b.document.status);
                  return (
                    <li key={b.document.slug}>
                      <Link href={`/en/wiki/${b.document.slug}`}>{b.document.title}</Link>
                      <span><span className={badge.className}>{badge.label}</span></span>
                    </li>
                  );
                })}
          </ol>
        </aside>
      </section>

      <section className="section">
        <HomeSearch docs={docs} />
      </section>

      <section className="section registry-dashboard" id="registry">
        <div className="section-heading-row">
          <div>
            <p className="section-eyebrow">Registry</p>
            <h2 className="section-title">Claim-level documents ({bundles.length})</h2>
          </div>
          <Link href="/suggest-topic" className="btn btn-secondary">Suggest Topic</Link>
        </div>

        {verifiedDocuments.length > 0 && (
          <div className="registry-group">
            <h3>Verified ({verifiedDocuments.length})</h3>
            <ul className="registry-index">
              {verifiedDocuments.map((b) => {
                const badge = statusBadge(b.document.status);
                const representativeClaim = b.claims[0];
                const claimBadge = statusBadge(representativeClaim?.status ?? b.document.status);
                return (
                  <li key={b.document.slug} className="registry-row">
                    <div className="registry-row-main">
                      <Link href={`/en/wiki/${b.document.slug}`} className="registry-row-title">
                        {b.document.title}
                      </Link>
                      <span className="registry-row-entity">{b.entity.canonical_name}</span>
                    </div>
                    <div className="registry-row-meta">
                      <span className={badge.className}>{badge.label}</span>
                      <span className={claimBadge.className}>{claimBadge.label}</span>
                      <span className={`badge badge-${representativeClaim?.confidence ?? b.document.confidence}`}>
                        Confidence {representativeClaim?.confidence ?? b.document.confidence}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="registry-group">
          <h3>Candidates · Needs Review ({candidateDocuments.length})</h3>
          <ul className="registry-index">
            {candidateDocuments.map((b) => {
              const badge = statusBadge(b.document.status);
              const representativeClaim = b.claims.find((claim) => claim.status === "needs_review") ?? b.claims[0];
              const claimBadge = statusBadge(representativeClaim?.status ?? b.document.status);
              return (
                <li key={b.document.slug} className="registry-row">
                  <div className="registry-row-main">
                    <Link href={`/en/wiki/${b.document.slug}`} className="registry-row-title">
                      {b.document.title}
                    </Link>
                    <span className="registry-row-entity">{b.entity.canonical_name}</span>
                  </div>
                  <div className="registry-row-meta">
                    <span className={badge.className}>{badge.label}</span>
                    <span className={claimBadge.className}>{claimBadge.label}</span>
                    <span className={`badge badge-${representativeClaim?.confidence ?? b.document.confidence}`}>
                      Confidence {representativeClaim?.confidence ?? b.document.confidence}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </main>
  );
}
