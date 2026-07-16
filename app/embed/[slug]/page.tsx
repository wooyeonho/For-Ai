import { notFound } from "next/navigation";
import { buildBadgeSnippet, buildCitationPresentation } from "../../../lib/citation-presentation";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const presentation = await buildCitationPresentation(slug);
  return { title: presentation ? `For-Ai citation badge: ${presentation.document.title}` : "For-Ai citation badge" };
}

export default async function EmbedBadgePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const presentation = await buildCitationPresentation(slug);
  if (!presentation) notFound();

  const statusClass = presentation.canCiteDocument ? "ready" : "review";
  return (
    <main style={{ margin: 0, padding: 12, fontFamily: "system-ui, sans-serif", color: "#172033", background: "#fff" }}>
      <article style={{ border: "1px solid #d8dee9", borderRadius: 14, padding: 14, boxShadow: "0 8px 24px rgba(15,23,42,.08)" }} aria-label="For-Ai citation badge">
        <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "#4f46e5" }}>For-Ai citation badge</p>
        <h1 style={{ margin: "0 0 10px", fontSize: 18, lineHeight: 1.25 }}>{presentation.document.title}</h1>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#475569" }}>{presentation.entity.canonical_name} · {presentation.document.slug}</p>
        <dl style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, margin: 0, fontSize: 12 }}>
          <div><dt style={{ color: "#64748b" }}>Citation status</dt><dd style={{ margin: 0, fontWeight: 800, color: statusClass === "ready" ? "#166534" : "#92400e" }}>{presentation.docStatus.label}</dd></div>
          <div><dt style={{ color: "#64748b" }}>Claims</dt><dd style={{ margin: 0, fontWeight: 800 }}>{presentation.docStatus.verifiedClaims}/{presentation.docStatus.totalClaims} ready</dd></div>
          <div><dt style={{ color: "#64748b" }}>Freshness</dt><dd style={{ margin: 0, fontWeight: 800 }}>{presentation.docStatus.freshness}</dd></div>
          <div><dt style={{ color: "#64748b" }}>Checked</dt><dd style={{ margin: 0, fontWeight: 800 }}>{presentation.checkedDate ?? "Needs verification"}</dd></div>
        </dl>
        <p style={{ margin: "12px 0 0", fontSize: 12, color: "#64748b" }}>Only cite claim-level values when can_cite is true. Unknown facts remain Needs verification.</p>
        <a href={presentation.canonicalUrl} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 12, fontSize: 13, fontWeight: 800, color: "#4f46e5" }}>Open source record</a>
      </article>
      <details style={{ marginTop: 10, fontSize: 11, color: "#475569" }}>
        <summary>Embed snippet</summary>
        <code style={{ display: "block", whiteSpace: "pre-wrap", marginTop: 6 }}>{buildBadgeSnippet(presentation.document.slug)}</code>
      </details>
    </main>
  );
}
