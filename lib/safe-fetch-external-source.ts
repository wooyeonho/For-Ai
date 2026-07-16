import "server-only";

import { createHash } from "node:crypto";
import { resolve4, resolve6, resolveCname } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 2;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const INLINE_SNAPSHOT_BYTES = 1024 * 1024;
const MAX_DNS_DEPTH = 8;

export type SafeFetchErrorCode =
  | "invalid_url"
  | "blocked_address"
  | "dns_failed"
  | "redirect_limit"
  | "invalid_redirect"
  | "timeout"
  | "network_error"
  | "http_status"
  | "body_too_large"
  | "unsupported_encoding"
  | "unsupported_mime"
  | "mime_mismatch"
  | "empty_canonical_text"
  | "snapshot_storage_required"
  | "snapshot_write_failed"
  | "quote_absent"
  | "quote_multiple";

export class SafeFetchError extends Error {
  constructor(
    public readonly code: SafeFetchErrorCode,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "SafeFetchError";
  }
}

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

interface TransportRequest {
  url: URL;
  pinnedAddress: ResolvedAddress;
  timeoutMs: number;
}

interface TransportResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

export interface SafeFetchDependencies {
  resolveHost?: (hostname: string) => Promise<ResolvedAddress[]>;
  request?: (input: TransportRequest) => Promise<TransportResponse>;
  now?: () => Date;
}

export interface SafeFetchExternalSourceOptions {
  timeoutMs?: number;
  dependencies?: SafeFetchDependencies;
}

export interface SafeFetchExternalSourceResult {
  canonicalUrl: string;
  finalUrl: string;
  retrievedAt: string;
  httpStatus: number;
  contentType: string;
  contentHash: string;
  normalizedTextHash: string;
  canonicalText: string;
  title: string | null;
  etag: string | null;
  lastModified: string | null;
}

export interface SourceSnapshotInsert {
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

export interface SnapshotTextStorage {
  put(normalizedText: string, normalizedTextHash: string): Promise<string>;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalizeExternalUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new SafeFetchError("invalid_url", "Source URL is invalid");
  }
  if (url.protocol !== "https:") {
    throw new SafeFetchError("invalid_url", "Only HTTPS source URLs are allowed");
  }
  if (url.username || url.password) {
    throw new SafeFetchError("invalid_url", "URL userinfo is not allowed");
  }
  if (url.port && url.port !== "443") {
    throw new SafeFetchError("invalid_url", "Only port 443 is allowed");
  }
  if (!url.hostname || isIP(url.hostname) !== 0) {
    throw new SafeFetchError("invalid_url", "Source URLs must use a DNS hostname");
  }
  url.hash = "";
  url.port = "";
  return url;
}

function parseIpv4(address: string): number | null {
  if (isIP(address) !== 4) return null;
  return address.split(".").reduce((value, octet) => (value << 8) + Number(octet), 0) >>> 0;
}

function ipv4InCidr(value: number, base: number, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (base & mask);
}

function expandIpv6(address: string): number[] | null {
  if (isIP(address) !== 6) return null;
  let normalized = address.toLowerCase().split("%")[0];
  const ipv4Tail = normalized.match(/(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (ipv4Tail) {
    const ipv4 = parseIpv4(ipv4Tail);
    if (ipv4 === null) return null;
    normalized = normalized.slice(0, -ipv4Tail.length) + `${(ipv4 >>> 16).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
  }
  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const groups = [...left, ...Array(missing).fill("0"), ...right];
  if (groups.length !== 8) return null;
  const values: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    values.push(Number.parseInt(group, 16));
  }
  return values;
}

function ipv6InCidr(value: number[], base: number[], prefix: number): boolean {
  const wholeGroups = Math.floor(prefix / 16);
  const remainingBits = prefix % 16;
  for (let index = 0; index < wholeGroups; index += 1) {
    if (value[index] !== base[index]) return false;
  }
  if (remainingBits === 0) return true;
  const mask = (0xffff << (16 - remainingBits)) & 0xffff;
  return (value[wholeGroups] & mask) === (base[wholeGroups] & mask);
}

export function isBlockedNetworkAddress(address: string): boolean {
  const ipv4 = parseIpv4(address);
  if (ipv4 !== null) {
    const ranges: Array<[string, number]> = [
      ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
      ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
      ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
      ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
    ];
    return ranges.some(([base, prefix]) => ipv4InCidr(ipv4, parseIpv4(base)!, prefix));
  }

  const ipv6 = expandIpv6(address);
  if (ipv6 === null) return true;
  const mappedPrefix = expandIpv6("::ffff:0:0")!;
  if (ipv6InCidr(ipv6, mappedPrefix, 96)) {
    const embedded = ((ipv6[6] << 16) | ipv6[7]) >>> 0;
    return isBlockedNetworkAddress([
      (embedded >>> 24) & 255, (embedded >>> 16) & 255,
      (embedded >>> 8) & 255, embedded & 255,
    ].join("."));
  }
  const ranges: Array<[string, number]> = [
    ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["100::", 64],
    ["2001::", 32], ["2001:2::", 48], ["2001:10::", 28], ["2001:db8::", 32],
    ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
  ];
  return ranges.some(([base, prefix]) => ipv6InCidr(ipv6, expandIpv6(base)!, prefix));
}

async function defaultResolveHost(hostname: string): Promise<ResolvedAddress[]> {
  const seen = new Set<string>();
  const addresses: ResolvedAddress[] = [];

  async function visit(name: string, depth: number): Promise<void> {
    const canonicalName = name.toLowerCase().replace(/\.$/, "");
    if (seen.has(canonicalName)) return;
    if (depth > MAX_DNS_DEPTH) throw new SafeFetchError("dns_failed", "DNS CNAME chain is too deep");
    seen.add(canonicalName);
    const [v4, v6, cnames] = await Promise.all([
      resolve4(canonicalName).catch(() => []),
      resolve6(canonicalName).catch(() => []),
      resolveCname(canonicalName).catch(() => []),
    ]);
    addresses.push(...v4.map((address) => ({ address, family: 4 as const })));
    addresses.push(...v6.map((address) => ({ address, family: 6 as const })));
    for (const cname of cnames) await visit(cname, depth + 1);
  }

  await visit(hostname, 0);
  const unique = [...new Map(addresses.map((item) => [`${item.family}:${item.address}`, item])).values()];
  if (unique.length === 0) throw new SafeFetchError("dns_failed", "DNS returned no A or AAAA address");
  return unique;
}

function normalizeHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).flatMap(([key, value]) =>
    value === undefined ? [] : [[key.toLowerCase(), Array.isArray(value) ? value.join(", ") : value]],
  ));
}

async function defaultTransport(input: TransportRequest): Promise<TransportResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      callback();
    };
    const req = httpsRequest(input.url, {
      method: "GET",
      headers: {
        "user-agent": "For-Ai-SafeFetch/1.0",
        accept: "text/html,application/xhtml+xml;q=0.9",
        "accept-encoding": "gzip, deflate, br",
      },
      servername: input.url.hostname,
      rejectUnauthorized: true,
      lookup: (_hostname, _options, callback) => callback(null, input.pinnedAddress.address, input.pinnedAddress.family),
    }, (response) => {
      const chunks: Buffer[] = [];
      let total = 0;
      response.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > MAX_BODY_BYTES) {
          response.destroy(new SafeFetchError("body_too_large", "Compressed response exceeded 5MB"));
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      response.on("error", (error) => finish(() => reject(error instanceof SafeFetchError
          ? error
          : new SafeFetchError("network_error", "Source response failed", { cause: error.message }))));
      response.on("end", () => finish(() => resolve({
          status: response.statusCode ?? 0,
          headers: normalizeHeaders(response.headers),
          body: Buffer.concat(chunks),
        })));
    });
    const deadline = setTimeout(() => {
      req.destroy(new SafeFetchError("timeout", "Source fetch timed out"));
    }, input.timeoutMs);
    req.on("error", (error) => finish(() => reject(error instanceof SafeFetchError
        ? error
        : new SafeFetchError("network_error", "Source fetch failed", { cause: error.message }))));
    req.end();
  });
}

async function decompress(body: Buffer, encoding: string): Promise<Buffer> {
  const normalized = encoding.trim().toLowerCase();
  if (!normalized || normalized === "identity") {
    if (body.length > MAX_BODY_BYTES) throw new SafeFetchError("body_too_large", "Response exceeded 5MB");
    return body;
  }
  const decoder = normalized === "gzip" ? createGunzip()
    : normalized === "deflate" ? createInflate()
      : normalized === "br" ? createBrotliDecompress()
        : null;
  if (!decoder) throw new SafeFetchError("unsupported_encoding", "Unsupported content encoding", { encoding });

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    Readable.from(body).pipe(decoder);
    decoder.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        decoder.destroy(new SafeFetchError("body_too_large", "Decompressed response exceeded 5MB"));
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    decoder.on("end", () => resolve(Buffer.concat(chunks)));
    decoder.on("error", (error) => reject(error instanceof SafeFetchError
      ? error
      : new SafeFetchError("network_error", "Response decompression failed", { cause: error.message })));
  });
}

function parseRetryAfter(value: string | undefined, now: Date): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value.trim())) return Number(value.trim());
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, Math.ceil((timestamp - now.getTime()) / 1000)) : null;
}

function assertHtmlMime(headers: Record<string, string>, body: Buffer): string {
  const contentType = (headers["content-type"] ?? "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "text/html" && contentType !== "application/xhtml+xml") {
    throw new SafeFetchError("unsupported_mime", "Only HTML/XHTML sources are allowed", { contentType });
  }
  const prefix = body.subarray(0, 2048);
  if (prefix.includes(0) || !/(?:<!doctype\s+html|<html|<head|<body|<\?xml)/i.test(prefix.toString("utf8"))) {
    throw new SafeFetchError("mime_mismatch", "Response body does not look like HTML/XHTML");
  }
  return contentType;
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, key: string) => {
    if (key[0] === "#") {
      const codePoint = key[1]?.toLowerCase() === "x" ? Number.parseInt(key.slice(2), 16) : Number.parseInt(key.slice(1), 10);
      return Number.isFinite(codePoint) && codePoint > 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : entity;
    }
    return named[key.toLowerCase()] ?? entity;
  });
}

export function extractCanonicalText(html: string): string {
  const withoutBoilerplate = html
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<(script|style|noscript|svg|canvas|nav|header|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(br|hr)\b[^>]*>/gi, "\n")
    .replace(/<\/(p|div|section|article|main|h[1-6]|li|tr)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeHtmlEntities(withoutBoilerplate)
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractHtmlTitle(html: string): string | null {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
  if (!match) return null;
  const title = decodeHtmlEntities(match[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  return title || null;
}

export async function safeFetchExternalSource(
  input: string,
  options: SafeFetchExternalSourceOptions = {},
): Promise<SafeFetchExternalSourceResult> {
  const dependencies = options.dependencies ?? {};
  const resolveHost = dependencies.resolveHost ?? defaultResolveHost;
  const request = dependencies.request ?? defaultTransport;
  const now = dependencies.now ?? (() => new Date());
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1), DEFAULT_TIMEOUT_MS);
  const canonical = canonicalizeExternalUrl(input);
  let current = canonical;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const addresses = await resolveHost(current.hostname).catch((error: unknown) => {
      if (error instanceof SafeFetchError) throw error;
      throw new SafeFetchError("dns_failed", "DNS resolution failed", { cause: error instanceof Error ? error.message : String(error) });
    });
    if (addresses.length === 0) throw new SafeFetchError("dns_failed", "DNS returned no address");
    const blocked = addresses.find(({ address }) => isBlockedNetworkAddress(address));
    if (blocked) throw new SafeFetchError("blocked_address", "DNS resolved to a blocked address", { family: blocked.family });

    // The validated address is pinned into the TLS socket lookup callback. A
    // second DNS answer cannot replace it between validation and connect.
    const response = await request({ url: current, pinnedAddress: addresses[0], timeoutMs });
    if (response.status >= 300 && response.status < 400) {
      if (redirectCount === MAX_REDIRECTS) throw new SafeFetchError("redirect_limit", "Source exceeded two redirects");
      const location = response.headers.location;
      if (!location) throw new SafeFetchError("invalid_redirect", "Redirect omitted Location header");
      try {
        current = canonicalizeExternalUrl(new URL(location, current).toString());
      } catch (error) {
        if (error instanceof SafeFetchError) throw new SafeFetchError("invalid_redirect", error.message);
        throw error;
      }
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new SafeFetchError("http_status", "Source returned a non-success status", {
        status: response.status,
        retryAfterSeconds: parseRetryAfter(response.headers["retry-after"], now()),
      });
    }

    const body = await decompress(response.body, response.headers["content-encoding"] ?? "identity");
    const contentType = assertHtmlMime(response.headers, body);
    const html = body.toString("utf8");
    const canonicalText = extractCanonicalText(html);
    if (!canonicalText) throw new SafeFetchError("empty_canonical_text", "HTML produced no canonical text");
    return {
      canonicalUrl: canonical.toString(),
      finalUrl: current.toString(),
      retrievedAt: now().toISOString(),
      httpStatus: response.status,
      contentType,
      contentHash: sha256(body),
      normalizedTextHash: sha256(canonicalText),
      canonicalText,
      title: extractHtmlTitle(html),
      etag: response.headers.etag ?? null,
      lastModified: response.headers["last-modified"] ?? null,
    };
  }
  throw new SafeFetchError("redirect_limit", "Source exceeded two redirects");
}

export async function buildSourceSnapshotInsert(
  result: SafeFetchExternalSourceResult,
  sourceId: string | null = null,
  storage?: SnapshotTextStorage,
): Promise<SourceSnapshotInsert> {
  const inline = Buffer.byteLength(result.canonicalText, "utf8") <= INLINE_SNAPSHOT_BYTES;
  if (!inline && !storage) {
    throw new SafeFetchError("snapshot_storage_required", "Canonical text exceeds the 1MB inline snapshot policy");
  }
  const storagePath = inline ? null : await storage!.put(result.canonicalText, result.normalizedTextHash);
  return {
    source_id: sourceId,
    canonical_url: result.canonicalUrl,
    final_url: result.finalUrl,
    retrieved_at: result.retrievedAt,
    http_status: result.httpStatus,
    content_type: result.contentType,
    content_hash: result.contentHash,
    normalized_text_hash: result.normalizedTextHash,
    normalized_text: inline ? result.canonicalText : null,
    storage_path: storagePath,
    etag: result.etag,
    last_modified: result.lastModified,
  };
}

export async function fetchAndStoreSourceSnapshot(
  supabase: SupabaseClient,
  input: string,
  sourceId: string | null = null,
  options: SafeFetchExternalSourceOptions & { storage?: SnapshotTextStorage } = {},
): Promise<Record<string, unknown>> {
  const fetched = await safeFetchExternalSource(input, options);
  const insert = await buildSourceSnapshotInsert(fetched, sourceId, options.storage);
  const { data, error } = await supabase.from("source_snapshots").insert(insert).select("*").single();
  if (error || !data) throw new SafeFetchError("snapshot_write_failed", "Source snapshot insert failed", { cause: error?.message });
  return data as Record<string, unknown>;
}

function controlledWhitespace(value: string): { text: string; starts: number[]; ends: number[] } {
  let text = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let index = 0;
  while (index < value.length) {
    if (/\s/u.test(value[index])) {
      const start = index;
      while (index < value.length && /\s/u.test(value[index])) index += 1;
      if (text && text[text.length - 1] !== " ") {
        text += " "; starts.push(start); ends.push(index);
      }
      continue;
    }
    text += value[index]; starts.push(index); ends.push(index + 1); index += 1;
  }
  if (text.endsWith(" ")) { text = text.slice(0, -1); starts.pop(); ends.pop(); }
  return { text, starts, ends };
}

export interface VerifiedQuote {
  quoteStart: number;
  quoteEnd: number;
  quoteHash: string;
  contextHash: string;
  matchedText: string;
}

export function verifyQuoteInCanonicalText(canonicalText: string, quote: string): VerifiedQuote {
  const haystack = controlledWhitespace(canonicalText);
  const needle = controlledWhitespace(quote).text;
  if (!needle) throw new SafeFetchError("quote_absent", "Quote is empty after whitespace normalization");
  const occurrences: number[] = [];
  let from = 0;
  while (from <= haystack.text.length - needle.length) {
    const found = haystack.text.indexOf(needle, from);
    if (found < 0) break;
    occurrences.push(found);
    from = found + 1;
  }
  if (occurrences.length === 0) throw new SafeFetchError("quote_absent", "Quote was not found in canonical text");
  if (occurrences.length > 1) throw new SafeFetchError("quote_multiple", "Quote occurs more than once in canonical text", { occurrences: occurrences.length });
  const normalizedStart = occurrences[0];
  const normalizedEnd = normalizedStart + needle.length;
  const quoteStart = haystack.starts[normalizedStart];
  const quoteEnd = haystack.ends[normalizedEnd - 1];
  const matchedText = canonicalText.slice(quoteStart, quoteEnd);
  const context = canonicalText.slice(Math.max(0, quoteStart - 160), Math.min(canonicalText.length, quoteEnd + 160));
  return { quoteStart, quoteEnd, matchedText, quoteHash: sha256(matchedText), contextHash: sha256(context) };
}
