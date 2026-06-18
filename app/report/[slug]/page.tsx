export default async function ReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <section className="registry-panel">
      <p className="eyebrow">Correction report</p>
      <h1>{slug}</h1>
      <p>신고 기능은 Goal 5에서 구현됩니다.</p>
    </section>
  );
}
