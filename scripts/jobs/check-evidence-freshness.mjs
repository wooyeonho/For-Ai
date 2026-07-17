#!/usr/bin/env node
// Bible v7 Task 5-E — claim_evidence freshness/health checking.
//
// This job must be run via `npm run job:check-evidence-freshness`, not
// `node scripts/jobs/check-evidence-freshness.mjs` directly: the npm script
// first compiles lib/safe-fetch-external-source.ts (the same hardened
// SSRF-safe fetch layer Task 5-B1 uses) into .tmp/jobs and stubs the
// bundler-only "server-only" import for that compile, mirroring the
// established `npm test` pattern (see scripts/stub-server-only-for-tests.mjs).
// Running the bare .mjs file without that compile step fails fast below with
// a clear message instead of silently falling back to an unguarded fetch.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeLimit, parseArgs, requireServiceRoleClient, runJob, writeAuditEvent } from "../lib/cron-job-utils.mjs";
import {
  cardSeverity,
  classifyFetchFailure,
  classifyFetchSuccess,
  compareQueuePriority,
  shouldOpenCard,
} from "../lib/evidence-freshness.mjs";

const compiledSafeFetchPath = new URL("../../.tmp/jobs/lib/safe-fetch-external-source.js", import.meta.url);
if (!existsSync(fileURLToPath(compiledSafeFetchPath))) {
  console.error(
    "check-evidence-freshness: compiled safe-fetch layer not found at .tmp/jobs/lib/safe-fetch-external-source.js. " +
    "Run this job via `npm run job:check-evidence-freshness`, which compiles it first.",
  );
  process.exit(1);
}

const { safeFetchExternalSource, verifyQuoteInCanonicalText, SafeFetchError } = await import(compiledSafeFetchPath);

async function checkOne(supabase, row, timeoutMs) {
  const snapshot = row.source_snapshots;
  const originalQuote = snapshot.normalized_text.slice(row.quote_start, row.quote_end);

  let classification;
  try {
    const fetched = await safeFetchExternalSource(snapshot.canonical_url, { timeoutMs });
    try {
      verifyQuoteInCanonicalText(fetched.canonicalText, originalQuote);
      classification = classifyFetchSuccess({
        finalUrl: fetched.finalUrl,
        canonicalUrl: snapshot.canonical_url,
        contentHash: fetched.contentHash,
        previousContentHash: snapshot.content_hash,
      });
    } catch (quoteError) {
      if (quoteError instanceof SafeFetchError && (quoteError.code === "quote_absent" || quoteError.code === "quote_multiple")) {
        classification = { result: "evidence_missing", isTemporary: false, httpStatus: fetched.httpStatus };
      } else {
        throw quoteError;
      }
    }
  } catch (error) {
    if (error instanceof SafeFetchError) {
      classification = classifyFetchFailure(error);
    } else {
      classification = { result: "fetch_error", isTemporary: true, httpStatus: null };
    }
  }

  return classification;
}

await runJob("check-evidence-freshness", async () => {
  const args = parseArgs();
  const limit = normalizeLimit(args.limit, 50, 200);
  const timeoutMs = normalizeLimit(args.timeoutMs, 8000, 30000);
  const supabase = requireServiceRoleClient();

  const { data: candidates, error: candidatesError } = await supabase
    .from("claim_evidence")
    .select(
      "id,claim_version_id,quote_start,quote_end,last_checked_at,last_attempt_at,consecutive_failure_count,valid_until," +
        "source_snapshots(id,canonical_url,content_hash,normalized_text,storage_path)," +
        "claim_versions(claim_id)",
    )
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(Math.min(limit * 4, 800));
  if (candidatesError) throw new Error(`Failed to read claim_evidence: ${candidatesError.message}`);

  const now = new Date();
  const storageBacked = (candidates || []).filter((row) => !row.source_snapshots || row.source_snapshots.normalized_text === null);
  const checkable = (candidates || [])
    .filter((row) => row.source_snapshots && row.source_snapshots.normalized_text !== null)
    .sort((a, b) => compareQueuePriority(a, b, now))
    .slice(0, limit);

  const resultCounts = {};
  const cardsOpened = [];
  const errors = [];

  for (const row of checkable) {
    const claimId = row.claim_versions?.claim_id;
    if (!claimId) continue;

    let classification;
    try {
      classification = await checkOne(supabase, row, timeoutMs);
    } catch (error) {
      errors.push({ claim_evidence_id: row.id, error: error instanceof Error ? error.message : String(error) });
      continue;
    }

    resultCounts[classification.result] = (resultCounts[classification.result] || 0) + 1;
    const nowIso = now.toISOString();
    const newConsecutiveFailureCount = classification.isTemporary ? (row.consecutive_failure_count || 0) + 1 : 0;

    if (!args.dryRun) {
      const update = {
        last_attempt_at: nowIso,
        consecutive_failure_count: newConsecutiveFailureCount,
      };
      if (!classification.isTemporary) update.last_checked_at = nowIso;

      const { error: updateError } = await supabase.from("claim_evidence").update(update).eq("id", row.id);
      if (updateError) {
        errors.push({ claim_evidence_id: row.id, error: `claim_evidence update failed: ${updateError.message}` });
        continue;
      }

      const { error: historyError } = await supabase.from("evidence_health_checks").insert({
        claim_evidence_id: row.id,
        result: classification.result,
        is_temporary: classification.isTemporary,
        http_status: classification.httpStatus,
        detail: { canonical_url: row.source_snapshots.canonical_url },
        checked_at: nowIso,
      });
      if (historyError) errors.push({ claim_evidence_id: row.id, error: `evidence_health_checks insert failed: ${historyError.message}` });
    }

    if (shouldOpenCard(classification.result, newConsecutiveFailureCount)) {
      const { data: existingCard, error: existingCardError } = await supabase
        .from("evidence_recheck_cards")
        .select("id")
        .eq("claim_evidence_id", row.id)
        .eq("status", "open")
        .maybeSingle();
      if (existingCardError) {
        errors.push({ claim_evidence_id: row.id, error: `evidence_recheck_cards read failed: ${existingCardError.message}` });
      } else if (!existingCard) {
        const { data: claim, error: claimError } = await supabase
          .from("claims")
          .select("published_claim_version_id")
          .eq("id", claimId)
          .maybeSingle();
        if (claimError) {
          errors.push({ claim_evidence_id: row.id, error: `claims read failed: ${claimError.message}` });
        } else {
          let otherValidEvidenceCount = 0;
          if (claim?.published_claim_version_id) {
            const { count, error: siblingError } = await supabase
              .from("claim_evidence")
              .select("id", { count: "exact", head: true })
              .eq("claim_version_id", claim.published_claim_version_id)
              .neq("id", row.id)
              .eq("consecutive_failure_count", 0)
              .not("last_checked_at", "is", null);
            if (siblingError) errors.push({ claim_evidence_id: row.id, error: `sibling evidence read failed: ${siblingError.message}` });
            else otherValidEvidenceCount = count ?? 0;
          }

          const severity = cardSeverity(classification.result, otherValidEvidenceCount);
          if (!args.dryRun) {
            const { error: cardError } = await supabase.from("evidence_recheck_cards").insert({
              claim_evidence_id: row.id,
              claim_id: claimId,
              reason: classification.result,
              severity,
              other_valid_evidence_count: otherValidEvidenceCount,
            });
            if (cardError) errors.push({ claim_evidence_id: row.id, error: `evidence_recheck_cards insert failed: ${cardError.message}` });
            else cardsOpened.push({ claim_evidence_id: row.id, claim_id: claimId, reason: classification.result, severity });
          } else {
            cardsOpened.push({ claim_evidence_id: row.id, claim_id: claimId, reason: classification.result, severity, dryRun: true });
          }
        }
      }
    }
  }

  await writeAuditEvent(supabase, {
    action: "cron.check_evidence_freshness",
    metadata: {
      limit,
      timeout_ms: timeoutMs,
      checked: checkable.length,
      skipped_storage_backed: storageBacked.length,
      result_counts: resultCounts,
      cards_opened: cardsOpened,
      errors,
      policy: "no automatic citation downgrade; this job only logs history (evidence_health_checks) and opens operator recheck cards (evidence_recheck_cards).",
    },
  }, { dryRun: args.dryRun });

  return {
    dryRun: args.dryRun,
    checked: checkable.length,
    skippedStorageBacked: storageBacked.length,
    resultCounts,
    cardsOpened: cardsOpened.length,
    errors: errors.length,
  };
});
