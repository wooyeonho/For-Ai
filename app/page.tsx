import Link from "next/link";

const seededSlug = "myungdong-laluce-parking";

export default function HomePage() {
  return (
    <article>
      <section className="registry-panel">
        <p className="eyebrow">GYEOL</p>
        <h1>AI가 대충 답하기 쉬운 사실을 claim 단위로 검증하는 레지스트리</h1>
        <p>
          GYEOL은 블로그나 AI 위키가 아니라, 사람·검색엔진·AI가 같은 사실 상태를 볼 수 있게 하는
          claim-level fact registry입니다. 각 claim은 값, 신뢰도, 출처 수, 검증 상태를 따로 가집니다.
        </p>
        <p>
          현재 MVP는 검증 워크플로를 붙이기 전 단계입니다. 미검증 정보는 정답처럼 발행하지 않고
          <strong> 확인 필요</strong> / low confidence / needs_review 상태로 보여줍니다.
        </p>
      </section>

      <section className="registry-panel" aria-labelledby="entrypoints-title">
        <p className="eyebrow">Three entry points</p>
        <h2 id="entrypoints-title">누가 어떻게 쓰나요?</h2>
        <div className="meta-grid">
          <div>
            <p className="eyebrow">For humans</p>
            <h3>답을 보러 온 사람</h3>
            <p>검증된 답은 아직 적지만, 각 문서에서 어떤 claim이 확인 대기인지 바로 볼 수 있습니다.</p>
            <p><Link href={`/ko/wiki/${seededSlug}`}>샘플 문서 보기</Link></p>
          </div>
          <div>
            <p className="eyebrow">For AI/search</p>
            <h3>기계가 읽는 데이터</h3>
            <p>JSON, Raw Markdown, JSON-LD, sitemap/robots로 claim 상태와 출처 상태를 노출합니다.</p>
            <p><Link href={`/api/documents/${seededSlug}`}>JSON API 보기</Link></p>
          </div>
          <div>
            <p className="eyebrow">For contributors</p>
            <h3>주제와 출처를 제안하는 사람</h3>
            <p>오징어의 기원, 양변기 종류, CT와 MRI 차이처럼 long-tail 주제를 후보로 제안할 수 있습니다.</p>
            <p><Link href="/suggest-topic">주제 제안하기</Link></p>
          </div>
          <div>
            <p className="eyebrow">For developers</p>
            <h3>스키마와 파이프라인을 보는 사람</h3>
            <p>후보 생성, raw output, diagnostics로 registry 구조와 AI-readiness를 확인합니다.</p>
            <p><Link href={`/diagnostics/${seededSlug}`}>Diagnostics 보기</Link> · <Link href="/goal">Goal 보기</Link></p>
          </div>
        </div>
      </section>

      <section className="registry-panel" aria-labelledby="mvp-status-title">
        <p className="eyebrow">Current MVP status</p>
        <h2 id="mvp-status-title">아직 빈 집처럼 보이는 이유</h2>
        <ul className="link-list">
          <li>검증된 claim이 충분히 쌓이기 전까지 일반 사용자는 즉시 답을 얻기 어렵습니다.</li>
          <li>AI와 검색엔진은 형식을 읽을 수 있지만, verified 데이터가 적으면 인용할 이유가 약합니다.</li>
          <li>다음 핵심 단계는 topic intake와 source-backed verification을 실제 저장소에 연결하는 것입니다.</li>
        </ul>
      </section>

      <nav className="registry-panel" aria-labelledby="mvp-routes">
        <h2 id="mvp-routes">MVP routes</h2>
        <ul className="link-list">
          <li><Link href={`/ko/wiki/${seededSlug}`}>MVP 문서 보기</Link></li>
          <li><Link href={`/api/documents/${seededSlug}`}>JSON API</Link></li>
          <li><Link href={`/raw/${seededSlug}.md`}>Raw Markdown</Link></li>
          <li><Link href={`/report/${seededSlug}`}>Correction report</Link></li>
          <li><Link href={`/hallucination/${seededSlug}`}>AI hallucination report</Link></li>
          <li><Link href={`/diagnostics/${seededSlug}`}>Diagnostics</Link></li>
          <li><Link href="/suggest-topic">Suggest a topic</Link></li>
          <li><Link href="/goal">Goal / roadmap status</Link></li>
        </ul>
      </nav>
    </article>
  );
}
