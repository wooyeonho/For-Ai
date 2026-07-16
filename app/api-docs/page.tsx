import Link from "next/link";
import type { Metadata } from "next";
import { siteUrl } from "../../lib/urls";

export const metadata: Metadata = {
  title: "API Documentation — For-Ai",
  description: "For-Ai Registry public API reference. Machine-readable fact data for AI, search engines, and developers.",
};

export default function ApiDocsPage() {
  const BASE = siteUrl("").replace(/\/+$/, "");
  const publicApiEndpoints = [
    {
      methods: ["GET /api/search"],
      description: "Search published documents and verified claims by query text, with optional language and limit filters.",
      auth: "No auth required.",
      rateLimit: "Yes — standard public API rate limit headers are returned.",
      response: '{ "results": [{ "type": "document|claim", "document_id": "...", "slug": "...", "title": "...", "category": "...", "lang": "...", "excerpt": "..." }], "query": "...", "total": 0 }',
      safety: "Only verified claims are searched; still check the target document citation guidance before citing a result.",
    },
    {
      methods: ["GET /api/trending"],
      description: "Returns AI citation, human view, and hallucination trending lists for public registry documents.",
      auth: "No auth required.",
      rateLimit: "Yes — standard public API rate limit headers are returned.",
      response: '{ "ai_trending": [], "human_trending": [], "hallucination_trending": [], "total_ai_citations": 0, "total_human_views": 0, "total_views": 0, "total_hallucinations": 0, "generated_at": "..." }',
      safety: "Trending rank is analytics metadata, not a factual verification signal; cite only citation-ready claims.",
    },
    {
      methods: ["GET /api/coverage"],
      description: "Public coverage metrics for the registry coverage goal and citation-readiness policy.",
      auth: "No auth required.",
      rateLimit: "Yes — standard public API rate limit headers are returned.",
      response: '{ "...coverage_metrics": "...", "citation_policy": "Cite only citation-ready claims..." }',
      safety: "Use the included citation policy as guidance; coverage counts do not make unverified facts citable.",
    },
    {
      methods: ["POST /api/source-suggest"],
      description: "Submit a public source suggestion for an existing claim; stores a contributor hash instead of raw IP.",
      auth: "No login required.",
      rateLimit: "Yes — limited per contributor hash and claim, with 429 on daily overuse.",
      response: '{ "success": true, "suggestion_id": "...", "points_awarded": 0, "is_official_source": false, "new_badges": [] }',
      safety: "Suggestions are pending evidence only; they are not verified sources until reviewed and attached to claims.",
    },
    {
      methods: ["POST /api/documents/:slug/copy-citation"],
      description: "Record a citation-copy analytics event for one document slug.",
      auth: "No auth required.",
      rateLimit: "Yes — per IP and slug window, with 429 when exceeded.",
      response: '{ "success": true }',
      safety: "This only records user intent; clients must still inspect citation guidance before copying or citing facts.",
    },
    {
      methods: ["GET /api/gamification/bounties", "POST /api/gamification/bounties"],
      description: "List open source/claim bounties, or create a new bounty for admin-managed campaigns.",
      auth: "GET is public; POST requires admin authorization.",
      rateLimit: "No dedicated public limiter; infrastructure or admin controls may still apply.",
      response: 'GET: { "bounties": [] } · POST: { "success": true, "bounty_id": "..." }',
      safety: "Bounties identify contribution targets, not verified facts; sponsored bounties must remain clearly labeled.",
    },
    {
      methods: ["GET /api/gamification/leaderboard"],
      description: "Quality-point leaderboard for contributors over week, month, or all-time periods.",
      auth: "No auth required.",
      rateLimit: "No dedicated public limiter; response is revalidated for five minutes.",
      response: '{ "leaderboard": [{ "rank": 1, "contributor_hash": "...", "quality_points": 0, "badge_count": 0 }], "period": "week", "generated_at": "..." }',
      safety: "Contributor score is reputation metadata and never a substitute for source-backed claim verification.",
    },
    {
      methods: ["GET /api/gamification/country-quest"],
      description: "Country-level quest progress derived from public entities and documents.",
      auth: "No auth required.",
      rateLimit: "No dedicated public limiter; response is revalidated for ten minutes.",
      response: '{ "quests": [{ "country": "...", "verified_count": 0, "total_count": 0, "target_count": 100, "progress_pct": 0 }], "generated_at": "..." }',
      safety: "Quest progress summarizes registry coverage only; it does not mark individual claims as citation-ready.",
    },
    {
      methods: ["GET /api/gamification/contributor/:hash"],
      description: "Contributor profile statistics, point events, badges, and weekly rank by contributor hash.",
      auth: "No auth required; contributor hash must be at least eight characters.",
      rateLimit: "No dedicated public limiter.",
      response: '{ "total_points": 0, "events": [], "badges": [], "rank_this_week": null }',
      safety: "Badges and points are contribution metadata; claim citation safety remains source and verification based.",
    },
    {
      methods: ["GET /api/contributor-receipt/:hash"],
      description: "Contributor receipt for public submissions keyed by contributor hash only.",
      auth: "No auth required; contributor hash must be 8 to 64 hexadecimal characters.",
      rateLimit: "No dedicated public limiter; receipt data is scoped to the supplied contributor hash.",
      response: '{ "contributor_hash": "...", "totals": { "points": 0, "pending": 0, "accepted": 0, "rejected": 0, "verified-linked": 0 }, "items": [], "privacy": { "raw_ip_stored": false } }',
      safety: "Receipts are contribution metadata only; they never make submitted facts citation-ready or expose raw IP addresses.",
    },
    {
      methods: ["GET /api/business/submitted-claims"],
      description: "Review queue for claims submitted through verified business workflows.",
      auth: "Admin authorization required.",
      rateLimit: "Protected by admin access controls; no public rate limit contract.",
      response: '{ "claims": [{ "...business_submitted_claim": "...", "verified_business_profiles": { "business_name": "...", "tier": "..." } }] }',
      safety: "Business-submitted claims remain unverified until human review; sponsored or business-claimed content must be labeled.",
    },
  ];

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">For-Ai · Developers</p>
        <h1>API Documentation</h1>
        <p style={{ color: "var(--muted)", fontSize: "1rem", lineHeight: 1.7 }}>
          Machine-readable fact data for AI systems, search engines, and developers. The first commercial wedge is business operating facts and reputation correction, so the key API signals are verified claims, stale claims, source coverage, API usage, and business correction requests.
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
          <strong>Pro features:</strong> Priority business correction intake, reputation alerts, webhook callbacks, bulk export, advanced search filters, priority support.
          <br />
          <strong>Enterprise features:</strong> All Pro features + custom SLA, data licensing, private namespaces, dedicated account manager, SSO.
        </div>
      </section>

      <section className="registry-panel" aria-labelledby="business-dashboard-metrics" id="business-dashboard-metrics">
        <h2 id="business-dashboard-metrics">Business wedge dashboard metrics</h2>
        <p style={{ fontSize: "0.9rem", color: "var(--muted)", lineHeight: 1.7 }}>
          For the initial vertical, API consumers should evaluate business facts as one operating bundle rather than separate vanity counters.
        </p>
        <ul style={{ fontSize: "0.9rem", color: "var(--muted)", lineHeight: 2 }}>
          <li><strong>Verified claims:</strong> canonical business facts that passed source-backed human review.</li>
          <li><strong>Stale claims:</strong> verified operating facts due for re-checking before AI keeps citing them.</li>
          <li><strong>Source coverage:</strong> share of business claims with acceptable traceable sources attached.</li>
          <li><strong>API usage:</strong> document/citation reads that identify high-demand business facts.</li>
          <li><strong>Business correction requests:</strong> owner or operator intake signals, never automatically citation-ready.</li>
        </ul>
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

          {/* GET /api/cite/:slug */}
          <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 16 }}>
            <p style={{ margin: 0, fontFamily: "monospace", fontWeight: 700 }}>
              GET /api/cite/<span style={{ color: "var(--accent)" }}>{"{slug}"}</span>
            </p>
            <p style={{ margin: "8px 0", fontSize: "0.9rem", color: "var(--muted)" }}>
              Lightweight citation-ready dataset for one document, including citable claims,
              source summaries, and machine-readable links.
            </p>
          </div>

          {/* GET /api/entities/:id */}
          <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 16 }}>
            <p style={{ margin: 0, fontFamily: "monospace", fontWeight: 700 }}>
              GET /api/entities/<span style={{ color: "var(--accent)" }}>{"{id}"}</span>
            </p>
            <p style={{ margin: "8px 0", fontSize: "0.9rem", color: "var(--muted)" }}>
              Entity-level profile with linked documents, citation status, and registry URLs.
            </p>
          </div>

          {/* GET /api/index */}
          <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 16 }}>
            <p style={{ margin: 0, fontFamily: "monospace", fontWeight: 700 }}>
              GET /api/index
            </p>
            <p style={{ margin: "8px 0", fontSize: "0.9rem", color: "var(--muted)" }}>
              Search and discovery index for public registry documents. Supports filters such as
              <code> q</code>, <code>type</code>, <code>country</code>, <code>lang</code>, and <code>cite</code>.
            </p>
          </div>

          {/* POST /api/documents/:slug/view */}
          <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 16 }}>
            <p style={{ margin: 0, fontFamily: "monospace", fontWeight: 700 }}>
              POST /api/documents/<span style={{ color: "var(--accent)" }}>{"{slug}"}</span>/view
            </p>
            <p style={{ margin: "8px 0", fontSize: "0.9rem", color: "var(--muted)" }}>
              Increment a document view counter.
            </p>
          </div>

          {/* POST /api/documents/:slug/cite */}
          <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 16 }}>
            <p style={{ margin: 0, fontFamily: "monospace", fontWeight: 700 }}>
              POST /api/documents/<span style={{ color: "var(--accent)" }}>{"{slug}"}</span>/cite
            </p>
            <p style={{ margin: "8px 0", fontSize: "0.9rem", color: "var(--muted)" }}>
              Increment a document AI citation counter.
            </p>
          </div>

          {/* GET /api/contributions/mine */}
          <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 16 }}>
            <p style={{ margin: 0, fontFamily: "monospace", fontWeight: 700 }}>
              GET /api/contributions/mine
            </p>
            <p style={{ margin: "8px 0", fontSize: "0.9rem", color: "var(--muted)" }}>
              Status of topic suggestions, correction reports, hallucination reports, and source suggestions
              submitted from the caller&apos;s own network address. No identifier is accepted or required — the
              contributor hash is derived server-side, so this can only ever return the caller&apos;s own submissions.
            </p>
          </div>

          {/* GET /api/contributions/streak */}
          <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 16 }}>
            <p style={{ margin: 0, fontFamily: "monospace", fontWeight: 700 }}>
              GET /api/contributions/streak
            </p>
            <p style={{ margin: "8px 0", fontSize: "0.9rem", color: "var(--muted)" }}>
              The caller&apos;s own accepted-contribution streak (current/longest day counts), derived from the
              same server-side contributor hash as /api/contributions/mine. Returns <code>{"{ streak: null }"}</code>{" "}
              when the caller has no streak history or the service-role Supabase connection is not configured.
            </p>
          </div>

          {/* GET/POST /api/posts */}
          <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 16 }}>
            <p style={{ margin: 0, fontFamily: "monospace", fontWeight: 700 }}>GET /api/posts</p>
            <p style={{ margin: "6px 0 0", fontFamily: "monospace", fontWeight: 700 }}>POST /api/posts</p>
            <p style={{ margin: "8px 0", fontSize: "0.9rem", color: "var(--muted)" }}>
              List published community posts or submit a new public post for review.
            </p>
          </div>

          <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 16 }}>
            <p style={{ margin: 0, fontFamily: "monospace", fontWeight: 700 }}>GET /api/search</p>
            <p style={{ margin: "6px 0 0", fontFamily: "monospace", fontWeight: 700 }}>GET /api/trending</p>
            <p style={{ margin: "6px 0 0", fontFamily: "monospace", fontWeight: 700 }}>GET /api/coverage</p>
            <p style={{ margin: "8px 0", fontSize: "0.9rem", color: "var(--muted)" }}>
              Discovery, trending, and public coverage metrics for registry documents.
            </p>
          </div>

          <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 16 }}>
            <p style={{ margin: 0, fontFamily: "monospace", fontWeight: 700 }}>POST /api/documents/<span style={{ color: "var(--accent)" }}>{"{slug}"}</span>/copy-citation</p>
            <p style={{ margin: "8px 0", fontSize: "0.9rem", color: "var(--muted)" }}>
              Increment citation-copy telemetry for API usage and high-demand fact prioritization.
            </p>
          </div>

          <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 16 }}>
            <p style={{ margin: 0, fontFamily: "monospace", fontWeight: 700 }}>POST /api/source-suggest</p>
            <p style={{ margin: "8px 0", fontSize: "0.9rem", color: "var(--muted)" }}>
              Submit source suggestions for claim verification without making the claim citation-ready.
            </p>
          </div>

          <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 16 }}>
            <p style={{ margin: 0, fontFamily: "monospace", fontWeight: 700 }}>GET /api/gamification/bounties</p>
            <p style={{ margin: "6px 0 0", fontFamily: "monospace", fontWeight: 700 }}>POST /api/gamification/bounties</p>
            <p style={{ margin: "6px 0 0", fontFamily: "monospace", fontWeight: 700 }}>GET /api/gamification/contributor/<span style={{ color: "var(--accent)" }}>{"{hash}"}</span></p>
            <p style={{ margin: "6px 0 0", fontFamily: "monospace", fontWeight: 700 }}>GET /api/gamification/country-quest</p>
            <p style={{ margin: "6px 0 0", fontFamily: "monospace", fontWeight: 700 }}>GET /api/gamification/leaderboard</p>
            <p style={{ margin: "8px 0", fontSize: "0.9rem", color: "var(--muted)" }}>
              Public verification participation endpoints for bounties, contributor progress, country quests, and leaderboard views.
            </p>
          </div>

          {/* Public submission endpoints */}
          <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 16 }}>
            <p style={{ margin: 0, fontFamily: "monospace", fontWeight: 700 }}>
              POST /api/report/<span style={{ color: "var(--accent)" }}>{"{slug}"}</span>
            </p>
            <p style={{ margin: "6px 0 0", fontFamily: "monospace", fontWeight: 700 }}>
              POST /api/hallucination/<span style={{ color: "var(--accent)" }}>{"{slug}"}</span>
            </p>
            <p style={{ margin: "6px 0 0", fontFamily: "monospace", fontWeight: 700 }}>POST /api/suggest-topic</p>
            <p style={{ margin: "6px 0 0", fontFamily: "monospace", fontWeight: 700 }}>POST /api/source-suggest</p>
            <p style={{ margin: "8px 0", fontSize: "0.9rem", color: "var(--muted)" }}>
              Public submissions for corrections, hallucination reports, suggested registry topics, and claim source suggestions.
              Submissions store contributor hashes, not raw IP addresses, and point awards are server-side/idempotent.
            </p>
          </div>

          {/* Discovery, analytics, and gamification endpoints */}
          <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 16 }}>
            <p style={{ margin: 0, fontFamily: "monospace", fontWeight: 700 }}>GET /api/search</p>
            <p style={{ margin: "6px 0 0", fontFamily: "monospace", fontWeight: 700 }}>GET /api/trending</p>
            <p style={{ margin: "6px 0 0", fontFamily: "monospace", fontWeight: 700 }}>GET /api/coverage</p>
            <p style={{ margin: "6px 0 0", fontFamily: "monospace", fontWeight: 700 }}>
              POST /api/documents/<span style={{ color: "var(--accent)" }}>{"{slug}"}</span>/copy-citation
            </p>
            <p style={{ margin: "8px 0", fontSize: "0.9rem", color: "var(--muted)" }}>
              Public discovery and analytics surfaces for registry search, trending documents, coverage summaries, and citation-copy counters.
            </p>
          </div>

          <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 16 }}>
            <p style={{ margin: 0, fontFamily: "monospace", fontWeight: 700 }}>GET /api/gamification/bounties</p>
            <p style={{ margin: "6px 0 0", fontFamily: "monospace", fontWeight: 700 }}>POST /api/gamification/bounties</p>
            <p style={{ margin: "6px 0 0", fontFamily: "monospace", fontWeight: 700 }}>
              GET /api/gamification/contributor/<span style={{ color: "var(--accent)" }}>{"{hash}"}</span>
            </p>
            <p style={{ margin: "6px 0 0", fontFamily: "monospace", fontWeight: 700 }}>GET /api/gamification/country-quest</p>
            <p style={{ margin: "6px 0 0", fontFamily: "monospace", fontWeight: 700 }}>GET /api/gamification/leaderboard</p>
            <p style={{ margin: "8px 0", fontSize: "0.9rem", color: "var(--muted)" }}>
              Gamification endpoints expose contribution tasks and aggregate reputation signals only. Admin-only writes still require server-side admin authorization.
            </p>
          </div>
        </div>
      </section>

      <section className="registry-panel" aria-labelledby="public-api">
        <h2 id="public-api">Public API route coverage</h2>
        <p style={{ fontSize: "0.9rem", color: "var(--muted)", lineHeight: 1.7 }}>
          These routes are included in the CI route guard and mirror the implemented public
          <code> app/api/**/route.ts</code> surface. Treat every factual value as non-citable
          unless its claim-level citation guidance says it is ready.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {publicApiEndpoints.map((endpoint) => (
            <div key={endpoint.methods.join("|")} style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 16 }}>
              {endpoint.methods.map((method) => (
                <p key={method} style={{ margin: endpoint.methods[0] === method ? 0 : "6px 0 0", fontFamily: "monospace", fontWeight: 700 }}>
                  {method}
                </p>
              ))}
              <p style={{ margin: "8px 0", fontSize: "0.9rem", color: "var(--muted)" }}>
                {endpoint.description}
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.85rem", color: "var(--muted)", lineHeight: 1.7 }}>
                <li><strong>Auth:</strong> {endpoint.auth}</li>
                <li><strong>Rate limit:</strong> {endpoint.rateLimit}</li>
                <li><strong>Response shape:</strong> <code>{endpoint.response}</code></li>
                <li><strong>Citation safety:</strong> {endpoint.safety}</li>
              </ul>
            </div>
          ))}
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
const res = await fetch("${BASE}/api/documents/your-slug");
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
  url          = {${BASE}/en/wiki/your-slug},
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
          and monitor AI reputation through the Business API. Business-submitted data is intake only; canonical claims still require independent verification before AI citation.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 16 }}>
            <p style={{ margin: 0, fontFamily: "monospace", fontWeight: 700 }}>
              GET /api/business/profile
            </p>
            <p style={{ margin: "6px 0 0", fontFamily: "monospace", fontWeight: 700 }}>
              POST /api/business/profile
            </p>
            <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
              Claim a business entity. Requires verification (email, domain, or document).
            </p>
          </div>
          <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 16 }}>
            <p style={{ margin: 0, fontFamily: "monospace", fontWeight: 700 }}>
              GET /api/business/submitted-claims
            </p>
            <p style={{ margin: "6px 0 0", fontFamily: "monospace", fontWeight: 700 }}>
              POST /api/business/corrections
            </p>
            <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
              Submit a fact correction for your entity. Priority/urgent requires Pro+ tier.
            </p>
          </div>
          <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 16 }}>
            <p style={{ margin: 0, fontFamily: "monospace", fontWeight: 700 }}>
              GET /api/business/submitted-claims
            </p>
            <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
              List business-submitted claims for verified-profile workflows. These remain separate from canonical citation-ready claims.
            </p>
          </div>
          <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 16 }}>
            <p style={{ margin: 0, fontFamily: "monospace", fontWeight: 700 }}>
              GET /api/business/alerts?profile_id=...
            </p>
            <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
              View reputation alerts and stale-claim signals for operating facts (incorrect citations, outdated facts, new hallucinations).
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
          Need higher rate limits, priority business corrections, or reputation monitoring?
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

BASE = "${BASE}"
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
  "${BASE}/api/documents/seoul-metro-base-fare",
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
  ${BASE}/api/cite/seoul-metro-base-fare

# Get raw markdown for LLM context injection
curl ${BASE}/raw/seoul-metro-base-fare.md`}</pre>
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
          <li><Link href="/community">Community</Link></li>
        </ul>
      </nav>
    </article>
  );
}
