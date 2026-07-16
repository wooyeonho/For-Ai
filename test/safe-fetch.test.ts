import test from "node:test";
import assert from "node:assert/strict";
import * as http from "node:http";
import * as zlib from "node:zlib";
import type { AddressInfo } from "node:net";
import {
  validateExternalUrl,
  isBlockedIpv4,
  isBlockedIpv6,
  isBlockedIpAddress,
  resolvePinnedAddress,
  __testing,
  type DnsResolverLike,
} from "../lib/safe-fetch";

// ---------------------------------------------------------------------------
// Layer A -- validateExternalUrl
// ---------------------------------------------------------------------------

test("validateExternalUrl accepts a well-formed https URL on the default port", () => {
  const result = validateExternalUrl("https://example.com/article?x=1");
  assert.equal(result.ok, true);
});

test("validateExternalUrl rejects http (non-https) URLs", () => {
  const result = validateExternalUrl("http://example.com/");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "invalid_url");
});

test("validateExternalUrl rejects URL userinfo", () => {
  const result = validateExternalUrl("https://user:pass@example.com/");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "invalid_url");
});

test("validateExternalUrl rejects non-443 ports", () => {
  const result = validateExternalUrl("https://example.com:8443/");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "invalid_url");
});

test("validateExternalUrl rejects malformed URLs", () => {
  const result = validateExternalUrl("not a url");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "invalid_url");
});

test("validateExternalUrl rejects literal IPv4 hosts", () => {
  const result = validateExternalUrl("https://93.184.216.34/");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "blocked_host");
});

test("validateExternalUrl rejects literal IPv6 hosts", () => {
  const result = validateExternalUrl("https://[2001:db8::1]/");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "blocked_host");
});

test("validateExternalUrl canonicalizes an IDN hostname to punycode", () => {
  const result = validateExternalUrl("https://ünicode-example.test/");
  assert.equal(result.ok, true);
  if (result.ok) assert.match(result.url.hostname, /^xn--/);
});

// ---------------------------------------------------------------------------
// Layer B -- IP blocklist (SSRF full regression)
// ---------------------------------------------------------------------------

test("isBlockedIpv4 blocks loopback, private, link-local/metadata, CGNAT, and reserved ranges", () => {
  const blocked = [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // cloud metadata endpoint
    "169.254.0.1",
    "100.64.0.1", // CGNAT
    "0.0.0.0",
    "224.0.0.1", // multicast
    "240.0.0.1", // reserved
    "198.18.0.1", // benchmarking
    "192.0.2.1", // TEST-NET-1
  ];
  for (const ip of blocked) {
    assert.equal(isBlockedIpv4(ip), true, `expected ${ip} to be blocked`);
  }
});

test("isBlockedIpv4 allows ordinary public addresses", () => {
  const publicIps = ["8.8.8.8", "93.184.216.34", "1.1.1.1"];
  for (const ip of publicIps) {
    assert.equal(isBlockedIpv4(ip), false, `expected ${ip} to be allowed`);
  }
});

test("isBlockedIpv6 blocks loopback, unspecified, unique-local, and link-local", () => {
  const blocked = ["::1", "::", "fc00::1", "fd00::1", "fe80::1", "ff02::1"];
  for (const ip of blocked) {
    assert.equal(isBlockedIpv6(ip), true, `expected ${ip} to be blocked`);
  }
});

test("isBlockedIpv6 blocks IPv4-mapped addresses embedding a private/loopback IPv4", () => {
  assert.equal(isBlockedIpv6("::ffff:127.0.0.1"), true);
  assert.equal(isBlockedIpv6("::ffff:169.254.169.254"), true);
  assert.equal(isBlockedIpv6("::ffff:10.0.0.5"), true);
});

test("isBlockedIpv6 allows a mapped public IPv4 and an ordinary public IPv6", () => {
  assert.equal(isBlockedIpv6("::ffff:8.8.8.8"), false);
  assert.equal(isBlockedIpv6("2606:4700:4700::1111"), false);
});

test("isBlockedIpAddress fails closed on an unparseable address", () => {
  assert.equal(isBlockedIpAddress("not-an-ip"), true);
});

// ---------------------------------------------------------------------------
// Layer B -- resolvePinnedAddress (DNS rebinding defense)
// ---------------------------------------------------------------------------

function fakeResolver(v4: string[], v6: string[] = []): DnsResolverLike {
  return {
    async resolve4() {
      if (v4.length === 0) throw new Error("ENODATA");
      return v4;
    },
    async resolve6() {
      if (v6.length === 0) throw new Error("ENODATA");
      return v6;
    },
  };
}

test("resolvePinnedAddress pins to a single validated public address", async () => {
  const result = await resolvePinnedAddress("news.example", fakeResolver(["93.184.216.34"]));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.pinned.ip, "93.184.216.34");
});

test("resolvePinnedAddress rejects a hostname that resolves only to internal addresses (DNS rebind attempt)", async () => {
  const result = await resolvePinnedAddress("attacker.example", fakeResolver(["169.254.169.254", "127.0.0.1"]));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "dns_blocked_address");
});

test("resolvePinnedAddress picks a public address out of a mixed public/private answer set", async () => {
  const result = await resolvePinnedAddress("mixed.example", fakeResolver(["10.0.0.1", "8.8.8.8"]));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.pinned.ip, "8.8.8.8");
});

test("resolvePinnedAddress reports dns_resolution_failed when both A and AAAA fail", async () => {
  const result = await resolvePinnedAddress("nowhere.example", fakeResolver([]));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "dns_resolution_failed");
});

// ---------------------------------------------------------------------------
// Layer D -- full orchestrator against a local HTTP test server (no real
// network/DNS/TLS is used; the resolver and request transport are both
// injected so these tests are hermetic and fast).
// ---------------------------------------------------------------------------

async function startTestServer(handler: http.RequestListener): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function testDeps(port: number, overrides: Partial<Parameters<typeof __testing.runSafeFetch>[1]> = {}) {
  return {
    resolver: fakeResolver(["127.0.0.1"]),
    requestModule: http as unknown as typeof import("node:https"),
    useTls: false,
    timeoutMs: 2000,
    connectPort: port,
    // The real (unmodified) private/internal-address block stays active for
    // every IP except this local test server's own loopback address, so
    // these integration tests exercise the exact same orchestration path
    // safeFetchExternalSource uses in production.
    testAllowedIps: new Set(["127.0.0.1"]),
    ...overrides,
  };
}

test("safeFetchExternalSource (via runSafeFetch) succeeds on a plain HTML response", async () => {
  const { port, close } = await startTestServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<html><body><p>Hello world.</p></body></html>");
  });
  try {
    const result = await __testing.runSafeFetch("https://safe-fetch-test.invalid/page", testDeps(port));
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.httpStatus, 200);
      assert.ok(result.body.includes("Hello world."));
    }
  } finally {
    await close();
  }
});

test("safeFetchExternalSource follows a redirect chain within the 2-hop limit", async () => {
  const { port, close } = await startTestServer((req, res) => {
    if (req.url === "/start") {
      res.writeHead(302, { location: "/middle" });
      res.end();
    } else if (req.url === "/middle") {
      res.writeHead(302, { location: "/final" });
      res.end();
    } else {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html><body>Final page.</body></html>");
    }
  });
  try {
    const result = await __testing.runSafeFetch("https://safe-fetch-test.invalid/start", testDeps(port));
    assert.equal(result.ok, true);
    if (result.ok) assert.ok(result.body.includes("Final page."));
  } finally {
    await close();
  }
});

test("safeFetchExternalSource rejects a redirect chain exceeding the hop limit", async () => {
  const { port, close } = await startTestServer((req, res) => {
    const n = Number((req.url ?? "/0").slice(1));
    res.writeHead(302, { location: `/${n + 1}` });
    res.end();
  });
  try {
    const result = await __testing.runSafeFetch("https://safe-fetch-test.invalid/0", testDeps(port));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "too_many_redirects");
  } finally {
    await close();
  }
});

test("safeFetchExternalSource decompresses a gzip-encoded response", async () => {
  const body = "<html><body><p>Compressed content.</p></body></html>";
  const { port, close } = await startTestServer((req, res) => {
    const gz = zlib.gzipSync(Buffer.from(body, "utf-8"));
    res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
    res.end(gz);
  });
  try {
    const result = await __testing.runSafeFetch("https://safe-fetch-test.invalid/gz", testDeps(port));
    assert.equal(result.ok, true);
    if (result.ok) assert.ok(result.body.includes("Compressed content."));
  } finally {
    await close();
  }
});

test("safeFetchExternalSource rejects a response whose decompressed size exceeds the cap", async () => {
  const { port, close } = await startTestServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    const chunk = "<p>" + "a".repeat(1024 * 1024) + "</p>";
    for (let i = 0; i < 6; i++) res.write(chunk);
    res.end();
  });
  try {
    const result = await __testing.runSafeFetch("https://safe-fetch-test.invalid/big", testDeps(port));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "too_large");
  } finally {
    await close();
  }
});

test("safeFetchExternalSource rejects a non-HTML content-type", async () => {
  const { port, close } = await startTestServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"ok":true}');
  });
  try {
    const result = await __testing.runSafeFetch("https://safe-fetch-test.invalid/json", testDeps(port));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "unsupported_content_type");
  } finally {
    await close();
  }
});

test("safeFetchExternalSource rejects an HTML content-type whose body is not actually HTML", async () => {
  const { port, close } = await startTestServer((req, res) => {
    // MIME confusion: server claims HTML but the bytes are a JSON payload.
    res.writeHead(200, { "content-type": "text/html" });
    res.end('{"not":"html","at":"all"}');
  });
  try {
    const result = await __testing.runSafeFetch("https://safe-fetch-test.invalid/lie", testDeps(port));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "mime_mismatch");
  } finally {
    await close();
  }
});

test("safeFetchExternalSource surfaces a timeout for a slow upstream", async () => {
  const { port, close } = await startTestServer((_req, res) => {
    setTimeout(() => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html><body>Too slow.</body></html>");
    }, 500);
  });
  try {
    const result = await __testing.runSafeFetch("https://safe-fetch-test.invalid/slow", testDeps(port, { timeoutMs: 100 }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "timeout");
  } finally {
    await close();
  }
});

test("safeFetchExternalSource reports rate_limited with retryAfterSeconds on HTTP 429", async () => {
  const { port, close } = await startTestServer((req, res) => {
    res.writeHead(429, { "retry-after": "30" });
    res.end();
  });
  try {
    const result = await __testing.runSafeFetch("https://safe-fetch-test.invalid/limited", testDeps(port));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "rate_limited");
      assert.equal(result.error.retryAfterSeconds, 30);
    }
  } finally {
    await close();
  }
});

test("safeFetchExternalSource rejects a redirect whose target resolves only to an internal address", async () => {
  const { port, close } = await startTestServer((req, res) => {
    res.writeHead(302, { location: "https://internal-target.invalid/secret" });
    res.end();
  });
  try {
    const resolver: DnsResolverLike = {
      async resolve4(hostname: string) {
        if (hostname === "safe-fetch-test.invalid") return ["127.0.0.1"];
        if (hostname === "internal-target.invalid") return ["169.254.169.254"];
        throw new Error("ENODATA");
      },
      async resolve6() {
        throw new Error("ENODATA");
      },
    };
    const result = await __testing.runSafeFetch("https://safe-fetch-test.invalid/redir", testDeps(port, { resolver }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "dns_blocked_address");
  } finally {
    await close();
  }
});
