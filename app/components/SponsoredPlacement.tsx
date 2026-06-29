"use client";

import Image from "next/image";
import type { CSSProperties } from "react";

interface SponsoredPlacementProps {
  businessName: string;
  placementType: "sidebar" | "inline" | "banner" | "featured";
  title: string;
  description?: string;
  url?: string;
  imageUrl?: string;
}

const SPONSORED_DISCLOSURE = "Sponsored — not a verified factual claim";

/**
 * Renders a sponsored placement with a mandatory disclosure label.
 * Sponsored content is promotional and visually separated from factual claims.
 */
export function SponsoredPlacement({
  businessName,
  placementType,
  title,
  description,
  url,
  imageUrl,
}: SponsoredPlacementProps) {
  const wrapperStyle: CSSProperties = {
    border: "1px dashed var(--accent)",
    borderRadius: 10,
    padding: "16px",
    position: "relative",
    background: "color-mix(in srgb, var(--soft) 82%, transparent)",
    marginBlock: 16,
    boxShadow: "none",
  };

  if (placementType === "banner") {
    wrapperStyle.borderLeft = "6px solid var(--accent)";
  }

  return (
    <aside
      style={wrapperStyle}
      aria-label={`${SPONSORED_DISCLOSURE} from ${businessName}`}
      data-content-kind="sponsored-placement"
      data-claim-status="not-a-factual-claim"
      data-placement-type={placementType}
    >
      <div
        style={{
          display: "inline-flex",
          gap: 6,
          alignItems: "center",
          fontSize: "0.72rem",
          fontWeight: 700,
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          background: "var(--line)",
          padding: "3px 8px",
          borderRadius: 999,
          marginBottom: 10,
        }}
      >
        {SPONSORED_DISCLOSURE}
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        {imageUrl && <Image src={imageUrl} alt="" width={48} height={48} style={{ borderRadius: 6, objectFit: "cover" }} />}
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontWeight: 650, fontSize: "0.95rem" }}>
            {url ? (
              <a href={url} target="_blank" rel="noopener noreferrer sponsored" style={{ color: "inherit" }}>
                {title}
              </a>
            ) : title}
          </p>
          {description && <p style={{ margin: "6px 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>{description}</p>}
          <p style={{ margin: "8px 0 0", fontSize: "0.75rem", color: "var(--muted)" }}>
            Promotional placement by {businessName}. This block is separate from verified claim data.
          </p>
        </div>
      </div>
    </aside>
  );
}
