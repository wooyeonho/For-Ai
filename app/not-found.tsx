import Link from "next/link";

export default function NotFound() {
  return (
    <section className="registry-panel">
      <p className="eyebrow">Not found</p>
      <h1>문서를 찾을 수 없습니다</h1>
      <p>요청한 GYEOL registry document가 없습니다. MVP seed document로 돌아가세요.</p>
      <p><Link href="/ko/wiki/myungdong-laluce-parking">명동 라루체 주차 정보</Link></p>
    </section>
  );
}
