# Task 5-B1 — Safe Fetch + Snapshots: Test Evidence, CI Guard, Rollback

Required PR attachments per Bible v7 Book VI §12. This PR is purely app-layer: `source_snapshots` and `claim_evidence` already exist (created, immutable, RLS-enabled, zero `anon`/`authenticated` grants beyond `claim_evidence` SELECT, in Task 5-0's migration `20260716120955_task5_structural_foundation.sql`). No new migration is added here.

## 1. What this PR ships

- `lib/safe-fetch.ts` — `safeFetchExternalSource(url)`, the sole entry point for fetching an externally-discovered URL. Layered design (pure URL validation -> DNS resolve+pin -> bytes-on-the-wire request -> redirect-following orchestrator) so each layer is independently unit-testable without touching real network/DNS/TLS.
- `lib/canonical-text.ts` — hand-rolled (no new dependency) HTML boilerplate stripper: drops `script/style/nav/header/footer/aside/...` subtrees, decodes entities, turns block-tag boundaries into line breaks, collapses whitespace. Produces the text `source_snapshots.normalized_text` stores and `claim_evidence` quotes are verified against.
- `lib/quote-verification.ts` — re-finds an LLM-produced quote in canonical text; exact match first, falling back to a controlled-whitespace-normalized match; rejects (never guesses) an absent or multiply-occurring quote.
- `lib/source-snapshot.ts` — orchestrates fetch -> canonical extraction -> hash -> storage-size policy -> `source_snapshots` insert. Client-agnostic (caller supplies the `SupabaseClient`), so it has no service-role dependency of its own.
- `external-fetch` CI guard (`scripts/ci-guards.mjs`) — fails the build if server-side code calls `fetch()`/`http(s).request()` directly outside an explicit, justified allowlist.

No cron/route wiring is added in this PR (Task 5-B1's scope per Bible v7 Book VI §12 is the pipeline itself; Task 5-B2 is the cron caller).

## 2. Network defense test evidence (`test/safe-fetch.test.ts`, 30 cases, all passing)

| Bible v7 §15 requirement | Test(s) |
|---|---|
| HTTPS only, no userinfo, port 443 only | `validateExternalUrl rejects http (non-https) URLs`, `... rejects URL userinfo`, `... rejects non-443 ports` |
| IDN canonicalization | `validateExternalUrl canonicalizes an IDN hostname to punycode` |
| Literal IP hosts rejected (decimal/octal/hex obfuscation closed off at the same point) | `... rejects literal IPv4 hosts`, `... rejects literal IPv6 hosts` |
| DNS A/AAAA private/link-local/loopback/metadata/mapped-IPv6 block (SSRF full regression) | `isBlockedIpv4 blocks loopback, private, link-local/metadata, CGNAT, and reserved ranges` (13 addresses incl. `169.254.169.254`), `isBlockedIpv4 allows ordinary public addresses`, `isBlockedIpv6 blocks loopback, unspecified, unique-local, and link-local`, `isBlockedIpv6 blocks IPv4-mapped addresses embedding a private/loopback IPv4`, `isBlockedIpv6 allows a mapped public IPv4 and an ordinary public IPv6`, `isBlockedIpAddress fails closed on an unparseable address` |
| Fetch-time pin/revalidation (DNS rebinding defense) | `resolvePinnedAddress pins to a single validated public address`, `... rejects a hostname that resolves only to internal addresses (DNS rebind attempt)`, `... picks a public address out of a mixed public/private answer set`, and end-to-end: `safeFetchExternalSource rejects a redirect whose target resolves only to an internal address` (redirect Location pointed at a hostname that resolves to `169.254.169.254`; the real, unmodified block fires on the second hop) |
| Manual redirect, max 2, each hop fully validated | `safeFetchExternalSource follows a redirect chain within the 2-hop limit`, `... rejects a redirect chain exceeding the hop limit` |
| Decompressed size cap (5 MB) | `safeFetchExternalSource decompresses a gzip-encoded response`, `... rejects a response whose decompressed size exceeds the cap` |
| HTML/XHTML-only, MIME sniff | `safeFetchExternalSource rejects a non-HTML content-type`, `... rejects an HTML content-type whose body is not actually HTML` (server lies about content-type; body sniff catches it) |
| Timeout | `safeFetchExternalSource surfaces a timeout for a slow upstream` |
| Retry-After / structured errors | `safeFetchExternalSource reports rate_limited with retryAfterSeconds on HTTP 429` |
| No auth/cookie/referrer, no JS execution | By construction — `performPinnedRequest`'s fixed header set never includes `Authorization`/`Cookie`/`Referer`, `Set-Cookie` is never read, and the module never runs a JS/browser engine (raw bytes only) |

Integration-level tests (redirect/compression/MIME/timeout/rate-limit) run against a real local `http` server bound to `127.0.0.1` — no external network, DNS, or TLS is used, so they're hermetic and fast (~1.5s for the whole 219-case suite). A test-only seam (`testAllowedIps`, threaded through `resolvePinnedAddress`/`SafeFetchDeps`, empty by default) lets these tests point the *unmodified* production block-checking code at the local server's own loopback address without weakening the block for any other address — verified directly by the DNS-rebind-via-redirect test above, which uses the same seam but leaves the real internal target un-allowlisted and confirms it still gets blocked.

## 3. Canonical text and quote verification test evidence

`test/canonical-text.test.ts` (6 cases): script/style subtrees fully removed (not just unwrapped), `nav`/`header`/`footer`/`aside` boilerplate dropped, named/numeric HTML entities decoded, block-tag boundaries become line breaks (no word fusion across paragraphs), whitespace runs collapsed, hash is deterministic and content-sensitive.

`test/quote-verification.test.ts` (6 cases): exact match, controlled-whitespace-normalized match, absent quote rejected, quote occurring more than once rejected (never silently disambiguated), empty quote rejected, and an offset round-trip check confirming `text.slice(start, end)` reproduces the original quote through the original (non-normalized) text.

`test/source-snapshot.test.ts` (5 cases): successful insert carries canonical text + `content_hash`/`normalized_text_hash`, a `safeFetchExternalSource` failure passes through without inserting, a canonical text over the inline-storage cap is rejected fail-closed (not truncated) without inserting, a page with no extractable text is rejected, and a Supabase insert error is surfaced as `insert_failed`.

## 4. Storage size policy

`source_snapshots.normalized_text`/`storage_path` is an XOR check constraint (Task 5-0 schema). This PR always writes to `normalized_text` (inline), capped at `MAX_INLINE_NORMALIZED_TEXT_CHARS` (500,000 characters — well under the 5 MB raw-fetch decompressed cap once markup/boilerplate is stripped). A page whose canonical text exceeds the cap is rejected outright rather than truncated: silently truncating could hide the very passage a later `claim_evidence` quote-verification step needs, which would be a correctness/trust regression worse than simply not snapshotting that page. `storage_path`/object-storage overflow handling stays schema-supported for a future PR if a genuinely oversized page is observed in practice; no object-storage bucket infrastructure exists yet and none is added here.

## 5. New finding: a pre-existing unguarded external fetch (`app/api/admin/check-source/route.ts`)

While building the `external-fetch` CI guard's allowlist, an existing admin-only route was found to call `fetch(parsed.toString(), { redirect: "follow", ... })` directly against an admin-operator-typed URL, with only a protocol check (`http`/`https`) and no SSRF protection (no private-IP block, no redirect cap, `MAX_BYTES` enforced only after the fact via manual byte counting). This was not caught by Task 5-0's brownfield grep (`docs/task5/TASK5_EXISTING_CODE_MAP.md` §1's search terms don't match this file's content) and so was missing from that inventory.

This PR does **not** migrate that route to `safeFetchExternalSource`, for the same reason `scripts/jobs/check-source-health.mjs` was explicitly deferred by the Task 5-0 code map: the threat model is different (a trusted admin operator typing in a URL they already intend to check, gated by `requireAdmin`) from `safeFetchExternalSource`'s threat model (a URL an AI/search step discovered at runtime, i.e. untrusted input), and `safeFetchExternalSource`'s HTML-only/443-only/5MB constraints don't necessarily fit that diagnostic tool's needs. It is explicitly allowlisted in the new CI guard with this justification, consistent with `check-source-health.mjs`'s existing deferred-hardening precedent. Recommend a follow-up Task 5-E (source-check unification) decision on whether to harden both at once.

## 6. Rollback

- Revert this PR's commit. All changes are additive new files plus two small, backward-compatible edits (`package.json`'s `test` script gains new files to compile/run; `scripts/ci-guards.mjs` gains one new guard function and its registration) — no existing file's behavior changes, and no database migration is included.
- The new `external-fetch` CI guard only affects future commits (it scans the working tree at CI time); reverting this PR removes the guard along with the primitive it protects.
- No `source_snapshots`/`claim_evidence` rows are written by anything in this PR (no caller exists yet) — Task 5-B2 is the first real caller. There is nothing to roll back at the data level.
