import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { getAllRegistryBundles } from "../lib/data";
import type { RegistryDocumentBundle } from "../lib/types";
import HomeSearch, { type HomeSearchDoc } from "./components/HomeSearch";

type DocItem = HomeSearchDoc;

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
  if (b.document.status === "verified" || b.document.status === "published") return 0;
  if (b.document.status === "needs_review") return 1;
  return 2;
}

function citationBadgeLabel(status: string): string {
  if (status === "verified" || status === "published") return "인용 가능";
  if (status === "needs_review") return "확인 필요 / 사실값 인용 금지";
  return "사실값 인용 금지";
}

function sourceCount(b: RegistryDocumentBundle): number {
  return new Set(b.claims.flatMap((claim) => claim.sources.map((source) => source.id))).size;
}

function latestVerifiedTime(b: RegistryDocumentBundle): string | null {
  return (
    b.document.last_verified_at ??
    b.claims
      .map((claim) => claim.last_verified_at)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ??
    null
  );
}

async function getAllDocs(): Promise<DocItem[]> {
  const staticDocs: DocItem[] = getAllRegistryBundles().map((b) => ({
    slug: b.document.slug,
    title: b.document.title,
    category: b.document.category || b.entity.type,
    status: b.document.status,
    confidence: b.document.confidence,
    sourceCount: sourceCount(b),
    lastVerifiedAt:
      b.document.last_verified_at ??
      b.claims
        .map((claim) => claim.last_verified_at)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ??
      null,
    source: "static" as const,
    lang: b.document.lang,
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
        .select("slug,title,category,status,confidence,last_verified_at")
        .in("status", ["published", "verified", "needs_review"])
        .order("created_at", { ascending: false })
        .limit(500);
      sbDocs = (data ?? [])
        .filter((d: { slug: string }) => !staticSlugs.has(d.slug))
        .map(
          (d: {
            slug: string;
            title: string;
            category?: string;
            status?: string;
            confidence?: string;
            last_verified_at?: string | null;
          }) => ({
            slug: d.slug,
            title: d.title,
            category: d.category ?? "",
            status: d.status ?? "published",
            confidence: d.confidence ?? "low",
            sourceCount: 0,
            lastVerifiedAt: d.last_verified_at ?? null,
            source: "supabase" as const,
          }),
        );
    } catch {
      /* Supabase unavailable — use static only */
    }
  }
  return [...sbDocs, ...staticDocs];
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
  const verifiedDocuments = sorted.filter(
    (b) => b.document.status === "verified" || b.document.status === "published",
  );
  const needsReviewDocuments = sorted.filter((b) => b.document.status === "needs_review");
  const recentlyVerified = [...verifiedDocuments]
    .sort((a, b) => (latestVerifiedTime(b) ?? "").localeCompare(latestVerifiedTime(a) ?? ""))
    .slice(0, 5);
  const documentsByCategory = [
    ...bundles.reduce((groups, bundle) => {
      const category = bundle.document.category || bundle.entity.type || "uncategorized";
      const group = groups.get(category) ?? [];
      group.push(bundle);
      groups.set(category, group);
      return groups;
    }, new Map<string, RegistryDocumentBundle[]>()),
  ].sort(([a], [b]) => a.localeCompare(b, "ko"));

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
      <section className="section">
        <HomeSearch docs={docs} />
      </section>

      {/* Discovery slices */}
      <section className="section" id="registry">
        <p className="section-eyebrow">레지스트리 분류</p>
        <h2 className="section-title">검증 상태별 문서</h2>
        <div className="audience-grid">
          <article className="audience-card">
            <h3>검증 완료 문서 ({verifiedDocuments.length})</h3>
            <ul className="document-list">
              {verifiedDocuments.map((b) => (
                <li key={b.document.slug}>
                  <Link href={`/ko/wiki/${b.document.slug}`}>{b.document.title}</Link>
                  <span className="meta-label"> — {b.document.slug}</span>
                  <span className="badge badge-verified">{citationBadgeLabel(b.document.status)}</span>
                </li>
              ))}
            </ul>
          </article>
          <article className="audience-card">
            <h3>확인 필요 문서 ({needsReviewDocuments.length})</h3>
            <ul className="document-list">
              {needsReviewDocuments.map((b) => (
                <li key={b.document.slug}>
                  <Link href={`/ko/wiki/${b.document.slug}`}>{b.document.title}</Link>
                  <span className="meta-label"> — {b.document.slug}</span>
                  <span className="badge badge-review">{citationBadgeLabel(b.document.status)}</span>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section className="section">
        <p className="section-eyebrow">최근 검증</p>
        <h2 className="section-title">최근 검증된 문서</h2>
        <ul className="registry-index">
          {recentlyVerified.map((b) => (
            <li key={b.document.slug} className="registry-row">
              <div className="registry-row-main">
                <Link href={`/ko/wiki/${b.document.slug}`} className="registry-row-title">
                  {b.document.title}
                </Link>
                <span className="registry-row-entity">
                  slug: {b.document.slug} · confidence: {b.document.confidence} · verified:{" "}
                  {latestVerifiedTime(b) ?? "확인 필요"}
                </span>
              </div>
              <div className="registry-row-meta">
                <span className="badge badge-verified">인용 가능</span>
                <span className="badge">sources {sourceCount(b)}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="section">
        <p className="section-eyebrow">카테고리</p>
        <h2 className="section-title">카테고리별 문서</h2>
        <div className="audience-grid">
          {documentsByCategory.map(([category, categoryBundles]) => (
            <article className="audience-card" key={category}>
              <h3>{category}</h3>
              <ul className="document-list">
                {categoryBundles.map((b) => (
                  <li key={b.document.slug}>
                    <Link href={`/ko/wiki/${b.document.slug}`}>{b.document.title}</Link>
                    <span className="meta-label"> — {b.document.status}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {/* Registry index */}
      <section className="section">
        <p className="section-eyebrow">레지스트리</p>
        <h2 className="section-title">등록된 문서 ({bundles.length})</h2>
        <ul className="registry-index">
          {sorted.map((b) => {
            const badge = statusBadge(b.document.status);
            return (
              <li key={b.document.slug} className="registry-row">
                <div className="registry-row-main">
                  <Link href={`/ko/wiki/${b.document.slug}`} className="registry-row-title">
                    {b.document.title}
                  </Link>
                  <span className="registry-row-entity">{b.entity.canonical_name}</span>
                </div>
                <div className="registry-row-meta">
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
