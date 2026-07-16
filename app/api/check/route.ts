import { NextResponse } from "next/server";
import { persistentRateLimited } from "../../../lib/rate-limit-store";
import { findBestClaimMatch, type ClaimCandidate } from "../../../lib/check-engine";

const CANDIDATES: ClaimCandidate[] = [
  { id: "seoul-metro-base-fare", entityId: "kr-transport-seoul-metro-001", text: "Seoul subway base fare is 1400 won." },
  { id: "passport-reissue-fee", entityId: "kr-passport-reissue-001", text: "Korean passport reissue fee is 50000 won." },
];

function clientKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function POST(request: Request) {
  const rateLimit = await persistentRateLimited("check-api", clientKey(request), 60, 60_000);
  if (rateLimit.backend !== "postgres" && process.env.FORAI_ENABLE_CHECK_WITH_MEMORY_RATE_LIMIT !== "1") {
    console.warn("[check-api] unavailable without distributed limiter", { backend: rateLimit.backend });
    return NextResponse.json({ error: "check_unavailable" }, { status: 503 });
  }
  if (rateLimit.limited) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const text = typeof body === "object" && body && "text" in body ? String((body as { text?: unknown }).text ?? "") : "";
  if (!text.trim()) return NextResponse.json({ error: "invalid_text" }, { status: 400 });
  const sentence = text.split(/[.!?。？！؟।॥\n]/u).find((part) => part.trim())?.trim() ?? text.trim();
  const match = findBestClaimMatch(sentence, CANDIDATES);
  console.info("[check-api] check completed", { sentence_count: 1, matched: "claimId" in match });
  return NextResponse.json({ results: [{ sentence_hash_only: true, match }] });
}
