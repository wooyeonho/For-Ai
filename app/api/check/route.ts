import { NextResponse } from "next/server";
import { clientIp } from "../../../lib/rate-limit";
import { persistentRateLimited } from "../../../lib/rate-limit-store";
import { isValidLocale, DEFAULT_LOCALE, type SupportedLocale } from "../../../lib/i18n/locales";
import { dedupeSentences, exceedsMaxSentences, splitSentences } from "../../../lib/check/sentence-split";
import { evaluateSentences, CheckTimeoutError } from "../../../lib/check/evaluate";
import { buildCheckAnalyticsEvent, logCheckAnalyticsEvent } from "../../../lib/check/analytics";
import { CHECK_LIMITS, type CheckRequestBody } from "../../../lib/check/types";

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
// Fast-reject margin above the real limit: a Content-Length far past this is
// rejected without reading the body, but the actual limit is still enforced
// by streaming byte counting below (Content-Length is never trusted alone).
const CONTENT_LENGTH_FAST_REJECT_BYTES = CHECK_LIMITS.actualBodyBytes * 2;

function errorResponse(status: number, error: string, extraHeaders?: HeadersInit) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store", ...extraHeaders } });
}

async function readBodyWithByteLimit(request: Request): Promise<{ ok: true; bytes: Uint8Array } | { ok: false }> {
  const reader = request.body?.getReader();
  if (!reader) return { ok: true, bytes: new Uint8Array(0) };

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > CHECK_LIMITS.actualBodyBytes) {
      await reader.cancel().catch(() => {});
      return { ok: false };
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes: merged };
}

export async function POST(request: Request) {
  // 1. Rate limit — IP is used only as the persistent limiter's hashed key
  // (see lib/rate-limit-store.ts); it is never stored raw or logged.
  const ip = clientIp(request);
  const rateLimit = await persistentRateLimited("check", ip, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (rateLimit.limited) {
    return errorResponse(429, "rate_limited", { "Retry-After": String(Math.ceil(rateLimit.retryAfterMs / 1000)) });
  }

  // 2. Content-Length fast reject (advisory only — not a security boundary).
  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader) {
    const declaredLength = Number(contentLengthHeader);
    if (Number.isFinite(declaredLength) && declaredLength > CONTENT_LENGTH_FAST_REJECT_BYTES) {
      return errorResponse(413, "payload_too_large");
    }
  }

  // 3. Streaming byte limit — the real enforcement point.
  const bodyResult = await readBodyWithByteLimit(request);
  if (!bodyResult.ok) {
    return errorResponse(413, "payload_too_large");
  }

  // 4. UTF-8 decode.
  let rawBody: string;
  try {
    rawBody = new TextDecoder("utf-8", { fatal: true }).decode(bodyResult.bytes);
  } catch {
    return errorResponse(400, "invalid_request");
  }

  // 5. JSON parse.
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return errorResponse(400, "invalid_json");
  }

  // 6. Object/schema validation.
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return errorResponse(400, "invalid_request");
  }
  const body = parsed as Partial<CheckRequestBody>;
  if (typeof body.text !== "string" || body.text.trim().length === 0) {
    return errorResponse(400, "invalid_request");
  }
  if (body.locale !== undefined && typeof body.locale !== "string") {
    return errorResponse(400, "invalid_request");
  }

  // 7. Text length.
  if (body.text.length > CHECK_LIMITS.textMaxChars) {
    return errorResponse(400, "text_too_long");
  }

  // 8. Locale validation.
  let locale: SupportedLocale = DEFAULT_LOCALE;
  if (body.locale !== undefined) {
    if (!isValidLocale(body.locale)) {
      return errorResponse(400, "unsupported_locale");
    }
    locale = body.locale;
  }

  // 9. Sentence split.
  const splitResult = splitSentences(body.text, locale);

  // 10. Sentence count.
  if (splitResult.analyzable.length === 0) {
    return errorResponse(422, "no_analyzable_sentences");
  }
  if (exceedsMaxSentences(splitResult)) {
    return errorResponse(422, "too_many_sentences");
  }

  // 11. Dedup normalized sentence.
  const sentences = dedupeSentences(splitResult.analyzable);

  // 12-14. Search, match, aggregate — under a deadline. No partial results
  // are ever returned: either the full response is built before the
  // deadline, or the request fails closed with 504.
  const startedAt = Date.now();
  const deadlineAt = startedAt + CHECK_LIMITS.deadlineMs;
  const deadlineSignal = AbortSignal.timeout(CHECK_LIMITS.deadlineMs);
  let response;
  try {
    response = await Promise.race([
      Promise.resolve().then(() => evaluateSentences(sentences, locale, deadlineSignal, deadlineAt)),
      new Promise<never>((_, reject) => {
        deadlineSignal.addEventListener("abort", () => reject(new CheckTimeoutError()));
      }),
    ]);
  } catch (error) {
    if (error instanceof CheckTimeoutError) {
      return errorResponse(504, "check_timeout");
    }
    throw error;
  }
  const durationMs = Date.now() - startedAt;

  // 15. Privacy-safe analytics — never blocks the response on failure.
  try {
    logCheckAnalyticsEvent(buildCheckAnalyticsEvent(response, durationMs, locale));
  } catch (error) {
    console.error("[check-answer-analytics] failed to log event", error);
  }

  return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
}
