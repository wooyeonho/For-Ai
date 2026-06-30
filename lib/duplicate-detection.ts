export interface DuplicateCandidateInput {
  id?: string;
  title: string;
  slug: string;
  lang?: string;
  country?: string;
  category?: string;
  entity_id?: string;
}

export interface DuplicateDocumentMatch {
  id: string;
  title: string;
  slug: string;
  lang: string;
  country: string;
  category: string;
  entity_id: string;
  slug_similarity: number;
  title_similarity: number;
  same_entity: boolean;
  same_category: boolean;
  same_country: boolean;
  reasons: string[];
}

export interface DuplicateDetectionResult {
  has_potential_duplicate: boolean;
  highest_score: number;
  slug_similarity_threshold: number;
  title_similarity_threshold: number;
  matches: DuplicateDocumentMatch[];
  recommendations: DuplicateDocumentMatch[];
}

interface SupabaseLike {
  from(table: string): {
    select(columns: string): {
      limit(count: number): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
    };
  };
}

const SLUG_SIMILARITY_THRESHOLD = 0.78;
const TITLE_SIMILARITY_THRESHOLD = 0.72;
const CONTEXT_RECOMMENDATION_LIMIT = 5;
const MAX_DOCUMENTS_TO_COMPARE = 500;

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function normalizeSlug(value: string): string {
  return normalizeText(value).replace(/\s+/g, "-");
}

function bigrams(value: string): Set<string> {
  const normalized = normalizeText(value).replace(/\s+/g, " ");
  if (normalized.length < 2) return new Set(normalized ? [normalized] : []);
  const grams = new Set<string>();
  for (let i = 0; i < normalized.length - 1; i += 1) grams.add(normalized.slice(i, i + 2));
  return grams;
}

function diceSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aGrams = bigrams(a);
  const bGrams = bigrams(b);
  if (aGrams.size === 0 || bGrams.size === 0) return 0;
  let overlap = 0;
  for (const gram of aGrams) if (bGrams.has(gram)) overlap += 1;
  return (2 * overlap) / (aGrams.size + bGrams.size);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function buildReasons(match: Omit<DuplicateDocumentMatch, "reasons">): string[] {
  const reasons: string[] = [];
  if (match.slug_similarity >= SLUG_SIMILARITY_THRESHOLD) reasons.push(`slug ${Math.round(match.slug_similarity * 100)}%`);
  if (match.title_similarity >= TITLE_SIMILARITY_THRESHOLD) reasons.push(`title ${Math.round(match.title_similarity * 100)}%`);
  if (match.same_entity) reasons.push("same entity");
  if (match.same_category) reasons.push("same category");
  if (match.same_country) reasons.push("same country");
  return reasons;
}

function score(match: DuplicateDocumentMatch): number {
  return Math.max(match.slug_similarity, match.title_similarity) + (match.same_entity ? 0.2 : 0) + (match.same_category ? 0.08 : 0) + (match.same_country ? 0.05 : 0);
}

export function detectDuplicateDocuments(input: DuplicateCandidateInput, documents: unknown[]): DuplicateDetectionResult {
  const inputSlug = normalizeSlug(input.slug);
  const inputTitle = normalizeText(input.title);
  const inputCountry = asString(input.country).toUpperCase();
  const inputCategory = asString(input.category).toLowerCase();
  const inputEntityId = asString(input.entity_id);

  const matches = documents.map((doc) => {
    const row = doc as Record<string, unknown>;
    const candidate = {
      id: asString(row.id),
      title: asString(row.title),
      slug: asString(row.slug),
      lang: asString(row.lang),
      country: asString(row.country),
      category: asString(row.category),
      entity_id: asString(row.entity_id),
      slug_similarity: diceSimilarity(inputSlug, normalizeSlug(asString(row.slug))),
      title_similarity: diceSimilarity(inputTitle, normalizeText(asString(row.title))),
      same_entity: Boolean(inputEntityId && inputEntityId === asString(row.entity_id)),
      same_category: Boolean(inputCategory && inputCategory === asString(row.category).toLowerCase()),
      same_country: Boolean(inputCountry && inputCountry === asString(row.country).toUpperCase()),
    };
    return { ...candidate, reasons: buildReasons(candidate) };
  });

  const duplicateMatches = matches
    .filter((match) => match.slug_similarity >= SLUG_SIMILARITY_THRESHOLD || match.title_similarity >= TITLE_SIMILARITY_THRESHOLD)
    .sort((a, b) => score(b) - score(a));

  const contextRecommendations = matches
    .filter((match) => (match.same_entity || (match.same_category && match.same_country)) && !duplicateMatches.some((dupe) => dupe.id === match.id))
    .sort((a, b) => score(b) - score(a))
    .slice(0, CONTEXT_RECOMMENDATION_LIMIT);

  const recommendations = [...duplicateMatches.slice(0, CONTEXT_RECOMMENDATION_LIMIT), ...contextRecommendations]
    .filter((match, index, all) => all.findIndex((m) => m.id === match.id) === index)
    .slice(0, CONTEXT_RECOMMENDATION_LIMIT);

  return {
    has_potential_duplicate: duplicateMatches.length > 0,
    highest_score: recommendations[0] ? Number(Math.min(score(recommendations[0]), 1).toFixed(2)) : 0,
    slug_similarity_threshold: SLUG_SIMILARITY_THRESHOLD,
    title_similarity_threshold: TITLE_SIMILARITY_THRESHOLD,
    matches: duplicateMatches,
    recommendations,
  };
}

export async function findDuplicateDocuments(sb: SupabaseLike, input: DuplicateCandidateInput): Promise<DuplicateDetectionResult> {
  const { data, error } = await sb
    .from("documents")
    .select("id,title,slug,lang,country,category,entity_id")
    .limit(MAX_DOCUMENTS_TO_COMPARE);
  if (error) throw new Error(error.message);
  return detectDuplicateDocuments(input, data ?? []);
}
