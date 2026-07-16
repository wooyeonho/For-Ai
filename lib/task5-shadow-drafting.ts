import "server-only";

import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AI_PROVIDERS,
  generateWithProvider,
  providerEstimatedCostPer1kTokensUsd,
  providerSupportsWebSearch,
  type AIGenerateRequest,
  type AIGenerateResponse,
  type AIProviderKey,
} from "./ai-providers";
import {
  fetchAndStoreSourceSnapshot,
  SafeFetchError,
  verifyQuoteInCanonicalText,
  type SafeFetchExternalSourceOptions,
} from "./safe-fetch-external-source";
import { isReputationOrCrimeRisk } from "./wanted-claims";

export const TASK5_DRAFT_PROMPT_VERSION = "task5-b2-draft-v1";
export const TASK5_RISK_PROMPT_VERSION = "task5-b2-risk-v1";
export const TASK5_DETERMINISTIC_POLICY_VERSION = "task5-risk-keywords-v1";
const DEFAULT_LEASE_SECONDS = 600;
const MAX_SOURCE_CANDIDATES = 3;
const MAX_SOURCE_TEXT_CHARS = 16_000;

export type RiskResult = "normal" | "high" | "unknown";

export interface ShadowDraftLease {
  run_id: string;
  attempt_id: string;
  wanted_claim_id: string;
  locale: string;
  normalized_text: string;
  attempt_number: number;
  lease_expires_at: string;
}

export interface StructuredShadowDraft {
  answer: string;
  quote: string;
}

interface StoredSnapshot extends Record<string, unknown> {
  id: string;
  normalized_text?: string | null;
  storage_path?: string | null;
}

export interface Task5ShadowDraftDependencies {
  generate: (provider: AIProviderKey, request: AIGenerateRequest) => Promise<AIGenerateResponse>;
  fetchAndStore: typeof fetchAndStoreSourceSnapshot;
  now: () => Date;
  uuid: () => string;
}

export interface RunTask5ShadowDraftOptions {
  limit?: number;
  searchProvider?: AIProviderKey;
  modelProvider?: AIProviderKey;
  workerId?: string;
  scheduledFor?: Date;
  safeFetchOptions?: SafeFetchExternalSourceOptions;
  dependencies?: Partial<Task5ShadowDraftDependencies>;
}

export interface Task5ShadowDraftRunResult {
  enabled: boolean;
  runId: string | null;
  leased: number;
  completed: number;
  failed: number;
  errors: Array<{ attemptId: string; code: string }>;
}

class ShadowDraftError extends Error {
  constructor(
    public readonly code: string,
    public readonly errorClass: string,
    public readonly retryable: boolean,
    message: string,
  ) {
    super(message);
    this.name = "ShadowDraftError";
  }
}

function approximateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}

function boundedLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(Math.max(Math.floor(value!), 1), 5);
}

export function task5EmergencyDisabled(value = process.env.TASK5_EMERGENCY_DISABLE): boolean {
  return value === "1";
}

export function validTask5CronSecret(provided: string | null, expected = process.env.CRON_SECRET): boolean {
  if (!provided || !expected || expected.length < 32) return false;
  const providedHash = createHash("sha256").update(provided).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}

export function combineRiskResults(deterministic: RiskResult, model: RiskResult): RiskResult {
  if (deterministic === "high" || model === "high") return "high";
  if (deterministic === "unknown" || model === "unknown") return "unknown";
  return "normal";
}

export function deterministicDraftRisk(question: string, answer: string): RiskResult {
  const normalized = `${question} ${answer}`.toLowerCase().replace(/\s+/g, " ");
  return isReputationOrCrimeRisk(normalized) ? "high" : "normal";
}

function parseJsonObject(content: string): Record<string, unknown> {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new ShadowDraftError("model_json_missing", "model_output", true, "Model returned no JSON object");
  try {
    const value = JSON.parse(match[0]);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not_object");
    return value as Record<string, unknown>;
  } catch {
    throw new ShadowDraftError("model_json_invalid", "model_output", true, "Model JSON was invalid");
  }
}

export function parseStructuredShadowDraft(content: string): StructuredShadowDraft {
  const parsed = parseJsonObject(content);
  const forbiddenKey = Object.keys(parsed).find((key) => /url|source|citation|link/i.test(key));
  if (forbiddenKey) {
    throw new ShadowDraftError("model_url_output_forbidden", "model_output", false, "Model attempted to provide a URL");
  }
  if (typeof parsed.answer !== "string" || typeof parsed.quote !== "string") {
    throw new ShadowDraftError("model_schema_invalid", "model_output", true, "Model output omitted answer or quote");
  }
  const answer = parsed.answer.trim();
  const quote = parsed.quote.trim();
  if (!answer || !quote || answer.length > 4_000 || quote.length > 2_000) {
    throw new ShadowDraftError("model_value_invalid", "model_output", false, "Model answer or quote was out of bounds");
  }
  return { answer, quote };
}

export function parseModelRisk(content: string): RiskResult {
  try {
    const parsed = parseJsonObject(content);
    return parsed.risk === "normal" || parsed.risk === "high" ? parsed.risk : "unknown";
  } catch {
    return "unknown";
  }
}

function discoveryRequest(question: string, locale: string): AIGenerateRequest {
  return {
    adminContext: "admin",
    temperature: 0,
    maxOutputTokens: 800,
    systemPrompt: "Find authoritative web sources for a fact-registry draft. Do not invent URLs. The application will use only provider-supplied search citations, never URLs from your prose.",
    userPrompt: `Locale: ${locale}\nQuestion: ${question}\nReturn a short source-backed answer.`,
  };
}

function structureRequest(question: string, locale: string, canonicalText: string): AIGenerateRequest {
  return {
    adminContext: "admin",
    temperature: 0,
    maxOutputTokens: 800,
    systemPrompt: "Structure one shadow fact draft using only the supplied source text. Output exactly one JSON object with string keys answer and quote. The quote must be copied from the source. Never output a URL, source, citation, or link field.",
    userPrompt: `Locale: ${locale}\nQuestion: ${question}\nSOURCE TEXT:\n${canonicalText.slice(0, MAX_SOURCE_TEXT_CHARS)}`,
  };
}

function riskRequest(question: string, answer: string): AIGenerateRequest {
  return {
    adminContext: "admin",
    temperature: 0,
    maxOutputTokens: 256,
    systemPrompt: "Classify only whether this draft is high-risk (medical, legal, financial, safety, crime, reputation, or similarly consequential). Output exactly {\"risk\":\"normal\"} or {\"risk\":\"high\"}. If uncertain, output no classification so the application fails closed to unknown.",
    userPrompt: `Question: ${question}\nDraft answer: ${answer}`,
  };
}

async function rpc<T>(client: SupabaseClient, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new ShadowDraftError(`rpc_${name}_failed`, "database", true, error.message);
  return data as T;
}

async function updateAttemptState(client: SupabaseClient, attemptId: string, workerId: string, state: string): Promise<void> {
  const { error } = await client.from("draft_attempts").update({ state }).eq("id", attemptId).eq("worker_id", workerId);
  if (error) throw new ShadowDraftError("attempt_state_failed", "database", true, error.message);
}

async function paidModelCall(
  client: SupabaseClient,
  lease: ShadowDraftLease,
  stage: string,
  promptVersion: string,
  provider: AIProviderKey,
  request: AIGenerateRequest,
  generate: Task5ShadowDraftDependencies["generate"],
): Promise<AIGenerateResponse> {
  const usageKey = `${lease.attempt_id}:${stage}`;
  const inputTokens = approximateTokens(`${request.systemPrompt}\n${request.userPrompt}`);
  const outputTokens = request.maxOutputTokens ?? 800;
  const reservedCost = Number((((inputTokens + outputTokens) / 1000) * providerEstimatedCostPer1kTokensUsd(provider)).toFixed(6));
  const reserved = await rpc<boolean>(client, "reserve_task5_budget", {
    p_usage_key: usageKey,
    p_attempt_id: lease.attempt_id,
    p_provider: provider,
    p_calls: 1,
    p_input_tokens: inputTokens,
    p_output_tokens: outputTokens,
    p_cost: reservedCost,
  });
  if (!reserved) throw new ShadowDraftError("budget_not_reserved", "budget", true, "Daily budget unavailable");

  let response: AIGenerateResponse;
  try {
    response = await generate(provider, request);
  } catch {
    response = { provider, model: AI_PROVIDERS[provider].model, content: "", error: "provider_exception" };
  }

  const actualInput = response.input_tokens ?? inputTokens;
  const actualOutput = response.output_tokens ?? approximateTokens(response.content);
  const actualCost = response.estimated_cost_usd ?? Number((((actualInput + actualOutput) / 1000) * providerEstimatedCostPer1kTokensUsd(provider)).toFixed(6));
  const overshoot = await rpc<boolean>(client, "reconcile_task5_budget", {
    p_usage_key: usageKey,
    p_input_tokens: actualInput,
    p_output_tokens: actualOutput,
    p_cost: actualCost,
  });
  await rpc<void>(client, "record_task5_model_call", {
    p_attempt_id: lease.attempt_id,
    p_stage: stage,
    p_provider: provider,
    p_model_id: response.model,
    p_prompt_version: promptVersion,
    p_provider_request_id: response.provider_request_id ?? null,
  });
  if (overshoot) throw new ShadowDraftError("budget_overshoot", "budget", false, "Actual usage exceeded the daily budget");
  if (response.error || !response.content.trim()) {
    throw new ShadowDraftError("provider_failed", "provider", true, "Provider call failed");
  }
  return response;
}

function uniqueCitationUrls(response: AIGenerateResponse): string[] {
  return [...new Set((response.citations ?? []).filter((value): value is string => typeof value === "string"))]
    .slice(0, MAX_SOURCE_CANDIDATES);
}

async function fetchFirstSnapshot(
  client: SupabaseClient,
  urls: string[],
  options: SafeFetchExternalSourceOptions,
  fetchAndStore: Task5ShadowDraftDependencies["fetchAndStore"],
): Promise<StoredSnapshot> {
  let lastError: unknown = null;
  for (const url of urls) {
    try {
      const snapshot = await fetchAndStore(client, url, null, options) as StoredSnapshot;
      if (snapshot.normalized_text && !snapshot.storage_path) return snapshot;
      lastError = new ShadowDraftError("snapshot_text_unavailable", "source", true, "Snapshot requires private storage retrieval");
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError instanceof SafeFetchError) {
    throw new ShadowDraftError(`source_${lastError.code}`, "source", true, "No safe source snapshot was available");
  }
  if (lastError instanceof ShadowDraftError) throw lastError;
  throw new ShadowDraftError("source_unavailable", "source", true, "No safe source snapshot was available");
}

async function failAttempt(client: SupabaseClient, lease: ShadowDraftLease, workerId: string, error: unknown): Promise<{ attemptId: string; code: string }> {
  const failure = error instanceof ShadowDraftError
    ? error
    : new ShadowDraftError("unexpected_failure", "internal", true, "Unexpected shadow drafting failure");
  await rpc<void>(client, "fail_task5_shadow_draft", {
    p_attempt_id: lease.attempt_id,
    p_worker_id: workerId,
    p_error_class: failure.errorClass,
    p_error_code: failure.code,
    p_retryable: failure.retryable,
  });
  return { attemptId: lease.attempt_id, code: failure.code };
}

export async function runTask5ShadowDraftBatch(
  client: SupabaseClient,
  options: RunTask5ShadowDraftOptions = {},
): Promise<Task5ShadowDraftRunResult> {
  const dependencies: Task5ShadowDraftDependencies = {
    generate: options.dependencies?.generate ?? generateWithProvider,
    fetchAndStore: options.dependencies?.fetchAndStore ?? fetchAndStoreSourceSnapshot,
    now: options.dependencies?.now ?? (() => new Date()),
    uuid: options.dependencies?.uuid ?? randomUUID,
  };
  const searchProvider = options.searchProvider ?? "perplexity";
  const modelProvider = options.modelProvider ?? "gpt";
  if (!providerSupportsWebSearch(searchProvider)) {
    throw new ShadowDraftError("search_provider_not_grounded", "configuration", false, "Search provider must return search citations");
  }

  const { data: settings, error: settingsError } = await client
    .from("task5_settings")
    .select("phase, draft_enabled")
    .eq("id", true)
    .maybeSingle();
  if (settingsError || !settings || settings.phase !== 0 || settings.draft_enabled !== true) {
    return { enabled: false, runId: null, leased: 0, completed: 0, failed: 0, errors: [] };
  }

  const workerId = options.workerId ?? `task5-b2-${dependencies.uuid()}`;
  const scheduledFor = options.scheduledFor ?? dependencies.now();
  const correlationId = dependencies.uuid();
  const leases = await rpc<ShadowDraftLease[]>(client, "lease_task5_wanted_claims", {
    p_worker_id: workerId,
    p_limit: boundedLimit(options.limit),
    p_lease_seconds: DEFAULT_LEASE_SECONDS,
    p_scheduled_for: scheduledFor.toISOString(),
    p_correlation_id: correlationId,
    p_prompt_version: TASK5_DRAFT_PROMPT_VERSION,
    p_risk_prompt_version: TASK5_RISK_PROMPT_VERSION,
  });

  const runId = leases[0]?.run_id ?? null;
  let completed = 0;
  const errors: Array<{ attemptId: string; code: string }> = [];
  for (const lease of leases) {
    try {
      await updateAttemptState(client, lease.attempt_id, workerId, "source_discovery");
      const discovery = await paidModelCall(
        client, lease, "source_discovery", TASK5_DRAFT_PROMPT_VERSION,
        searchProvider, discoveryRequest(lease.normalized_text, lease.locale), dependencies.generate,
      );
      const urls = uniqueCitationUrls(discovery);
      if (urls.length === 0) throw new ShadowDraftError("search_citations_missing", "source", true, "Search returned no citations");
      const snapshot = await fetchFirstSnapshot(client, urls, options.safeFetchOptions ?? {}, dependencies.fetchAndStore);

      await updateAttemptState(client, lease.attempt_id, workerId, "structuring");
      const structuredResponse = await paidModelCall(
        client, lease, "structuring", TASK5_DRAFT_PROMPT_VERSION,
        modelProvider, structureRequest(lease.normalized_text, lease.locale, snapshot.normalized_text!), dependencies.generate,
      );
      const structured = parseStructuredShadowDraft(structuredResponse.content);
      const verified = verifyQuoteInCanonicalText(snapshot.normalized_text!, structured.quote);

      await updateAttemptState(client, lease.attempt_id, workerId, "risk_assessment");
      const deterministic = deterministicDraftRisk(lease.normalized_text, structured.answer);
      let modelRisk: RiskResult = "unknown";
      try {
        const riskResponse = await paidModelCall(
          client, lease, "risk_assessment", TASK5_RISK_PROMPT_VERSION,
          modelProvider, riskRequest(lease.normalized_text, structured.answer), dependencies.generate,
        );
        modelRisk = parseModelRisk(riskResponse.content);
      } catch (error) {
        if (error instanceof ShadowDraftError && error.errorClass === "provider") {
          modelRisk = "unknown";
        } else {
          throw error;
        }
      }
      await rpc<string>(client, "complete_task5_shadow_draft", {
        p_attempt_id: lease.attempt_id,
        p_worker_id: workerId,
        p_source_snapshot_id: snapshot.id,
        p_answer: structured.answer,
        p_quote_start: verified.quoteStart,
        p_quote_end: verified.quoteEnd,
        p_quote_hash: verified.quoteHash,
        p_context_hash: verified.contextHash,
        p_deterministic_result: deterministic,
        p_model_result: modelRisk,
        p_deterministic_policy_version: TASK5_DETERMINISTIC_POLICY_VERSION,
        p_model_id: structuredResponse.model,
        p_prompt_version: TASK5_RISK_PROMPT_VERSION,
        p_provider: modelProvider,
        p_provider_request_id: structuredResponse.provider_request_id ?? null,
      });
      completed += 1;
    } catch (error) {
      errors.push(await failAttempt(client, lease, workerId, error));
    }
  }

  if (runId) await rpc<void>(client, "finish_task5_run", { p_run_id: runId });
  return {
    enabled: true,
    runId,
    leased: leases.length,
    completed,
    failed: errors.length,
    errors,
  };
}
