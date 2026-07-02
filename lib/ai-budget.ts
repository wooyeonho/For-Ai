import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import type { AIProviderKey } from "./ai-providers";

export const AI_BUDGET_USAGE_TABLE = "ai_generation_usage";
export const AI_CONFIG_TABLE = "app_config";

export const AI_GENERATION_LIMITS = {
  maxCount: readPositiveInt("AI_GENERATION_MAX_COUNT", 10),
  maxProviders: readPositiveInt("AI_GENERATION_MAX_PROVIDERS", 3),
  maxOutputTokens: readPositiveInt("AI_GENERATION_MAX_OUTPUT_TOKENS", 4096),
  dailyRequests: readPositiveInt("AI_GENERATION_DAILY_REQUEST_QUOTA", 25),
  monthlyRequests: readPositiveInt("AI_GENERATION_MONTHLY_REQUEST_QUOTA", 300),
};

type UsageWindow = "daily" | "monthly";

export type AIGenerationBudgetRequest = {
  provider: AIProviderKey;
  model: string;
  requestedCount: number;
  maxOutputTokens: number;
  adminActorHash: string;
  requestId: string;
};

export type AIGenerationBudgetRecord = AIGenerationBudgetRequest & {
  generatedCount?: number;
  status: "reserved" | "completed" | "failed" | "blocked";
  error?: string | null;
};

function readPositiveInt(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function adminActorHashFromRequest(request: Request, fallback = "unknown-admin"): string {
  const actor = request.headers.get("x-admin-actor")?.trim();
  if (actor) return hash(`actor:${actor}`);
  return fallback;
}

export async function aiGenerationKillSwitchEnabled(sb: SupabaseClient | null): Promise<{ disabled: boolean; reason: string }> {
  if (process.env.AI_GENERATION_DISABLED === "true") {
    return { disabled: true, reason: "AI_GENERATION_DISABLED=true" };
  }
  if (!sb) return { disabled: false, reason: "db_config_unavailable" };

  const { data, error } = await sb
    .from(AI_CONFIG_TABLE)
    .select("value")
    .eq("key", "ai_generation_disabled")
    .maybeSingle<{ value: unknown }>();

  if (error) {
    console.warn("[ai-budget] config lookup skipped", { table: AI_CONFIG_TABLE, code: error.code, message: error.message });
    return { disabled: false, reason: "db_config_lookup_failed" };
  }

  const value = data?.value;
  const disabled = value === true || value === "true" || (typeof value === "object" && value !== null && "disabled" in value && (value as { disabled?: unknown }).disabled === true);
  return { disabled, reason: disabled ? "db_config:ai_generation_disabled" : "enabled" };
}

function periodStart(window: UsageWindow): string {
  const now = new Date();
  if (window === "daily") now.setUTCHours(0, 0, 0, 0);
  else { now.setUTCDate(1); now.setUTCHours(0, 0, 0, 0); }
  return now.toISOString();
}

async function usageCount(sb: SupabaseClient, adminActorHash: string, window: UsageWindow): Promise<number | null> {
  const { count, error } = await sb
    .from(AI_BUDGET_USAGE_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("admin_actor_hash", adminActorHash)
    .gte("created_at", periodStart(window))
    .in("status", ["reserved", "completed"]);

  if (error) {
    console.warn("[ai-budget] quota lookup skipped", { table: AI_BUDGET_USAGE_TABLE, window, code: error.code, message: error.message });
    return null;
  }
  return count ?? 0;
}

export async function checkAIGenerationQuota(sb: SupabaseClient | null, adminActorHash: string): Promise<{ allowed: boolean; dailyUsed?: number; monthlyUsed?: number; reason?: string }> {
  if (!sb) return { allowed: true, reason: "usage_table_unavailable" };
  const [dailyUsed, monthlyUsed] = await Promise.all([
    usageCount(sb, adminActorHash, "daily"),
    usageCount(sb, adminActorHash, "monthly"),
  ]);
  if (dailyUsed !== null && dailyUsed >= AI_GENERATION_LIMITS.dailyRequests) return { allowed: false, dailyUsed, monthlyUsed: monthlyUsed ?? undefined, reason: "daily_quota_exceeded" };
  if (monthlyUsed !== null && monthlyUsed >= AI_GENERATION_LIMITS.monthlyRequests) return { allowed: false, dailyUsed: dailyUsed ?? undefined, monthlyUsed, reason: "monthly_quota_exceeded" };
  return { allowed: true, dailyUsed: dailyUsed ?? undefined, monthlyUsed: monthlyUsed ?? undefined };
}

export async function recordAIGenerationUsage(sb: SupabaseClient | null, record: AIGenerationBudgetRecord): Promise<void> {
  if (!sb) return;
  const { error } = await sb.from(AI_BUDGET_USAGE_TABLE).insert({
    provider: record.provider,
    model: record.model,
    requested_count: record.requestedCount,
    generated_count: record.generatedCount ?? null,
    max_output_tokens: record.maxOutputTokens,
    admin_actor_hash: record.adminActorHash,
    request_id: record.requestId,
    status: record.status,
    error: record.error ?? null,
  });
  if (error) console.warn("[ai-budget] usage insert skipped", { table: AI_BUDGET_USAGE_TABLE, code: error.code, message: error.message });
}
