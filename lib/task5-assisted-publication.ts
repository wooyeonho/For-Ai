export const TASK5_ASSISTED_POLICY_VERSION = 1;
export const TASK5_REVIEW_REASON_MIN = 3;
export const TASK5_REVIEW_REASON_MAX = 2000;
export const TASK5_EDIT_TEXT_MAX = 4000;

export type Task5AssistedReviewAction = "reject" | "escalate" | "refetch" | "hold";

export type Task5ModelProvenance = {
  provider: string;
  model_id: string;
  prompt_version: string;
  stage: string;
};

export type Task5EvidenceExcerpt = {
  quote: string;
  context: string;
  context_start: number;
  context_end: number;
};

export type Task5DuplicateCandidate = {
  id: string;
  document_slug: string;
  claim_text: string;
  claim_value: string;
  score: number;
};

export type PublicAssistedPublicationReceipt = {
  event_id: string;
  claim_id: string;
  claim_version_id: string;
  publication_mode: "assisted_operator";
  content_origin: "task5_ai";
  verification_policy_version: number;
  deterministic_policy_version: string;
  risk_result: "normal";
  evidence_count: number;
  source_count: number;
  published_at: string;
  model_provenance: Task5ModelProvenance[];
  sources: Array<{
    url: string;
    retrieved_at: string;
    content_type: string;
  }>;
};

export function task5PublicationEmergencyDisabled(
  value = process.env.TASK5_EMERGENCY_DISABLE,
): boolean {
  return value === "1";
}

export function task5PhaseAllowsAssistedPublication(phase: unknown): boolean {
  return typeof phase === "number" && Number.isInteger(phase) && phase >= 1 && phase <= 4;
}

export function isTask5AssistedReviewAction(value: unknown): value is Task5AssistedReviewAction {
  return value === "reject" || value === "escalate" || value === "refetch" || value === "hold";
}

export function task5ReviewActionForRpc(
  action: Task5AssistedReviewAction,
): "rejected" | "escalated" | "refetch_requested" | "held" {
  if (action === "reject") return "rejected";
  if (action === "escalate") return "escalated";
  if (action === "refetch") return "refetch_requested";
  return "held";
}

export function buildTask5EvidenceExcerpt(
  canonicalText: string,
  quoteStart: number,
  quoteEnd: number,
  contextRadius = 160,
): Task5EvidenceExcerpt | null {
  if (!Number.isInteger(quoteStart) || !Number.isInteger(quoteEnd)) return null;
  if (quoteStart < 0 || quoteEnd <= quoteStart || quoteEnd > canonicalText.length) return null;
  const quote = canonicalText.slice(quoteStart, quoteEnd);
  if (!quote) return null;
  const contextStart = Math.max(0, quoteStart - Math.max(0, contextRadius));
  const contextEnd = Math.min(canonicalText.length, quoteEnd + Math.max(0, contextRadius));
  return {
    quote,
    context: canonicalText.slice(contextStart, contextEnd),
    context_start: contextStart,
    context_end: contextEnd,
  };
}

function cleanProvenanceValue(value: unknown, max = 160): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function publicTask5ModelProvenance(value: unknown): Task5ModelProvenance[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    const provider = cleanProvenanceValue(row.provider);
    const modelId = cleanProvenanceValue(row.model_id);
    const promptVersion = cleanProvenanceValue(row.prompt_version);
    const stage = cleanProvenanceValue(row.stage);
    if (!provider || !modelId || !promptVersion || !stage) return [];
    return [{ provider, model_id: modelId, prompt_version: promptVersion, stage }];
  }).slice(0, 12);
}

function duplicateTokens(value: string): Set<string> {
  const normalized = value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return new Set(normalized.split(/\s+/u).filter((token) => token.length >= 2).slice(0, 80));
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

export function rankTask5DuplicateCandidates(
  input: { claim_text: string; claim_value: string },
  candidates: Array<{ id: string; document_slug: string; claim_text: string; claim_value: string }>,
  limit = 5,
): Task5DuplicateCandidate[] {
  const sourceTokens = duplicateTokens(`${input.claim_text} ${input.claim_value}`);
  return candidates
    .map((candidate) => ({
      ...candidate,
      score: Number(jaccard(sourceTokens, duplicateTokens(`${candidate.claim_text} ${candidate.claim_value}`)).toFixed(4)),
    }))
    .filter((candidate) => candidate.score >= 0.2)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, Math.min(Math.max(limit, 1), 10));
}
