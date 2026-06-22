import Link from "next/link";

export default function HomePage() {
  return (
    <article>
      <section className="registry-panel">
        <p className="eyebrow">GYEOL</p>
        <h1>로컬 팩트 레지스트리</h1>
        <p>GYEOL은 로컬 팩트 레지스트리입니다. claim 단위로 신뢰도, 출처, 검증일을 관리합니다.</p>
        <p>
          MVP는 한국어 문서 하나로 시작하지만, route, slug, entity_id, machine-readable output은
          다국어 문서와 AI/search crawling 확장을 전제로 고정합니다.
        </p>
      </section>

      <nav className="registry-panel" aria-labelledby="mvp-routes">
        <h2 id="mvp-routes">MVP routes</h2>
        <ul className="link-list">
          <li><Link href="/ko/wiki/myungdong-laluce-parking">MVP 문서 보기</Link></li>
          <li><Link href="/api/documents/myungdong-laluce-parking">JSON API</Link></li>
          <li><Link href="/raw/myungdong-laluce-parking.md">Raw Markdown</Link></li>
          <li><Link href="/report/myungdong-laluce-parking">Correction report</Link></li>
          <li><Link href="/hallucination/myungdong-laluce-parking">AI hallucination report</Link></li>
          <li><Link href="/diagnostics/myungdong-laluce-parking">Diagnostics</Link></li>
          <li><Link href="/suggest-topic">Suggest a topic</Link></li>
        </ul>
      </nav>
    </article>
  );
}
