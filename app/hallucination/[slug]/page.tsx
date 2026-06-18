export default async function HallucinationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <section className="registry-panel">
      <p className="eyebrow">AI hallucination report</p>
      <h1>{slug}</h1>
      <p>AI 오답 신고 기능은 Goal 5에서 구현됩니다.</p>
    </section>
  );
}
