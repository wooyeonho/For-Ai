"use client";
import { useState } from "react";

export function CopyCitationButton({
  citationText,
  labelCopy,
  labelCopied,
  warningText,
}: {
  citationText: string;
  labelCopy: string;
  labelCopied: string;
  warningText?: string;
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
        style={{
          padding: "4px 10px",
          fontSize: "0.8rem",
          fontWeight: 600,
          border: "1px solid var(--line)",
          borderRadius: 5,
          background: copied ? "var(--success-bg)" : "var(--soft)",
          color: copied ? "var(--success)" : "var(--text)",
          cursor: canCopy ? "pointer" : "not-allowed",
          transition: "background 0.15s, color 0.15s",
          minHeight: 32,
          opacity: canCopy ? 1 : 0.6,
        }}
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
