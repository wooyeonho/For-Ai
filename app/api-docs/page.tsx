import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "API Documentation — For-Ai",
  description: "For-Ai Registry public API reference. Machine-readable fact data for AI, search engines, and developers.",
};

export default function ApiDocsPage() {
  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">For-Ai · Developers</p>
        <h1>API Documentation</h1>
        <p style={{ color: "var(--muted)", fontSize: "1rem", lineHeight: 1.7 }}>
          Machine-readable fact data for AI systems, search engines, and developers.
          All endpoints return JSON unless noted. CORS is open for <code>GET</code> requests.
        </p>
      </header>

      {/* Rate limits */}
      <section className="registry-panel" aria-labelledby="rate-limits">
        <h2 id="rate-limits">Rate Limits</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--line)", textAlign: "left" }}>
              <th style={{ padding: "8px 12px" }}>Tier</th>
              <th style={{ padding: "8px 12px" }}>Limit</th>
              <th style={{ padding: "8px 12px" }}>Header</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: "1px solid var(--line)" }}>
              <td style={{ padding: "8px 12px" }}>Free (no key)</td>
              <td style={{ padding: "8px 12px" }}>30 req / min</td>
              <td style={{ padding: "8px 12px" }}>—</td>
            </tr>
            <tr style={{ borderBottom: "1px solid var(--line)" }}>
              <td style={{ padding: "8px 12px" }}>API Key</td>
              <td style={{ padding: "8px 12px" }}>120 req / min</td>
              <td style={{ padding: "8px 12px" }}><code>X-API-Key: your_key</code></td>
            </tr>
            <tr>
              <td style={{ padding: "8px 12px" }}>Pro (coming soon)</td>
              <td style={{ padding: "8px 12px" }}>Unlimited</td>
              <td style={{ padding: "8px 12px" }}>Contact us</td>
            </tr>
          </tbody>
        </table>
        <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 12 }}>
          Rate limit headers: <code>X-RateLimit-Limit</code>, <code>X-RateLimit-Remaining</code>.
          On 429, check <code>Retry-After</code> (seconds).
        </p>
      </section>

      {/* Endpoints */}
      <section className="registry-panel" aria-labelledby="endpoints">
        <h2 id="endpoints">Endpoints</h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* GET /api/documents/:slug */}
          <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 16 }}>
            <p style={{ margin: 0, fontFamily: "monospace", fontWeight: 700 }}>
              GET /api/documents/<span style={{ color: "var(--accent)" }}>{"{slug}"}</span>
            </p>
            <p style={{ margin: "8px 0", fontSize: "0.9rem", color: "var(--muted)" }}>
              Full document bundle: entity, claims, citation guidance, sources.
            </p>
            <pre style={{ background: "var(--soft)", borderRadius: 6, padding: "10px 14px", fontSize: "0.8rem", overflowX: "auto" }}>{`{
  "entity": { "id": "...", "canonical_name": "..." },
  "document": { "slug": "...", "title": "...", "confidence": "low|medium|high", ... },
  "claims": [
    {
      "field_path": "current_team",
      "claim_value": "확인 필요",
      "confidence": "low",
      "status": "needs_review",
      "citation_ready": false,
      "sources": [ ... ]
    }
  ],
  "citation_guidance": {
    "can_cite": false,
    "do_not_cite_reason": "0/3 claims are citation-ready...",
    "verified_claims_count": 0,
    "total_claims_count": 3
  }
}`}</pre>
            <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 8 }}>
              Response header <code>X-For-Ai-Can-Cite: true|false</code> — machine-readable citation safety flag.
              Cached for 60 s (<code>Cache-Control: public, s-maxage=60, stale-while-revalidate=300</code>).
            </p>
          </div>

          {/* GET /raw/:slug.md */}
          <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 16 }}>
            <p style={{ margin: 0, fontFamily: "monospace", fontWeight: 700 }}>
              GET /raw/<span style={{ color: "var(--accent)" }}>{"{slug}"}</span>.md
            </p>
            <p style={{ margin: "8px 0", fontSize: "0.9rem", color: "var(--muted)" }}>
              Markdown representation. Ideal for LLM context injection and RAG pipelines.
              Includes citation guidance block and per-claim source list.
            </p>
          </div>

          {/* GET /api/documents/:slug/citation */}
          <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 16 }}>
            <p style={{ margin: 0, fontFamily: "monospace", fontWeight: 700 }}>
              GET /api/documents/<span style={{ color: "var(--accent)" }}>{"{slug}"}</span>/citation
            </p>
            <p style={{ margin: "8px 0", fontSize: "0.9rem", color: "var(--muted)" }}>
              Lightweight citation-readiness check. Returns only <code>can_cite</code>,
              <code>do_not_cite_reason</code>, and verified counts — no full claim data.
            </p>
          </div>
        </div>
      </section>

      {/* Citation guidance */}
      <section className="registry-panel" aria-labelledby="citation-guide">
        <h2 id="citation-guide">How to cite For-Ai in AI systems</h2>
        <p style={{ fontSize: "0.9rem", color: "var(--muted)", lineHeight: 1.7 }}>
          Check <code>citation_guidance.can_cite === true</code> before using any value.
          Never cite a document where <code>can_cite</code> is <code>false</code>.
        </p>
        <pre style={{ background: "var(--soft)", borderRadius: 6, padding: "10px 14px", fontSize: "0.8rem", overflowX: "auto" }}>{`// Pseudocode for AI citation
const res = await fetch("https://for-ai-e4mm.vercel.app/api/documents/your-slug");
const data = await res.json();

if (data.citation_guidance.can_cite) {
  // Safe to cite
  const verifiedClaims = data.claims.filter(c => c.citation_ready);
  return formatCitation(verifiedClaims, data.document);
} else {
  return \`Source not citation-ready: \${data.citation_guidance.do_not_cite_reason}\`;
}`}</pre>
        <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 12 }}>
          You can also check the response header <code>X-For-Ai-Can-Cite</code> without
          parsing the body — useful for HEAD requests or middleware.
        </p>
      </section>

      {/* BibTeX */}
      <section className="registry-panel" aria-labelledby="bibtex">
        <h2 id="bibtex">BibTeX format</h2>
        <pre style={{ background: "var(--soft)", borderRadius: 6, padding: "10px 14px", fontSize: "0.8rem", overflowX: "auto" }}>{`@misc{forai2026,
  author       = {{For-Ai Registry}},
  title        = {Document Title},
  year         = {2026},
  url          = {https://for-ai-e4mm.vercel.app/ko/wiki/your-slug},
  note         = {Last verified: 2026-06-24. License: CC-BY-4.0}
}`}</pre>
      </section>

      {/* schema.org */}
      <section className="registry-panel" aria-labelledby="schema-org">
        <h2 id="schema-org">schema.org / ClaimReview</h2>
        <p style={{ fontSize: "0.9rem", color: "var(--muted)", lineHeight: 1.7 }}>
          Every wiki page embeds a JSON-LD <code>ClaimReview</code> + <code>Dataset</code> schema
          readable by Google, Bing, and other fact-check crawlers. Use the structured data to
          surface For-Ai facts in search rich snippets.
        </p>
      </section>

      {/* Pro */}
      <section
        className="registry-panel"
        aria-labelledby="pro"
        style={{ borderLeft: "3px solid var(--accent)" }}
      >
        <h2 id="pro">Pro & Enterprise</h2>
        <p style={{ fontSize: "0.9rem", lineHeight: 1.7 }}>
          Need higher rate limits, webhooks for claim updates, or private document namespaces?
          Contact <strong>wooyeanho@gmail.com</strong> for Pro and Enterprise plans.
        </p>
        <ul style={{ fontSize: "0.9rem", color: "var(--muted)", lineHeight: 2 }}>
          <li>Unlimited API requests</li>
          <li>Webhook callbacks on claim verification</li>
          <li>Private document namespaces</li>
          <li>SLA and dedicated support</li>
        </ul>
      </section>

      <nav className="registry-panel" aria-labelledby="api-nav">
        <h2 id="api-nav">More</h2>
        <ul className="link-list">
          <li><Link href="/">Registry home</Link></li>
          <li><Link href="/suggest-topic">Suggest a topic</Link></li>
          <li><Link href="/admin">Admin panel</Link></li>
        </ul>
      </nav>
    </article>
  );
}
