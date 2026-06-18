export default async function DiagnosticsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <section className="registry-panel">
      <p className="eyebrow">AI-readiness diagnostics</p>
      <h1>{slug}</h1>
      <p>AI-readiness 진단은 Goal 7에서 구현됩니다.</p>
    </section>
  );
}
