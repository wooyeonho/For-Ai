"use client";
import { useState } from "react";

export function CopyCitationButton({
  citationText,
  labelCopy,
  labelCopied,
  warningText,
  slug,
}: {
  citationText: string;
  labelCopy: string;
  labelCopied: string;
  warningText?: string;
  slug?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const canCopy = citationText.trim().length > 0;

  async function handleCopy() {
    if (!canCopy) return;
    try {
      await navigator.clipboard.writeText(citationText);
      setCopied(true);
      setError(false);
      if (slug) {
        fetch(`/api/documents/${slug}/copy-citation`, { method: "POST" }).catch(() => {});
      }
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(true);
    }
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
      <button
        onClick={handleCopy}
        disabled={!canCopy}
        title={warningText ?? citationText}
        className={copied ? "btn btn-secondary btn-compact" : "btn btn-ghost btn-compact"}
        aria-label={copied ? labelCopied : labelCopy}
      >
        {copied ? labelCopied : labelCopy}
      </button>
      {warningText && (
        <span className="meta-label" role="note" style={{ maxWidth: 320 }}>
          {warningText}
        </span>
      )}
      {error && (
        <span className="meta-label" role="alert" style={{ maxWidth: 320 }}>
          Clipboard unavailable. Select and copy the citation text manually.
        </span>
      )}
    </span>
  );
}
