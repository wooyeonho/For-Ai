import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SafeFetchError,
  safeFetchExternalSource,
  verifyQuoteInCanonicalText,
  type SafeFetchExternalSourceOptions,
} from "./safe-fetch-external-source";

export type EvidenceFreshnessResult =
  | "healthy"
  | "redirected"
  | "content_changed"
  | "evidence_missing"
  | "not_found"
  | "temporarily_unavailable"
  | "blocked"
  | "fetch_error";

type LeasedEvidence = {
  claim_evidence_id: string;
  claim_id: string;
  claim_version_id: string;
  canonical_url: string;
  previous_final_url: string;
  previous_normalized_text_hash: string;
  quote_text: string | null;
  valid_until: string | null;
};

type FreshnessCompletion = {
  result: EvidenceFreshnessResult;
  finalUrl: string | null;
  normalizedTextHash: string | null;
  httpStatus: number | null;
  errorCode: string | null;
  metadata: Record<string, string | number | boolean | null>;
};

export function classifyFreshnessFetchError(error: unknown): FreshnessCompletion {
  if (!(error instanceof SafeFetchError)) {
    return {
      result: "fetch_error",
      finalUrl: null,
      normalizedTextHash: null,
      httpStatus: null,
      errorCode: "unknown_error",
      metadata: {},
    };
  }

  const status = typeof error.details.status === "number" ? error.details.status : null;
  if (error.code === "http_status") {
    if (status === 404 || status === 410) {
      return { result: "not_found", finalUrl: null, normalizedTextHash: null, httpStatus: status, errorCode: "http_not_found", metadata: {} };
    }
    if (status === 403) {
      return { result: "blocked", finalUrl: null, normalizedTextHash: null, httpStatus: status, errorCode: "http_blocked", metadata: {} };
    }
    if (status === 429 || (status !== null && status >= 500)) {
      return {
        result: "temporarily_unavailable",
        finalUrl: null,
        normalizedTextHash: null,
        httpStatus: status,
        errorCode: status === 429 ? "http_rate_limited" : "http_server_error",
        metadata: {
          retry_after_seconds: typeof error.details.retryAfterSeconds === "number" ? error.details.retryAfterSeconds : null,
        },
      };
    }
  }

  const temporaryCodes = new Set(["timeout", "network_error", "dns_failed"]);
  return {
    result: temporaryCodes.has(error.code) ? "temporarily_unavailable" : "fetch_error",
    finalUrl: null,
    normalizedTextHash: null,
    httpStatus: status,
    errorCode: error.code,
    metadata: {},
  };
}

export async function inspectEvidenceFreshness(
  evidence: LeasedEvidence,
  options: SafeFetchExternalSourceOptions = {},
): Promise<FreshnessCompletion> {
  if (!evidence.quote_text) {
    return {
      result: "fetch_error",
      finalUrl: null,
      normalizedTextHash: null,
      httpStatus: null,
      errorCode: "snapshot_text_unavailable",
      metadata: {},
    };
  }

  try {
    const fetched = await safeFetchExternalSource(evidence.canonical_url, options);
    let quotePresent = true;
    try {
      verifyQuoteInCanonicalText(fetched.canonicalText, evidence.quote_text);
    } catch (error) {
      if (error instanceof SafeFetchError && (error.code === "quote_absent" || error.code === "quote_multiple")) {
        quotePresent = false;
      } else {
        throw error;
      }
    }

    const redirected = fetched.finalUrl !== fetched.canonicalUrl;
    const hashChanged = fetched.normalizedTextHash !== evidence.previous_normalized_text_hash;
    const result: EvidenceFreshnessResult = !quotePresent
      ? "evidence_missing"
      : hashChanged
        ? "content_changed"
        : redirected
          ? "redirected"
          : "healthy";

    return {
      result,
      finalUrl: fetched.finalUrl,
      normalizedTextHash: fetched.normalizedTextHash,
      httpStatus: fetched.httpStatus,
      errorCode: null,
      metadata: { redirected, hash_changed: hashChanged, quote_present: quotePresent },
    };
  } catch (error) {
    return classifyFreshnessFetchError(error);
  }
}

export async function runEvidenceFreshnessBatch(
  supabase: SupabaseClient,
  options: { limit?: number; workerId?: string; fetch?: SafeFetchExternalSourceOptions } = {},
): Promise<{ leased: number; completed: number; results: Record<EvidenceFreshnessResult, number> }> {
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  const workerId = options.workerId ?? `freshness-${randomUUID()}`;
  const { data, error } = await supabase.rpc("lease_evidence_freshness", {
    p_worker_id: workerId,
    p_limit: limit,
    p_lease_seconds: 120,
  });
  if (error) throw new Error(`lease_evidence_freshness failed: ${error.message}`);

  const leased = (data ?? []) as LeasedEvidence[];
  const results = Object.fromEntries([
    "healthy", "redirected", "content_changed", "evidence_missing", "not_found",
    "temporarily_unavailable", "blocked", "fetch_error",
  ].map((key) => [key, 0])) as Record<EvidenceFreshnessResult, number>;

  let completed = 0;
  for (const evidence of leased) {
    const outcome = await inspectEvidenceFreshness(evidence, options.fetch);
    const completion = await supabase.rpc("complete_evidence_freshness", {
      p_worker_id: workerId,
      p_claim_evidence_id: evidence.claim_evidence_id,
      p_result: outcome.result,
      p_final_url: outcome.finalUrl,
      p_current_normalized_text_hash: outcome.normalizedTextHash,
      p_http_status: outcome.httpStatus,
      p_error_code: outcome.errorCode,
      p_metadata: outcome.metadata,
    });
    if (completion.error) {
      throw new Error(`complete_evidence_freshness failed for ${evidence.claim_evidence_id}: ${completion.error.message}`);
    }
    results[outcome.result] += 1;
    completed += 1;
  }

  return { leased: leased.length, completed, results };
}
