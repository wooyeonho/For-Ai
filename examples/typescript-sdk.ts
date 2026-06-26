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

  // 1. Check citation safety
  const canCite = await checkCitationSafety(slug);
  console.log(`${canCite ? "✓" : "✗"} ${slug} is ${canCite ? "" : "NOT "}citation-ready`);

  if (canCite) {
    // 2. Get structured citation
    const citation = await getCitation(slug);
    if (citation) {
      console.log(`  URL: ${citation.url}`);
    }
  }

  // 3. Full document fetch
  const doc = await getDocument(slug);
  console.log(`\nDocument: ${doc.document.title}`);
  console.log(`Claims: ${doc.claims.length}`);
  console.log(`Verified: ${doc.citation_guidance.verified_claims_count}/${doc.citation_guidance.total_claims_count}`);

  // 4. Filter citation-ready claims only
  const citableClaims = doc.claims.filter((c) => c.citation_ready);
  for (const claim of citableClaims) {
    console.log(`  [${claim.confidence}] ${claim.field_path}: ${claim.claim_value}`);
  }
}

main().catch(console.error);
