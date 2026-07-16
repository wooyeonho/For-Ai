// Task 5-B1 — orchestrates safeFetchExternalSource -> canonical text
// extraction -> hashing -> storage-size policy -> an immutable
// source_snapshots row. Client-agnostic (the caller supplies an already
// -authenticated SupabaseClient) so this module has no service-role
// dependency of its own -- Task 5-B2 (cron) and any future HTTP route can
// both call it with whichever client construction fits their context.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { safeFetchExternalSource, type SafeFetchResult } from "./safe-fetch";
import { extractCanonicalText, hashCanonicalText } from "./canonical-text";

// Rather than silently truncating an oversized page (which could hide the
// very passage a later quote-verification step needs), a page whose
// canonical text exceeds this inline-storage cap is rejected outright.
// Object-storage overflow handling (source_snapshots.storage_path) is
// deferred until a real oversized page is observed in practice.
export const MAX_INLINE_NORMALIZED_TEXT_CHARS = 500_000;

export interface SourceSnapshotRow {
  id: string;
  source_id: string | null;
  canonical_url: string;
  final_url: string;
  retrieved_at: string;
  http_status: number;
  content_type: string;
  content_hash: string;
  normalized_text_hash: string;
  normalized_text: string | null;
  storage_path: string | null;
  etag: string | null;
  last_modified: string | null;
}

export interface CreateSourceSnapshotError {
  code: string;
  message: string;
}

export type CreateSourceSnapshotResult =
  | { ok: true; snapshot: SourceSnapshotRow; canonicalText: string }
  | { ok: false; error: CreateSourceSnapshotError };

export interface CreateSourceSnapshotOptions {
  sourceId?: string | null;
  // Test-only seam: bypasses the real network fetch. Production callers
  // never set this -- safeFetchExternalSource is always used for a real URL.
  fetchOverride?: (rawUrl: string) => Promise<SafeFetchResult>;
}

export async function createSourceSnapshot(
  supabase: SupabaseClient,
  rawUrl: string,
  options?: CreateSourceSnapshotOptions,
): Promise<CreateSourceSnapshotResult> {
  const fetcher = options?.fetchOverride ?? safeFetchExternalSource;
  const fetchResult = await fetcher(rawUrl);
  if (fetchResult.ok === false) {
    const fetchError = fetchResult.error;
    return { ok: false, error: { code: fetchError.code, message: fetchError.message } };
  }

  const canonicalText = extractCanonicalText(fetchResult.body);
  if (!canonicalText) {
    return { ok: false, error: { code: "empty_canonical_text", message: "No extractable text content after boilerplate removal." } };
  }
  if (canonicalText.length > MAX_INLINE_NORMALIZED_TEXT_CHARS) {
    return {
      ok: false,
      error: {
        code: "snapshot_too_large",
        message: `Canonical text (${canonicalText.length} chars) exceeds the ${MAX_INLINE_NORMALIZED_TEXT_CHARS}-char inline storage cap.`,
      },
    };
  }

  const contentHash = createHash("sha256").update(fetchResult.body, "utf-8").digest("hex");
  const normalizedTextHash = hashCanonicalText(canonicalText);

  const { data, error } = await supabase
    .from("source_snapshots")
    .insert({
      source_id: options?.sourceId ?? null,
      canonical_url: fetchResult.canonicalUrl,
      final_url: fetchResult.finalUrl,
      retrieved_at: fetchResult.retrievedAt,
      http_status: fetchResult.httpStatus,
      content_type: fetchResult.contentType,
      content_hash: contentHash,
      normalized_text_hash: normalizedTextHash,
      normalized_text: canonicalText,
      storage_path: null,
      etag: fetchResult.etag,
      last_modified: fetchResult.lastModified,
    })
    .select()
    .single();

  if (error || !data) {
    return { ok: false, error: { code: "insert_failed", message: error?.message ?? "Insert returned no row." } };
  }

  return { ok: true, snapshot: data as SourceSnapshotRow, canonicalText };
}
