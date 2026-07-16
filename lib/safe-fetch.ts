// Task 5-B1 — sole entry point for fetching an externally-discovered (i.e.
// not operator-curated) URL. Every network primitive here exists to defend
// against SSRF: a search/LLM step hands us a URL string it found at runtime,
// and we must not let that string reach an internal address, an oversized or
// mislabeled response, or an unbounded redirect chain.
//
// Do not call `fetch`/`http.request`/`https.request` directly for an
// externally-discovered URL anywhere else in the codebase — the
// `external-fetch` CI guard (scripts/ci-guards.mjs) enforces this.

import { isIP } from "node:net";
import { Buffer } from "node:buffer";
import * as http from "node:http";
import * as https from "node:https";
import * as zlib from "node:zlib";
import type { Duplex } from "node:stream";
import { Resolver as DnsResolver } from "node:dns/promises";

export type SafeFetchErrorCode =
  | "invalid_url"
  | "blocked_host"
  | "dns_resolution_failed"
  | "dns_blocked_address"
  | "too_many_redirects"
  | "redirect_blocked"
  | "redirect_missing_location"
  | "timeout"
  | "too_large"
  | "unsupported_content_type"
  | "mime_mismatch"
  | "connection_error"
  | "http_error"
  | "rate_limited";

export interface SafeFetchError {
  code: SafeFetchErrorCode;
  message: string;
  httpStatus?: number;
  retryAfterSeconds?: number;
}

export interface SafeFetchSuccess {
  ok: true;
  canonicalUrl: string;
  finalUrl: string;
  httpStatus: number;
  contentType: string;
  body: string;
  retrievedAt: string;
  etag: string | null;
  lastModified: string | null;
}

export type SafeFetchResult = SafeFetchSuccess | { ok: false; error: SafeFetchError };

const REQUIRED_PORT = 443;
const MAX_REDIRECTS = 2;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_DECOMPRESSED_BYTES = 5 * 1024 * 1024;
const ALLOWED_CONTENT_TYPE_RE = /^\s*(text\/html|application\/xhtml\+xml)\s*(;.*)?$/i;
const USER_AGENT = "For-AiSourceFetcher/1 (+https://for-ai-seven.vercel.app/api-docs)";
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

// ---------------------------------------------------------------------------
// Layer A — pure URL-shape validation (no I/O).
// ---------------------------------------------------------------------------

export type UrlValidationResult = { ok: true; url: URL } | { ok: false; error: SafeFetchError };

export function validateExternalUrl(rawUrl: string): UrlValidationResult {
  let url: URL;
  try {
    // WHATWG URL parsing canonicalizes IDN hostnames to ASCII punycode.
    url = new URL(rawUrl);
  } catch {
    return { ok: false, error: { code: "invalid_url", message: "Malformed URL." } };
  }
  if (url.protocol !== "https:") {
    return { ok: false, error: { code: "invalid_url", message: "Only https:// URLs are allowed." } };
  }
  if (url.username || url.password) {
    return { ok: false, error: { code: "invalid_url", message: "URL userinfo (user:pass@) is not allowed." } };
  }
  const port = url.port === "" ? REQUIRED_PORT : Number(url.port);
  if (port !== REQUIRED_PORT) {
    return { ok: false, error: { code: "invalid_url", message: "Only port 443 is allowed." } };
  }
  if (!url.hostname) {
    return { ok: false, error: { code: "invalid_url", message: "URL has no hostname." } };
  }
  // WHATWG URL keeps the [brackets] on a literal IPv6 hostname; strip them
  // before the IP-literal check below.
  const bareHostname =
    url.hostname.startsWith("[") && url.hostname.endsWith("]") ? url.hostname.slice(1, -1) : url.hostname;
  if (isIP(bareHostname)) {
    // Literal IP hosts (including decimal/octal/hex obfuscated forms, which
    // `new URL()` normalizes into dotted-quad form) skip DNS resolution
    // entirely and are always rejected — a resolvable hostname is required
    // so every fetch goes through the same DNS-time IP validation below.
    return { ok: false, error: { code: "blocked_host", message: "Literal IP-address hosts are not allowed." } };
  }
  return { ok: true, url };
}

// ---------------------------------------------------------------------------
// Layer B — DNS resolution + private/internal address blocking.
// ---------------------------------------------------------------------------

export interface DnsResolverLike {
  resolve4(hostname: string): Promise<string[]>;
  resolve6(hostname: string): Promise<string[]>;
}

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map((p) => Number(p));
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function ipv4InCidr(ip: string, base: string, prefix: number): boolean {
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

// RFC 1918/5735/6598/3927 + multicast/reserved + the cloud metadata address
// (169.254.169.254 falls inside the link-local block already listed here).
const BLOCKED_IPV4_CIDRS: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

export function isBlockedIpv4(ip: string): boolean {
  return BLOCKED_IPV4_CIDRS.some(([base, prefix]) => ipv4InCidr(ip, base, prefix));
}

function ipv6ToBigInt(ip: string): bigint {
  let head = ip;
  let tail = "";
  const doubleColon = ip.indexOf("::");
  if (doubleColon !== -1) {
    head = ip.slice(0, doubleColon);
    tail = ip.slice(doubleColon + 2);
  }
  const headParts = head.length ? head.split(":") : [];
  const tailParts = tail.length ? tail.split(":") : [];
  const missing = 8 - headParts.length - tailParts.length;
  const groups = [...headParts, ...Array(Math.max(missing, 0)).fill("0"), ...tailParts];
  let value = BigInt(0);
  for (const group of groups.slice(0, 8)) {
    value = (value << BigInt(16)) | BigInt(parseInt(group || "0", 16));
  }
  return value;
}

function ipv6InCidr(ip: string, base: string, prefix: number): boolean {
  const ipInt = ipv6ToBigInt(ip);
  const baseInt = ipv6ToBigInt(base);
  const full = (BigInt(1) << BigInt(128)) - BigInt(1);
  const mask = prefix === 0 ? BigInt(0) : (full << BigInt(128 - prefix)) & full;
  return (ipInt & mask) === (baseInt & mask);
}

const BLOCKED_IPV6_CIDRS: Array<[string, number]> = [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["64:ff9b::", 96], // NAT64 (embeds an IPv4 address — block the whole range)
  ["100::", 64], // discard-only
  ["2001:db8::", 32], // documentation
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
];

function extractIpv4MappedAddress(ip: string): string | null {
  const match = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(ip);
  return match ? match[1] : null;
}

export function isBlockedIpv6(ip: string): boolean {
  const mapped = extractIpv4MappedAddress(ip);
  if (mapped) return isBlockedIpv4(mapped);
  return BLOCKED_IPV6_CIDRS.some(([base, prefix]) => ipv6InCidr(ip, base, prefix));
}

export function isBlockedIpAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isBlockedIpv4(ip);
  if (version === 6) return isBlockedIpv6(ip);
  return true; // not a parseable IP => fail closed
}

export interface ResolvedAddress {
  ip: string;
  family: 4 | 6;
}

export type ResolveResult =
  | { ok: true; pinned: ResolvedAddress }
  | { ok: false; error: SafeFetchError };

export async function resolvePinnedAddress(
  hostname: string,
  resolver: DnsResolverLike,
  // Test-only seam: a small, explicit set of otherwise-blocked IPs (e.g. the
  // loopback address a local test server binds to) that may pass the block.
  // Empty by default so every existing/normal caller keeps the strict,
  // unmodified production behavior this function is unit-tested against.
  testAllowedIps: ReadonlySet<string> = new Set(),
): Promise<ResolveResult> {
  const addresses: ResolvedAddress[] = [];
  let attempted = false;
  try {
    const v4 = await resolver.resolve4(hostname);
    attempted = true;
    addresses.push(...v4.map((ip) => ({ ip, family: 4 as const })));
  } catch {
    /* try AAAA below */
  }
  try {
    const v6 = await resolver.resolve6(hostname);
    attempted = true;
    addresses.push(...v6.map((ip) => ({ ip, family: 6 as const })));
  } catch {
    /* handled by the empty-result checks below */
  }

  if (!attempted || addresses.length === 0) {
    return { ok: false, error: { code: "dns_resolution_failed", message: `Could not resolve ${hostname}.` } };
  }

  const allowed = addresses.filter((a) => testAllowedIps.has(a.ip) || !isBlockedIpAddress(a.ip));
  if (allowed.length === 0) {
    return {
      ok: false,
      error: { code: "dns_blocked_address", message: `${hostname} resolves only to blocked/internal addresses.` },
    };
  }
  // Pin to a single, already-validated address so the actual TCP/TLS
  // connection below can never re-resolve DNS and observe a different
  // (attacker-controlled, internal) answer — this is the DNS-rebinding
  // defense. Prefer IPv4 deterministically for reproducibility.
  const pinned = allowed.find((a) => a.family === 4) ?? allowed[0];
  return { ok: true, pinned };
}

// ---------------------------------------------------------------------------
// Layer C — the actual bytes-on-the-wire request to an already-pinned IP.
// Does not follow redirects; the caller (Layer D) re-validates and re-pins
// each hop independently.
// ---------------------------------------------------------------------------

export type RequestModule = Pick<typeof https, "request">;

export interface PinnedRequestOptions {
  hostname: string; // original hostname (for Host header + TLS SNI)
  pinnedIp: string;
  port: number;
  path: string; // pathname + search
  deadlineAt: number; // Date.now()-space deadline shared across all hops
  requestModule: RequestModule;
  useTls: boolean; // production always true; tests may pass a plain-http module
}

export interface PinnedResponse {
  httpStatus: number;
  headers: http.IncomingHttpHeaders;
  bodyBuffer: Buffer;
}

export type PinnedRequestResult = { ok: true; response: PinnedResponse } | { ok: false; error: SafeFetchError };

function pickDecompressStream(contentEncoding: string | undefined): NodeJS.ReadWriteStream | null {
  const encoding = (contentEncoding ?? "").trim().toLowerCase();
  if (encoding === "" || encoding === "identity") return null;
  if (encoding === "gzip" || encoding === "x-gzip") return zlib.createGunzip();
  if (encoding === "deflate") return zlib.createInflate();
  if (encoding === "br") return zlib.createBrotliDecompress();
  return null;
}

function performPinnedRequest(options: PinnedRequestOptions): Promise<PinnedRequestResult> {
  return new Promise((resolve) => {
    const remainingMs = options.deadlineAt - Date.now();
    if (remainingMs <= 0) {
      resolve({ ok: false, error: { code: "timeout", message: "Request deadline exceeded before this hop started." } });
      return;
    }

    let settled = false;
    const finish = (result: PinnedRequestResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const req = options.requestModule.request({
      hostname: options.pinnedIp,
      port: options.port,
      path: options.path,
      method: "GET",
      // TLS servername + Host header stay the original hostname so
      // certificate validation and virtual-hosting behave normally even
      // though the socket connects to the pinned IP, not a fresh DNS lookup.
      servername: options.useTls ? options.hostname : undefined,
      headers: {
        Host: options.hostname,
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Encoding": "gzip, deflate, br",
        // Deliberately no Authorization, Cookie, or Referer.
      },
      timeout: remainingMs,
      rejectUnauthorized: true,
    } as https.RequestOptions & { hostname: string }, (res: http.IncomingMessage) => {
      const httpStatus = res.statusCode ?? 0;
      const isSuccess = httpStatus >= 200 && httpStatus < 300;

      if (!isSuccess) {
        // Redirects (Location) and error statuses (e.g. 429's Retry-After)
        // are interpreted by the caller from status+headers alone; the
        // content-type/size/decompression checks below only apply to a
        // response we intend to treat as page content.
        res.resume();
        res.on("end", () => {
          finish({ ok: true, response: { httpStatus, headers: res.headers, bodyBuffer: Buffer.alloc(0) } });
        });
        res.on("error", () => {
          finish({ ok: false, error: { code: "connection_error", message: "Response stream error." } });
        });
        return;
      }

      const contentType = String(res.headers["content-type"] ?? "");
      if (!ALLOWED_CONTENT_TYPE_RE.test(contentType)) {
        res.destroy();
        finish({
          ok: false,
          error: { code: "unsupported_content_type", message: `Unsupported content-type: ${contentType || "(missing)"}` },
        });
        return;
      }

      const decompressor = pickDecompressStream(res.headers["content-encoding"] as string | undefined);
      const source: NodeJS.ReadableStream = decompressor ? res.pipe(decompressor) : res;

      const chunks: Buffer[] = [];
      let total = 0;
      let tooLarge = false;

      source.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > MAX_DECOMPRESSED_BYTES) {
          tooLarge = true;
          res.destroy();
          (source as Duplex).destroy?.();
          finish({ ok: false, error: { code: "too_large", message: `Decompressed body exceeded ${MAX_DECOMPRESSED_BYTES} bytes.` } });
          return;
        }
        chunks.push(chunk);
      });
      source.on("end", () => {
        if (tooLarge || settled) return;
        finish({
          ok: true,
          response: { httpStatus: res.statusCode ?? 0, headers: res.headers, bodyBuffer: Buffer.concat(chunks) },
        });
      });
      source.on("error", () => {
        finish({ ok: false, error: { code: "connection_error", message: "Response stream error." } });
      });
    });

    req.on("timeout", () => {
      req.destroy();
      finish({ ok: false, error: { code: "timeout", message: `Request exceeded ${remainingMs}ms deadline.` } });
    });
    req.on("error", () => {
      finish({ ok: false, error: { code: "connection_error", message: "Connection error." } });
    });
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Layer D — public orchestrator: validate, resolve+pin, fetch, follow
// redirects (each hop fully re-validated and re-pinned), decode.
// ---------------------------------------------------------------------------

export interface SafeFetchDeps {
  resolver: DnsResolverLike;
  requestModule: RequestModule;
  useTls: boolean;
  timeoutMs: number;
  // The TCP port actually connected to. Always REQUIRED_PORT (443) in
  // production -- validateExternalUrl already rejects any declared URL port
  // other than 443, so this only exists as a test seam for pointing the
  // pinned connection at a local ephemeral-port test server.
  connectPort: number;
  // Test-only seam forwarded to resolvePinnedAddress; see its doc comment.
  // Always empty in production.
  testAllowedIps: ReadonlySet<string>;
}

function defaultDeps(): SafeFetchDeps {
  return {
    resolver: new DnsResolver(),
    requestModule: https,
    useTls: true,
    timeoutMs: REQUEST_TIMEOUT_MS,
    connectPort: REQUIRED_PORT,
    testAllowedIps: new Set(),
  };
}

function parseRetryAfter(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const asDate = Date.parse(value);
  if (!Number.isNaN(asDate)) {
    return Math.max(0, Math.round((asDate - Date.now()) / 1000));
  }
  return undefined;
}

function decodeBody(buffer: Buffer, contentType: string): string {
  const charsetMatch = /charset=([^;]+)/i.exec(contentType);
  const charset = charsetMatch ? charsetMatch[1].trim().toLowerCase() : "utf-8";
  try {
    return buffer.toString(charset === "utf-8" || charset === "utf8" ? "utf-8" : "latin1");
  } catch {
    return buffer.toString("utf-8");
  }
}

function looksLikeHtml(text: string): boolean {
  const head = text.slice(0, 4096).toLowerCase();
  return head.includes("<html") || head.includes("<!doctype html") || (/<\s*[a-z!]/i.test(head) && head.includes("<"));
}

async function runSafeFetch(rawUrl: string, deps: SafeFetchDeps): Promise<SafeFetchResult> {
  const initialValidation = validateExternalUrl(rawUrl);
  if (initialValidation.ok === false) {
    const initialError: SafeFetchError = initialValidation.error;
    return { ok: false, error: initialError };
  }
  const canonicalUrl = initialValidation.url.toString();

  const deadlineAt = Date.now() + deps.timeoutMs;
  let currentUrl: URL = initialValidation.url;
  let hop = 0;

  while (true) {
    let hopUrl: URL;
    if (hop === 0) {
      hopUrl = currentUrl;
    } else {
      const hopValidation = validateExternalUrl(currentUrl.toString());
      if (hopValidation.ok === false) {
        return { ok: false, error: { code: "redirect_blocked", message: hopValidation.error.message } };
      }
      hopUrl = hopValidation.url;
    }

    const resolved = await resolvePinnedAddress(hopUrl.hostname, deps.resolver, deps.testAllowedIps);
    if (resolved.ok === false) {
      const resolveError: SafeFetchError = resolved.error;
      return { ok: false, error: resolveError };
    }

    const result = await performPinnedRequest({
      hostname: hopUrl.hostname,
      pinnedIp: resolved.pinned.ip,
      port: deps.connectPort,
      path: `${hopUrl.pathname}${hopUrl.search}`,
      deadlineAt,
      requestModule: deps.requestModule,
      useTls: deps.useTls,
    });
    if (result.ok === false) {
      const requestError: SafeFetchError = result.error;
      return { ok: false, error: requestError };
    }

    const { response } = result;

    if (REDIRECT_STATUS_CODES.has(response.httpStatus)) {
      const location = response.headers.location;
      if (!location) {
        return { ok: false, error: { code: "redirect_missing_location", message: `Redirect status ${response.httpStatus} without a Location header.` } };
      }
      hop += 1;
      if (hop > MAX_REDIRECTS) {
        return { ok: false, error: { code: "too_many_redirects", message: `Exceeded ${MAX_REDIRECTS} redirects.` } };
      }
      let nextUrl: URL;
      try {
        nextUrl = new URL(location, hopUrl);
      } catch {
        return { ok: false, error: { code: "redirect_blocked", message: "Redirect Location header is not a valid URL." } };
      }
      currentUrl = nextUrl;
      continue;
    }

    if (response.httpStatus === 429 || response.httpStatus === 503) {
      return {
        ok: false,
        error: {
          code: response.httpStatus === 429 ? "rate_limited" : "http_error",
          message: `Upstream responded ${response.httpStatus}.`,
          httpStatus: response.httpStatus,
          retryAfterSeconds: parseRetryAfter(response.headers["retry-after"] as string | undefined),
        },
      };
    }

    if (response.httpStatus < 200 || response.httpStatus >= 300) {
      return { ok: false, error: { code: "http_error", message: `Upstream responded ${response.httpStatus}.`, httpStatus: response.httpStatus } };
    }

    const contentType = String(response.headers["content-type"] ?? "");
    const body = decodeBody(response.bodyBuffer, contentType);
    if (!looksLikeHtml(body)) {
      return { ok: false, error: { code: "mime_mismatch", message: "Response body does not look like HTML despite an HTML content-type." } };
    }

    return {
      ok: true,
      canonicalUrl,
      finalUrl: hopUrl.toString(),
      httpStatus: response.httpStatus,
      contentType,
      body,
      retrievedAt: new Date().toISOString(),
      etag: (response.headers.etag as string | undefined) ?? null,
      lastModified: (response.headers["last-modified"] as string | undefined) ?? null,
    };
  }
}

/**
 * The sole entry point for fetching an externally-discovered URL. See the
 * module header and Bible v7 Book IV section 15 for the full defense list.
 */
export async function safeFetchExternalSource(rawUrl: string): Promise<SafeFetchResult> {
  return runSafeFetch(rawUrl, defaultDeps());
}

// Test-only seams. Never imported by production call sites — the CI guard
// only inspects raw fetch/http(s).request call sites, not this export.
export const __testing = {
  validateExternalUrl,
  isBlockedIpAddress,
  isBlockedIpv4,
  isBlockedIpv6,
  resolvePinnedAddress,
  runSafeFetch,
  MAX_DECOMPRESSED_BYTES,
  MAX_REDIRECTS,
};
