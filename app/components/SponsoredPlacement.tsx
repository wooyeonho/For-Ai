"use client";

import Image from "next/image";

interface SponsoredPlacementProps {
  businessName: string;
  placementType: "sidebar" | "inline" | "banner" | "featured";
  title: string;
  description?: string;
  url?: string;
  imageUrl?: string;
}

/**
 * Renders a sponsored placement with mandatory "Sponsored" label.
 * All sponsored content MUST be clearly labeled per For-Ai monetization principles.
 */
export function SponsoredPlacement({
  businessName,
  placementType,
  title,
  description,
  url,
  imageUrl,
}: SponsoredPlacementProps) {
  const wrapperStyle: React.CSSProperties = {
    border: "1px solid var(--line)",
    borderRadius: 8,
    padding: "12px 16px",
    position: "relative",
    background: "var(--soft)",
  };

  if (placementType === "banner") {
    wrapperStyle.borderLeft = "3px solid var(--accent)";
  }

  return (
    <aside
      style={wrapperStyle}
      aria-label={`Sponsored content from ${businessName}`}
      data-placement-type={placementType}
    >
      <span
        style={{
          position: "absolute",
          top: 6,
          right: 10,
          fontSize: "0.7rem",
          fontWeight: 600,
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          background: "var(--line)",
          padding: "2px 6px",
          borderRadius: 3,
        }}
      >
        Sponsored
      </span>

      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        {imageUrl && (
          <Image
            src={imageUrl}
            alt=""
            width={48}
            height={48}
            style={{ borderRadius: 6, objectFit: "cover" }}
          />
        )}
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontWeight: 600, fontSize: "0.9rem" }}>
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer sponsored"
                style={{ color: "inherit", textDecoration: "none" }}
              >
                {title}
              </a>
            ) : (
              title
            )}
          </p>
          {description && (
            <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
              {description}
            </p>
          )}
          <p style={{ margin: "4px 0 0", fontSize: "0.75rem", color: "var(--muted)" }}>
            by {businessName}
          </p>
        </div>
      </div>
    </aside>
  );
}
