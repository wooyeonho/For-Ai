# Task 5-B1 — Safe fetch and source snapshots

## Implemented contract

- `safeFetchExternalSource` is the server-only entry point for untrusted source retrieval.
- URLs require HTTPS, no userinfo, DNS hostnames, and port 443.
- A/AAAA/CNAME resolution is repeated for every redirect hop. Every returned address is checked, and the selected public address is pinned into the TLS connection.
- Redirects are manual and capped at two; each destination passes the complete URL and DNS policy again.
- TLS certificate verification remains enabled. Requests send no authorization, cookie, or referrer header and execute no JavaScript.
- The request timeout is capped at 10 seconds. Compressed and decompressed bodies are bounded, with a 5MB decompressed ceiling.
- Only HTML/XHTML with a matching body signature is accepted. Retry-After is retained in structured errors.
- Canonical text removes executable and common boilerplate regions before hashing.
- Snapshot records store canonical text inline up to 1MB and require a private storage adapter above that size. The existing immutable `source_snapshots` table is the only persistence target.
- Quote evidence is accepted only when its exact/controlled-whitespace form occurs once; returned offsets refer to the original canonical text and include quote/context hashes.

## Integration and guard

The admin source-check route now uses the safe-fetch layer. The CI `external-source-fetch` guard fails if that route reintroduces direct `fetch` or if core safe-fetch controls disappear. The older curated source-health cron remains unchanged for Task 5-E, as recorded in the existing code map; it does not ingest AI-discovered URLs or create snapshots.

## Verification

- SSRF address ranges, loopback, link-local, metadata, IPv4-mapped IPv6
- IDN canonicalization and URL restrictions
- DNS rebinding between redirect hops
- redirect limit and downgrade rejection
- decompression limit and MIME mismatch
- structured timeout and Retry-After
- canonical text and immutable snapshot insert policy
- quote absent/multiple/controlled-whitespace cases

All tests use injected DNS/transport boundaries and do not contact external systems or persist fixture text.

## Rollback

Disable consumers of `safeFetchExternalSource` and revert the Task 5-B1 application commit. Existing immutable snapshots are retained. No schema migration or publication path is introduced by this task.
