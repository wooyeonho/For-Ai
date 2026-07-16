import { NextRequest, NextResponse } from "next/server";
import { checkText, type CheckLocale } from "../../../lib/check-engine";

const MAX_BODY_BYTES = 32 * 1024;
const MAX_TEXT_CHARS = 5000;
const LOCALES = new Set(["ko", "en", "hi", "ar", "es", "ja", "zh"]);

async function readLimitedBody(request: NextRequest): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) throw new Error("body_too_large");
    chunks.push(value);
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) return NextResponse.json({ error: "body_too_large" }, { status: 413 });
  try {
    const raw = await readLimitedBody(request);
    const payload = JSON.parse(raw) as { text?: unknown; locale?: unknown };
    if (typeof payload.text !== "string") return NextResponse.json({ error: "text_required" }, { status: 400 });
    if (payload.text.length > MAX_TEXT_CHARS) return NextResponse.json({ error: "text_too_long" }, { status: 400 });
    const locale = typeof payload.locale === "string" && LOCALES.has(payload.locale) ? (payload.locale as CheckLocale) : "en";
    return NextResponse.json({ locale, ...checkText(payload.text) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_request";
    return NextResponse.json({ error: message === "body_too_large" ? message : "invalid_json" }, { status: message === "body_too_large" ? 413 : 400 });
  }
}
