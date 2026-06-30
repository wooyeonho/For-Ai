#!/usr/bin/env node
import { isoDaysAgo, normalizeLimit, parseArgs, requireServiceRoleClient, runJob, writeAuditEvent } from "../lib/cron-job-utils.mjs";

await runJob("find-stale-claims", async () => {
  const args = parseArgs();
  const days = Number.isFinite(args.days) ? Math.max(1, Math.floor(args.days)) : 90;
  const limit = normalizeLimit(args.limit, 100, 1000);
  const cutoff = isoDaysAgo(days);
  const supabase = requireServiceRoleClient();
  const { data, error } = await supabase.from("claims").select("id,document_id,entity_id,field_path,status,confidence,last_verified_at,updated_at,documents(category,country)").or(`last_verified_at.is.null,last_verified_at.lt.${cutoff}`).order("updated_at", { ascending: true }).limit(limit);
  if (error) throw new Error(`Failed to read stale claims: ${error.message}`);
  const staleClaims = (data || []).map((claim) => ({
    id: claim.id,
    document_id: claim.document_id,
    entity_id: claim.entity_id,
    field_path: claim.field_path,
    status: claim.status,
    confidence: claim.confidence,
    last_verified_at: claim.last_verified_at,
    category: claim.documents?.category ?? null,
    country: claim.documents?.country ?? claim.country ?? "GLOBAL",
  }));

  const { data: adoptions, error: adoptionError } = await supabase
    .from("topic_adoptions")
    .select("id,contributor_id,contributor_hash,entity_id,document_id,category,country,notification_preference")
    .eq("active", true)
    .limit(5000);
  if (adoptionError) throw new Error(`Failed to read topic adoptions: ${adoptionError.message}`);

  const watchRows = [];
  for (const claim of staleClaims) {
    for (const adoption of adoptions || []) {
      const matchesDocument = adoption.document_id && adoption.document_id === claim.document_id;
      const matchesEntity = adoption.entity_id && adoption.entity_id === claim.entity_id;
      const matchesCategory = adoption.category && adoption.category === claim.category;
      const matchesCountry = adoption.country === "GLOBAL" || adoption.country === claim.country;
      if ((matchesDocument || matchesEntity || matchesCategory) && matchesCountry) {
        watchRows.push({
          topic_adoption_id: adoption.id,
          contributor_id: adoption.contributor_id,
          contributor_hash: adoption.contributor_hash,
          entity_id: claim.entity_id,
          document_id: claim.document_id,
          claim_id: claim.id,
          category: claim.category,
          country: claim.country,
          event_type: "source_update_needed",
          notification_preference: adoption.notification_preference,
          mission_status: "open",
          source_update_needed: true,
          mission_created_at: new Date().toISOString(),
        });
      }
    }
  }

  if (!args.dryRun && watchRows.length > 0) {
    const { error: insertError } = await supabase.from("watch_subscriptions").insert(watchRows);
    if (insertError) throw new Error(`Failed to create watch subscriptions: ${insertError.message}`);
  }

  await writeAuditEvent(supabase, { action: "cron.find_stale_claims", metadata: { days, cutoff, scanned: staleClaims.length, stale_claims: staleClaims, watch_missions: watchRows.length } }, { dryRun: args.dryRun });
  return { dryRun: args.dryRun, days, cutoff, staleClaims: staleClaims.length, watchMissions: watchRows.length };
});
