"use client";

import { useState } from "react";

type ApiResult = { analyzed_sentence_count: number; truncated: boolean; results: { sentence: string; match: null | { score: number; presentation: { label: string; citeable: boolean } } }[] };

export default function CheckClient({ locale }: { locale: string }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ApiResult | null>(null);
  const [status, setStatus] = useState<string>("");

  async function submit() {
    setStatus("Checking…");
    setResult(null);
    const response = await fetch("/api/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, locale }) });
    const json = await response.json();
    if (!response.ok) {
      setStatus(json.error ?? "Request failed");
      return;
    }
    setResult(json);
    setStatus("Complete");
  }

  return (
    <section className="registry-panel" aria-labelledby="check-form">
      <h2 id="check-form">Check text against citation-ready claims</h2>
      <p style={{ color: "var(--muted)", lineHeight: 1.7 }}>Input text is processed for this request only. Do not paste sensitive personal data.</p>
      <textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={5000} rows={8} style={{ width: "100%" }} aria-describedby="check-privacy" />
      <p id="check-privacy" style={{ color: "var(--muted)", fontSize: "0.9rem" }}>Raw text is not stored by this feature.</p>
      <button type="button" onClick={submit} disabled={!text.trim()} style={{ marginTop: 12 }}>Check citations</button>
      <p role="status" aria-live="polite">{status}</p>
      {result ? (
        <div aria-label="Check results">
          <p>{result.analyzed_sentence_count} sentence(s) analyzed{result.truncated ? "; extra sentences were truncated" : ""}.</p>
          <ul>
            {result.results.map((item, index) => (
              <li key={`${item.sentence}-${index}`} style={{ marginBlock: 12 }}>
                <strong>{item.match ? item.match.presentation.label : "Needs verification"}</strong>
                <div style={{ overflowWrap: "anywhere" }}>{item.sentence}</div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
