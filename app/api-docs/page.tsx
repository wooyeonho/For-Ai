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

      {/* API Tiers & Pricing */}
      <section className="registry-panel" aria-labelledby="pricing" id="pricing">
        <h2 id="rate-limits">API Tiers & Rate Limits</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--line)", textAlign: "left" }}>
              <th style={{ padding: "8px 12px" }}>Tier</th>
              <th style={{ padding: "8px 12px" }}>Rate Limit</th>
              <th style={{ padding: "8px 12px" }}>Daily Limit</th>
              <th style={{ padding: "8px 12px" }}>Price</th>
              <th style={{ padding: "8px 12px" }}>Auth</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: "1px solid var(--line)" }}>
              <td style={{ padding: "8px 12px", fontWeight: 600 }}>Free</td>
              <td style={{ padding: "8px 12px" }}>60 req / min</td>
              <td style={{ padding: "8px 12px" }}>1,000 / day</td>
              <td style={{ padding: "8px 12px" }}>$0</td>
              <td style={{ padding: "8px 12px" }}><code>X-API-Key: forai_free_...</code></td>
            </tr>
            <tr style={{ borderBottom: "1px solid var(--line)" }}>
              <td style={{ padding: "8px 12px", fontWeight: 600 }}>Pro</td>
              <td style={{ padding: "8px 12px" }}>300 req / min</td>
              <td style={{ padding: "8px 12px" }}>50,000 / day</td>
              <td style={{ padding: "8px 12px" }}>$49/mo</td>
              <td style={{ padding: "8px 12px" }}><code>X-API-Key: forai_pro_...</code></td>
            </tr>
            <tr>
              <td style={{ padding: "8px 12px", fontWeight: 600 }}>Enterprise</td>
              <td style={{ padding: "8px 12px" }}>1,000 req / min</td>
              <td style={{ padding: "8px 12px" }}>500,000 / day</td>
              <td style={{ padding: "8px 12px" }}>Custom</td>
              <td style={{ padding: "8px 12px" }}><code>X-API-Key: forai_ent_...</code></td>
            </tr>
          </tbody>
        </table>
        <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 12 }}>
          Rate limit headers: <code>X-RateLimit-Limit</code>, <code>X-RateLimit-Remaining</code>, <code>X-RateLimit-Reset</code>, <code>X-API-Tier</code>.
          On 429, check <code>Retry-After</code> (seconds).
        </p>
        <div style={{ marginTop: 16, padding: "12px 16px", background: "var(--soft)", borderRadius: 6, fontSize: "0.85rem" }}>
          <strong>Pro features:</strong> Priority claim corrections, webhook callbacks, bulk export, advanced search filters, priority support.
          <br />
          <strong>Enterprise features:</strong> All Pro features + custom SLA, data licensing, private namespaces, dedicated account manager, SSO.
        </div>
      </section>

      {/* Endpoints */}
      <section className="registry-panel" aria-labelledby="endpoints">
        <h2 id="endpoints">Endpoints</h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* GET /api/documents/:slug */}
          <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 16 }}>
            <p style={{ margin: 0, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 700 }}>
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
            <p style={{ margin: 0, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 700 }}>
              GET /raw/<span style={{ color: "var(--accent)" }}>{"{slug}"}</span>.md
            </p>
            <p style={{ margin: "8px 0", fontSize: "0.9rem", color: "var(--muted)" }}>
              Markdown representation. Ideal for LLM context injection and RAG pipelines.
              Includes citation guidance block and per-claim source list.
            </p>
          </div>

          {/* GET /api/documents/:slug/citation */}
          <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 16 }}>
            <p style={{ margin: 0, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 700 }}>
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

      {/* Business API */}
      <section className="registry-panel" aria-labelledby="business-api">
        <h2 id="business-api">Business API</h2>
        <p style={{ fontSize: "0.9rem", color: "var(--muted)", lineHeight: 1.7 }}>
          Verified businesses can manage their fact profile, submit priority corrections,
          and monitor AI reputation through the Business API.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 16 }}>
            <p style={{ margin: 0, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 700 }}>
              POST /api/business/profile
            </p>
            <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
              Claim a business entity. Requires verification (email, domain, or document).
            </p>
          </div>
          <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 16 }}>
            <p style={{ margin: 0, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 700 }}>
              POST /api/business/corrections
            </p>
            <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
              Submit a fact correction for your entity. Priority/urgent requires Pro+ tier.
            </p>
          </div>
          <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 16 }}>
            <p style={{ margin: 0, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 700 }}>
              GET /api/business/alerts?profile_id=...
            </p>
            <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
              View reputation alerts (incorrect citations, outdated facts, new hallucinations).
            </p>
          </div>
          <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 16 }}>
            <p style={{ margin: 0, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 700 }}>
              POST /api/keys
            </p>
            <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
              Create an API key (admin). Keys are prefixed by tier: <code>forai_free_</code>, <code>forai_pro_</code>, <code>forai_ent_</code>.
            </p>
          </div>
        </div>
      </section>

      {/* Pro & Enterprise */}
      <section
        className="registry-panel"
        aria-labelledby="pro"
        style={{ borderLeft: "3px solid var(--accent)" }}
      >
        <h2 id="pro">Pro & Enterprise</h2>
        <p style={{ fontSize: "0.9rem", lineHeight: 1.7 }}>
          Need higher rate limits, priority corrections, or reputation monitoring?
          Contact <strong>wooyeanho@gmail.com</strong> for Pro and Enterprise plans.
        </p>
        <ul style={{ fontSize: "0.9rem", color: "var(--muted)", lineHeight: 2 }}>
          <li><strong>Pro ($49/mo):</strong> 300 rpm, priority corrections, webhooks, bulk export</li>
          <li><strong>Enterprise (custom):</strong> 1000 rpm, data licensing, SLA, private namespaces, SSO</li>
          <li>All tiers include verified business profile and reputation alerts</li>
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
