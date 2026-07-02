import Link from "next/link";
import { getAllRegistryBundles, partitionRegistryBundles } from "../../lib/data";
import type { RegistryDocumentBundle } from "../../lib/types";
import { getHomeDocs, getHomePopularDocs, type HomePopularDoc } from "@/lib/home-data";
import HomeSearch from "./HomeSearch";
import type { SupportedLocale } from "@/lib/i18n/locales";
import { TrendingWidget } from "./TrendingWidget";

type HomePageContentProps = { locale?: string };
type HomeHeroProps = { copy: typeof HOME_COPY; };
type HomeStatsProps = { documentCount: number; totalClaims: number; verifiedClaims: number; needsReviewClaims: number; verifiedPct: number; };
type HomeAudienceAndWorkflowProps = { exampleSlug: string; };
type HomeVerticalGroupsProps = { locale: string; groupedDocuments: VerticalDocumentGroup[]; documentCount: number; };
type HomePopularDocsProps = { locale: string; popularDocs: HomePopularDoc[]; fallbackDocuments: RegistryDocumentBundle[]; };
type HomeEntryQuestionsProps = { questions: string[]; copy: typeof HOME_COPY.entryQuestions; };
type HomeVerifiedCivicDocsProps = { locale: string; documents: RegistryDocumentBundle[]; copy: typeof HOME_COPY.verifiedCivic; };
type VerticalDocumentGroup = (typeof VERTICAL_GROUPS)[number] & { bundles: RegistryDocumentBundle[] };

type StatusBadge = { className: string; label: string };

const HOME_COPY = {
  hero: {
    initialVertical: {
      title: "Public fees & civic processing times",
      label: "Initial focus vertical",
      description:
        "For-Ai should start where AI answers are high-impact, frequently outdated, and source-verifiable: government fees, filing windows, renewal costs, and civil-service processing rules.",
      examples: [
        "Passport and resident ID reissue fees",
        "Move-in report and tax payment windows",
        "Official-source deadlines and eligibility rules",
      ],
    },
    titlePrefix: "Start with civic facts AI often gets wrong",
    titleAccent: "global claim-level registry",
    titleSuffix: "then expand as a",
    unknownLabel: "Needs verification",
    browseRegistry: "Browse Registry",
    apiDocs: "API Docs",
    community: "Community",
    suggestTopic: "Suggest Topic",
  },
  stats: {
    documents: "Documents",
    totalClaims: "Total Claims",
    verifiedClaims: "Verified Claims",
    needsReview: "Needs Review",
    verifiedPercentage: "Verified Percentage",
    notePrefix: "These figures are calculated from the current registry bundles.",
    noteLink: "Open the public coverage dashboard",
    noteSuffix: "We mark what we don't know.",
  },
  audience: {
    eyebrow: "Who uses For-Ai",
    title: "Three audiences, one source of truth",
  },
  workflow: {
    eyebrow: "How it works",
    title: "No guessing. Only verification.",
  },
  verifiedCivic: {
    eyebrow: "Daily Verified Intelligence · Initial Vertical",
    title: "Recently available verified civic documents",
    lede: "The first concentrated vertical is public fees and civic processing periods, because these answers are practical, frequently searched, and can be checked against official sources.",
  },
  popularDocs: {
    eyebrow: "Most Cited by AI",
    title: "Citation stats from registry telemetry",
    aiCitations: "AI citations",
    views: "Views",
    unavailable: "Citation stats are not available yet",
    notEnoughData: "Not enough data",
  },
  entryQuestions: {
    eyebrow: "Entry points",
    title: "AI가 자주 틀리는 질문으로 시작하기",
    cta: "Submit or verify this claim →",
  },
  registry: {
    eyebrow: "Registry",
    titlePrefix: "Registered Documents by Vertical",
    lede: "Documents are grouped by the post-MVP verticals instead of a flat list, so users and AI systems can enter through the domain where stale answers are most likely.",
    docs: "docs",
    status: "Status",
  },
} as const;

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
] as const;

function verticalForBundle(bundle: RegistryDocumentBundle) {
  const haystack = [bundle.entity.type, bundle.entity.canonical_name, bundle.document.category, bundle.document.title, bundle.document.slug]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return VERTICAL_GROUPS.find((group) => group.matches.some((match) => haystack.includes(match))) ?? null;
}

function groupedRegistryBundles(bundles: RegistryDocumentBundle[]): VerticalDocumentGroup[] {
  const grouped = VERTICAL_GROUPS.map((group) => ({ ...group, bundles: [] as RegistryDocumentBundle[] }));
  const other = {
    key: "other",
    title: "Other claim-level candidates",
    description: "Additional verified or candidate documents outside the initial focus verticals.",
    matches: [] as string[],
    bundles: [] as RegistryDocumentBundle[],
  };

  for (const bundle of bundles) {
    const group = verticalForBundle(bundle);
    const target = group ? grouped.find((item) => item.key === group.key) : other;
    target?.bundles.push(bundle);
  }

  return [...grouped, other].filter((group) => group.bundles.length > 0);
}

function statusBadge(status: string): StatusBadge {
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

function statusRank(bundle: RegistryDocumentBundle): number {
  if (bundle.document.status === "verified" || bundle.document.status === "published") return 0;
  if (bundle.document.status === "needs_review") return 1;
  return 2;
}

function confidenceLabel(bundle: RegistryDocumentBundle): string {
  const verifiedClaim = bundle.claims.find(
    (claim) =>
      claim.status === "verified" &&
      claim.confidence !== "low" &&
      claim.claim_value !== "확인 필요" &&
      claim.sources.length > 0,
  );

  if (verifiedClaim) return `Confidence: ${verifiedClaim.confidence}`;
  if (bundle.document.status === "verified" || bundle.document.status === "published") {
    return bundle.document.confidence === "low" ? "Not enough data" : `Confidence: ${bundle.document.confidence}`;
  }

  return "Needs verification";
}

function HomeHero({ copy }: HomeHeroProps) {
  return (
    <section className="hero">
      <p className="hero-eyebrow">{copy.hero.initialVertical.label}: {copy.hero.initialVertical.title}</p>
      <h1 className="hero-title">
        {copy.hero.titlePrefix}
        <br />
        {copy.hero.titleSuffix} <span className="hero-accent">{copy.hero.titleAccent}</span>.
      </h1>
      <p className="hero-sub">
        {copy.hero.initialVertical.description} Every claim carries confidence, sources, and verification status; unknowns stay as <strong>&ldquo;{copy.hero.unknownLabel}&rdquo;</strong>.
      </p>
      <ul className="hero-focus-list" aria-label="Initial focus examples">
        {copy.hero.initialVertical.examples.map((example) => <li key={example}>{example}</li>)}
      </ul>
      <div className="hero-cta-row">
        <Link href="/#registry" className="btn btn-primary">{copy.hero.browseRegistry}</Link>
        <Link href="/api-docs" className="btn btn-secondary">{copy.hero.apiDocs}</Link>
        <Link href="/community" className="btn btn-secondary">{copy.hero.community}</Link>
        <Link href="/suggest-topic" className="btn btn-secondary">{copy.hero.suggestTopic}</Link>
      </div>
    </section>
  );
}

function HomeStats({ documentCount, totalClaims, verifiedClaims, needsReviewClaims, verifiedPct }: HomeStatsProps) {
  const stats = [
    { value: documentCount, label: HOME_COPY.stats.documents },
    { value: totalClaims, label: HOME_COPY.stats.totalClaims },
    { value: verifiedClaims, label: HOME_COPY.stats.verifiedClaims },
    { value: needsReviewClaims, label: HOME_COPY.stats.needsReview },
  ];

  return (
    <section className="stat-strip" aria-label="Registry stats">
      {stats.map((stat) => (
        <div className="stat" key={stat.label}>
          <span className="stat-num">{stat.value}</span>
          <span className="stat-label">{stat.label}</span>
        </div>
      ))}
      <Link href="/goal#coverage" className="stat stat-link" aria-label="Open public coverage dashboard">
        <span className="stat-num">{verifiedPct}%</span>
        <span className="stat-label">{HOME_COPY.stats.verifiedPercentage}</span>
      </Link>
      <p className="stat-note">
        {HOME_COPY.stats.notePrefix} <Link href="/goal#coverage">{HOME_COPY.stats.noteLink}</Link>. {HOME_COPY.stats.noteSuffix}
      </p>
    </section>
  );
}

function HomeAudienceAndWorkflow({ exampleSlug }: HomeAudienceAndWorkflowProps) {
  return (
    <>
      <section className="section">
        <p className="section-eyebrow">{HOME_COPY.audience.eyebrow}</p>
        <h2 className="section-title">{HOME_COPY.audience.title}</h2>
        <div className="audience-grid">
          <article className="audience-card" id="developers">
            <div className="audience-icon" aria-hidden="true">{"</>"}</div>
            <h3>Developers</h3>
            <p>Fetch structured facts via JSON, Markdown, or JSON-LD. Every claim includes confidence and sources — ready for RAG pipelines and AI agents to cite directly.</p>
            <div className="audience-links">
              {exampleSlug ? <><Link href={`/api/documents/${exampleSlug}`} className="mono-link">GET /api/documents/{exampleSlug}</Link><Link href={`/raw/${exampleSlug}.md`} className="mono-link">GET /raw/{exampleSlug}.md</Link></> : null}
              <Link href="/api-docs" className="text-link">Full API Documentation</Link>
            </div>
          </article>
          <article className="audience-card">
            <div className="audience-icon" aria-hidden="true">&#9783;</div>
            <h3>People</h3>
            <p>Find source-backed answers to questions AI often gets wrong. If something is outdated or incorrect, report it with one click — no login required.</p>
            <div className="audience-links"><Link href="/#registry" className="text-link">Browse Registry</Link><Link href="/suggest-topic" className="text-link">Suggest a Topic</Link></div>
          </article>
          <article className="audience-card" id="ai-systems">
            <div className="audience-icon" aria-hidden="true">&#10022;</div>
            <h3>AI &amp; Crawlers</h3>
            <p>Check <code>confidence</code>, <code>status</code>, and <code>sources</code> before citing. Never cite unverified (&ldquo;Needs verification&rdquo;) claims as facts. Each document embeds JSON-LD in raw HTML.</p>
            <div className="audience-links"><Link href="/llms.txt" className="mono-link">/llms.txt</Link><Link href="/sitemap.xml" className="mono-link">/sitemap.xml</Link>{exampleSlug ? <Link href={`/diagnostics/${exampleSlug}`} className="text-link">AI-readiness diagnostics</Link> : null}</div>
          </article>
        </div>
      </section>
      <section className="section">
        <p className="section-eyebrow">{HOME_COPY.workflow.eyebrow}</p>
        <h2 className="section-title">{HOME_COPY.workflow.title}</h2>
        <ol className="steps">
          <li className="step"><span className="step-num">1</span><div><h3>Claim registered</h3><p>Every fact starts as <code>Needs verification</code> / <code>confidence: low</code> / <code>status: needs_review</code> / no sources. AI-generated candidates follow the same rule.</p></div></li>
          <li className="step"><span className="step-num">2</span><div><h3>Source attached &amp; verified</h3><p>Official, regulatory, or platform sources are attached with observation timestamps. Verification events record the full audit trail.</p></div></li>
          <li className="step"><span className="step-num">3</span><div><h3>Promoted to verified</h3><p>Only after human review does a claim become <code>verified</code> with <code>confidence: medium/high</code>. AI-generated content is never published as verified fact without source backing.</p></div></li>
        </ol>
      </section>
    </>
  );
}

function HomeVerifiedCivicDocs({ locale, documents, copy }: HomeVerifiedCivicDocsProps) {
  return (
    <section className="section">
      <p className="section-eyebrow">{copy.eyebrow}</p>
      <h2 className="section-title">{copy.title}</h2>
      <p className="section-lede">{copy.lede}</p>
      <RegistryRows bundles={documents.slice(0, 5)} locale={locale} />
    </section>
  );
}

function HomePopularDocs({ locale, popularDocs, fallbackDocuments }: HomePopularDocsProps) {
  return (
    <section className="section">
      <p className="section-eyebrow">{HOME_COPY.popularDocs.eyebrow}</p>
      <h2 className="section-title">{HOME_COPY.popularDocs.title}</h2>
      {popularDocs.length > 0 ? (
        <ul className="registry-index">
          {popularDocs.map((document, index) => (
            <li key={document.document_id} className="registry-row">
              <div className="registry-row-main"><Link href={`/${locale}/wiki/${document.slug}`} className="registry-row-title">{index + 1}. {document.title}</Link></div>
              <div className="registry-row-meta"><span className="badge" title={HOME_COPY.popularDocs.aiCitations}>{HOME_COPY.popularDocs.aiCitations}: {document.ai_citation_count}</span><span className="badge" title={HOME_COPY.popularDocs.views}>{HOME_COPY.popularDocs.views}: {document.view_count}</span><span className="badge">{HOME_COPY.popularDocs.notEnoughData}</span></div>
            </li>
          ))}
        </ul>
      ) : fallbackDocuments.length > 0 ? (
        <RegistryRows bundles={fallbackDocuments.slice(0, 3)} locale={locale} entityLabel={HOME_COPY.popularDocs.unavailable} />
      ) : <p className="stat-note">{HOME_COPY.popularDocs.unavailable}.</p>}
    </section>
  );
}

function HomeEntryQuestions({ questions, copy }: HomeEntryQuestionsProps) {
  return (
    <section className="section" aria-labelledby="ai-wrong-questions">
      <p className="section-eyebrow">{copy.eyebrow}</p>
      <h2 className="section-title" id="ai-wrong-questions">{copy.title}</h2>
      <div className="question-grid">{questions.map((question) => <Link key={question} href="/suggest-topic" className="question-card"><span>{question}</span><small>{copy.cta}</small></Link>)}</div>
    </section>
  );
}

function HomeVerticalGroups({ locale, groupedDocuments, documentCount }: HomeVerticalGroupsProps) {
  return (
    <section className="section" id="registry">
      <p className="section-eyebrow">{HOME_COPY.registry.eyebrow}</p>
      <h2 className="section-title">{HOME_COPY.registry.titlePrefix} ({documentCount})</h2>
      <p className="section-lede">{HOME_COPY.registry.lede}</p>
      <div className="vertical-group-list">
        {groupedDocuments.map((group) => (
          <section key={group.key} className="vertical-group" aria-labelledby={`vertical-${group.key}`}>
            <div className="vertical-group-header"><div><h3 id={`vertical-${group.key}`}>{group.title}</h3><p>{group.description}</p></div><span className="badge">{group.bundles.length} {HOME_COPY.registry.docs}</span></div>
            <ul className="registry-index">
              {group.bundles.map((bundle) => {
                const badge = statusBadge(bundle.document.status);
                return <li key={bundle.document.slug} className="registry-row"><div className="registry-row-main"><Link href={`/${locale}/wiki/${bundle.document.slug}`} className="registry-row-title">{bundle.document.title}</Link><span className="registry-row-entity">{bundle.entity.canonical_name}</span></div><div className="registry-row-meta"><span className={badge.className}>{HOME_COPY.registry.status}: {badge.label}</span><span className="badge">{bundle.entity.type}</span></div></li>;
              })}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}

function RegistryRows({ bundles, locale, entityLabel }: { bundles: RegistryDocumentBundle[]; locale: string; entityLabel?: string }) {
  return (
    <ul className="registry-index">
      {bundles.map((bundle) => {
        const badge = statusBadge(bundle.document.status);
        return (
          <li key={bundle.document.slug} className="registry-row">
            <div className="registry-row-main"><Link href={`/${locale}/wiki/${bundle.document.slug}`} className="registry-row-title">{bundle.document.title}</Link><span className="registry-row-entity">{entityLabel ?? bundle.entity.canonical_name}</span></div>
            <div className="registry-row-meta"><span className={badge.className}>{badge.label}</span><span className="badge">{confidenceLabel(bundle)}</span></div>
          </li>
        );
      })}
    </ul>
  );
}

export default async function HomePageContent({ locale = "en" }: HomePageContentProps) {
  const bundles = getAllRegistryBundles();
  const [docs, popularDocs] = await Promise.all([getHomeDocs(), getHomePopularDocs()]);
  const claims = bundles.flatMap((bundle) => bundle.claims);
  const totalClaims = claims.length;
  const verifiedClaims = claims.filter((claim) => claim.status === "verified").length;
  const needsReviewClaims = totalClaims - verifiedClaims;
  const verifiedPct = totalClaims ? Math.round((verifiedClaims / totalClaims) * 100) : 0;
  const example = bundles.find((bundle) => bundle.claims.some((claim) => claim.status === "verified")) ?? bundles[0];
  const sorted = [...bundles].sort((a, b) => {
    const rank = statusRank(a) - statusRank(b);
    return rank !== 0 ? rank : a.document.title.localeCompare(b.document.title, locale);
  });
  const { verified: verifiedDocuments } = partitionRegistryBundles(sorted);
  const groupedDocuments = groupedRegistryBundles(sorted);
  const primaryVerticalDocuments = verifiedDocuments.filter((bundle) => verticalForBundle(bundle)?.key === "public-civic");

  return (
    <div className="home">
      <HomeHero copy={HOME_COPY} />
      <HomeStats documentCount={bundles.length} totalClaims={totalClaims} verifiedClaims={verifiedClaims} needsReviewClaims={needsReviewClaims} verifiedPct={verifiedPct} />
      <TrendingWidget locale={locale as SupportedLocale} />
      <HomeAudienceAndWorkflow exampleSlug={example?.document.slug ?? ""} />
      <HomeVerifiedCivicDocs locale={locale} documents={(primaryVerticalDocuments.length > 0 ? primaryVerticalDocuments : verifiedDocuments)} copy={HOME_COPY.verifiedCivic} />
      <HomePopularDocs locale={locale} popularDocs={popularDocs} fallbackDocuments={verifiedDocuments} />
      <section className="section"><HomeSearch docs={docs} locale={locale as SupportedLocale} /></section>
      <HomeEntryQuestions questions={AI_WRONG_QUESTIONS} copy={HOME_COPY.entryQuestions} />
      <HomeVerticalGroups locale={locale} groupedDocuments={groupedDocuments} documentCount={bundles.length} />
    </div>
  );
}
