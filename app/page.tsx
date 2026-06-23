import type { Metadata } from "next";
import Link from "next/link";
import { getAllRegistryBundles } from "../lib/data";
import type { Confidence, DocumentStatus, RegistryDocumentBundle } from "../lib/types";
import { getSupabaseDocumentIndex } from "../lib/supabase-documents";
import HomeSearch from "./components/HomeSearch";

interface DocItem {
  slug: string;
  title: string;
  category?: string;
  source: "static" | "supabase";
  status: DocumentStatus;
  confidence: Confidence;
  sourceCount: number;
  lang?: string;
}

export const metadata: Metadata = {
  title: { absolute: "GYEOL — 로컬 팩트 레지스트리" },
  description:
    "AI·검색·사람이 같은 사실을 같은 근거로 인용하는 로컬 팩트 레지스트리. claim 단위로 신뢰도·출처·검증일을 관리합니다.",
};

function statusBadge(status: string): { className: string; label: string } {
  switch (status) {
    case "verified":
    case "published":
      return { className: "badge badge-verified", label: "검증됨" };
    case "needs_review":
      return { className: "badge badge-review", label: "확인 필요" };
    case "archived":
      return { className: "badge", label: "보관" };
    default:
      return { className: "badge badge-low", label: "초안" };
  }
}

function statusRank(b: RegistryDocumentBundle): number {
  return statusRankValue(b.document.status);
}

async function getAllDocs(): Promise<DocItem[]> {
  const staticDocs: DocItem[] = getAllRegistryBundles().map((b) => ({
    slug: b.document.slug,
    title: b.document.title,
    category: b.document.category || b.entity.type,
    source: "static" as const,
    status: b.document.status,
    confidence: b.document.confidence,
    sourceCount: b.claims.reduce((count, claim) => count + claim.sources.length, 0),
    lang: b.document.lang,
  }));
  const staticSlugs = new Set(staticDocs.map((d) => d.slug));
  const sbDocs: DocItem[] = (await getSupabaseDocumentIndex())
    .filter((d) => !staticSlugs.has(d.slug))
    .map((d) => ({ ...d, source: "supabase" as const }));

  return [...sbDocs, ...staticDocs].sort((a, b) => {
    const statusDelta = statusRankValue(a.status) - statusRankValue(b.status);
    return statusDelta !== 0 ? statusDelta : a.title.localeCompare(b.title, "ko");
  });
}

function statusRankValue(status: DocumentStatus): number {
  if (status === "verified" || status === "published") return 0;
  if (status === "needs_review") return 1;
  return 2;
}

function citationBadge(doc: Pick<DocItem, "status" | "confidence">): { className: string; label: string } {
  if ((doc.status === "verified" || doc.status === "published") && doc.confidence !== "low") {
    return { className: "badge badge-verified", label: "인용 가능" };
  }
  return { className: "badge badge-review", label: "사실값 인용 금지" };
}

export const revalidate = 60;

export default async function HomePage() {
  const bundles = getAllRegistryBundles();
  const docs = await getAllDocs();

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
  const verifiedDocs = docs.filter(
    (doc) => (doc.status === "verified" || doc.status === "published") && doc.confidence !== "low",
  );
  const reviewDocs = docs.filter(
    (doc) => doc.status === "needs_review" || doc.confidence === "low",
  );
  const categoryLinks = ["교통", "민원", "수수료", "환불", "배송", "금융", "통신"];

  return (
    <div className="home">
      {/* Hero */}
      <section className="hero">
        <p className="hero-eyebrow">로컬 팩트 레지스트리 · for AI · search · humans</p>
        <h1 className="hero-title">
          사실을 <span className="hero-accent">claim 단위</span>로,
          <br />
          출처와 검증일과 함께.
        </h1>
        <p className="hero-sub">
          GYEOL은 AI·검색엔진·사람이 같은 사실을 같은 근거로 인용하도록 만드는 로컬 팩트
          레지스트리입니다. 모든 사실은 신뢰도·출처·검증 상태를 가지며, 확인되지 않은
          정보는 추측하지 않고 <strong>&ldquo;확인 필요&rdquo;</strong>로 남깁니다.
        </p>
        <div className="hero-cta-row">
          <Link href="#registry" className="btn btn-primary">
            레지스트리 둘러보기
          </Link>
          <Link href="#developers" className="btn btn-secondary">
            개발자 · AI 연동 →
          </Link>
          <Link href="/suggest-topic" className="btn btn-secondary">
            + 토픽 제안하기
          </Link>
        </div>
      </section>

      {/* Trust / stats */}
      <section className="stat-strip" aria-label="레지스트리 현황">
        <div className="stat">
          <span className="stat-num">{bundles.length}</span>
          <span className="stat-label">등록 문서</span>
        </div>
        <div className="stat">
          <span className="stat-num">{totalClaims}</span>
          <span className="stat-label">전체 claim</span>
        </div>
        <div className="stat">
          <span className="stat-num">{verifiedClaims}</span>
          <span className="stat-label">검증된 claim</span>
        </div>
        <div className="stat">
          <span className="stat-num">{categories}</span>
          <span className="stat-label">카테고리</span>
        </div>
        <p className="stat-note">
          검증 {verifiedClaims} · 확인 필요 {needsReviewClaims} ({verifiedPct}% 검증). 우리는
          모르는 것을 모른다고 표시합니다.
        </p>
      </section>

      {/* 3 audience entry points */}
      <section className="section">
        <p className="section-eyebrow">누가 쓰나요</p>
        <h2 className="section-title">세 종류의 사용자, 하나의 사실</h2>
        <div className="audience-grid">
          <article className="audience-card" id="developers">
            <div className="audience-icon" aria-hidden>
              {"</>"}
            </div>
            <h3>개발자</h3>
            <p>
              구조화된 JSON·Markdown·JSON-LD로 사실을 가져가세요. claim마다 신뢰도와 출처가
              붙어 있어, RAG·에이전트가 그대로 인용·검증할 수 있습니다.
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
              <Link href="/sitemap.xml" className="mono-link">
                GET /sitemap.xml
              </Link>
            </div>
          </article>

          <article className="audience-card">
            <div className="audience-icon" aria-hidden>
              ☷
            </div>
            <h3>일반 사용자</h3>
            <p>
              검색해서 들어온 질문에 출처가 달린 답을. 값이 틀렸거나 오래됐다면 로그인 없이
              한 번의 클릭으로 정정을 제보할 수 있습니다.
            </p>
            <div className="audience-links">
              <Link href="#registry" className="text-link">
                레지스트리 둘러보기
              </Link>
              <Link href="/suggest-topic" className="text-link">
                새 토픽 제안하기
              </Link>
            </div>
          </article>

          <article className="audience-card" id="ai-systems">
            <div className="audience-icon" aria-hidden>
              ✦
            </div>
            <h3>AI · 크롤러</h3>
            <p>
              인용 전에 <code>confidence</code>·<code>status</code>·<code>sources</code>를
              확인하세요. 미검증(&ldquo;확인 필요&rdquo;) 사실은 인용하지 마세요. 각 문서는 JSON-LD
              Dataset을 raw HTML에 내장합니다.
            </p>
            <div className="audience-links">
              <Link href="/sitemap.xml" className="mono-link">
                /sitemap.xml
              </Link>
              <Link href="/robots.txt" className="mono-link">
                /robots.txt
              </Link>
              {exampleSlug ? (
                <Link href={`/diagnostics/${exampleSlug}`} className="text-link">
                  AI-readiness 진단 보기
                </Link>
              ) : null}
            </div>
          </article>
        </div>
      </section>

      {/* How it works */}
      <section className="section">
        <p className="section-eyebrow">어떻게 동작하나</p>
        <h2 className="section-title">추측하지 않고, 검증합니다</h2>
        <ol className="steps">
          <li className="step">
            <span className="step-num">1</span>
            <div>
              <h3>claim 등록</h3>
              <p>
                모든 사실은 <code>확인 필요</code> / <code>low</code> /{" "}
                <code>needs_review</code> / 출처 없음 상태로 시작합니다. AI가 생성한 후보도
                예외 없이 동일합니다.
              </p>
            </div>
          </li>
          <li className="step">
            <span className="step-num">2</span>
            <div>
              <h3>출처 부착 · 검증 이벤트</h3>
              <p>
                공식·법령·운영기관 등 허용된 출처와 확인 시각을 붙이고, 검증 이벤트로 변경
                이력을 기록합니다.
              </p>
            </div>
          </li>
          <li className="step">
            <span className="step-num">3</span>
            <div>
              <h3>verified 승격</h3>
              <p>
                출처가 검증된 뒤에만 실제 값으로 바뀌고 신뢰도가{" "}
                <code>medium/high</code>로 올라갑니다. AI 생성 콘텐츠는 검증된 사실로
                발행되지 않습니다.
              </p>
            </div>
          </li>
        </ol>
      </section>

      {/* Search */}
      <section className="section" id="registry">
        <p className="section-eyebrow">레지스트리 탐색</p>
        <h2 className="section-title">문서 검색 · 카테고리별 진입</h2>
        <p className="section-subtitle">
          홈 검색은 정적 문서와 Supabase document index helper로 가져온 새 문서를 함께 보여줍니다.
          결과에는 title, slug, confidence, status, source count가 표시됩니다.
        </p>
        <nav className="category-links" aria-label="카테고리별 링크">
          {categoryLinks.map((category) => (
            <Link key={category} href={`#category-${encodeURIComponent(category)}`} className="category-link">
              {category}
            </Link>
          ))}
        </nav>
        <HomeSearch docs={docs} />
        <div className="category-index-grid" aria-label="카테고리별 문서 바로가기">
          {categoryLinks.map((category) => {
            const categoryDocs = docs.filter((doc) => doc.category?.includes(category));
            return (
              <article key={category} id={`category-${encodeURIComponent(category)}`} className="category-index-card">
                <h3>{category}</h3>
                {categoryDocs.length ? (
                  <ul>
                    {categoryDocs.slice(0, 4).map((doc) => (
                      <li key={doc.slug}>
                        <Link href={`/ko/wiki/${doc.slug}`}>{doc.title}</Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="meta-label">해당 카테고리 문서 준비 중</p>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="section" aria-labelledby="verified-documents">
        <p className="section-eyebrow">검증 우선</p>
        <h2 className="section-title" id="verified-documents">
          검증 완료 문서 ({verifiedDocs.length})
        </h2>
        <ul className="registry-index">
          {verifiedDocs.map((doc) => {
            const badge = statusBadge(doc.status);
            const cite = citationBadge(doc);
            return (
              <li key={doc.slug} className="registry-row">
                <div className="registry-row-main">
                  <Link href={`/ko/wiki/${doc.slug}`} className="registry-row-title">
                    {doc.title}
                  </Link>
                  <span className="registry-row-entity">/{doc.slug} · 출처 {doc.sourceCount}개</span>
                </div>
                <div className="registry-row-meta">
                  <span className={cite.className}>{cite.label}</span>
                  <span className={badge.className}>{badge.label}</span>
                  <span className="badge">{doc.confidence}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="section" aria-labelledby="review-documents">
        <p className="section-eyebrow">인용 제한</p>
        <h2 className="section-title" id="review-documents">
          확인 필요 후보/문서 ({reviewDocs.length})
        </h2>
        <ul className="registry-index">
          {reviewDocs.map((doc) => {
            const badge = statusBadge(doc.status);
            const cite = citationBadge(doc);
            return (
              <li key={doc.slug} className="registry-row">
                <div className="registry-row-main">
                  <Link href={`/ko/wiki/${doc.slug}`} className="registry-row-title">
                    {doc.title}
                  </Link>
                  <span className="registry-row-entity">/{doc.slug} · 출처 {doc.sourceCount}개</span>
                </div>
                <div className="registry-row-meta">
                  <span className={cite.className}>{cite.label}</span>
                  <span className={badge.className}>{badge.label}</span>
                  <span className="badge">{doc.confidence}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Registry index */}
      <section className="section">
        <p className="section-eyebrow">레지스트리</p>
        <h2 className="section-title">정적 등록 문서 ({bundles.length})</h2>
        <ul className="registry-index">
          {sorted.map((b) => {
            const badge = statusBadge(b.document.status);
            const cite = citationBadge({ status: b.document.status, confidence: b.document.confidence });
            return (
              <li key={b.document.slug} className="registry-row">
                <div className="registry-row-main">
                  <Link href={`/ko/wiki/${b.document.slug}`} className="registry-row-title">
                    {b.document.title}
                  </Link>
                  <span className="registry-row-entity">{b.entity.canonical_name}</span>
                </div>
                <div className="registry-row-meta">
                  <span className={cite.className}>{cite.label}</span>
                  <span className={badge.className}>{badge.label}</span>
                  <span className="badge">{b.entity.type}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
