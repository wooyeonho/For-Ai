import { NextResponse } from "next/server";
import { createServiceRoleClient } from "../../../lib/supabase-server";
import { makeContributorHashForRequest } from "../../../lib/contributor-hash";
import { persistentRateLimited } from "../../../lib/rate-limit-store";
import { isValidLocale } from "../../../lib/i18n/locales";
import { validateWantedClaimText } from "../../../lib/wanted-claims";

const DAILY_SUGGESTION_LIMIT = 10;
const DAY_MS = 86_400_000;

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.locale !== "string" || typeof body.text !== "string") {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const locale = body.locale.trim();
  const text = body.text;

  if (!isValidLocale(locale)) {
    return NextResponse.json({ error: "invalid_locale" }, { status: 400 });
  }

  const validation = validateWantedClaimText(text);
  if (!validation.ok) {
    // Never echo the rejected text back or log it -- a PII/secret match must
    // not be persisted anywhere, including application logs.
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  let contributorHash: string;
  try {
    contributorHash = makeContributorHashForRequest(request);
  } catch (err) {
    console.error("[wanted-claims] salt missing:", err);
    return NextResponse.json({ error: "server_configuration_error" }, { status: 500 });
  }

  const sb = createServiceRoleClient();
  if (!sb) {
    return NextResponse.json({ error: "submission_storage_unavailable" }, { status: 503 });
  }

  const rateLimit = await persistentRateLimited("wanted-claims-suggest", contributorHash, DAILY_SUGGESTION_LIMIT, DAY_MS);
  if (rateLimit.limited) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rateLimit.retryAfterMs / 1000)) } },
    );
  }

  const { data, error } = await sb.rpc("submit_wanted_claim_signal", {
    p_locale: locale,
    p_raw_text: text.trim(),
    p_source: "user_suggestion",
    p_actor_key: contributorHash,
    p_contributor_hash: contributorHash,
    p_risk_flag: validation.riskFlag,
  });

  if (error || !data) {
    console.error("[wanted-claims] rpc error:", error?.message);
    return NextResponse.json({ error: "submission_failed" }, { status: 500 });
  }

  const result = data as { wanted_claim_id: string; status: string };
  return NextResponse.json(
    { wanted_claim_id: result.wanted_claim_id, status: result.status },
    { headers: { "Cache-Control": "no-store" } },
  );
}
