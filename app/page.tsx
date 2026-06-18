import Link from "next/link";

export default function HomePage() {
  return (
    <section className="registry-panel">
      <p className="eyebrow">GYEOL</p>
      <h1>로컬 팩트 레지스트리</h1>
      <p>GYEOL은 로컬 팩트 레지스트리입니다. claim 단위로 신뢰도, 출처, 검증일을 관리합니다.</p>
      <p>
        MVP는 한국어 문서 하나로 시작하지만, route, slug, entity_id, machine-readable output은
        다국어 문서와 AI/search crawling 확장을 전제로 고정합니다.
      </p>
      <p>
        <Link href="/ko/wiki/myungdong-laluce-parking">MVP 문서 보기</Link>
      </p>
    </section>
  );
}
