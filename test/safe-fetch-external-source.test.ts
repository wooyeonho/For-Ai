import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import {
  SafeFetchError,
  buildSourceSnapshotInsert,
  canonicalizeExternalUrl,
  extractCanonicalText,
  isBlockedNetworkAddress,
  safeFetchExternalSource,
  verifyQuoteInCanonicalText,
  type SafeFetchDependencies,
} from "../lib/safe-fetch-external-source";

const PUBLIC_ADDRESS = [{ address: "93.184.216.34", family: 4 as const }];

function htmlResponse(body = "<!doctype html><html><body><main>Trusted source text</main></body></html>") {
  return { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: Buffer.from(body) };
}

function dependencies(
  request: NonNullable<SafeFetchDependencies["request"]>,
  resolveHost: NonNullable<SafeFetchDependencies["resolveHost"]> = async () => PUBLIC_ADDRESS,
): SafeFetchDependencies {
  return { request, resolveHost, now: () => new Date("2026-07-17T00:00:00.000Z") };
}

test("canonicalizeExternalUrl enforces HTTPS, no userinfo, port 443, and DNS hosts", () => {
  for (const value of ["http://example.com", "https://user:pass@example.com", "https://example.com:8443/path", "https://127.0.0.1/path"]) {
    assert.throws(() => canonicalizeExternalUrl(value), (error: unknown) => error instanceof SafeFetchError && error.code === "invalid_url");
  }
  assert.equal(canonicalizeExternalUrl("https://bücher.example:443/a#fragment").toString(), "https://xn--bcher-kva.example/a");
});

test("network classifier blocks private, loopback, link-local, metadata, documentation, and mapped IPv6", () => {
  for (const address of [
    "10.0.0.1", "127.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.1.1",
    "198.51.100.9", "::1", "fe80::1", "fc00::1", "2001:db8::1", "::ffff:192.168.1.1",
  ]) assert.equal(isBlockedNetworkAddress(address), true, address);
  assert.equal(isBlockedNetworkAddress("93.184.216.34"), false);
  assert.equal(isBlockedNetworkAddress("2606:2800:220:1:248:1893:25c8:1946"), false);
});

test("safe fetch pins a validated address and returns canonical text and hashes", async () => {
  let pinned = "";
  const result = await safeFetchExternalSource("https://example.com/source#part", {
    dependencies: dependencies(async (input) => {
      pinned = input.pinnedAddress.address;
      return htmlResponse("<!doctype html><html><body><nav>Menu</nav><main>Hello <b>world</b></main><script>secret()</script></body></html>");
    }),
  });
  assert.equal(pinned, "93.184.216.34");
  assert.equal(result.canonicalUrl, "https://example.com/source");
  assert.equal(result.finalUrl, "https://example.com/source");
  assert.equal(result.canonicalText, "Hello world");
  assert.match(result.contentHash, /^[a-f0-9]{64}$/);
  assert.match(result.normalizedTextHash, /^[a-f0-9]{64}$/);
});

test("all DNS answers are validated before any socket request", async () => {
  let requested = false;
  await assert.rejects(
    safeFetchExternalSource("https://example.com", {
      dependencies: dependencies(
        async () => { requested = true; return htmlResponse(); },
        async () => [...PUBLIC_ADDRESS, { address: "169.254.169.254", family: 4 }],
      ),
    }),
    (error: unknown) => error instanceof SafeFetchError && error.code === "blocked_address",
  );
  assert.equal(requested, false);
});

test("redirect hops re-resolve and block a DNS-rebinding answer", async () => {
  let resolutions = 0;
  let requests = 0;
  await assert.rejects(
    safeFetchExternalSource("https://example.com/start", {
      dependencies: dependencies(
        async () => { requests += 1; return { status: 302, headers: { location: "https://target.example/final" }, body: Buffer.alloc(0) }; },
        async () => ++resolutions === 1 ? PUBLIC_ADDRESS : [{ address: "127.0.0.1", family: 4 }],
      ),
    }),
    (error: unknown) => error instanceof SafeFetchError && error.code === "blocked_address",
  );
  assert.equal(requests, 1);
  assert.equal(resolutions, 2);
});

test("redirect limit is two and every Location must remain allowed HTTPS", async () => {
  await assert.rejects(
    safeFetchExternalSource("https://example.com/0", {
      dependencies: dependencies(async (input) => ({
        status: 302,
        headers: { location: `https://example.com/${Number(input.url.pathname.slice(1)) + 1}` },
        body: Buffer.alloc(0),
      })),
    }),
    (error: unknown) => error instanceof SafeFetchError && error.code === "redirect_limit",
  );
  await assert.rejects(
    safeFetchExternalSource("https://example.com", {
      dependencies: dependencies(async () => ({ status: 302, headers: { location: "http://example.com" }, body: Buffer.alloc(0) })),
    }),
    (error: unknown) => error instanceof SafeFetchError && error.code === "invalid_redirect",
  );
});

test("decompressed response size is capped at 5MB", async () => {
  const compressed = gzipSync(`<!doctype html><html><body>${"a".repeat(5 * 1024 * 1024)}</body></html>`);
  await assert.rejects(
    safeFetchExternalSource("https://example.com", {
      dependencies: dependencies(async () => ({ status: 200, headers: { "content-type": "text/html", "content-encoding": "gzip" }, body: compressed })),
    }),
    (error: unknown) => error instanceof SafeFetchError && error.code === "body_too_large",
  );
});

test("HTML content type and body sniff must both pass", async () => {
  await assert.rejects(
    safeFetchExternalSource("https://example.com", {
      dependencies: dependencies(async () => ({ status: 200, headers: { "content-type": "application/pdf" }, body: Buffer.from("%PDF") })),
    }),
    (error: unknown) => error instanceof SafeFetchError && error.code === "unsupported_mime",
  );
  await assert.rejects(
    safeFetchExternalSource("https://example.com", {
      dependencies: dependencies(async () => ({ status: 200, headers: { "content-type": "text/html" }, body: Buffer.from("not markup") })),
    }),
    (error: unknown) => error instanceof SafeFetchError && error.code === "mime_mismatch",
  );
});

test("Retry-After is preserved in a structured status error", async () => {
  await assert.rejects(
    safeFetchExternalSource("https://example.com", {
      dependencies: dependencies(async () => ({ status: 429, headers: { "retry-after": "120" }, body: Buffer.alloc(0) })),
    }),
    (error: unknown) => error instanceof SafeFetchError && error.code === "http_status" && error.details.retryAfterSeconds === 120,
  );
});

test("transport timeout remains a structured failure", async () => {
  await assert.rejects(
    safeFetchExternalSource("https://example.com", {
      timeoutMs: 50_000,
      dependencies: dependencies(async (input) => {
        assert.equal(input.timeoutMs, 10_000);
        throw new SafeFetchError("timeout", "timed out");
      }),
    }),
    (error: unknown) => error instanceof SafeFetchError && error.code === "timeout",
  );
});

test("canonical extractor removes boilerplate and decodes controlled entities", () => {
  const text = extractCanonicalText("<html><body><header>Logo</header><article><h1>A &amp; B</h1><p>First&nbsp;line</p></article><footer>Legal</footer></body></html>");
  assert.equal(text, "A & B\nFirst line");
});

test("quote verification accepts controlled whitespace and returns original offsets/hash", () => {
  const canonical = "Before. The source\n says 42 percent. After.";
  const verified = verifyQuoteInCanonicalText(canonical, "The source says 42 percent.");
  assert.equal(verified.matchedText, "The source\n says 42 percent.");
  assert.equal(canonical.slice(verified.quoteStart, verified.quoteEnd), verified.matchedText);
  assert.match(verified.quoteHash, /^[a-f0-9]{64}$/);
  assert.match(verified.contextHash, /^[a-f0-9]{64}$/);
});

test("quote verification rejects absent and non-unique quotes", () => {
  assert.throws(() => verifyQuoteInCanonicalText("one two", "three"), (error: unknown) => error instanceof SafeFetchError && error.code === "quote_absent");
  assert.throws(() => verifyQuoteInCanonicalText("same quote; same quote", "same quote"), (error: unknown) => error instanceof SafeFetchError && error.code === "quote_multiple");
});

test("snapshot record stores small canonical text inline", async () => {
  const fetched = await safeFetchExternalSource("https://example.com", { dependencies: dependencies(async () => htmlResponse()) });
  const insert = await buildSourceSnapshotInsert(fetched, "source-1");
  assert.equal(insert.source_id, "source-1");
  assert.equal(insert.normalized_text, "Trusted source text");
  assert.equal(insert.storage_path, null);
});

test("snapshot record sends canonical text over 1MB to private storage", async () => {
  let storedHash = "";
  const insert = await buildSourceSnapshotInsert({
    canonicalUrl: "https://example.com/large",
    finalUrl: "https://example.com/large",
    retrievedAt: "2026-07-17T00:00:00.000Z",
    httpStatus: 200,
    contentType: "text/html",
    contentHash: "a".repeat(64),
    normalizedTextHash: "b".repeat(64),
    canonicalText: "x".repeat(1024 * 1024 + 1),
    title: null,
    etag: null,
    lastModified: null,
  }, null, {
    async put(_text, hash) { storedHash = hash; return "private/source-snapshots/large.txt"; },
  });
  assert.equal(storedHash, "b".repeat(64));
  assert.equal(insert.normalized_text, null);
  assert.equal(insert.storage_path, "private/source-snapshots/large.txt");
});
