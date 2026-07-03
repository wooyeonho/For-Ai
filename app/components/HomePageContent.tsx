import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { getAllRegistryBundles, isVerifiedDocumentBundle, partitionRegistryBundles } from "../../lib/data";
import type { RegistryDocumentBundle } from "../../lib/types";
import { getTranslations } from "../../lib/i18n";
import type { SupportedLocale } from "../../lib/i18n";
import HomeSearch from "./HomeSearch";
import { TrendingWidget } from "./TrendingWidget";

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

type HomeCopy = {
  verticalLabel: string;
  verticalTitle: string;
  verticalDescription: string;
  verticalExamples: string[];
  audiencesEyebrow: string;
  audiencesTitle: string;
  audienceDeveloperTitle: string;
  audienceDeveloperDescription: string;
  audiencePeopleTitle: string;
  audiencePeopleDescription: string;
  audienceAiTitle: string;
  audienceAiDescription: string;
  howItWorksEyebrow: string;
  howItWorksTitle: string;
  step1Title: string;
  step1Description: string;
  step2Title: string;
  step2Description: string;
  step3Title: string;
  step3Description: string;
  verifiedEyebrow: string;
  verifiedTitle: string;
  verifiedDescription: string;
  mostCitedEyebrow: string;
  mostCitedTitle: string;
  mostCitedFallback: string;
  entryEyebrow: string;
  entryTitle: string;
  entryQuestionCta: string;
  registryEyebrow: string;
  registryTitle: string;
  registryDescription: string;
  statDocuments: string;
  statTotalClaims: string;
  statVerifiedClaims: string;
  statNeedsReview: string;
  statVerifiedPct: string;
  statNote: string;
  statNoteLink: string;
  aiCitationsLabel: string;
  viewsLabel: string;
  citationStatsUnavailable: string;
  statusPrefix: string;
  questionHeading: string;
  questions: string[];
};

const HOME_COPY: Record<string, HomeCopy> = {
  ko: {
    verticalLabel: "초기 집중 분야",
    verticalTitle: "공공요금 · 행정 처리 기간",
    verticalDescription:
      "For-Ai는 AI 답변이 자주 틀리고, 자주 바뀌며, 공식 출처로 검증할 수 있는 영역부터 시작해야 합니다. 수수료, 신청 기한, 갱신 비용, 행정 처리 규칙이 여기에 해당합니다.",
    verticalExamples: [
      "여권 재발급 수수료",
      "전입신고 및 세금 납부 기한",
      "공식 출처 기반 마감일과 자격 조건",
    ],
    audiencesEyebrow: "For-Ai를 쓰는 사람들",
    audiencesTitle: "하나의 출처, 세 가지 사용자",
    audienceDeveloperTitle: "개발자",
    audienceDeveloperDescription:
      "JSON, Markdown, JSON-LD로 구조화된 사실을 가져가세요. 모든 claim에는 신뢰도와 출처가 붙어 AI 에이전트와 RAG 파이프라인이 바로 인용할 수 있습니다.",
    audiencePeopleTitle: "사람",
    audiencePeopleDescription:
      "AI가 자주 틀리는 답을 출처 기반으로 찾으세요. 무엇인가 오래됐거나 잘못됐다면 로그인 없이 바로 신고할 수 있습니다.",
    audienceAiTitle: "AI & 크롤러",
    audienceAiDescription:
      "인용 전에 confidence, status, sources를 확인하세요. 확인되지 않은 claim은 사실로 인용하지 말아야 합니다.",
    howItWorksEyebrow: "작동 방식",
    howItWorksTitle: "추측하지 않고, 검증합니다.",
    step1Title: "claim 등록",
    step1Description:
      "모든 사실은 Needs verification / confidence: low / status: needs_review / no sources 상태로 시작합니다.",
    step2Title: "출처 추가 및 검증",
    step2Description:
      "공식·규제·플랫폼 출처를 관찰 시점과 함께 붙입니다. verification 이벤트가 전체 감사 이력을 남깁니다.",
    step3Title: "verified로 승격",
    step3Description:
      "사람이 검토해야만 verified와 confidence: medium/high가 됩니다.",
    verifiedEyebrow: "일일 검증 인텔리전스 · 초기 vertical",
    verifiedTitle: "최근 검증된 공공 문서",
    verifiedDescription:
      "초기 집중 vertical은 공공요금과 행정 처리 기간입니다. 자주 검색되고 공식 출처로 확인하기 쉬운 영역이기 때문입니다.",
    mostCitedEyebrow: "AI가 많이 인용한 것",
    mostCitedTitle: "레지스트리 텔레메트리 기반 인용 통계",
    mostCitedFallback: "인용 통계는 아직 없습니다.",
    entryEyebrow: "입구",
    entryTitle: "AI가 자주 틀리는 질문으로 시작하기",
    entryQuestionCta: "이 claim을 제출하거나 검증하기 →",
    registryEyebrow: "레지스트리",
    registryTitle: "vertical별 등록 문서 ({count})",
    registryDescription:
      "문서는 post-MVP vertical 기준으로 묶이며, 사용자는 AI가 틀리기 쉬운 도메인부터 들어올 수 있습니다.",
    statDocuments: "문서",
    statTotalClaims: "총 claim",
    statVerifiedClaims: "검증된 claim",
    statNeedsReview: "검토 필요",
    statVerifiedPct: "검증 비율",
    statNote: "현재 registry bundles를 기준으로 계산됩니다. 무엇을 모르는지 표시합니다.",
    statNoteLink: "공개 coverage dashboard 열기",
    aiCitationsLabel: "AI 인용",
    viewsLabel: "조회",
    citationStatsUnavailable: "인용 통계는 아직 없습니다",
    statusPrefix: "상태:",
    questionHeading: "AI가 자주 틀리는 질문",
    questions: [
      "여권 재발급 수수료가 지금 얼마야?",
      "전입신고는 며칠 안에 해야 해?",
      "주민등록증 재발급 수수료는 무료야?",
      "자동차세 납부 기간은 언제야?",
    ],
  },
  en: {
    verticalLabel: "Initial focus vertical",
    verticalTitle: "Public fees & civic processing times",
    verticalDescription:
      "For-Ai should start where AI answers are high-impact, frequently outdated, and source-verifiable: government fees, filing windows, renewal costs, and civil-service processing rules.",
    verticalExamples: [
      "Passport and resident ID reissue fees",
      "Move-in report and tax payment windows",
      "Official-source deadlines and eligibility rules",
    ],
    audiencesEyebrow: "Who uses For-Ai",
    audiencesTitle: "Three audiences, one source of truth",
    audienceDeveloperTitle: "Developers",
    audienceDeveloperDescription:
      "Fetch structured facts via JSON, Markdown, or JSON-LD. Every claim includes confidence and sources — ready for RAG pipelines and AI agents to cite directly.",
    audiencePeopleTitle: "People",
    audiencePeopleDescription:
      "Find source-backed answers to questions AI often gets wrong. If something is outdated or incorrect, report it with one click — no login required.",
    audienceAiTitle: "AI & Crawlers",
    audienceAiDescription:
      "Check confidence, status, and sources before citing. Never cite unverified claims as facts.",
    howItWorksEyebrow: "How it works",
    howItWorksTitle: "No guessing. Only verification.",
    step1Title: "Claim registered",
    step1Description:
      "Every fact starts as Needs verification / confidence: low / status: needs_review / no sources.",
    step2Title: "Source attached & verified",
    step2Description:
      "Official, regulatory, or platform sources are attached with observation timestamps. Verification events record the full audit trail.",
    step3Title: "Promoted to verified",
    step3Description:
      "Only after human review does a claim become verified with confidence: medium/high.",
    verifiedEyebrow: "Daily Verified Intelligence · Initial Vertical",
    verifiedTitle: "Recently available verified civic documents",
    verifiedDescription:
      "The first concentrated vertical is public fees and civic processing periods, because these answers are practical, frequently searched, and can be checked against official sources.",
    mostCitedEyebrow: "Most Cited by AI",
    mostCitedTitle: "Citation stats from registry telemetry",
    mostCitedFallback: "Citation stats are not available yet.",
    entryEyebrow: "Entry points",
    entryTitle: "Start with AI's most common mistakes",
    entryQuestionCta: "Submit or verify this claim →",
    registryEyebrow: "Registry",
    registryTitle: "Registered Documents by Vertical ({count})",
    registryDescription:
      "Documents are grouped by the post-MVP verticals instead of a flat list, so users and AI systems can enter through the domain where stale answers are most likely.",
    statDocuments: "Documents",
    statTotalClaims: "Total Claims",
    statVerifiedClaims: "Verified Claims",
    statNeedsReview: "Needs Review",
    statVerifiedPct: "Verified Percentage",
    statNote: "These figures are calculated from the current registry bundles. We mark what we don't know.",
    statNoteLink: "Open the public coverage dashboard",
    aiCitationsLabel: "AI citations",
    viewsLabel: "Views",
    citationStatsUnavailable: "Citation stats are not available yet",
    statusPrefix: "Status:",
    questionHeading: "AI often gets these wrong",
    questions: [
      "How much is passport reissue fee today?",
      "How many days do I have to file a move-in report?",
      "Is the resident ID reissue fee free?",
      "When is the car tax payment window?",
    ],
  },
};

function getHomeCopy(locale: string): HomeCopy {
  return HOME_COPY[locale] ?? HOME_COPY.en;
}

const VERTICAL_GROUPS = [
  {
    key: "business-policy",
    title: "Business operating facts / reputation correction",
    description: "The initial commercial wedge: hours, availability, policies, owner corrections, and AI reputation fixes that require independent source verification.",
    matches: ["commerce", "business", "venue", "policy", "refund", "hours", "service", "parking", "restaurant", "hotel", "store"],
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
    key: "public-civic",
    title: "Future coverage: public fees / civic processing",
    description: "Fees, filing periods, deadlines, and civil-service requirements remain valid future coverage, but are not in the seed-generation priority lane.",
    matches: ["administration", "tax", "government", "civic", "passport", "resident", "move-in"],
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

const DEFAULT_HOME_EXPLAINER = {
  eyebrow: "Registry explainer",
  title: "Operational terms belong below the headline",
  body: "The hero states the promise in plain language. The explainer can define registry bundle, candidate, and source trust for people who want the workflow details.",
  registryBundle: "Registry bundle: the entity, document, claims, sources, and verification events read together.",
  candidate: "Candidate: an unverified claim or topic that stays Needs verification with low confidence until reviewed.",
  sourceTrust: "Source trust: signals from source type, observation time, and review history that inform citation readiness.",
};

function HomeHero({ locale }: { locale: SupportedLocale }) {
  const t = getTranslations(locale).home;

  return (
    <section className="hero">
      <p className="hero-eyebrow">{t.heroEyebrow ?? "Global claim-level fact registry"}</p>
      <h1 className="hero-title">{t.heroTitle}</h1>
      <p className="hero-sub">{t.heroSubtitle}</p>
      <div className="hero-cta-row">
        <Link href="/#registry" className="btn btn-primary">
          {t.primaryCta ?? "Search verified claims"}
        </Link>
        <Link href="/suggest-topic" className="btn btn-secondary">
          {t.secondaryCta ?? "Submit a source"}
        </Link>
      </div>
    </section>
  );
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

export default async function HomePageContent({ locale = "en" }: { locale?: string }) {
  const home = getHomeCopy(locale);
  const localeKey = locale as SupportedLocale;
  const t = getTranslations(localeKey);
  const bundles = getAllRegistryBundles();
  const [docs, popularDocs] = await Promise.all([getAllDocs(), getPopularDocs()]);
  // Only advertise AI-citation telemetry once real citation events exist;
  // an always-empty "Most Cited" section reads as a broken promise.
  const hasCitationData = popularDocs.some((d) => d.ai_citation_count > 0 || d.view_count > 0);

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
    return r !== 0 ? r : a.document.title.localeCompare(b.document.title, activeLocale);
  });
  const { verified: verifiedDocuments } = partitionRegistryBundles(sorted);
  const groupedDocuments = groupedRegistryBundles(sorted);
  const primaryVerticalDocuments = verifiedDocuments.filter((bundle) => verticalForBundle(bundle)?.key === "business-policy");

  return (
    <div className="home">
      {/* Hero */}
      <section className="hero">
        <p className="hero-eyebrow">{home.verticalLabel}: {home.verticalTitle}</p>
        <h1 className="hero-title">
          {t.home.heroTitle}
        </h1>
        <p className="hero-sub">
          {t.home.heroSubtitle}
        </p>
        <ul className="hero-focus-list" aria-label="Initial focus examples">
          {home.verticalExamples.map((example) => (
            <li key={example}>{example}</li>
          ))}
        </ul>
        <div className="hero-cta-row">
          <Link href="/#registry" className="btn btn-primary">
            {t.nav.registry}
          </Link>
          <Link href="/api-docs" className="btn btn-secondary">
            {t.nav.api}
          </Link>
          <Link href="/community" className="btn btn-secondary">
            {t.nav.community}
          </Link>
          <Link href="/suggest-topic" className="btn btn-secondary">
            {t.nav.suggestTopic}
          </Link>
        </div>
      </section>

      {/* Trust / stats */}
      <section className="stat-strip" aria-label="Registry stats">
        <div className="stat">
          <span className="stat-num">{bundles.length}</span>
          <span className="stat-label">{home.statDocuments}</span>
        </div>
        <div className="stat">
          <span className="stat-num">{totalClaims}</span>
          <span className="stat-label">{home.statTotalClaims}</span>
        </div>
        <div className="stat">
          <span className="stat-num">{verifiedClaims}</span>
          <span className="stat-label">{home.statVerifiedClaims}</span>
        </div>
        <div className="stat">
          <span className="stat-num">{needsReviewClaims}</span>
          <span className="stat-label">{home.statNeedsReview}</span>
        </div>
        <Link href="/goal#coverage" className="stat stat-link" aria-label="Open public coverage dashboard">
          <span className="stat-num">{verifiedPct}%</span>
          <span className="stat-label">{home.statVerifiedPct}</span>
        </Link>
        <p className="stat-note">
          {home.statNote} <Link href="/goal#coverage">{home.statNoteLink}</Link>.
        </p>
      </section>

      {/* Trending */}
      <TrendingWidget locale={localeKey} />

      {/* 3 audience entry points */}
      <section className="section">
        <p className="section-eyebrow">{home.audiencesEyebrow}</p>
        <h2 className="section-title">{home.audiencesTitle}</h2>
        <div className="audience-grid">
          <article className="audience-card" id="developers">
            <div className="audience-icon" aria-hidden="true">
              {"</>"}
            </div>
            <h3>{home.audienceDeveloperTitle}</h3>
            <p>
              {home.audienceDeveloperDescription}
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
            <h3>{home.audiencePeopleTitle}</h3>
            <p>
              {home.audiencePeopleDescription}
            </p>
            <div className="audience-links">
              <Link href="/#registry" className="text-link">
                {t.nav.registry}
              </Link>
              <Link href="/suggest-topic" className="text-link">
                {t.nav.suggestTopic}
              </Link>
            </div>
          </article>

          <article className="audience-card" id="ai-systems">
            <div className="audience-icon" aria-hidden="true">
              &#10022;
            </div>
            <h3>{home.audienceAiTitle}</h3>
            <p>
              {home.audienceAiDescription}
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

      <section className="section">
        <p className="section-eyebrow">{homeCopy.explainerEyebrow ?? DEFAULT_HOME_EXPLAINER.eyebrow}</p>
        <h2 className="section-title">{homeCopy.explainerTitle ?? DEFAULT_HOME_EXPLAINER.title}</h2>
        <p className="section-lede">{homeCopy.explainerBody ?? DEFAULT_HOME_EXPLAINER.body}</p>
        <div className="audience-grid">
          <article className="audience-card"><h3>Registry bundle</h3><p>{homeCopy.explainerRegistryBundle ?? DEFAULT_HOME_EXPLAINER.registryBundle}</p></article>
          <article className="audience-card"><h3>Candidate</h3><p>{homeCopy.explainerCandidate ?? DEFAULT_HOME_EXPLAINER.candidate}</p></article>
          <article className="audience-card"><h3>Source trust</h3><p>{homeCopy.explainerSourceTrust ?? DEFAULT_HOME_EXPLAINER.sourceTrust}</p></article>
        </div>
      </section>

      {/* How it works */}
      <section className="section">
        <p className="section-eyebrow">{home.howItWorksEyebrow}</p>
        <h2 className="section-title">{home.howItWorksTitle}</h2>
        <ol className="steps">
          <li className="step">
            <span className="step-num">1</span>
            <div>
              <h3>{home.step1Title}</h3>
              <p>
                {home.step1Description}
              </p>
            </div>
          </li>
          <li className="step">
            <span className="step-num">2</span>
            <div>
              <h3>{home.step2Title}</h3>
              <p>
                {home.step2Description}
              </p>
            </div>
          </li>
          <li className="step">
            <span className="step-num">3</span>
            <div>
              <h3>{home.step3Title}</h3>
              <p>
                {home.step3Description}
              </p>
            </div>
          </li>
        </ol>
      </section>

      <section className="section">
        <p className="section-eyebrow">{home.verifiedEyebrow}</p>
        <h2 className="section-title">{home.verifiedTitle}</h2>
        <p className="section-lede">
          {home.verifiedDescription}
        </p>
        <ul className="registry-index">
          {(primaryVerticalDocuments.length > 0 ? primaryVerticalDocuments : verifiedDocuments).slice(0, 5).map((b) => {
            const badge = statusBadge(b.document.status);
            return (
              <li key={b.document.slug} className="registry-row">
                <div className="registry-row-main">
                  <Link href={`/${activeLocale}/wiki/${b.document.slug}`} className="registry-row-title">
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
        <p className="section-eyebrow">{home.mostCitedEyebrow}</p>
        <h2 className="section-title">{home.mostCitedTitle}</h2>
        {popularDocs.length > 0 ? (
          <ul className="registry-index">
            {popularDocs.map((d, i) => (
              <li key={d.document_id} className="registry-row">
                <div className="registry-row-main">
                  <Link href={`/${activeLocale}/wiki/${d.slug}`} className="registry-row-title">
                    {i + 1}. {d.title}
                  </Link>
                </div>
                <div className="registry-row-meta">
                  <span className="badge" title={home.aiCitationsLabel}>{home.aiCitationsLabel}: {d.ai_citation_count}</span>
                  <span className="badge" title={home.viewsLabel}>{home.viewsLabel}: {d.view_count}</span>
                  <span className="badge">{home.mostCitedFallback}</span>
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
                    <Link href={`/${locale}/wiki/${b.document.slug}`} className="registry-row-title">
                      {b.document.title}
                    </Link>
                    <span className="registry-row-entity">{home.citationStatsUnavailable}</span>
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
          <p className="stat-note">{home.mostCitedFallback}</p>
        )}
      </section>

      {/* Search */}
      <section className="section">
        <HomeSearch docs={docs} locale={localeKey} />
      </section>

      <section className="section" aria-labelledby="ai-wrong-questions">
        <p className="section-eyebrow">{home.entryEyebrow}</p>
        <h2 className="section-title" id="ai-wrong-questions">{home.entryTitle}</h2>
        <div className="question-grid">
          {home.questions.map((question) => (
            <Link key={question} href="/suggest-topic" className="question-card">
              <span>{question}</span>
              <small>{home.entryQuestionCta}</small>
            </Link>
          ))}
        </div>
      </section>

      {/* Registry index */}
      <section className="section" id="registry">
        <p className="section-eyebrow">{home.registryEyebrow}</p>
        <h2 className="section-title">{home.registryTitle.replace("{count}", String(bundles.length))}</h2>
        <p className="section-lede">
          {home.registryDescription}
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
                        <Link href={`/${activeLocale}/wiki/${b.document.slug}`} className="registry-row-title">
                          {b.document.title}
                        </Link>
                        <span className="registry-row-entity">{b.entity.canonical_name}</span>
                      </div>
                      <div className="registry-row-meta">
                        <span className={badge.className}>{home.statusPrefix} {badge.label}</span>
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
