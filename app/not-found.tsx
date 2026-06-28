import Link from "next/link";

export default function NotFound() {
  return (
    <section className="registry-panel">
      <p className="eyebrow">Not found</p>
      <h1>문서를 찾을 수 없습니다</h1>
      <p>요청한 문서가 없습니다.</p>
      <p><Link href="/">Return to the registry home</Link></p>
    </section>
  );
}
