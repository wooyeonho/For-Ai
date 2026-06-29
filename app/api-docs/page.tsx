import Link from "next/link";
import type { Metadata } from "next";
import { siteUrl } from "../../lib/urls";

export const metadata: Metadata = {
  title: "API Documentation — For-Ai",
  description: "Use-case oriented For-Ai API docs for citation-ready facts, entity facts, verified-only queries, source-backed citations, and verification webhooks.",
};

const panel = { fontSize: "0.9rem", color: "var(--muted)", lineHeight: 1.7 };
const codeBlock = { background: "var(--soft)", borderRadius: 6, padding: "10px 14px", fontSize: "0.8rem", overflowX: "auto" as const };
const endpointCard = { borderLeft: "3px solid var(--accent)", paddingLeft: 16 };

export default function ApiDocsPage() {
  const BASE = siteUrl("").replace(/\/+$/, "");

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">For-Ai · Developers</p>
        <h1>API Documentation</h1>
        <p style={{ color: "var(--muted)", fontSize: "1rem", lineHeight: 1.7 }}>
          Build AI answers from claim-level facts that include confidence, verification status, and traceable sources.
          Use For-Ai as a citation registry: cite only verified claims, preserve source URLs, and treat unknown facts as
          <strong> Needs verification</strong> / <strong>확인 필요</strong>.
        </p>
      </header>

      <section className="registry-panel" aria-labelledby="use-cases">
        <h2 id="use-cases">Use-case first quickstart</h2>
        <ol style={{ ...panel, paddingLeft: 20 }}>
          <li><strong>Known slug:</strong> call <code>GET /api/cite/{"{slug}"}</code> for citation-ready facts or <code>GET /api/documents/{"{slug}"}</code> for the full claim bundle.</li>
          <li><strong>Known entity:</strong> call <code>GET /api/entities/{"{entity_id}"}</code> to list every document and citable fact group for one entity.</li>
          <li><strong>Verified-only discovery:</strong> call <code>GET /api/index?verification=verified&amp;cite=true</code> before selecting documents for AI answers.</li>
          <li><strong>Source-backed citation:</strong> cite only claims with <code>citation_ready=true</code> and include each claim&apos;s source URL and verification timestamp.</li>
          <li><strong>Freshness sync:</strong> register webhooks and process <code>claim.verified</code>, <code>claim.updated</code>, and <code>claim.disputed</code> verification events.</li>
        </ol>
      </section>

      <section className="registry-panel" aria-labelledby="auth-rate-limits">
        <h2 id="auth-rate-limits">API key, rate limits, and headers</h2>
        <p style={panel}>
          Send your key as <code>X-API-Key</code>. Public read endpoints may answer without a key in development, but production integrations should always send one so rate limits and billing are attributed correctly.
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--line)", textAlign: "left" }}>
              <th style={{ padding: "8px 12px" }}>Tier</th><th style={{ padding: "8px 12px" }}>Rate limit</th><th style={{ padding: "8px 12px" }}>Daily limit</th><th style={{ padding: "8px 12px" }}>Key prefix</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Free", "60 req/min", "1,000/day", "forai_free_..."],
              ["Pro", "300 req/min", "50,000/day", "forai_pro_..."],
              ["Enterprise", "1,000 req/min", "500,000/day", "forai_ent_..."],
            ].map(([tier, rpm, day, key]) => (
              <tr key={tier} style={{ borderBottom: "1px solid var(--line)" }}>
                <td style={{ padding: "8px 12px", fontWeight: 600 }}>{tier}</td><td style={{ padding: "8px 12px" }}>{rpm}</td><td style={{ padding: "8px 12px" }}>{day}</td><td style={{ padding: "8px 12px" }}><code>{key}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ ...panel, marginTop: 12 }}>
          Responses include <code>X-RateLimit-Limit</code>, <code>X-RateLimit-Remaining</code>, <code>X-RateLimit-Reset</code>, and <code>X-API-Tier</code>. A <code>429</code> response also includes <code>Retry-After</code>.
        </p>
      </section>

      <section className="registry-panel" aria-labelledby="endpoints">
        <h2 id="endpoints">Core endpoints by use case</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={endpointCard}>
            <p style={{ margin: 0, fontFamily: "monospace", fontWeight: 700 }}>GET /api/cite/<span style={{ color: "var(--accent)" }}>{"{slug}"}</span></p>
            <p style={panel}>Best for AI answers. Returns a compact source-backed citation bundle for a specific slug. Filter to <code>citation_ready=true</code> before using facts.</p>
          </div>
          <div style={endpointCard}>
            <p style={{ margin: 0, fontFamily: "monospace", fontWeight: 700 }}>GET /api/documents/<span style={{ color: "var(--accent)" }}>{"{slug}"}</span></p>
            <p style={panel}>Full document bundle: entity metadata, document status, all claims, claim sources, and <code>citation_guidance</code>. Header <code>X-For-Ai-Can-Cite</code> is a fast machine-readable safety flag.</p>
          </div>
          <div style={endpointCard}>
            <p style={{ margin: 0, fontFamily: "monospace", fontWeight: 700 }}>GET /api/entities/<span style={{ color: "var(--accent)" }}>{"{entity_id}"}</span></p>
            <p style={panel}>Entity-level facts. Use when you know an entity ID and need every For-Ai document attached to it with citable counts and canonical URLs.</p>
          </div>
          <div style={endpointCard}>
            <p style={{ margin: 0, fontFamily: "monospace", fontWeight: 700 }}>GET /api/index?verification=verified&amp;cite=true</p>
            <p style={panel}>Verified-only discovery. Add <code>q</code>, <code>type</code>, <code>country</code>, <code>lang</code>, <code>limit</code>, and <code>offset</code> to search safely before citation.</p>
          </div>
          <div style={endpointCard}>
            <p style={{ margin: 0, fontFamily: "monospace", fontWeight: 700 }}>GET /api/documents/<span style={{ color: "var(--accent)" }}>{"{slug}"}</span>/cite</p>
            <p style={panel}>Lightweight citation-readiness check for a document when you do not need all claim data.</p>
          </div>
        </div>
      </section>

      <section className="registry-panel" aria-labelledby="response-examples">
        <h2 id="response-examples">Response example: verified vs. needs verification</h2>
        <p style={panel}>A verified claim can be cited as a fact. A needs-verification claim must be displayed as unknown and must not be cited as fact.</p>
        <pre style={codeBlock}>{`{
  "entity": { "id": "kr-transport-seoul-metro-001", "canonical_name": "Seoul Metro" },
  "document": { "slug": "seoul-metro-base-fare", "title": "Seoul Metro base fare", "confidence": "medium" },
  "claims": [
    {
      "field_path": "fare.adult.base",
      "claim_value": "1400 KRW",
      "confidence": "high",
      "status": "verified",
      "citation_ready": true,
      "last_verified_at": "2026-06-24T09:00:00Z",
      "sources": [{ "title": "Official fare page", "url": "https://example.gov/fares", "source_type": "official" }]
    },
    {
      "field_path": "fare.future_change_date",
      "claim_value": "Needs verification",
      "confidence": "low",
      "status": "needs_review",
      "citation_ready": false,
      "last_verified_at": null,
      "sources": []
    }
  ],
  "citation_guidance": {
    "can_cite": false,
    "do_not_cite_reason": "Only cite individual claims where citation_ready=true; unresolved claims remain Needs verification.",
    "verified_claims_count": 1,
    "total_claims_count": 2
  }
}`}</pre>
      </section>

      <section className="registry-panel" aria-labelledby="source-backed-citation">
        <h2 id="source-backed-citation">Source-backed citation generation</h2>
        <pre style={codeBlock}>{`const res = await fetch("${BASE}/api/cite/seoul-metro-base-fare", {
  headers: { "X-API-Key": "forai_free_your_key" }
});
const data = await res.json();
const facts = data.claims.filter((claim) => claim.citation_ready);

return facts.map((claim) => ({
  text: claim.claim_text,
  value: claim.claim_value,
  source_url: claim.sources[0]?.url,
  last_verified_at: claim.last_verified_at
}));`}</pre>
        <p style={panel}>Never convert <code>low</code> confidence, <code>needs_review</code>, or <code>Needs verification</code> values into factual statements.</p>
      </section>

      <section className="registry-panel" aria-labelledby="errors">
        <h2 id="errors">Error response format</h2>
        <pre style={codeBlock}>{`{
  "error": "Document not found",
  "code": "not_found",
  "message": "No document exists for slug: unknown-slug",
  "request_id": "req_01J...",
  "details": { "slug": "unknown-slug" }
}`}</pre>
        <p style={panel}>Common statuses: <code>400</code> invalid parameters, <code>401</code> invalid API key, <code>403</code> tier not allowed, <code>404</code> not found, <code>429</code> rate limited, <code>500</code> server error.</p>
      </section>

      <section className="registry-panel" aria-labelledby="sdk-examples">
        <h2 id="sdk-examples">SDK examples</h2>
        <p style={panel}>Runnable examples live in <code>examples/python-sdk.py</code>, <code>examples/typescript-sdk.ts</code>, and <code>examples/curl-examples.sh</code>.</p>
        <pre style={codeBlock}>{`curl -H "X-API-Key: forai_free_..." "${BASE}/api/cite/seoul-metro-base-fare"
curl -H "X-API-Key: forai_free_..." "${BASE}/api/documents/seoul-metro-base-fare"
curl -H "X-API-Key: forai_free_..." "${BASE}/api/index?verification=verified&cite=true"`}</pre>
      </section>

      <section className="registry-panel" aria-labelledby="webhooks">
        <h2 id="webhooks">Receive verification events by webhook</h2>
        <p style={panel}>Pro and Enterprise integrations can subscribe to verification events so AI caches update when human reviewers approve, dispute, or update claims.</p>
        <pre style={codeBlock}>{`POST /api/webhooks
{
  "url": "https://your-server.example/forai/webhook",
  "events": ["claim.verified", "claim.updated", "claim.disputed"],
  "secret": "whsec_your_signing_secret"
}`}</pre>
        <h3 style={{ fontSize: "0.95rem", marginTop: 16 }}>Delivery payload</h3>
        <pre style={codeBlock}>{`POST /forai/webhook
Headers:
  X-ForAi-Event: claim.verified
  X-ForAi-Signature: sha256=<hmac_hex>
  X-ForAi-Delivery: <uuid>

{
  "event": "claim.verified",
  "timestamp": "2026-06-25T10:00:00Z",
  "data": {
    "entity_id": "kr-transport-seoul-metro-001",
    "document_slug": "seoul-metro-base-fare",
    "claim_id": "claim_123",
    "field_path": "fare.adult.base",
    "confidence": "high",
    "source_urls": ["https://example.gov/fares"]
  }
}`}</pre>
        <p style={panel}>Verify <code>X-ForAi-Signature</code> with HMAC-SHA256 over the raw request body. Webhooks auto-disable after repeated delivery failures.</p>
      </section>

      <section className="registry-panel" aria-labelledby="pro">
        <h2 id="pro">Pro & Enterprise</h2>
        <p style={panel}>Need higher limits, webhooks, bulk export, or reputation monitoring? Contact <strong>wooyeanho@gmail.com</strong>.</p>
      </section>

      <nav className="registry-panel" aria-labelledby="api-nav">
        <h2 id="api-nav">More</h2>
        <ul className="link-list">
          <li><Link href="/">Registry home</Link></li>
          <li><Link href="/suggest-topic">Suggest a topic</Link></li>
          <li><Link href="/community">Community</Link></li>
        </ul>
      </nav>
    </article>
  );
}
