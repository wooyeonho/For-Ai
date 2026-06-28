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

      {/* Business API */}
      <section className="registry-panel" aria-labelledby="business-api">
        <h2 id="business-api">Business API</h2>
        <p style={{ fontSize: "0.9rem", color: "var(--muted)", lineHeight: 1.7 }}>
          Verified businesses can manage their fact profile, submit priority corrections,
          and monitor AI reputation through the Business API.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 16 }}>
            <p style={{ margin: 0, fontFamily: "monospace", fontWeight: 700 }}>
              POST /api/business/profile
            </p>
            <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
              Claim a business entity. Requires verification (email, domain, or document).
            </p>
          </div>
          <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 16 }}>
            <p style={{ margin: 0, fontFamily: "monospace", fontWeight: 700 }}>
              POST /api/business/corrections
            </p>
            <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
              Submit a fact correction for your entity. Priority/urgent requires Pro+ tier.
            </p>
          </div>
          <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 16 }}>
            <p style={{ margin: 0, fontFamily: "monospace", fontWeight: 700 }}>
              GET /api/business/alerts?profile_id=...
            </p>
            <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
              View reputation alerts (incorrect citations, outdated facts, new hallucinations).
            </p>
          </div>
          <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 16 }}>
            <p style={{ margin: 0, fontFamily: "monospace", fontWeight: 700 }}>
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

      {/* SDK Examples */}
      <section className="registry-panel" aria-labelledby="sdk-examples">
        <h2 id="sdk-examples">SDK Examples</h2>
        <p style={{ fontSize: "0.9rem", color: "var(--muted)", lineHeight: 1.7, marginBottom: 16 }}>
          Ready-to-use examples for integrating For-Ai into your AI pipeline.
          Full source available in <code>/examples/</code> on GitHub.
        </p>

        <h3 style={{ fontSize: "0.95rem", marginBottom: 8 }}>Python</h3>
        <pre style={{ background: "var(--soft)", borderRadius: 6, padding: "10px 14px", fontSize: "0.8rem", overflowX: "auto" }}>{`import requests

BASE = "https://for-ai-e4mm.vercel.app"
KEY = "forai_free_your_key"

# Check if a document is safe to cite
res = requests.get(f"{BASE}/api/documents/seoul-metro-base-fare",
                   headers={"X-API-Key": KEY})
data = res.json()

if data["citation_guidance"]["can_cite"]:
    verified = [c for c in data["claims"] if c["citation_ready"]]
    print(f"Safe to cite: {len(verified)} verified claims")`}</pre>

        <h3 style={{ fontSize: "0.95rem", marginTop: 20, marginBottom: 8 }}>TypeScript / JavaScript</h3>
        <pre style={{ background: "var(--soft)", borderRadius: 6, padding: "10px 14px", fontSize: "0.8rem", overflowX: "auto" }}>{`const res = await fetch(
  "https://for-ai-e4mm.vercel.app/api/documents/seoul-metro-base-fare",
  { headers: { "X-API-Key": "forai_free_your_key" } }
);
const { claims, citation_guidance } = await res.json();

if (citation_guidance.can_cite) {
  const verified = claims.filter(c => c.citation_ready);
  // Safe to use in AI responses
}`}</pre>

        <h3 style={{ fontSize: "0.95rem", marginTop: 20, marginBottom: 8 }}>cURL</h3>
        <pre style={{ background: "var(--soft)", borderRadius: 6, padding: "10px 14px", fontSize: "0.8rem", overflowX: "auto" }}>{`# Get JSON-LD citation
curl -H "X-API-Key: forai_free_..." \\
  https://for-ai-e4mm.vercel.app/api/cite/seoul-metro-base-fare

# Get raw markdown for LLM context injection
curl https://for-ai-e4mm.vercel.app/raw/seoul-metro-base-fare.md`}</pre>
      </section>

      {/* Webhooks */}
      <section className="registry-panel" aria-labelledby="webhooks">
        <h2 id="webhooks">Webhooks</h2>
        <p style={{ fontSize: "0.9rem", color: "var(--muted)", lineHeight: 1.7 }}>
          Subscribe to verification events to keep your AI system in sync.
          Webhooks are signed with HMAC-SHA256 for payload integrity.
        </p>

        <h3 style={{ fontSize: "0.95rem", marginTop: 16, marginBottom: 8 }}>Available Events</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--line)", textAlign: "left" }}>
              <th style={{ padding: "6px 10px" }}>Event</th>
              <th style={{ padding: "6px 10px" }}>Description</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["claim.verified", "A claim passed human verification"],
              ["claim.updated", "A claim value or confidence changed"],
              ["claim.disputed", "A claim was flagged for dispute"],
              ["document.published", "A new document was published"],
              ["document.updated", "A document was modified"],
              ["entity.created", "A new entity was registered"],
              ["business_profile.verified", "A business profile was verified"],
              ["correction.accepted", "A business correction was accepted"],
              ["correction.rejected", "A business correction was rejected"],
            ].map(([event, desc]) => (
              <tr key={event} style={{ borderBottom: "1px solid var(--line)" }}>
                <td style={{ padding: "6px 10px", fontFamily: "monospace" }}>{event}</td>
                <td style={{ padding: "6px 10px", color: "var(--muted)" }}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 style={{ fontSize: "0.95rem", marginTop: 20, marginBottom: 8 }}>Payload Format</h3>
        <pre style={{ background: "var(--soft)", borderRadius: 6, padding: "10px 14px", fontSize: "0.8rem", overflowX: "auto" }}>{`POST /your-webhook-url
Headers:
  Content-Type: application/json
  X-ForAi-Event: claim.verified
  X-ForAi-Signature: sha256=<hmac_hex>
  X-ForAi-Delivery: <uuid>

Body:
{
  "event": "claim.verified",
  "timestamp": "2026-06-25T10:00:00Z",
  "data": {
    "claim_id": "...",
    "entity_id": "...",
    "field_path": "base_fare",
    "new_confidence": "high"
  }
}`}</pre>

        <h3 style={{ fontSize: "0.95rem", marginTop: 20, marginBottom: 8 }}>Signature Verification</h3>
        <pre style={{ background: "var(--soft)", borderRadius: 6, padding: "10px 14px", fontSize: "0.8rem", overflowX: "auto" }}>{`import hmac, hashlib

def verify_signature(payload: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(f"sha256={expected}", signature)`}</pre>

        <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 12 }}>
          Webhooks auto-disable after 10 consecutive delivery failures.
          Re-activate via the API or admin dashboard.
        </p>
      </section>

      <nav className="registry-panel" aria-labelledby="api-nav">
        <h2 id="api-nav">More</h2>
        <ul className="link-list">
          <li><Link href="/">Registry home</Link></li>
          <li><Link href="/suggest-topic">Suggest a topic</Link></li>
          <li><Link href="/admin/review">Admin panel</Link></li>
        </ul>
      </nav>
    </article>
  );
}
