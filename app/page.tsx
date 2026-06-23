import Link from "next/link";
import { getAllRegistryBundles } from "../lib/data";

export default function HomePage() {
  const bundles = getAllRegistryBundles();
  const verifiedClaims = bundles.flatMap((bundle) => bundle.claims).filter((claim) => claim.status === "verified").length;
  const unknownClaims = bundles.flatMap((bundle) => bundle.claims).filter((claim) => claim.claim_value === "확인 필요").length;
  const mvpBundle = bundles.find((bundle) => bundle.document.slug === "myungdong-laluce-parking") ?? bundles[0];

  return (
    <>
      <section className="home-hero" aria-labelledby="home-title">
        <p className="eyebrow">AI-readable local facts</p>
        <h1 id="home-title">AI와 검색엔진이 인용할 수 있는 로컬 팩트 레지스트리</h1>
        <p className="hero-copy">
          GYEOL은 wiki가 아니라 claim 단위로 신뢰도, 출처, 검증 상태를 분리해 제공하는
          static-first registry입니다. 확인되지 않은 사실은 계속 <strong>확인 필요</strong>로 남깁니다.
        </p>
        <div className="cta-row">
          <Link className="cta-link cta-primary" href={`/ko/wiki/${mvpBundle.document.slug}`}>MVP 문서 보기</Link>
          <Link className="cta-link" href="/llms.txt">AI 인용 정책 보기</Link>
          <Link className="cta-link" href={`/api/documents/${mvpBundle.document.slug}`}>JSON API</Link>
        </div>
      </section>

      <section className="trust-stats" aria-label="Registry trust statistics">
        <div>
          <strong>{bundles.length}</strong>
          <span>registry documents</span>
        </div>
        <div>
          <strong>{verifiedClaims}</strong>
          <span>verified claims</span>
        </div>
        <div>
          <strong>{unknownClaims}</strong>
          <span>unknown facts preserved</span>
        </div>
      </section>

      <section className="audience-grid" aria-labelledby="audience-title">
        <h2 id="audience-title">누구를 위한 레지스트리인가</h2>
        <article>
          <h3>AI crawlers</h3>
          <p>JSON API, raw Markdown, JSON-LD, sitemap, robots, llms.txt로 claim-level context를 읽습니다.</p>
        </article>
        <article>
          <h3>Search engines</h3>
          <p>정적 HTML과 canonical metadata로 문서 제목, entity_id, confidence, source policy를 확인합니다.</p>
        </article>
        <article>
          <h3>Humans</h3>
          <p>확인된 정보와 확인이 필요한 정보를 분리해서 보고, 정정 요청과 AI 오답 신고를 남길 수 있습니다.</p>
        </article>
      </section>

      <section className="how-it-works" aria-labelledby="how-title">
        <h2 id="how-title">How it works</h2>
        <ol>
          <li><strong>Entity</strong><span>안정적인 entity_id로 대상을 고정합니다.</span></li>
          <li><strong>Document</strong><span>언어별 title과 stable English slug로 페이지를 만듭니다.</span></li>
          <li><strong>Claim</strong><span>사실을 claim 단위로 쪼개 confidence와 status를 관리합니다.</span></li>
          <li><strong>Source</strong><span>출처가 없으면 verified로 올리지 않습니다.</span></li>
        </ol>
      </section>

      <section className="registry-panel" aria-labelledby="registry-index-title">
        <p className="eyebrow">Registry index</p>
        <h2 id="registry-index-title">등록된 문서 ({bundles.length})</h2>
        <ul className="document-list document-list-grid">
          {bundles.map((bundle) => (
            <li key={bundle.document.slug}>
              <Link href={`/ko/wiki/${bundle.document.slug}`}>{bundle.document.title}</Link>
              <span className="meta-label">{bundle.entity.id}</span>
              <span className={`badge badge-${bundle.document.confidence}`}>{bundle.document.confidence}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
