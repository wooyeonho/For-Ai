import { createClient } from "@supabase/supabase-js";
import { getAllRegistryBundles } from "./data";
import { getDocumentCitationStatus, isStale, type FreshnessLabel } from "./citation-status";
import { DEFAULT_LOCALE } from "./i18n/locales";

// Normalized, filterable index over the whole registry (static seed bundles +
// Supabase documents). Every discovery surface — /api/index, llms.txt's Supabase
// section — derives "citable" from the SAME judgment here, so "No fake facts" is
// enforced identically everywhere. Static bundles carry full claim/source/event
// data and are judged by getDocumentCitationStatus(); Supabase index rows carry a
// lighter projection and are judged by isVerifiedSupabaseDoc().

export type RegistryIndexItem = {
  slug: string;
  title: string;
  entity_id: string;
  entity_name: string;
  type: string;
  category: string;
  country: string;
  lang: string;
  verification: "verified" | "candidate";
  confidence: string;
  doc_status: string;
  can_cite: boolean;
  freshness: FreshnessLabel;
  freshness_ttl_days: number;
  freshness_policy_reason: string;
  verified_claims: number;
  total_claims: number;
  needs_review_claims: number;
  stale_claims: number;
  missing_source_count: number;
  last_verified_at: string | null;
  oldest_verified_at: string | null;
  updated_at: string | null;
  source: "static" | "supabase";
};

export type RegistryIndexFilters = {
  q?: string;
  type?: string;
  country?: string;
  lang?: string;
  verification?: "verified" | "candidate" | "all";
  cite?: boolean;
};

type SupabaseIndexRow = {
  slug: string;
  title?: string;
  lang?: string;
  status?: string;
  confidence?: string;
  last_verified_at?: string | null;
  updated_at?: string | null;
  entities?: { id?: string; canonical_name?: string; type?: string; country?: string } | null;
  claims?: {
    status?: string;
    confidence?: string;
    claim_value?: string;
    last_verified_at?: string | null;
    claim_sources?: unknown[];
    verification_events?: { new_status?: string | null; event_type?: string | null }[];
  }[];
};

// A Supabase document is citable only when document.status is verified and
// every claim is verified with a non-low confidence, a real value, at least one
// source, a verification event, and last_verified_at. Published is public-only,
// not citation-ready. (Moved here from app/llms.txt so the judgment is single-sourced.)
export function isVerifiedSupabaseDoc(doc: {
  status?: string;
  confidence?: string;
  claims?: {
    status?: string;
    confidence?: string;
    claim_value?: string;
    last_verified_at?: string | null;
    claim_sources?: unknown[];
    verification_events?: { new_status?: string | null; event_type?: string | null }[];
  }[];
}): boolean {
  const claims = doc.claims ?? [];
  return (
    doc.status === "verified" &&
    doc.confidence !== "low" &&
    claims.length > 0 &&
    claims.every(
      (claim) =>
        claim.status === "verified" &&
        claim.confidence !== "low" &&
        claim.claim_value !== "확인 필요" &&
        Boolean(claim.last_verified_at) &&
        Array.isArray(claim.claim_sources) &&
        claim.claim_sources.length > 0 &&
        Array.isArray(claim.verification_events) &&
        claim.verification_events.some(
          (event) => event.new_status === "verified" || event.event_type === "source_verified",
        ),
    )
  );
}

function verifiedClaimCount(claims: SupabaseIndexRow["claims"]): number {
  return (claims ?? []).filter(
    (claim) =>
      claim.status === "verified" &&
      claim.confidence !== "low" &&
      claim.claim_value !== "확인 필요" &&
      Boolean(claim.last_verified_at) &&
      Array.isArray(claim.claim_sources) &&
      claim.claim_sources.length > 0 &&
      Array.isArray(claim.verification_events) &&
      claim.verification_events.some(
        (event) => event.new_status === "verified" || event.event_type === "source_verified",
      ),
  ).length;
}

function staticIndexItems(): RegistryIndexItem[] {
  return getAllRegistryBundles().map((bundle) => {
    const status = getDocumentCitationStatus(bundle);
    const { entity, document } = bundle;
    const missingSourceCount = bundle.claims.filter((claim) => claim.sources.length === 0).length;
    return {
      slug: document.slug,
      title: document.title,
      entity_id: entity.id,
      entity_name: entity.canonical_name,
      type: entity.type,
      category: document.category || entity.type,
      country: entity.country,
      lang: document.lang,
      verification: status.isVerifiedDocument ? "verified" : "candidate",
      confidence: document.confidence,
      doc_status: document.status,
      can_cite: status.isVerifiedDocument,
      freshness: status.freshness,
      freshness_ttl_days: status.freshnessWindowDays,
      freshness_policy_reason: status.freshnessPolicy.reason,
      verified_claims: status.verifiedClaims,
      total_claims: status.totalClaims,
      needs_review_claims: Math.max(0, status.totalClaims - status.verifiedClaims),
      stale_claims: status.staleClaims.length,
      missing_source_count: missingSourceCount,
      last_verified_at: document.last_verified_at,
      oldest_verified_at: status.oldestVerifiedAt,
      updated_at: document.updated_at,
      source: "static",
    };
  });
}

// Fetch the Supabase document index as normalized items. Static slugs are
// excluded so a slug authored statically wins (matches existing llms.txt/sitemap).
export async function getSupabaseIndexItems(staticSlugs: Set<string>): Promise<RegistryIndexItem[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];

  try {
    const sb = createClient(url, key);
    const { data } = await sb
      .from("documents")
      .select(
        "slug,title,lang,status,confidence,last_verified_at,updated_at," +
          "entities(id,canonical_name,type,country)," +
          "claims(status,confidence,claim_value,last_verified_at,claim_sources(id),verification_events(new_status,event_type))",
      )
      .in("status", ["published", "verified", "needs_review"])
      .order("updated_at", { ascending: false })
      .limit(500);

    return ((data ?? []) as unknown as SupabaseIndexRow[])
      .filter((row) => row.slug && !staticSlugs.has(row.slug))
      .map((row) => {
        const verified = isVerifiedSupabaseDoc(row);
        const totalClaims = (row.claims ?? []).length;
        return {
          slug: row.slug,
          title: row.title ?? row.slug,
          entity_id: row.entities?.id ?? "",
          entity_name: row.entities?.canonical_name ?? "",
          type: row.entities?.type ?? "",
          category: row.entities?.type ?? "uncategorized",
          country: row.entities?.country ?? "",
          lang: row.lang ?? DEFAULT_LOCALE,
          verification: verified ? "verified" : "candidate",
          confidence: row.confidence ?? "low",
          doc_status: row.status ?? "needs_review",
          can_cite: verified,
          freshness: (verified ? (isStale(row.last_verified_at ?? null) ? "stale" : "fresh") : "unknown") as FreshnessLabel,
          freshness_ttl_days: 180,
          freshness_policy_reason: "default freshness policy",
          verified_claims: verifiedClaimCount(row.claims),
          total_claims: totalClaims,
          needs_review_claims: Math.max(0, totalClaims - verifiedClaimCount(row.claims)),
          stale_claims: verified && isStale(row.last_verified_at ?? null) ? verifiedClaimCount(row.claims) : 0,
          missing_source_count: (row.claims ?? []).filter((claim) => !Array.isArray(claim.claim_sources) || claim.claim_sources.length === 0).length,
          last_verified_at: row.last_verified_at ?? null,
          oldest_verified_at: null,
          updated_at: row.updated_at ?? null,
          source: "supabase" as const,
        };
      });
  } catch {
    return [];
  }
}

function matchesFilters(item: RegistryIndexItem, filters: RegistryIndexFilters): boolean {
  if (filters.cite && !item.can_cite) return false;
  if (filters.verification && filters.verification !== "all" && item.verification !== filters.verification) return false;
  if (filters.lang && item.lang !== filters.lang) return false;
  if (filters.country && item.country.toLowerCase() !== filters.country.toLowerCase()) return false;
  if (filters.type && !item.type.toLowerCase().startsWith(filters.type.toLowerCase())) return false;
  if (filters.q) {
    const q = filters.q.toLowerCase();
    const haystack = `${item.title} ${item.entity_name} ${item.type}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

// Full filtered + sorted index (no pagination — callers paginate). Verified items
// first, then most-recently-updated. Falls back to static-only if Supabase is
// unconfigured, so discovery works in any environment.
export async function getRegistryIndex(filters: RegistryIndexFilters = {}): Promise<RegistryIndexItem[]> {
  const staticItems = staticIndexItems();
  const supabaseItems = await getSupabaseIndexItems(new Set(staticItems.map((i) => i.slug)));
  const all = [...staticItems, ...supabaseItems].filter((item) => matchesFilters(item, filters));

  return all.sort((a, b) => {
    if (a.can_cite !== b.can_cite) return a.can_cite ? -1 : 1;
    const at = a.updated_at ? Date.parse(a.updated_at) : 0;
    const bt = b.updated_at ? Date.parse(b.updated_at) : 0;
    return bt - at;
  });
}

export type CoverageRow = {
  country: string;
  category: string;
  total_documents: number;
  verified_claims: number;
  needs_review: number;
  stale_claims: number;
  missing_source_count: number;
};

export type CoverageRecommendation = CoverageRow & {
  priority_score: number;
  reason: string;
};

export type CoverageSummary = {
  rows: CoverageRow[];
  recommendations: CoverageRecommendation[];
  totals: Omit<CoverageRow, "country" | "category">;
};

function coveragePriority(row: CoverageRow): number {
  return row.needs_review * 3 + row.missing_source_count * 4 + row.stale_claims * 2 + Math.max(0, 3 - row.total_documents);
}

function recommendationReason(row: CoverageRow): string {
  const reasons: string[] = [];
  if (row.missing_source_count > 0) reasons.push(`${row.missing_source_count} missing source(s)`);
  if (row.needs_review > 0) reasons.push(`${row.needs_review} claim(s) need review`);
  if (row.stale_claims > 0) reasons.push(`${row.stale_claims} stale claim(s)`);
  if (row.total_documents < 3) reasons.push("thin country/category coverage");
  return reasons.join(" · ") || "maintain verified coverage";
}

export async function getCoverageSummary(): Promise<CoverageSummary> {
  const items = await getRegistryIndex({});
  const rowsByKey = new Map<string, CoverageRow>();

  for (const item of items) {
    const country = item.country || "global";
    const category = item.category || item.type || "uncategorized";
    const key = `${country}::${category}`;
    const row = rowsByKey.get(key) ?? {
      country,
      category,
      total_documents: 0,
      verified_claims: 0,
      needs_review: 0,
      stale_claims: 0,
      missing_source_count: 0,
    };
    row.total_documents += 1;
    row.verified_claims += item.verified_claims;
    row.needs_review += item.needs_review_claims;
    row.stale_claims += item.stale_claims;
    row.missing_source_count += item.missing_source_count;
    rowsByKey.set(key, row);
  }

  const rows = [...rowsByKey.values()].sort((a, b) => a.country.localeCompare(b.country) || a.category.localeCompare(b.category));
  const totals = rows.reduce(
    (acc, row) => ({
      total_documents: acc.total_documents + row.total_documents,
      verified_claims: acc.verified_claims + row.verified_claims,
      needs_review: acc.needs_review + row.needs_review,
      stale_claims: acc.stale_claims + row.stale_claims,
      missing_source_count: acc.missing_source_count + row.missing_source_count,
    }),
    { total_documents: 0, verified_claims: 0, needs_review: 0, stale_claims: 0, missing_source_count: 0 },
  );

  const recommendations = rows
    .map((row) => ({ ...row, priority_score: coveragePriority(row), reason: recommendationReason(row) }))
    .filter((row) => row.priority_score > 0)
    .sort((a, b) => b.priority_score - a.priority_score || a.country.localeCompare(b.country) || a.category.localeCompare(b.category))
    .slice(0, 8);

  return { rows, recommendations, totals };
}
