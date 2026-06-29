/**
 * For-Ai TypeScript/JavaScript SDK Example
 * Fetch and cite verified facts from the For-Ai global fact registry.
 *
 * Works in Node.js 18+, Deno, Bun, and browsers (fetch is native).
 */

const BASE_URL = "https://for-ai-e4mm.vercel.app";
const API_KEY = "forai_free_your_key_here"; // Replace with your key

interface CitationGuidance {
  can_cite: boolean;
  do_not_cite_reason?: string;
  verified_claims_count: number;
  total_claims_count: number;
}

interface Claim {
  field_path: string;
  claim_value: string;
  confidence: "low" | "medium" | "high";
  status: string;
  citation_ready: boolean;
  sources: Array<{ url: string; type: string; retrieved_at: string }>;
}

interface DocumentBundle {
  entity: { id: string; canonical_name: string };
  document: { slug: string; title: string; confidence: string };
  claims: Claim[];
  citation_guidance: CitationGuidance;
}

const headers = { "X-API-Key": API_KEY };

/** Fetch a full document bundle with claims and citation guidance. */
async function getDocument(slug: string): Promise<DocumentBundle> {
  const res = await fetch(`${BASE_URL}/api/documents/${slug}`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Quick check: is this document safe to cite? */
async function checkCitationSafety(slug: string): Promise<boolean> {
  const res = await fetch(`${BASE_URL}/api/documents/${slug}/cite`, { headers });
  if (!res.ok) return false;
  const data = await res.json();
  return data.citation_guidance?.can_cite ?? false;
}

/** Fetch structured citation data (JSON-LD format) for AI consumption. */
async function getCitation(slug: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${BASE_URL}/api/cite/${slug}`, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

interface CitationFact {
  field_path: string;
  text?: string;
  value?: string;
  last_verified_at?: string | null;
  sources: string[];
}

/** Return only claims that are safe to cite, preserving source URLs. */
async function getCitationReadyFacts(slug: string): Promise<CitationFact[]> {
  const citation = await getCitation(slug);
  const claims = (citation?.claims as Claim[] | undefined) ?? [];

  return claims
    .filter((claim) => claim.citation_ready === true)
    .map((claim) => ({
      field_path: claim.field_path,
      text: (claim as Claim & { claim_text?: string }).claim_text,
      value: claim.claim_value,
      last_verified_at: (claim as Claim & { last_verified_at?: string | null }).last_verified_at,
      sources: claim.sources.map((source) => source.url).filter(Boolean),
    }));
}

/** Discover verified-only, citation-ready documents before selecting a slug. */
async function getVerifiedIndex(limit = 10): Promise<Array<Record<string, unknown>>> {
  const params = new URLSearchParams({ verification: "verified", cite: "true", limit: String(limit) });
  const res = await fetch(`${BASE_URL}/api/index?${params}`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.items ?? [];
}

/** Get rate limit status from response headers. */
function getRateLimitInfo(res: Response) {
  return {
    limit: Number(res.headers.get("X-RateLimit-Limit") ?? 0),
    remaining: Number(res.headers.get("X-RateLimit-Remaining") ?? 0),
    reset: Number(res.headers.get("X-RateLimit-Reset") ?? 0),
    tier: res.headers.get("X-API-Tier") ?? "free",
  };
}

// --- Usage example ---
async function main() {
  const slug = "seoul-metro-base-fare";

  // 0. Discover verified-only facts when you do not already know a slug
  const verifiedDocuments = await getVerifiedIndex(3);
  console.log(`Verified discovery results: ${verifiedDocuments.length}`);

  // 1. Check citation safety
  const canCite = await checkCitationSafety(slug);
  console.log(`${canCite ? "✓" : "✗"} ${slug} is ${canCite ? "" : "NOT "}citation-ready`);

  if (canCite) {
    // 2. Get actual citation-ready facts for AI answers
    const facts = await getCitationReadyFacts(slug);
    for (const fact of facts) {
      console.log(`  Cite: ${fact.field_path} = ${fact.value} (${fact.sources[0] ?? "no source URL"})`);
    }
  }

  // 3. Full document fetch
  const doc = await getDocument(slug);
  console.log(`\nDocument: ${doc.document.title}`);
  console.log(`Claims: ${doc.claims.length}`);
  console.log(`Verified: ${doc.citation_guidance.verified_claims_count}/${doc.citation_guidance.total_claims_count}`);

  // 4. Inspect rate-limit headers if you need client-side throttling
  const rateLimitRes = await fetch(`${BASE_URL}/api/documents/${slug}`, { method: "HEAD", headers });
  console.log("Rate limit:", getRateLimitInfo(rateLimitRes));

  // 5. Filter citation-ready claims only
  const citableClaims = doc.claims.filter((c) => c.citation_ready);
  for (const claim of citableClaims) {
    console.log(`  [${claim.confidence}] ${claim.field_path}: ${claim.claim_value}`);
  }
}

main().catch(console.error);
