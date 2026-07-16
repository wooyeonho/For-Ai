import type { Metadata } from "next";
import { cache } from "react";
import { loadBadgeView } from "../../../lib/citation-badge";
import { presentationForKey } from "../../../lib/citation-presentation";

export const dynamic = "force-dynamic";
const getBadgeView = cache(loadBadgeView);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const badge = await getBadgeView(slug);
  return {
    title: `For-Ai fact status: ${presentationForKey(badge.statusKey).machineLabel}`,
    robots: { index: false, follow: false },
  };
}

export default async function EmbedBadgePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const badge = await getBadgeView(slug);
  const presentation = presentationForKey(badge.statusKey);
  const statusColor = badge.statusKey === "verified"
    ? "#166534"
    : badge.statusKey === "disputed"
      ? "#991b1b"
      : badge.statusKey === "needs_review"
        ? "#92400e"
        : "#475569";

  return (
    <div data-embed-root style={{ margin: 0, padding: 8, minHeight: 124, boxSizing: "border-box", fontFamily: "system-ui, sans-serif", color: "#172033", background: "#fff" }}>
      <article style={{ minHeight: 106, boxSizing: "border-box", border: "1px solid #d8dee9", borderRadius: 10, padding: 10 }} aria-label="For-Ai fact status">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <strong style={{ fontSize: 12 }}>For-Ai fact status</strong>
          <span style={{ fontSize: 12, fontWeight: 800, color: statusColor }}>{presentation.machineLabel}</span>
        </div>
        <h1 style={{ margin: "6px 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 15 }}>{badge.title}</h1>
        {badge.representativeClaims.length > 0 ? (
          <ul style={{ margin: "0 0 5px", paddingLeft: 17, fontSize: 11, lineHeight: 1.35 }}>
            {badge.representativeClaims.map((claim) => (
              <li key={claim.claimText} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {claim.claimText}{claim.value ? `: ${claim.value}` : " — value not citation-ready"}
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ margin: "0 0 5px", fontSize: 11, color: "#64748b" }}>
            {badge.state === "error" ? "Try again later." : "Unknown facts remain Needs verification."}
          </p>
        )}
        {badge.documentUrl ? (
          <a href={badge.documentUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, fontWeight: 700, color: "#4f46e5" }}>
            View registry record
          </a>
        ) : null}
      </article>
    </div>
  );
}
