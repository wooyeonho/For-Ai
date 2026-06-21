import Link from "next/link";
import { getAllRegistryBundles } from "../lib/data";

export default function HomePage() {
  const bundles = getAllRegistryBundles();

  return (
    <section className="registry-panel">
      <p className="eyebrow">GYEOL</p>
      <h1>로컬 팩트 레지스트리</h1>
      <p>
        GYEOL은 로컬 팩트 레지스트리입니다. claim 단위로 신뢰도, 출처,
        검증일을 관리합니다.
      </p>
      <h2>등록된 문서 ({bundles.length})</h2>
      <ul className="document-list">
        {bundles.map((b) => (
          <li key={b.document.slug}>
            <Link href={`/ko/wiki/${b.document.slug}`}>{b.document.title}</Link>
            <span className="meta-label"> — {b.entity.canonical_name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
