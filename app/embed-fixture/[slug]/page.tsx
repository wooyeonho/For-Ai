import { buildBadgeSnippet } from "../../../lib/citation-presentation";

export default async function ExternalIframeFixturePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <main style={{ padding: 24 }}>
      <h1>External iframe fixture</h1>
      <p>This page simulates a third-party site embedding the For-Ai badge.</p>
      <div dangerouslySetInnerHTML={{ __html: buildBadgeSnippet(slug) }} />
    </main>
  );
}
