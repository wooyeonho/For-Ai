"use client";

import { useState } from "react";

interface AgentExportButtonProps {
  payload: unknown;
  label?: string;
}

export default function AgentExportButton({ payload, label = "Export for agents" }: AgentExportButtonProps) {
  const [isRevealed, setIsRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const json = JSON.stringify(payload, null, 2);

  async function handleClick() {
    setIsRevealed(true);
    setCopied(false);

    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="agent-export">
      <button type="button" className="btn btn-secondary agent-export-button" onClick={handleClick}>
        {copied ? "Copied JSON" : label}
      </button>
      {isRevealed ? (
        <pre className="agent-export-json" aria-live="polite">
          <code>{json}</code>
        </pre>
      ) : null}
    </div>
  );
}
