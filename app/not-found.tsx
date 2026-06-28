import Link from "next/link";

export default function NotFound() {
  return (
    <section className="registry-panel">
      <p className="eyebrow">Not found</p>
      <h1>Page not found</h1>
      <p>요청한 페이지를 찾을 수 없습니다. The page you&apos;re looking for doesn&apos;t exist.</p>
      <p><Link href="/">← Back to home</Link></p>
    </section>
  );
}
