#!/usr/bin/env node
import { normalizeLimit, parseArgs, requireServiceRoleClient, runJob, writeAuditEvent } from "../lib/cron-job-utils.mjs";

await runJob("find-stale-claims", async () => {
  const args = parseArgs();
  const limit = normalizeLimit(args.limit, 100, 1000);
  const supabase = requireServiceRoleClient();
  const ttlByUpdateFrequency = { realtime: 1, daily: 2, weekly: 7, monthly: 31, quarterly: 92, annual: 366, event_based: 180, static: 730, unknown: 180 };
  const ageInDays = (iso) => {
    if (!iso) return null;
    const parsed = Date.parse(iso);
    if (Number.isNaN(parsed)) return null;
    return Math.floor((Date.now() - parsed) / 86_400_000);
  };
  const ttlFor = (claim) => ttlByUpdateFrequency[claim.update_frequency || claim.documents?.update_frequency || "unknown"] ?? ttlByUpdateFrequency.unknown;
  const { data, error } = await supabase
    .from("claims")
    .select("id,document_id,entity_id,field_path,status,confidence,last_verified_at,updated_at,update_frequency,documents(category,country,update_frequency)")
    .eq("status", "verified")
    .order("last_verified_at", { ascending: true, nullsFirst: true })
    .limit(Math.min(limit * 5, 5000));
  if (error) throw new Error(`Failed to read stale claims: ${error.message}`);
  const staleClaims = (data || [])
    .map((claim) => {
      const ttl_days = ttlFor(claim);
      const age_days = ageInDays(claim.last_verified_at);
      return {
        id: claim.id,
        document_id: claim.document_id,
        entity_id: claim.entity_id,
        field_path: claim.field_path,
        status: claim.status,
        confidence: claim.confidence,
        last_verified_at: claim.last_verified_at,
        update_frequency: claim.update_frequency ?? claim.documents?.update_frequency ?? "unknown",
        ttl_days,
        age_days,
        stale_reason: !claim.last_verified_at ? `missing last_verified_at; TTL ${ttl_days} days` : `last verified ${age_days} days ago; TTL ${ttl_days} days`,
        category: claim.documents?.category ?? null,
        country: claim.documents?.country ?? claim.country ?? "GLOBAL",
      };
    })
    .filter((claim) => claim.age_days === null || claim.age_days > claim.ttl_days)
    .slice(0, limit);

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

  await writeAuditEvent(supabase, { action: "cron.find_stale_claims", metadata: { freshness_ttl_source: "claims.update_frequency/documents.update_frequency", scanned: data?.length ?? 0, stale_claims: staleClaims, watch_missions: watchRows.length, admin_queue: "/admin/review stale claims" } }, { dryRun: args.dryRun });
  return { dryRun: args.dryRun, staleClaims: staleClaims.length, watchMissions: watchRows.length, queue: "/admin/review stale claims" };
});
