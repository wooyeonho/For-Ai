import Link from "next/link";

export default function NotFound() {
  return (
    <section className="registry-panel">
      <p className="eyebrow">Not found</p>
      <h1>Document not found</h1>
      <p>The requested registry document or page does not exist.</p>
      <p><Link href="/">Return to the registry home</Link></p>
    </section>
  );
}
