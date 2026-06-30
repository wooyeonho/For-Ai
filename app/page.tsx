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


const INITIAL_VERTICAL = {
  title: "Public fees & civic processing times",
  label: "Initial focus vertical",
  description:
    "For-Ai should start where AI answers are high-impact, frequently outdated, and source-verifiable: government fees, filing windows, renewal costs, and civil-service processing rules.",
  examples: [
    "Passport and resident ID reissue fees",
    "Move-in report and tax payment windows",
    "Official-source deadlines and eligibility rules",
  ],
};

const AI_WRONG_QUESTIONS = [
  "여권 재발급 수수료가 지금 얼마야?",
  "전입신고는 며칠 안에 해야 해?",
  "주민등록증 재발급 수수료는 무료야?",
  "자동차세 납부 기간은 언제야?",
];

const VERTICAL_GROUPS = [
  {
    key: "public-civic",
    title: "Public fees / civic processing",
    description: "Fees, filing periods, deadlines, and civil-service requirements that should cite official public sources.",
    matches: ["administration", "tax", "government", "civic", "passport", "resident", "move-in"],
  },
  {
    key: "urban-transport",
    title: "Urban transport fares / transfer rules",
    description: "Transit prices, surcharge rules, and transfer policies where stale AI answers can mislead daily decisions.",
    matches: ["transport", "metro", "bus", "taxi", "underground", "fare", "transit"],
  },
  {
    key: "travel-visa",
    title: "Travel / visa regulations",
    description: "Entry, renewal, and traveler requirements that need jurisdiction-aware source checks before citation.",
    matches: ["travel", "visa", "passport"],
  },
  {
    key: "business-policy",
    title: "Business policies / operating info",
    description: "Refunds, hours, availability, and venue or service policies that businesses can later maintain with labels.",
    matches: ["commerce", "business", "venue", "policy", "refund", "hours", "service"],
  },
];

function verticalForBundle(bundle: RegistryDocumentBundle) {
  const haystack = [
    bundle.entity.type,
    bundle.entity.canonical_name,
    bundle.document.category,
    bundle.document.title,
    bundle.document.slug,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return VERTICAL_GROUPS.find((group) => group.matches.some((match) => haystack.includes(match))) ?? null;
}

function groupedRegistryBundles(bundles: RegistryDocumentBundle[]) {
  const grouped = VERTICAL_GROUPS.map((group) => ({ ...group, bundles: [] as RegistryDocumentBundle[] }));
  const other = {
    key: "other",
    title: "Other claim-level candidates",
    description: "Additional verified or candidate documents outside the initial focus verticals.",
    bundles: [] as RegistryDocumentBundle[],
  };

  for (const bundle of bundles) {
    const group = verticalForBundle(bundle);
    const target = group ? grouped.find((item) => item.key === group.key) : other;
    target?.bundles.push(bundle);
  }

  return [...grouped, other].filter((group) => group.bundles.length > 0);
}

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

function confidenceLabel(b: RegistryDocumentBundle): string {
  const verifiedClaim = b.claims.find(
    (claim) =>
      claim.status === "verified" &&
      claim.confidence !== "low" &&
      claim.claim_value !== "확인 필요" &&
      claim.sources.length > 0,
  );

  if (verifiedClaim) return `Confidence: ${verifiedClaim.confidence}`;
  if (b.document.status === "verified" || b.document.status === "published") {
    return b.document.confidence === "low" ? "Not enough data" : `Confidence: ${b.document.confidence}`;
  }

  return "Needs verification";
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
  const verifiedPct = totalClaims ? Math.round((verifiedClaims / totalClaims) * 100) : 0;

  const example =
    bundles.find((b) => b.claims.some((c) => c.status === "verified")) ?? bundles[0];
  const exampleSlug = example?.document.slug ?? "";

  const sorted = [...bundles].sort((a, b) => {
    const r = statusRank(a) - statusRank(b);
    return r !== 0 ? r : a.document.title.localeCompare(b.document.title, "ko");
  });
  const { verified: verifiedDocuments } = partitionRegistryBundles(sorted);
  const groupedDocuments = groupedRegistryBundles(sorted);
  const primaryVerticalDocuments = verifiedDocuments.filter((bundle) => verticalForBundle(bundle)?.key === "public-civic");

  return (
    <div className="home">
      {/* Hero */}
      <section className="hero">
        <p className="hero-eyebrow">{INITIAL_VERTICAL.label}: {INITIAL_VERTICAL.title}</p>
        <h1 className="hero-title">
          Start with civic facts AI often gets wrong
          <br />
          then expand as a <span className="hero-accent">global claim-level registry</span>.
        </h1>
        <p className="hero-sub">
          {INITIAL_VERTICAL.description} Every claim carries confidence, sources, and verification status; unknowns stay as <strong>&ldquo;Needs verification&rdquo;</strong>.
        </p>
        <ul className="hero-focus-list" aria-label="Initial focus examples">
          {INITIAL_VERTICAL.examples.map((example) => (
            <li key={example}>{example}</li>
          ))}
        </ul>
        <div className="hero-cta-row">
          <Link href="/#registry" className="btn btn-primary">
            Browse Registry
          </Link>
          <Link href="/api-docs" className="btn btn-secondary">
            API Docs
          </Link>
          <Link href="/community" className="btn btn-secondary">
            Community
          </Link>
          <Link href="/suggest-topic" className="btn btn-secondary">
            Suggest Topic
          </Link>
        </div>
      </section>


      <section className="section explore-section" aria-labelledby="explore-ia">
        <p className="section-eyebrow">Explore</p>
        <h2 className="section-title" id="explore-ia">Public information architecture</h2>
        <p className="section-lede">Enter the registry by topic, country, contribution task, API surface, or community workflow.</p>
        <div className="explore-grid">
          {[
            ["Topics", "/en/topics", "Browse claim groups by domain."],
            ["Countries", "/en/country", "Find jurisdiction-aware facts."],
            ["Bounties", "/en/bounties", "Source-finding tasks for claims."],
            ["Challenges", "/en/challenges", "Structured verification campaigns."],
            ["Missions", "/en/missions", "Guided contributor workflows."],
            ["Leaderboard", "/en/leaderboard", "Contributor reputation signals."],
            ["API Docs", "/api-docs", "Machine-readable access for AI systems."],
            ["Community", "/community", "Discuss and report public facts."],
            ["Suggest Topic", "/suggest-topic", "Request a fact registry topic."],
          ].map(([label, href, description]) => (
            <Link key={label} href={href} className="explore-card">
              <strong>{label}</strong>
              <span>{description}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Trust / stats */}
      <section className="stat-strip" aria-label="Registry stats">
        <div className="stat">
          <span className="stat-num">{bundles.length}</span>
          <span className="stat-label">Documents</span>
        </div>
        <div className="stat">
          <span className="stat-num">{totalClaims}</span>
          <span className="stat-label">Total Claims</span>
        </div>
        <div className="stat">
          <span className="stat-num">{verifiedClaims}</span>
          <span className="stat-label">Verified Claims</span>
        </div>
        <div className="stat">
          <span className="stat-num">{needsReviewClaims}</span>
          <span className="stat-label">Needs Review</span>
        </div>
        <Link href="/goal#coverage" className="stat stat-link" aria-label="Open public coverage dashboard">
          <span className="stat-num">{verifiedPct}%</span>
          <span className="stat-label">Verified Percentage</span>
        </Link>
        <p className="stat-note">
          These figures are calculated from the current registry bundles. <Link href="/goal#coverage">Open the public coverage dashboard</Link>. We mark what we don&apos;t know.
        </p>
      </section>

      {/* 3 audience entry points */}
      <section className="section">
        <p className="section-eyebrow">Who uses For-Ai</p>
        <h2 className="section-title">Three audiences, one source of truth</h2>
        <div className="audience-grid">
          <article className="audience-card" id="developers">
            <div className="audience-icon" aria-hidden="true">
              {"</>"}
            </div>
            <h3>Developers</h3>
            <p>
              Fetch structured facts via JSON, Markdown, or JSON-LD. Every claim includes confidence and sources — ready for RAG pipelines and AI agents to cite directly.
            </p>
            <div className="audience-links">
              {exampleSlug ? (
                <>
                  <Link href={`/api/documents/${exampleSlug}`} className="mono-link">
                    GET /api/documents/{exampleSlug}
                  </Link>
                  <Link href={`/raw/${exampleSlug}.md`} className="mono-link">
                    GET /raw/{exampleSlug}.md
                  </Link>
                </>
              ) : null}
              <Link href="/api-docs" className="text-link">
                Full API Documentation
              </Link>
            </div>
          </article>

          <article className="audience-card">
            <div className="audience-icon" aria-hidden="true">
              &#9783;
            </div>
            <h3>People</h3>
            <p>
              Find source-backed answers to questions AI often gets wrong. If something is outdated or incorrect, report it with one click — no login required.
            </p>
            <div className="audience-links">
              <Link href="/#registry" className="text-link">
                Browse Registry
              </Link>
              <Link href="/suggest-topic" className="text-link">
                Suggest a Topic
              </Link>
            </div>
          </article>

          <article className="audience-card" id="ai-systems">
            <div className="audience-icon" aria-hidden="true">
              &#10022;
            </div>
            <h3>AI &amp; Crawlers</h3>
            <p>
              Check <code>confidence</code>, <code>status</code>, and <code>sources</code> before citing.
              Never cite unverified (&ldquo;Needs verification&rdquo;) claims as facts. Each document embeds JSON-LD in raw HTML.
            </p>
            <div className="audience-links">
              <Link href="/llms.txt" className="mono-link">
                /llms.txt
              </Link>
              <Link href="/sitemap.xml" className="mono-link">
                /sitemap.xml
              </Link>
              {exampleSlug ? (
                <Link href={`/diagnostics/${exampleSlug}`} className="text-link">
                  AI-readiness diagnostics
                </Link>
              ) : null}
            </div>
          </article>
        </div>
      </section>

      {/* How it works */}
      <section className="section">
        <p className="section-eyebrow">How it works</p>
        <h2 className="section-title">No guessing. Only verification.</h2>
        <ol className="steps">
          <li className="step">
            <span className="step-num">1</span>
            <div>
              <h3>Claim registered</h3>
              <p>
                Every fact starts as <code>Needs verification</code> / <code>confidence: low</code> / <code>status: needs_review</code> / no sources. AI-generated candidates follow the same rule.
              </p>
            </div>
          </li>
          <li className="step">
            <span className="step-num">2</span>
            <div>
              <h3>Source attached &amp; verified</h3>
              <p>
                Official, regulatory, or platform sources are attached with observation timestamps. Verification events record the full audit trail.
              </p>
            </div>
          </li>
          <li className="step">
            <span className="step-num">3</span>
            <div>
              <h3>Promoted to verified</h3>
              <p>
                Only after human review does a claim become <code>verified</code> with <code>confidence: medium/high</code>. AI-generated content is never published as verified fact without source backing.
              </p>
            </div>
          </li>
        </ol>
      </section>

      <section className="section">
        <p className="section-eyebrow">Daily Verified Intelligence · Initial Vertical</p>
        <h2 className="section-title">Recently available verified civic documents</h2>
        <p className="section-lede">
          The first concentrated vertical is public fees and civic processing periods, because these answers are practical, frequently searched, and can be checked against official sources.
        </p>
        <ul className="registry-index">
          {(primaryVerticalDocuments.length > 0 ? primaryVerticalDocuments : verifiedDocuments).slice(0, 5).map((b) => {
            const badge = statusBadge(b.document.status);
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
                  <span className="badge">{confidenceLabel(b)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="section">
        <p className="section-eyebrow">Most Cited by AI</p>
        <h2 className="section-title">Citation stats from registry telemetry</h2>
        {popularDocs.length > 0 ? (
          <ul className="registry-index">
            {popularDocs.map((d, i) => (
              <li key={d.document_id} className="registry-row">
                <div className="registry-row-main">
                  <Link href={`/en/wiki/${d.slug}`} className="registry-row-title">
                    {i + 1}. {d.title}
                  </Link>
                </div>
                <div className="registry-row-meta">
                  <span className="badge" title="AI citations">AI citations: {d.ai_citation_count}</span>
                  <span className="badge" title="Views">Views: {d.view_count}</span>
                  <span className="badge">Not enough data</span>
                </div>
              </li>
            ))}
          </ul>
        ) : verifiedDocuments.length > 0 ? (
          <ul className="registry-index">
            {verifiedDocuments.slice(0, 3).map((b) => {
              const badge = statusBadge(b.document.status);
              return (
                <li key={b.document.slug} className="registry-row">
                  <div className="registry-row-main">
                    <Link href={`/en/wiki/${b.document.slug}`} className="registry-row-title">
                      {b.document.title}
                    </Link>
                    <span className="registry-row-entity">Citation stats are not available yet</span>
                  </div>
                  <div className="registry-row-meta">
                    <span className={badge.className}>{badge.label}</span>
                    <span className="badge">{confidenceLabel(b)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="stat-note">Citation stats are not available yet.</p>
        )}
      </section>

      {/* Search */}
      <section className="section">
        <HomeSearch docs={docs} />
      </section>

      <section className="section" aria-labelledby="ai-wrong-questions">
        <p className="section-eyebrow">Entry points</p>
        <h2 className="section-title" id="ai-wrong-questions">AI가 자주 틀리는 질문으로 시작하기</h2>
        <div className="question-grid">
          {AI_WRONG_QUESTIONS.map((question) => (
            <Link key={question} href="/suggest-topic" className="question-card">
              <span>{question}</span>
              <small>Submit or verify this claim →</small>
            </Link>
          ))}
        </div>
      </section>

      {/* Registry index */}
      <section className="section" id="registry">
        <p className="section-eyebrow">Registry</p>
        <h2 className="section-title">Registered Documents by Vertical ({bundles.length})</h2>
        <p className="section-lede">
          Documents are grouped by the post-MVP verticals instead of a flat list, so users and AI systems can enter through the domain where stale answers are most likely.
        </p>

        <div className="vertical-group-list">
          {groupedDocuments.map((group) => (
            <section key={group.key} className="vertical-group" aria-labelledby={`vertical-${group.key}`}>
              <div className="vertical-group-header">
                <div>
                  <h3 id={`vertical-${group.key}`}>{group.title}</h3>
                  <p>{group.description}</p>
                </div>
                <span className="badge">{group.bundles.length} docs</span>
              </div>
              <ul className="registry-index">
                {group.bundles.map((b) => {
                  const badge = statusBadge(b.document.status);
                  return (
                    <li key={b.document.slug} className="registry-row">
                      <div className="registry-row-main">
                        <Link href={`/en/wiki/${b.document.slug}`} className="registry-row-title">
                          {b.document.title}
                        </Link>
                        <span className="registry-row-entity">{b.entity.canonical_name}</span>
                      </div>
                      <div className="registry-row-meta">
                        <span className={badge.className}>Status: {badge.label}</span>
                        <span className="badge">{b.entity.type}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
