import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSourceSnapshot, MAX_INLINE_NORMALIZED_TEXT_CHARS } from "../lib/source-snapshot";
import type { SafeFetchResult } from "../lib/safe-fetch";

function fakeSupabase(onInsert: (row: Record<string, unknown>) => { data: unknown; error: { message: string } | null }): SupabaseClient {
  return {
    from() {
      return {
        insert(row: Record<string, unknown>) {
          return {
            select() {
              return {
                async single() {
                  return onInsert(row);
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

function fetchSuccess(body: string, overrides: Partial<SafeFetchResult & { ok: true }> = {}): () => Promise<SafeFetchResult> {
  return async () => ({
    ok: true,
    canonicalUrl: "https://example.com/article",
    finalUrl: "https://example.com/article",
    httpStatus: 200,
    contentType: "text/html",
    body,
    retrievedAt: "2026-07-16T00:00:00.000Z",
    etag: null,
    lastModified: null,
    ...overrides,
  });
}

test("createSourceSnapshot inserts a row with canonical text, hashes, and metadata", async () => {
  const html = "<html><body><script>evil()</script><p>The measured value was 42 units.</p></body></html>";
  let insertedRow: Record<string, unknown> | null = null;
  const supabase = fakeSupabase((row) => {
    insertedRow = row;
    return { data: { id: "00000000-0000-0000-0000-000000000000", ...row }, error: null };
  });

  const result = await createSourceSnapshot(supabase, "https://example.com/article", { fetchOverride: fetchSuccess(html) });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(result.canonicalText.includes("The measured value was 42 units."));
    assert.ok(!result.canonicalText.includes("evil()"));
  }
  assert.ok(insertedRow);
  const row = insertedRow as unknown as Record<string, unknown>;
  assert.equal(row.canonical_url, "https://example.com/article");
  assert.equal(row.storage_path, null);
  assert.equal(typeof row.normalized_text, "string");
  assert.match(row.content_hash as string, /^[0-9a-f]{64}$/);
  assert.match(row.normalized_text_hash as string, /^[0-9a-f]{64}$/);
});

test("createSourceSnapshot passes through a safeFetchExternalSource failure without inserting", async () => {
  let inserted = false;
  const supabase = fakeSupabase((row) => {
    inserted = true;
    return { data: row, error: null };
  });
  const fetchOverride = async (): Promise<SafeFetchResult> => ({
    ok: false,
    error: { code: "dns_blocked_address", message: "blocked" },
  });

  const result = await createSourceSnapshot(supabase, "https://internal.example/", { fetchOverride });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "dns_blocked_address");
  assert.equal(inserted, false);
});

test("createSourceSnapshot rejects (fail-closed) a page whose canonical text exceeds the inline storage cap", async () => {
  const huge = "<p>" + "word ".repeat(Math.ceil(MAX_INLINE_NORMALIZED_TEXT_CHARS / 4)) + "</p>";
  let inserted = false;
  const supabase = fakeSupabase((row) => {
    inserted = true;
    return { data: row, error: null };
  });

  const result = await createSourceSnapshot(supabase, "https://example.com/huge", { fetchOverride: fetchSuccess(huge) });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "snapshot_too_large");
  assert.equal(inserted, false);
});

test("createSourceSnapshot rejects a page with no extractable text", async () => {
  const html = "<html><head><style>body{}</style></head><body><script>x()</script></body></html>";
  const supabase = fakeSupabase((row) => ({ data: row, error: null }));

  const result = await createSourceSnapshot(supabase, "https://example.com/empty", { fetchOverride: fetchSuccess(html) });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "empty_canonical_text");
});

test("createSourceSnapshot surfaces a Supabase insert error", async () => {
  const supabase = fakeSupabase(() => ({ data: null, error: { message: "insert failed" } }));

  const result = await createSourceSnapshot(supabase, "https://example.com/article", {
    fetchOverride: fetchSuccess("<p>Some content here.</p>"),
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "insert_failed");
});
