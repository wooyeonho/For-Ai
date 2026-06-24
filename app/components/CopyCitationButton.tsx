"use client";
import { useState } from "react";

export function CopyCitationButton({
  citationText,
  labelCopy,
  labelCopied,
}: {
  citationText: string;
  labelCopy: string;
  labelCopied: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(citationText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (non-HTTPS, blocked by browser policy)
    }
  }

  return (
    <button
      onClick={handleCopy}
      style={{
        padding: "4px 10px",
        fontSize: "0.8rem",
        fontWeight: 600,
        border: "1px solid var(--line)",
        borderRadius: 5,
        background: copied ? "var(--success-bg)" : "var(--soft)",
        color: copied ? "var(--success)" : "var(--text)",
        cursor: "pointer",
        transition: "background 0.15s, color 0.15s",
        minHeight: 32,
      }}
      aria-label={copied ? labelCopied : labelCopy}
    >
      {copied ? labelCopied : labelCopy}
    </button>
  );
}
